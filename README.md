# Distributed File Store

TypeScript distributed file store for demonstrating chunking, replication, quorum writes, failure detection, failover reads, and automatic re-replication.

## Architecture

- `@dfs/metadata-service`: Fastify API with Postgres metadata, heartbeat loop, and repair loop.
- `@dfs/storage-node`: Fastify API with disk-backed chunk storage.
- `@dfs/cli`: Commander CLI for upload, download, status, verify, and demo helpers.
- `@dfs/shared`: common types, checksum helpers, chunking, config, and HTTP utilities.

Default local cluster:

- 1 metadata service
- 1 Postgres instance
- 4 storage nodes
- replication factor 3
- write quorum 2

## Quick Start

```bash
corepack pnpm install
corepack pnpm build
docker compose up --build
```

In another shell, run the CLI inside the Compose network:

```bash
docker compose run --rm cli status
docker compose run --rm cli upload ./README.md
docker compose run --rm cli download <file-id> --out downloads/README.md
docker compose run --rm cli verify <file-id>
```

The default storage-node addresses are private Docker DNS names such as `http://storage-node-1:7001`, so the Compose CLI profile is the recommended local demo path.

## Failure Demo

```bash
docker compose run --rm cli demo seed
docker kill storage-node-3
docker compose run --rm cli status
docker compose run --rm cli download <file-id> --out downloads/demo-seed.bin
docker compose run --rm cli demo heal-watch
```

The fourth storage node lets the repair loop restore committed chunks back to replication factor 3 after one node is killed.

## APIs

Metadata:

- `POST /nodes/register`
- `GET /nodes`
- `POST /files`
- `POST /files/:fileId/chunks/plan`
- `POST /files/:fileId/chunks/:chunkIndex/commit`
- `POST /files/:fileId/complete`
- `GET /files/:fileId/chunks`
- `POST /chunk-locations/:id/report-bad`
- `GET /metrics`

Storage:

- `GET /health`
- `PUT /chunks/:chunkId`
- `GET /chunks/:chunkId`
- `DELETE /chunks/:chunkId`
- `POST /chunks/:chunkId/replicate`
- `GET /metrics`

## Tests

```bash
corepack pnpm test
corepack pnpm typecheck
```