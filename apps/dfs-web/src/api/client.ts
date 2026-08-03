import type {
  ChunkPlanResponse,
  ClusterMetrics,
  DownloadChunk,
  FileChunksResponse,
  FileRecord,
  StorageNodeRecord
} from "@dfs/shared";

export const METADATA_BASE_URL = (import.meta.env.VITE_METADATA_URL as string | undefined) ?? "/api";

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
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, size, chunkCount })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to create file: ${errText}`);
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
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chunkIndex, checksum, size })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to plan chunk ${chunkIndex}: ${errText}`);
  }
  return res.json();
}

export async function uploadChunkPayload(
  targetNodeId: string,
  targetAddress: string,
  chunkId: string,
  bytes: ArrayBuffer,
  checksum: string
): Promise<void> {
  // Try direct node upload first
  try {
    const url = `${targetAddress.replace(/\/$/, "")}/chunks/${chunkId}`;
    const directRes = await fetch(url, {
      method: "PUT",
      headers: {
        "content-type": "application/octet-stream",
        "x-checksum": checksum
      },
      body: bytes
    });
    if (directRes.ok) {
      return;
    }
  } catch {
    // Network or CORS error reaching direct storage address; fallback to gateway proxy
  }

  // Gateway proxy fallback
  const gatewayUrl = `${METADATA_BASE_URL}/gateway/nodes/${targetNodeId}/chunks/${chunkId}`;
  const gatewayRes = await fetch(gatewayUrl, {
    method: "PUT",
    headers: {
      "content-type": "application/octet-stream",
      "x-checksum": checksum
    },
    body: bytes
  });

  if (!gatewayRes.ok) {
    const text = await gatewayRes.text();
    throw new Error(`Upload chunk ${chunkId} to node ${targetNodeId} failed: ${text}`);
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
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ checksum, size, replicas })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to commit chunk ${chunkIndex}: ${errText}`);
  }
  return res.json();
}

export async function completeFile(fileId: string): Promise<FileRecord> {
  const res = await fetch(`${METADATA_BASE_URL}/files/${fileId}/complete`, {
    method: "POST"
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to complete file: ${errText}`);
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
  address: string,
  chunkId: string
): Promise<{ buffer: ArrayBuffer; checksum: string | null }> {
  // Try direct fetch first
  try {
    const url = `${address.replace(/\/$/, "")}/chunks/${chunkId}`;
    const res = await fetch(url);
    if (res.ok) {
      const checksum = res.headers.get("x-checksum");
      const buffer = await res.arrayBuffer();
      return { buffer, checksum };
    }
  } catch {
    // Direct reach failed, fallback to gateway proxy
  }

  // Gateway proxy fallback
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
