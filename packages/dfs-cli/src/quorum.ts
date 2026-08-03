import { WRITE_QUORUM } from "@dfs/shared";

export function assertWriteQuorum<T>(successfulReplicas: T[], quorum = WRITE_QUORUM): T[] {
  if (successfulReplicas.length < quorum) {
    throw new Error(`write quorum not met: need ${quorum}, got ${successfulReplicas.length}`);
  }
  return successfulReplicas;
}
