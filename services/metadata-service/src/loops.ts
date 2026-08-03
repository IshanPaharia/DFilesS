import {
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_MISSES_UNTIL_DEAD,
  REPAIR_INTERVAL_MS,
  REPLICATION_FACTOR,
  postJson
} from "@dfs/shared";
import type { MetadataDb } from "./db.js";

export async function runHeartbeatOnce(db: MetadataDb): Promise<void> {
  const nodes = await db.listNodes();

  await Promise.all(
    nodes.map(async (node) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2_000);
        const response = await fetch(`${node.address.replace(/\/$/, "")}/health`, { signal: controller.signal });
        clearTimeout(timeout);

        if (response.ok) {
          await db.markHeartbeatSuccess(node.id);
        } else {
          await db.markHeartbeatFailure(node.id, HEARTBEAT_MISSES_UNTIL_DEAD);
        }
      } catch {
        await db.markHeartbeatFailure(node.id, HEARTBEAT_MISSES_UNTIL_DEAD);
      }
    })
  );
}

export function startHeartbeatLoop(db: MetadataDb): NodeJS.Timeout {
  return setInterval(() => {
    runHeartbeatOnce(db).catch((error) => {
      console.error("heartbeat loop failed", error);
    });
  }, HEARTBEAT_INTERVAL_MS);
}

export async function runRepairOnce(db: MetadataDb): Promise<void> {
  const underReplicated = await db.listUnderReplicatedChunks();
  const healthyNodes = await db.listHealthyNodes();

  for (const chunk of underReplicated) {
    if (chunk.healthyReplicaCount >= REPLICATION_FACTOR) {
      continue;
    }

    const sources = await db.listHealthyLocations(chunk.id);
    if (sources.length === 0) {
      continue;
    }

    const existingNodeIds = await db.listAllLocationNodeIds(chunk.id);
    const target = healthyNodes.find((node) => !existingNodeIds.has(node.id));
    if (!target) {
      continue;
    }

    const source = sources[0];
    const job = await db.createRepairJob(chunk.id, source.nodeId, target.id);

    try {
      await postJson(target.address, `/chunks/${chunk.id}/replicate`, {
        sourceUrl: source.address,
        expectedChecksum: chunk.checksum
      });
      await db.addHealthyLocation(chunk.id, target.id);
      await db.finishRepairJob(job.id, "succeeded");
    } catch (error) {
      await db.finishRepairJob(job.id, "failed", error instanceof Error ? error.message : "repair failed");
    }
  }
}

export function startRepairLoop(db: MetadataDb): NodeJS.Timeout {
  return setInterval(() => {
    runRepairOnce(db).catch((error) => {
      console.error("repair loop failed", error);
    });
  }, REPAIR_INTERVAL_MS);
}
