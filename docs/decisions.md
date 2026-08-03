# Decision Log

Every deviation from the PRD or implementation plan must be recorded here with date, context, decision, rationale, and impact.

## 2026-08-03: TypeScript Monorepo

- Context: The project needs multiple services plus shared contracts.
- Decision: Use a pnpm TypeScript monorepo with `packages/shared`, `packages/dfs-cli`, `services/metadata-service`, and `services/storage-node`.
- Rationale: TypeScript keeps API contracts explicit while staying lightweight enough for a 3-week MVP.
- Impact: One build/test workflow covers all components.

## 2026-08-03: 2-of-3 Quorum Writes

- Context: The PRD originally described primary acknowledgement with asynchronous secondary writes, while the implementation plan calls for 2-of-3 quorum writes.
- Decision: Implement 2-of-3 quorum writes.
- Rationale: The plan is newer and gives a stronger, easier-to-demo correctness story: committed chunks already have at least two durable replicas.
- Impact: Upload latency waits for two successful storage-node writes, but reads can survive one node failure immediately after commit.

## 2026-08-03: Oracle VPS Deployment Target

- Context: The PRD mentions GCP, while the implementation plan selects Oracle Free Tier VPS.
- Decision: Document Oracle VPS as the live demo target.
- Rationale: The implementation plan supersedes the draft PRD and keeps the demo inexpensive.
- Impact: Deployment docs use Docker Compose on one VPS with private storage-node networking.

## 2026-08-03: Four-Node Demo Cluster

- Context: Replication factor is 3, but the demo must show repair after one node dies.
- Decision: Run four storage nodes by default.
- Rationale: A spare healthy node is required to restore RF=3 after a killed node remains down.
- Impact: Local and VPS demos start four storage-node containers.

## 2026-08-03: Abrupt Failure Demo Uses `docker kill`

- Context: Planned maintenance and abrupt crashes are different failure modes.
- Decision: Use `docker kill storage-node-3` as the default failure demo and document `docker compose stop storage-node-3` as the graceful variant.
- Rationale: `docker kill` better demonstrates crash tolerance.
- Impact: The main demo proves failover after an ungraceful node death.
