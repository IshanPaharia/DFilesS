import Fastify from "fastify";
import cors from "@fastify/cors";
import { getBytes, postJson, readEnv, readIntEnv, sha256, type StorageMetrics } from "@dfs/shared";
import { ChunkStore } from "./chunk-store.js";

export interface StorageNodeConfig {
  nodeId: string;
  advertisedAddress: string;
  metadataUrl: string;
  dataDir: string;
}

export function createStorageServer(config: StorageNodeConfig) {
  const server = Fastify({ logger: true, bodyLimit: 20 * 1024 * 1024 });
  const store = new ChunkStore(config.dataDir);

  server.register(cors, {
    origin: true,
    exposedHeaders: ["x-checksum", "content-type"]
  });

  server.addContentTypeParser("application/octet-stream", { parseAs: "buffer", bodyLimit: 20 * 1024 * 1024 }, (_request, body, done) => {
    done(null, body);
  });

  server.get("/health", async () => ({
    nodeId: config.nodeId,
    status: "ok"
  }));

  server.put<{ Params: { chunkId: string }; Body: Buffer }>("/chunks/:chunkId", async (request, reply) => {
    const expectedChecksum = request.headers["x-checksum"];
    if (typeof expectedChecksum !== "string") {
      return reply.status(400).send({ error: "missing x-checksum header" });
    }

    try {
      await store.put(request.params.chunkId, request.body, expectedChecksum);
      return reply.status(201).send({
        chunkId: request.params.chunkId,
        checksum: sha256(request.body),
        bytes: request.body.length
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to store chunk";
      return reply.status(message === "checksum mismatch" ? 422 : 400).send({ error: message });
    }
  });

  server.get<{ Params: { chunkId: string } }>("/chunks/:chunkId", async (request, reply) => {
    try {
      const bytes = await store.get(request.params.chunkId);
      return reply
        .header("content-type", "application/octet-stream")
        .header("x-checksum", sha256(bytes))
        .send(bytes);
    } catch {
      return reply.status(404).send({ error: "chunk not found" });
    }
  });

  server.delete<{ Params: { chunkId: string } }>("/chunks/:chunkId", async (request, reply) => {
    await store.delete(request.params.chunkId);
    return reply.status(204).send();
  });

  server.post<{ Params: { chunkId: string }; Body: { sourceUrl: string; expectedChecksum: string } }>(
    "/chunks/:chunkId/replicate",
    async (request, reply) => {
      const { sourceUrl, expectedChecksum } = request.body;
      try {
        const bytes = await getBytes(sourceUrl, `/chunks/${request.params.chunkId}`);
        await store.put(request.params.chunkId, bytes, expectedChecksum);
        return reply.status(201).send({
          chunkId: request.params.chunkId,
          checksum: sha256(bytes),
          bytes: bytes.length
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "replication failed";
        return reply.status(502).send({ error: message });
      }
    }
  );

  server.get("/metrics", async (): Promise<StorageMetrics> => ({
    nodeId: config.nodeId,
    ...(await store.metrics())
  }));

  return { server, store };
}

export async function registerWithMetadata(config: StorageNodeConfig): Promise<void> {
  await postJson(config.metadataUrl, "/nodes/register", {
    id: config.nodeId,
    address: config.advertisedAddress
  });
}

export function loadStorageConfig(): StorageNodeConfig {
  const port = readIntEnv("PORT", 7001);
  const nodeId = readEnv("NODE_ID", `storage-node-${port}`);
  return {
    nodeId,
    advertisedAddress: readEnv("ADVERTISED_ADDRESS", `http://localhost:${port}`),
    metadataUrl: readEnv("METADATA_URL", "http://localhost:4000"),
    dataDir: readEnv("DATA_DIR", `data/${nodeId}`)
  };
}
