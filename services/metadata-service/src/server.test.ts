import { describe, expect, it, beforeEach } from "vitest";
import { createMetadataServer } from "./server.js";
import { MetadataDb } from "./db.js";

describe("createMetadataServer security and rate limiting", () => {
  const mockDb = {
    registerNode: async () => ({ id: "node-1", address: "http://node1:7001", status: "healthy", lastHeartbeat: new Date(), missedHeartbeats: 0 }),
    listNodes: async () => [{ id: "node-1", address: "http://node1:7001", status: "healthy", lastHeartbeat: new Date(), missedHeartbeats: 0 }],
    listFiles: async () => [],
    createFile: async (name: string, size: number, chunkCount: number) => ({ id: "file-1", name, size, chunkCount, status: "pending", createdAt: new Date() }),
    planChunk: async () => ({ chunkId: "chunk-1", targets: [{ nodeId: "node-1", address: "http://node1:7001" }] }),
    commitChunk: async () => ({ id: "chunk-1", fileId: "file-1", chunkIndex: 0, checksum: "sha", size: 100, locations: [] }),
    completeFile: async () => ({ id: "file-1", name: "test", size: 100, chunkCount: 1, status: "completed", createdAt: new Date() }),
    getFileChunks: async () => ({ file: { id: "file-1", name: "test", size: 100, chunkCount: 1, status: "completed", createdAt: new Date() }, chunks: [] }),
    reportBadLocation: async () => {},
    metrics: async () => ({ healthyNodes: 1, deadNodes: 0, files: 0, chunks: 0, underReplicatedChunks: 0, repairJobsSucceeded: 0, repairJobsFailed: 0 })
  } as unknown as MetadataDb;

  it("allows public GET requests for metrics and files", async () => {
    const server = createMetadataServer(mockDb);
    const metricsRes = await server.inject({ method: "GET", url: "/metrics" });
    expect(metricsRes.statusCode).toBe(200);

    const filesRes = await server.inject({ method: "GET", url: "/files" });
    expect(filesRes.statusCode).toBe(200);
  });

  it("blocks write routes when DFS_WRITE_SECRET is set and header is missing or invalid", async () => {
    process.env.DFS_WRITE_SECRET = "supersecret";
    const server = createMetadataServer(mockDb);

    // Missing header
    const resNoHeader = await server.inject({
      method: "POST",
      url: "/files",
      payload: { name: "test.txt", size: 10, chunkCount: 1 }
    });
    expect(resNoHeader.statusCode).toBe(401);

    // Wrong header
    const resWrongHeader = await server.inject({
      method: "POST",
      url: "/files",
      headers: { "x-dfs-write-secret": "wrongsecret" },
      payload: { name: "test.txt", size: 10, chunkCount: 1 }
    });
    expect(resWrongHeader.statusCode).toBe(401);

    // Correct header
    const resCorrectHeader = await server.inject({
      method: "POST",
      url: "/files",
      headers: { "x-dfs-write-secret": "supersecret" },
      payload: { name: "test.txt", size: 10, chunkCount: 1 }
    });
    expect(resCorrectHeader.statusCode).toBe(200);

    delete process.env.DFS_WRITE_SECRET;
  });
});
