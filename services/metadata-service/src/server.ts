import Fastify from "fastify";
import cors from "@fastify/cors";
import { getBytes, putBytes, readEnv, readIntEnv } from "@dfs/shared";
import { MetadataDb } from "./db.js";

export interface MetadataConfig {
  databaseUrl: string;
  port: number;
  host: string;
}

class RateLimiter {
  private requests = new Map<string, number[]>();

  isRateLimited(ip: string, windowMs: number, maxRequests: number): boolean {
    const now = Date.now();
    const windowStart = now - windowMs;
    const timestamps = (this.requests.get(ip) ?? []).filter((t) => t > windowStart);
    if (timestamps.length >= maxRequests) {
      return true;
    }
    timestamps.push(now);
    this.requests.set(ip, timestamps);
    return false;
  }
}

export function createMetadataServer(db: MetadataDb) {
  const server = Fastify({ logger: true, bodyLimit: 20 * 1024 * 1024 });
  const writeRateLimiter = new RateLimiter();

  server.register(cors, {
    origin: true,
    exposedHeaders: ["x-checksum", "content-type"]
  });

  server.addContentTypeParser("application/octet-stream", { parseAs: "buffer", bodyLimit: 20 * 1024 * 1024 }, (_request, body, done) => {
    done(null, body);
  });

  server.addHook("onRequest", async (request, reply) => {
    const method = request.method.toUpperCase();
    const url = request.url;

    const isClientWrite =
      (method === "POST" && url.startsWith("/files")) ||
      (method === "PUT" && url.startsWith("/gateway/"));

    if (isClientWrite) {
      // 1. Shared Secret Check
      const secret = process.env.DFS_WRITE_SECRET;
      if (secret) {
        const headerSecret = request.headers["x-dfs-write-secret"];
        if (headerSecret !== secret) {
          return reply.status(401).send({ error: "Unauthorized: Invalid or missing X-DFS-Write-Secret header" });
        }
      }

      // 2. Targeted Rate Limiting for Writes (30 requests per minute per IP)
      const ip = request.ip || "127.0.0.1";
      if (writeRateLimiter.isRateLimited(ip, 60_000, 30)) {
        return reply.status(429).send({ error: "Too many write requests, please try again later" });
      }
    }
  });

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

  server.get("/files", async () => ({
    files: await db.listFiles()
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

  server.delete<{ Params: { fileId: string } }>("/files/:fileId", async (request, reply) => {
    await db.deleteFile(request.params.fileId);
    return reply.status(204).send();
  });

  server.delete("/files", async (_request, reply) => {
    const deletedCount = await db.deleteIncompleteFiles();
    return reply.send({ message: `Deleted ${deletedCount} incomplete files` });
  });

  server.post<{ Params: { id: string } }>("/chunk-locations/:id/report-bad", async (request, reply) => {
    await db.reportBadLocation(request.params.id);
    return reply.status(204).send();
  });

  server.get("/metrics", async () => db.metrics());

  server.put<{ Params: { nodeId: string; chunkId: string }; Body: Buffer }>(
    "/gateway/nodes/:nodeId/chunks/:chunkId",
    async (request, reply) => {
      const { nodeId, chunkId } = request.params;
      const checksum = request.headers["x-checksum"];
      if (typeof checksum !== "string") {
        return reply.status(400).send({ error: "missing x-checksum header" });
      }

      const nodes = await db.listNodes();
      const targetNode = nodes.find((n) => n.id === nodeId);
      if (!targetNode) {
        return reply.status(404).send({ error: `node ${nodeId} not found` });
      }

      try {
        await putBytes(targetNode.address, `/chunks/${chunkId}`, request.body, {
          "content-type": "application/octet-stream",
          "x-checksum": checksum
        });
        return reply.status(201).send({ status: "ok" });
      } catch (err) {
        return reply.status(502).send({ error: err instanceof Error ? err.message : "proxy upload failed" });
      }
    }
  );

  server.get<{ Params: { nodeId: string; chunkId: string } }>(
    "/gateway/nodes/:nodeId/chunks/:chunkId",
    async (request, reply) => {
      const { nodeId, chunkId } = request.params;
      const nodes = await db.listNodes();
      const targetNode = nodes.find((n) => n.id === nodeId);
      if (!targetNode) {
        return reply.status(404).send({ error: `node ${nodeId} not found` });
      }

      try {
        const response = await fetch(`${targetNode.address.replace(/\/$/, "")}/chunks/${chunkId}`);
        if (!response.ok) {
          return reply.status(response.status).send({ error: "chunk not found on target node" });
        }
        const checksum = response.headers.get("x-checksum");
        if (checksum) {
          reply.header("x-checksum", checksum);
        }
        reply.header("content-type", "application/octet-stream");
        const arrayBuffer = await response.arrayBuffer();
        return reply.send(Buffer.from(arrayBuffer));
      } catch (err) {
        return reply.status(502).send({ error: err instanceof Error ? err.message : "proxy download failed" });
      }
    }
  );

  return server;
}

export function loadMetadataConfig(): MetadataConfig {
  return {
    databaseUrl: readEnv("DATABASE_URL", "postgres://dfs:dfs@localhost:5432/dfs"),
    port: readIntEnv("PORT", 4000),
    host: process.env.HOST ?? "0.0.0.0"
  };
}
