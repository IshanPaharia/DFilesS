import type {
  ChunkPlanResponse,
  ClusterMetrics,
  DownloadChunk,
  FileChunksResponse,
  FileRecord,
  StorageNodeRecord
} from "@dfs/shared";

export const METADATA_BASE_URL = (import.meta.env.VITE_METADATA_URL as string | undefined) ?? "/api";

let writeSecretState = localStorage.getItem("dfs_write_secret") ?? "";

export function setWriteSecret(secret: string): void {
  writeSecretState = secret;
  if (secret) {
    localStorage.setItem("dfs_write_secret", secret);
  } else {
    localStorage.removeItem("dfs_write_secret");
  }
}

export function getWriteSecret(): string {
  return writeSecretState;
}

function getWriteHeaders(): Record<string, string> {
  const secret = getWriteSecret();
  return secret ? { "x-dfs-write-secret": secret } : {};
}

export async function fetchFiles(): Promise<FileRecord[]> {
  const res = await fetch(`${METADATA_BASE_URL}/files`);
  if (!res.ok) {
    throw new Error(`Failed to fetch files (${res.status})`);
  }
  const data = await res.json();
  return data.files ?? [];
}

export async function fetchNodes(): Promise<StorageNodeRecord[]> {
  const res = await fetch(`${METADATA_BASE_URL}/nodes`);
  if (!res.ok) {
    throw new Error(`Failed to fetch nodes (${res.status})`);
  }
  const data = await res.json();
  return data.nodes ?? [];
}

export async function fetchMetrics(): Promise<ClusterMetrics> {
  const res = await fetch(`${METADATA_BASE_URL}/metrics`);
  if (!res.ok) {
    throw new Error(`Failed to fetch metrics (${res.status})`);
  }
  return res.json();
}

export async function createFile(name: string, size: number, chunkCount: number): Promise<FileRecord> {
  const res = await fetch(`${METADATA_BASE_URL}/files`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...getWriteHeaders()
    },
    body: JSON.stringify({ name, size, chunkCount })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to create file (${res.status}): ${errText}`);
  }
  return res.json();
}

export async function planChunk(
  fileId: string,
  chunkIndex: number,
  checksum: string,
  size: number
): Promise<ChunkPlanResponse> {
  const res = await fetch(`${METADATA_BASE_URL}/files/${fileId}/chunks/plan`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...getWriteHeaders()
    },
    body: JSON.stringify({ chunkIndex, checksum, size })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to plan chunk ${chunkIndex} (${res.status}): ${errText}`);
  }
  return res.json();
}

export async function uploadChunkPayload(
  targetNodeId: string,
  _targetAddress: string,
  chunkId: string,
  bytes: ArrayBuffer,
  checksum: string
): Promise<void> {
  // Always route upload through metadata-service gateway
  const gatewayUrl = `${METADATA_BASE_URL}/gateway/nodes/${targetNodeId}/chunks/${chunkId}`;
  const gatewayRes = await fetch(gatewayUrl, {
    method: "PUT",
    headers: {
      "content-type": "application/octet-stream",
      "x-checksum": checksum,
      ...getWriteHeaders()
    },
    body: bytes
  });

  if (!gatewayRes.ok) {
    const text = await gatewayRes.text();
    throw new Error(`Upload chunk ${chunkId} to node ${targetNodeId} failed (${gatewayRes.status}): ${text}`);
  }
}

export async function commitChunk(
  fileId: string,
  chunkIndex: number,
  checksum: string,
  size: number,
  replicas: Array<{ nodeId: string; address: string }>
): Promise<DownloadChunk> {
  const res = await fetch(`${METADATA_BASE_URL}/files/${fileId}/chunks/${chunkIndex}/commit`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...getWriteHeaders()
    },
    body: JSON.stringify({ checksum, size, replicas })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to commit chunk ${chunkIndex} (${res.status}): ${errText}`);
  }
  return res.json();
}

export async function completeFile(fileId: string): Promise<FileRecord> {
  const res = await fetch(`${METADATA_BASE_URL}/files/${fileId}/complete`, {
    method: "POST",
    headers: {
      ...getWriteHeaders()
    }
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to complete file (${res.status}): ${errText}`);
  }
  return res.json();
}

export async function getFileChunks(fileId: string): Promise<FileChunksResponse> {
  const res = await fetch(`${METADATA_BASE_URL}/files/${fileId}/chunks`);
  if (!res.ok) {
    throw new Error(`Failed to get file chunks (${res.status})`);
  }
  return res.json();
}

export async function downloadChunkPayload(
  nodeId: string,
  _address: string,
  chunkId: string
): Promise<{ buffer: ArrayBuffer; checksum: string | null }> {
  // Always route download through metadata-service gateway
  const gatewayUrl = `${METADATA_BASE_URL}/gateway/nodes/${nodeId}/chunks/${chunkId}`;
  const res = await fetch(gatewayUrl);
  if (!res.ok) {
    throw new Error(`Download chunk ${chunkId} from node ${nodeId} failed (${res.status})`);
  }
  const checksum = res.headers.get("x-checksum");
  const buffer = await res.arrayBuffer();
  return { buffer, checksum };
}

export async function reportBadLocation(locationId: string): Promise<void> {
  await fetch(`${METADATA_BASE_URL}/chunk-locations/${locationId}/report-bad`, {
    method: "POST"
  });
}
