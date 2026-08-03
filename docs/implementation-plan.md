# Distributed File Store Implementation Plan

## Summary

Build a TypeScript distributed file store that demonstrates chunking, replication, quorum writes, failure detection, failover reads, and automatic re-replication for an SWE resume project.

Any future deviation from the PRD or this plan must be recorded in `docs/decisions.md`.

## Core Architecture

Components:

- `metadata-service`: Fastify REST API, Postgres metadata store, heartbeat loop, repair loop
- `storage-node`: Fastify REST API, local disk-backed chunk storage
- `dfs-cli`: Commander-based CLI for upload, download, status, verify, and demo flows
- `shared`: common types, checksum helpers, config parsing, HTTP clients

Runtime:

- TypeScript monorepo with pnpm workspaces
- Docker Compose for local and Oracle VPS deployment
- Default cluster: 1 metadata service, 1 Postgres instance, 4 storage-node containers
- Replication factor: 3
- Fourth storage node exists so RF=3 can be restored after one node is killed

## Key Decisions

Chunking:

- Fixed 4 MB chunks
- SHA-256 checksum per chunk
- Client verifies checksums during upload and download
- Storage nodes reject chunks whose bytes do not match expected checksum

Write model:

- Use 2-of-3 quorum writes instead of primary-only async acknowledgement
- CLI uploads each chunk to 3 assigned storage nodes
- Metadata commits a chunk only after at least 2 replicas confirm durable storage
- Failed partial uploads stay uncommitted or are cleaned up
- Repair loop restores committed chunks to 3 healthy replicas

Read model:

- Metadata returns only committed chunks and healthy replica locations
- CLI tries replicas until one returns bytes matching the checksum
- Bad or corrupt replicas are reported back to metadata
- Reads survive any single storage-node failure

Failure demo:

- Run multiple storage-node containers on the Oracle VPS
- Demonstrate failure by stopping one container
- Use `docker kill storage-node-3` for the main resume demo because it simulates an abrupt crash
- Document `docker compose stop storage-node-3` as the graceful planned-maintenance variant
- The demo must show upload, abrupt node failure, successful download, degraded replica count, and automatic repair back to RF=3

Decision log:

- Create `docs/decisions.md`
- Every PRD or implementation-plan deviation must include date, context, decision, rationale, and impact
- Initial entries should cover TypeScript, 2-of-3 quorum, Oracle VPS deployment, 4-node demo cluster, and `docker kill` as the failure-demo default

## Public Interfaces

Metadata API:

- `POST /nodes/register`
- `GET /nodes`
- `POST /files`
- `POST /files/:fileId/chunks/plan`
- `POST /files/:fileId/chunks/:chunkIndex/commit`
- `POST /files/:fileId/complete`
- `GET /files/:fileId/chunks`
- `POST /chunk-locations/:id/report-bad`
- `GET /metrics`

Storage API:

- `GET /health`
- `PUT /chunks/:chunkId`
- `GET /chunks/:chunkId`
- `DELETE /chunks/:chunkId`
- `POST /chunks/:chunkId/replicate`
- `GET /metrics`

CLI:

- `dfs upload <path>`
- `dfs download <fileId> --out <path>`
- `dfs status`
- `dfs verify <fileId>`
- `dfs demo seed`
- `dfs demo kill-node <nodeId>`
- `dfs demo heal-watch`

Database tables:

- `files`
- `chunks`
- `nodes`
- `chunk_locations`
- `repair_jobs`

## Deployment Plan

Local:

- Docker Compose runs Postgres, metadata service, and 4 storage nodes
- Each storage node gets a separate mounted data directory
- Demo scripts must work locally before VPS deployment

Oracle Free Tier VPS:

- Deploy the same Docker Compose topology on one VPS
- Run multiple storage-node containers on the VPS network
- Use persistent Docker volumes or host-mounted directories for Postgres and node data
- Expose only the metadata service publicly if needed
- Keep storage nodes private to the Docker network for the default demo
- Add `docs/deployment-oracle-vps.md` with setup, firewall, env vars, deploy, failure demo, teardown, and troubleshooting

## Milestones

Week 1: Single-node correctness

- Set up monorepo, TypeScript config, tests, Docker Compose, and shared utilities
- Implement storage-node chunk PUT/GET/DELETE
- Implement metadata file/chunk registration
- Implement CLI upload/download for one node
- Add byte-for-byte round-trip tests

Week 2: Replication and failover

- Add node registration and placement selection
- Implement 2-of-3 commit flow
- Add heartbeat detection
- Add healthy-location filtering
- Add failover reads after killing one node
- Add Docker Compose integration tests

Week 3: Self-healing, deployment, polish

- Implement repair loop
- Add node-to-node replication
- Add corrupt/missing replica reporting
- Add metrics and richer `dfs status`
- Add deterministic demo scripts
- Write README, architecture docs, decision log, Oracle VPS deployment docs, failure demo docs, and interview notes

## Test Plan

Unit tests:

- Chunk split/reassembly
- SHA-256 checksum validation
- Placement selection without duplicate nodes
- 2-of-3 quorum commit behavior
- Node health transitions
- Repair target selection

Integration tests:

- Upload/download byte equality for empty, small, exact-4MB, multi-chunk, and binary files
- Upload succeeds with 2 successful replicas
- Upload fails with fewer than 2 successful replicas
- Download succeeds after `docker kill storage-node-3`
- Repair restores RF=3 when a spare node exists
- Corrupt replica is skipped and reported
- Metadata never returns uncommitted chunks for download

Acceptance demo:

- Start cluster on Oracle VPS
- Upload a multi-chunk file
- Run `docker kill storage-node-3`
- Download still succeeds
- `dfs status` shows the dead node and under-replicated chunks
- Repair loop copies chunks to the spare node
- `dfs status` shows RF=3 restored
- Downloaded file matches original byte-for-byte

## Resume Deliverables

Required docs:

- `docs/implementation-plan.md`
- `README.md`
- `docs/design.md`
- `docs/decisions.md`
- `docs/failure-demo.md`
- `docs/deployment-oracle-vps.md`
- `docs/interview-notes.md`

Required proof:

- Passing unit and integration tests
- Docker Compose demo commands
- Oracle VPS demo commands
- Short recording or GIF showing abrupt node failure and automatic repair

Out of scope:

- Metadata-service HA
- Raft or leader election
- Erasure coding
- Auth
- Web UI
- Automatic rebalancing when new nodes join
- Cross-region deployment

## Assumptions

- Oracle VPS deployment is the main live demo target
- The project remains CLI-first
- TypeScript is the implementation language
- 2-of-3 quorum is the write acknowledgement model
- `docker kill storage-node-3` is the default failure demo because it represents a crash more honestly than graceful shutdown
- Any future implementation shift must update `docs/decisions.md` in the same change
