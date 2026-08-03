import Fastify from "fastify";
import { readEnv, readIntEnv } from "@dfs/shared";
import { MetadataDb } from "./db.js";

export interface MetadataConfig {
  databaseUrl: string;
  port: number;
  host: string;
}

export function createMetadataServer(db: MetadataDb) {
  const server = Fastify({ logger: true });

  server.post<{ Body: { id: string; address: string } }>("/nodes/register", async (request, reply) => {
    const { id, address } = request.body;
    if (!id || !address) {
      return reply.status(400).send({ error: "id and address are required" });
    }
    return db.registerNode(id, address);
  });

  server.get("/nodes", async () => ({
    nodes: await db.listNodes()
  }));

  server.post<{ Body: { name: string; size: number; chunkCount: number } }>("/files", async (request, reply) => {
    const { name, size, chunkCount } = request.body;
    if (!name || !Number.isInteger(size) || !Number.isInteger(chunkCount)) {
      return reply.status(400).send({ error: "name, size, and chunkCount are required" });
    }
    return db.createFile(name, size, chunkCount);
  });

  server.post<{
    Params: { fileId: string };
    Body: { chunkIndex: number; checksum: string; size: number };
  }>("/files/:fileId/chunks/plan", async (request, reply) => {
    try {
      return await db.planChunk(request.params.fileId, request.body);
    } catch (error) {
      return reply.status(409).send({ error: error instanceof Error ? error.message : "failed to plan chunk" });
    }
  });

  server.post<{
    Params: { fileId: string; chunkIndex: string };
    Body: { checksum: string; size: number; replicas: Array<{ nodeId: string; address: string }> };
  }>("/files/:fileId/chunks/:chunkIndex/commit", async (request, reply) => {
    try {
      return await db.commitChunk(request.params.fileId, Number(request.params.chunkIndex), request.body);
    } catch (error) {
      return reply.status(409).send({ error: error instanceof Error ? error.message : "failed to commit chunk" });
    }
  });

  server.post<{ Params: { fileId: string } }>("/files/:fileId/complete", async (request, reply) => {
    try {
      return await db.completeFile(request.params.fileId);
    } catch (error) {
      return reply.status(409).send({ error: error instanceof Error ? error.message : "failed to complete file" });
    }
  });

  server.get<{ Params: { fileId: string } }>("/files/:fileId/chunks", async (request, reply) => {
    try {
      return await db.getFileChunks(request.params.fileId);
    } catch (error) {
      return reply.status(404).send({ error: error instanceof Error ? error.message : "file not found" });
    }
  });

  server.post<{ Params: { id: string } }>("/chunk-locations/:id/report-bad", async (request, reply) => {
    await db.reportBadLocation(request.params.id);
    return reply.status(204).send();
  });

  server.get("/metrics", async () => db.metrics());

  return server;
}

export function loadMetadataConfig(): MetadataConfig {
  return {
    databaseUrl: readEnv("DATABASE_URL", "postgres://dfs:dfs@localhost:5432/dfs"),
    port: readIntEnv("PORT", 4000),
    host: process.env.HOST ?? "0.0.0.0"
  };
}
