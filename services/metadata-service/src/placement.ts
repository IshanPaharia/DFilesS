import { REPLICATION_FACTOR, type StorageNodeRecord } from "@dfs/shared";

export interface ReplicaTarget {
  nodeId: string;
  address: string;
}

export function selectReplicaTargets(
  healthyNodes: Pick<StorageNodeRecord, "id" | "address">[],
  chunkIndex: number,
  replicationFactor = REPLICATION_FACTOR
): ReplicaTarget[] {
  const uniqueNodes = Array.from(new Map(healthyNodes.map((node) => [node.id, node])).values()).sort((a, b) =>
    a.id.localeCompare(b.id)
  );

  if (uniqueNodes.length < replicationFactor) {
    throw new Error(`need ${replicationFactor} healthy nodes, found ${uniqueNodes.length}`);
  }

  const start = chunkIndex % uniqueNodes.length;
  const targets: ReplicaTarget[] = [];

  for (let offset = 0; targets.length < replicationFactor; offset += 1) {
    const node = uniqueNodes[(start + offset) % uniqueNodes.length];
    targets.push({
      nodeId: node.id,
      address: node.address
    });
  }

  return targets;
}
