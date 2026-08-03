import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import {
  REPLICATION_FACTOR,
  WRITE_QUORUM,
  type ChunkCommitRequest,
  type ChunkPlanRequest,
  type ChunkPlanResponse,
  type ClusterMetrics,
  type DownloadChunk,
  type FileChunksResponse,
  type FileRecord,
  type StorageNodeRecord
} from "@dfs/shared";
import { selectReplicaTargets } from "./placement.js";

interface DbRow {
  [key: string]: unknown;
}

export interface UnderReplicatedChunk {
  id: string;
  checksum: string;
  healthyReplicaCount: number;
}

export interface RepairJob {
  id: number;
}

export class MetadataDb {
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        size BIGINT NOT NULL,
        chunk_count INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'uploading',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        address TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'healthy',
        last_heartbeat TIMESTAMPTZ,
        missed_heartbeats INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL,
        checksum TEXT NOT NULL,
        size INTEGER NOT NULL,
        is_committed BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(file_id, chunk_index)
      );

      CREATE TABLE IF NOT EXISTS chunk_locations (
        id TEXT PRIMARY KEY,
        chunk_id TEXT NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
        node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
        is_healthy BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_verified_at TIMESTAMPTZ,
        UNIQUE(chunk_id, node_id)
      );

      CREATE TABLE IF NOT EXISTS repair_jobs (
        id BIGSERIAL PRIMARY KEY,
        chunk_id TEXT NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
        source_node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
        target_node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async registerNode(id: string, address: string): Promise<StorageNodeRecord> {
    const result = await this.pool.query(
      `
        INSERT INTO nodes (id, address, status, last_heartbeat, missed_heartbeats)
        VALUES ($1, $2, 'healthy', now(), 0)
        ON CONFLICT (id)
        DO UPDATE SET
          address = EXCLUDED.address,
          status = 'healthy',
          last_heartbeat = now(),
          missed_heartbeats = 0
        RETURNING *
      `,
      [id, address]
    );
    return mapNode(result.rows[0]);
  }

  async listNodes(): Promise<StorageNodeRecord[]> {
    const result = await this.pool.query("SELECT * FROM nodes ORDER BY id");
    return result.rows.map(mapNode);
  }

  async listHealthyNodes(): Promise<StorageNodeRecord[]> {
    const result = await this.pool.query("SELECT * FROM nodes WHERE status = 'healthy' ORDER BY id");
    return result.rows.map(mapNode);
  }

  async markHeartbeatSuccess(nodeId: string): Promise<void> {
    await this.pool.query(
      "UPDATE nodes SET status = 'healthy', last_heartbeat = now(), missed_heartbeats = 0 WHERE id = $1",
      [nodeId]
    );
  }

  async markHeartbeatFailure(nodeId: string, missesUntilDead: number): Promise<void> {
    const result = await this.pool.query(
      `
        UPDATE nodes
        SET missed_heartbeats = missed_heartbeats + 1
        WHERE id = $1
        RETURNING missed_heartbeats
      `,
      [nodeId]
    );

    const missedHeartbeats = Number(result.rows[0]?.missed_heartbeats ?? 0);
    if (missedHeartbeats >= missesUntilDead) {
      await this.pool.query("UPDATE nodes SET status = 'dead' WHERE id = $1", [nodeId]);
      await this.pool.query(
        `
          UPDATE chunk_locations
          SET is_healthy = false
          WHERE node_id = $1
        `,
        [nodeId]
      );
    }
  }

  async createFile(name: string, size: number, chunkCount: number): Promise<FileRecord> {
    const result = await this.pool.query(
      `
        INSERT INTO files (id, name, size, chunk_count)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `,
      [randomUUID(), name, size, chunkCount]
    );
    return mapFile(result.rows[0]);
  }

  async planChunk(fileId: string, request: ChunkPlanRequest): Promise<ChunkPlanResponse> {
    const existing = await this.pool.query("SELECT * FROM chunks WHERE file_id = $1 AND chunk_index = $2", [
      fileId,
      request.chunkIndex
    ]);

    let chunkId: string;
    if (existing.rowCount === 0) {
      chunkId = randomUUID();
      await this.pool.query(
        `
          INSERT INTO chunks (id, file_id, chunk_index, checksum, size)
          VALUES ($1, $2, $3, $4, $5)
        `,
        [chunkId, fileId, request.chunkIndex, request.checksum, request.size]
      );
    } else {
      const chunk = existing.rows[0];
      if (chunk.checksum !== request.checksum || Number(chunk.size) !== request.size) {
        throw new Error("chunk already exists with different checksum or size");
      }
      chunkId = String(chunk.id);
    }

    const targets = selectReplicaTargets(await this.listHealthyNodes(), request.chunkIndex, REPLICATION_FACTOR);
    return { chunkId, targets };
  }

  async commitChunk(fileId: string, chunkIndex: number, request: ChunkCommitRequest): Promise<DownloadChunk> {
    const uniqueReplicas = Array.from(new Map(request.replicas.map((replica) => [replica.nodeId, replica])).values());
    if (uniqueReplicas.length < WRITE_QUORUM) {
      throw new Error(`write quorum not met: need ${WRITE_QUORUM}, got ${uniqueReplicas.length}`);
    }

    const chunkResult = await this.pool.query(
      "SELECT * FROM chunks WHERE file_id = $1 AND chunk_index = $2 AND checksum = $3 AND size = $4",
      [fileId, chunkIndex, request.checksum, request.size]
    );
    if (chunkResult.rowCount === 0) {
      throw new Error("planned chunk not found");
    }

    const chunk = chunkResult.rows[0];
    for (const replica of uniqueReplicas) {
      await this.pool.query(
        `
          INSERT INTO chunk_locations (id, chunk_id, node_id, is_healthy, last_verified_at)
          VALUES ($1, $2, $3, true, now())
          ON CONFLICT (chunk_id, node_id)
          DO UPDATE SET is_healthy = true, last_verified_at = now()
        `,
        [randomUUID(), chunk.id, replica.nodeId]
      );
    }

    await this.pool.query("UPDATE chunks SET is_committed = true WHERE id = $1", [chunk.id]);
    return this.getChunkById(String(chunk.id));
  }

  async completeFile(fileId: string): Promise<FileRecord> {
    const file = await this.getFile(fileId);
    const result = await this.pool.query("SELECT count(*) AS count FROM chunks WHERE file_id = $1 AND is_committed", [
      fileId
    ]);
    const committed = Number(result.rows[0].count);
    if (committed !== file.chunkCount) {
      throw new Error(`file has ${committed}/${file.chunkCount} committed chunks`);
    }

    const updated = await this.pool.query("UPDATE files SET status = 'complete' WHERE id = $1 RETURNING *", [fileId]);
    return mapFile(updated.rows[0]);
  }

  async getFile(fileId: string): Promise<FileRecord> {
    const result = await this.pool.query("SELECT * FROM files WHERE id = $1", [fileId]);
    if (result.rowCount === 0) {
      throw new Error("file not found");
    }
    return mapFile(result.rows[0]);
  }

  async getFileChunks(fileId: string): Promise<FileChunksResponse> {
    const file = await this.getFile(fileId);
    const chunksResult = await this.pool.query(
      `
        SELECT *
        FROM chunks
        WHERE file_id = $1 AND is_committed = true
        ORDER BY chunk_index
      `,
      [fileId]
    );

    const chunks: DownloadChunk[] = [];
    for (const chunk of chunksResult.rows) {
      chunks.push(await this.getChunkById(String(chunk.id)));
    }

    return { file, chunks };
  }

  async getChunkById(chunkId: string): Promise<DownloadChunk> {
    const chunkResult = await this.pool.query("SELECT * FROM chunks WHERE id = $1", [chunkId]);
    if (chunkResult.rowCount === 0) {
      throw new Error("chunk not found");
    }

    const locationsResult = await this.pool.query(
      `
        SELECT cl.id, n.id AS node_id, n.address
        FROM chunk_locations cl
        JOIN nodes n ON n.id = cl.node_id
        WHERE cl.chunk_id = $1
          AND cl.is_healthy = true
          AND n.status = 'healthy'
        ORDER BY n.id
      `,
      [chunkId]
    );

    const chunk = chunkResult.rows[0];
    return {
      id: String(chunk.id),
      chunkIndex: Number(chunk.chunk_index),
      checksum: String(chunk.checksum),
      size: Number(chunk.size),
      locations: locationsResult.rows.map((row) => ({
        id: String(row.id),
        nodeId: String(row.node_id),
        address: String(row.address)
      }))
    };
  }

  async reportBadLocation(locationId: string): Promise<void> {
    await this.pool.query("UPDATE chunk_locations SET is_healthy = false WHERE id = $1", [locationId]);
  }

  async listUnderReplicatedChunks(limit = 20): Promise<UnderReplicatedChunk[]> {
    const result = await this.pool.query(
      `
        SELECT
          c.id,
          c.checksum,
          count(cl.id) FILTER (WHERE cl.is_healthy = true AND n.status = 'healthy') AS healthy_replica_count
        FROM chunks c
        LEFT JOIN chunk_locations cl ON cl.chunk_id = c.id
        LEFT JOIN nodes n ON n.id = cl.node_id
        WHERE c.is_committed = true
        GROUP BY c.id, c.checksum
        HAVING count(cl.id) FILTER (WHERE cl.is_healthy = true AND n.status = 'healthy') < $1
        ORDER BY c.id
        LIMIT $2
      `,
      [REPLICATION_FACTOR, limit]
    );
    return result.rows.map((row) => ({
      id: String(row.id),
      checksum: String(row.checksum),
      healthyReplicaCount: Number(row.healthy_replica_count)
    }));
  }

  async listHealthyLocations(chunkId: string): Promise<Array<{ nodeId: string; address: string }>> {
    const result = await this.pool.query(
      `
        SELECT n.id AS node_id, n.address
        FROM chunk_locations cl
        JOIN nodes n ON n.id = cl.node_id
        WHERE cl.chunk_id = $1
          AND cl.is_healthy = true
          AND n.status = 'healthy'
        ORDER BY n.id
      `,
      [chunkId]
    );
    return result.rows.map((row) => ({
      nodeId: String(row.node_id),
      address: String(row.address)
    }));
  }

  async listAllLocationNodeIds(chunkId: string): Promise<Set<string>> {
    const result = await this.pool.query("SELECT node_id FROM chunk_locations WHERE chunk_id = $1", [chunkId]);
    return new Set(result.rows.map((row) => String(row.node_id)));
  }

  async addHealthyLocation(chunkId: string, nodeId: string): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO chunk_locations (id, chunk_id, node_id, is_healthy, last_verified_at)
        VALUES ($1, $2, $3, true, now())
        ON CONFLICT (chunk_id, node_id)
        DO UPDATE SET is_healthy = true, last_verified_at = now()
      `,
      [randomUUID(), chunkId, nodeId]
    );
  }

  async createRepairJob(chunkId: string, sourceNodeId: string, targetNodeId: string): Promise<RepairJob> {
    const result = await this.pool.query(
      `
        INSERT INTO repair_jobs (chunk_id, source_node_id, target_node_id, status)
        VALUES ($1, $2, $3, 'queued')
        RETURNING id
      `,
      [chunkId, sourceNodeId, targetNodeId]
    );
    return { id: Number(result.rows[0].id) };
  }

  async finishRepairJob(jobId: number, status: "succeeded" | "failed", error?: string): Promise<void> {
    await this.pool.query(
      "UPDATE repair_jobs SET status = $1, error = $2, updated_at = now() WHERE id = $3",
      [status, error ?? null, jobId]
    );
  }

  async metrics(): Promise<ClusterMetrics> {
    const result = await this.pool.query(`
      SELECT
        (SELECT count(*) FROM files) AS files,
        (SELECT count(*) FROM chunks) AS chunks,
        (SELECT count(*) FROM nodes WHERE status = 'healthy') AS healthy_nodes,
        (SELECT count(*) FROM nodes WHERE status = 'dead') AS dead_nodes,
        (
          SELECT count(*) FROM (
            SELECT c.id
            FROM chunks c
            LEFT JOIN chunk_locations cl ON cl.chunk_id = c.id
            LEFT JOIN nodes n ON n.id = cl.node_id
            WHERE c.is_committed = true
            GROUP BY c.id
            HAVING count(cl.id) FILTER (WHERE cl.is_healthy = true AND n.status = 'healthy') < ${REPLICATION_FACTOR}
          ) under_replicated
        ) AS under_replicated_chunks,
        (SELECT count(*) FROM repair_jobs WHERE status = 'queued') AS repair_jobs_queued,
        (SELECT count(*) FROM repair_jobs WHERE status = 'succeeded') AS repair_jobs_succeeded,
        (SELECT count(*) FROM repair_jobs WHERE status = 'failed') AS repair_jobs_failed
    `);

    const row = result.rows[0];
    return {
      files: Number(row.files),
      chunks: Number(row.chunks),
      healthyNodes: Number(row.healthy_nodes),
      deadNodes: Number(row.dead_nodes),
      underReplicatedChunks: Number(row.under_replicated_chunks),
      repairJobsQueued: Number(row.repair_jobs_queued),
      repairJobsSucceeded: Number(row.repair_jobs_succeeded),
      repairJobsFailed: Number(row.repair_jobs_failed)
    };
  }
}

function mapFile(row: DbRow): FileRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    size: Number(row.size),
    chunkCount: Number(row.chunk_count),
    status: row.status === "complete" ? "complete" : "uploading",
    createdAt: new Date(String(row.created_at)).toISOString()
  };
}

function mapNode(row: DbRow): StorageNodeRecord {
  return {
    id: String(row.id),
    address: String(row.address),
    status: row.status === "dead" ? "dead" : "healthy",
    lastHeartbeat: row.last_heartbeat ? new Date(String(row.last_heartbeat)).toISOString() : null,
    missedHeartbeats: Number(row.missed_heartbeats)
  };
}
