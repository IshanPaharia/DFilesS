import { createWriteStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { once } from "node:events";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";
import {
  getBytes,
  getChunkCount,
  getJson,
  postJson,
  putBytes,
  readFileChunks,
  verifySha256,
  type ChunkPlanResponse,
  type ClusterMetrics,
  type FileChunksResponse,
  type FileRecord,
  type StorageNodeRecord
} from "@dfs/shared";
import { assertWriteQuorum } from "./quorum.js";

const execFileAsync = promisify(execFile);

export interface CliContext {
  metadataUrl: string;
  log: (message: string) => void;
}

export async function uploadFile(ctx: CliContext, filePath: string): Promise<FileRecord> {
  const absolutePath = resolve(filePath);
  const info = await stat(absolutePath);
  const chunkCount = getChunkCount(info.size);

  ctx.log(`Chunking ${absolutePath} (${info.size} bytes -> ${chunkCount} chunks)...`);
  const file = await postJson<FileRecord>(ctx.metadataUrl, "/files", {
    name: basename(absolutePath),
    size: info.size,
    chunkCount
  });

  for await (const chunk of readFileChunks(absolutePath)) {
    ctx.log(`Uploading chunk ${chunk.chunkIndex + 1}/${chunkCount}...`);
    const plan = await postJson<ChunkPlanResponse>(ctx.metadataUrl, `/files/${file.id}/chunks/plan`, {
      chunkIndex: chunk.chunkIndex,
      checksum: chunk.checksum,
      size: chunk.size
    });

    const successfulReplicas = [];
    const attempts = await Promise.allSettled(
      plan.targets.map(async (target) => {
        await putBytes(target.address, `/chunks/${plan.chunkId}`, chunk.bytes, {
          "content-type": "application/octet-stream",
          "x-checksum": chunk.checksum
        });
        return target;
      })
    );

    for (const attempt of attempts) {
      if (attempt.status === "fulfilled") {
        successfulReplicas.push(attempt.value);
      }
    }

    const committedReplicas = assertWriteQuorum(successfulReplicas);
    await postJson(ctx.metadataUrl, `/files/${file.id}/chunks/${chunk.chunkIndex}/commit`, {
      checksum: chunk.checksum,
      size: chunk.size,
      replicas: committedReplicas
    });

    ctx.log(
      `Chunk ${chunk.chunkIndex + 1}/${chunkCount} committed (${committedReplicas
        .map((replica) => replica.nodeId)
        .join(", ")})`
    );
  }

  const completeFile = await postJson<FileRecord>(ctx.metadataUrl, `/files/${file.id}/complete`, {});
  ctx.log(`Upload complete. file_id: ${completeFile.id}`);
  return completeFile;
}

export async function downloadFile(ctx: CliContext, fileId: string, outPath: string): Promise<void> {
  const response = await getJson<FileChunksResponse>(ctx.metadataUrl, `/files/${fileId}/chunks`);
  if (response.chunks.length !== response.file.chunkCount) {
    throw new Error(`metadata returned ${response.chunks.length}/${response.file.chunkCount} committed chunks`);
  }

  const absoluteOut = resolve(outPath);
  await mkdir(dirname(absoluteOut), { recursive: true });
  const stream = createWriteStream(absoluteOut);

  try {
    for (const chunk of response.chunks) {
      const bytes = await downloadVerifiedChunk(ctx, chunk);
      if (!stream.write(bytes)) {
        await once(stream, "drain");
      }
      ctx.log(`Downloaded chunk ${chunk.chunkIndex + 1}/${response.file.chunkCount}`);
    }
  } finally {
    stream.end();
    await once(stream, "finish");
  }

  ctx.log(`Download complete: ${absoluteOut}`);
}

export async function verifyFile(ctx: CliContext, fileId: string): Promise<boolean> {
  const response = await getJson<FileChunksResponse>(ctx.metadataUrl, `/files/${fileId}/chunks`);
  let verified = 0;

  for (const chunk of response.chunks) {
    await downloadVerifiedChunk(ctx, chunk);
    verified += 1;
  }

  ctx.log(`Verified ${verified}/${response.file.chunkCount} chunks for ${fileId}`);
  return verified === response.file.chunkCount;
}

export async function printStatus(ctx: CliContext): Promise<void> {
  const nodes = await getJson<{ nodes: StorageNodeRecord[] }>(ctx.metadataUrl, "/nodes");
  const metrics = await getJson<ClusterMetrics>(ctx.metadataUrl, "/metrics");

  ctx.log("Nodes:");
  for (const node of nodes.nodes) {
    ctx.log(`  ${node.id}: ${node.status} (${node.address}, missed=${node.missedHeartbeats})`);
  }

  ctx.log("Metrics:");
  ctx.log(`  files=${metrics.files}`);
  ctx.log(`  chunks=${metrics.chunks}`);
  ctx.log(`  healthy_nodes=${metrics.healthyNodes}`);
  ctx.log(`  dead_nodes=${metrics.deadNodes}`);
  ctx.log(`  under_replicated_chunks=${metrics.underReplicatedChunks}`);
  ctx.log(`  repairs succeeded=${metrics.repairJobsSucceeded} failed=${metrics.repairJobsFailed}`);
}

export async function seedDemo(ctx: CliContext, outPath = "tmp/demo-seed.bin", bytes = 9 * 1024 * 1024): Promise<void> {
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, randomBytes(bytes));
  ctx.log(`Created ${outPath} (${bytes} bytes)`);
  await uploadFile(ctx, outPath);
}

export async function killNode(nodeId: string): Promise<void> {
  await execFileAsync("docker", ["kill", nodeId]);
}

export async function watchHealing(ctx: CliContext, timeoutMs = 120_000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const metrics = await getJson<ClusterMetrics>(ctx.metadataUrl, "/metrics");
    ctx.log(
      `healthy=${metrics.healthyNodes} dead=${metrics.deadNodes} under_replicated=${metrics.underReplicatedChunks}`
    );

    if (metrics.underReplicatedChunks === 0) {
      return;
    }

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 5_000));
  }

  throw new Error("repair did not converge before timeout");
}

async function downloadVerifiedChunk(ctx: CliContext, chunk: FileChunksResponse["chunks"][number]): Promise<Buffer> {
  for (const location of chunk.locations) {
    try {
      const bytes = await getBytes(location.address, `/chunks/${chunk.id}`);
      if (bytes.length === chunk.size && verifySha256(bytes, chunk.checksum)) {
        return bytes;
      }

      await postJson(ctx.metadataUrl, `/chunk-locations/${location.id}/report-bad`, {});
      ctx.log(`Reported bad replica ${location.id} on ${location.nodeId}`);
    } catch {
      await postJson(ctx.metadataUrl, `/chunk-locations/${location.id}/report-bad`, {});
    }
  }

  throw new Error(`no healthy replica returned valid bytes for chunk ${chunk.chunkIndex}`);
}
