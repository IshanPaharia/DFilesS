export type NodeStatus = "healthy" | "dead";

export interface StorageNodeRecord {
  id: string;
  address: string;
  status: NodeStatus;
  lastHeartbeat: string | null;
  missedHeartbeats: number;
}

export interface FileRecord {
  id: string;
  name: string;
  size: number;
  chunkCount: number;
  status: "uploading" | "complete";
  createdAt: string;
}

export interface ChunkPlanRequest {
  chunkIndex: number;
  checksum: string;
  size: number;
}

export interface ChunkPlanResponse {
  chunkId: string;
  targets: Array<{
    nodeId: string;
    address: string;
  }>;
}

export interface ChunkCommitRequest {
  checksum: string;
  size: number;
  replicas: Array<{
    nodeId: string;
    address: string;
  }>;
}

export interface ChunkLocation {
  id: string;
  nodeId: string;
  address: string;
}

export interface DownloadChunk {
  id: string;
  chunkIndex: number;
  checksum: string;
  size: number;
  locations: ChunkLocation[];
}

export interface FileChunksResponse {
  file: FileRecord;
  chunks: DownloadChunk[];
}

export interface ClusterMetrics {
  files: number;
  chunks: number;
  healthyNodes: number;
  deadNodes: number;
  underReplicatedChunks: number;
  repairJobsQueued: number;
  repairJobsSucceeded: number;
  repairJobsFailed: number;
}

export interface StorageMetrics {
  nodeId: string;
  chunks: number;
  bytesStored: number;
}
