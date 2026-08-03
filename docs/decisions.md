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

## 2026-08-03: DFilesS Web Dashboard (`apps/dfs-web`)

- Context: The system needed a presentation layer for non-technical viewers to demo upload, download, file listing, and self-healing cluster state.
- Decision: Add `apps/dfs-web` as a React + Vite + Tailwind dashboard, enable CORS on `metadata-service` and `storage-node`, add `GET /files`, and implement VPS gateway chunk proxying (`/gateway/nodes/:nodeId/chunks/:chunkId`).
- Rationale: Allows browser clients to upload and download files through a single public origin without direct browser access to private Docker storage-node IPs.
- Impact: The presentation polish is complete without introducing new distributed-systems logic.

## 2026-08-03: Local/Colocated PostgreSQL

- Context: Database setup choice between external managed Postgres (e.g. Neon) vs containerized local Postgres.
- Decision: Kept Postgres local/colocated rather than Neon.
- Rationale: Avoids adding an external network dependency to the control-plane's hot path.
- Impact: Metadata operations retain low latency and zero external dependency risk during local and VPS deployment.

## 2026-08-03: Strict Gateway Routing for Web Clients

- Context: Browser clients on external networks (e.g. Vercel) cannot access private Docker container IP addresses (`http://storage-node-N:7001`).
- Decision: Standardize `apps/dfs-web` chunk uploads and downloads exclusively through `metadata-service` gateway endpoints (`/gateway/nodes/:nodeId/chunks/:chunkId`).
- Rationale: Isolates storage node network addresses as internal implementation details and eliminates CORS/mixed-content issues.
- Impact: Storage nodes remain securely tucked inside the private Docker network; web applications communicate only with the public metadata/gateway origin.

## 2026-08-03: Shared Secret Write Protection & Targeted Rate Limiting

- Context: Protecting live demo deployments against write abuse without obscuring or locking the presentation dashboard behind a full passkey login gate.
- Decision: Implement write-route shared secret checking (`X-DFS-Write-Secret` header against `DFS_WRITE_SECRET`) paired with targeted rate limiting (30 req/min for write routes), while leaving read and metrics polling routes (`/metrics`, `/nodes`, `/files`) fully public and unthrottled.
- Rationale: Preserves the core goal of deploying a public demo (showing cluster health, file listings, and downloads) while preventing unauthorized write/storage resource abuse.
- Impact: Visitors can explore the dashboard and download files immediately; authorized uploaders can enter the secret on the upload tab or pass it via CLI env var.

## 2026-08-03: Caddy + DuckDNS HTTPS Reverse Proxy & Oracle Firewall Setup

- Context: Web browsers require HTTPS endpoints when fetching from HTTPS origins (Vercel). Oracle Cloud blocks ports 80 and 443 by default at both VCN and OS iptables levels.
- Decision: Deploy Caddy reverse proxy using a free DuckDNS domain (`dfiless.duckdns.org`) for automatic Let's Encrypt TLS termination, and explicitly document opening VCN ingress rules and instance OS iptables/ufw rules.
- Rationale: Caddy provides zero-config automatic HTTPS, while explicit firewall documentation prevents ACME challenge timeouts during initial VPS setup.
- Impact: Live demo endpoints are securely served over HTTPS without custom certificate management overhead.

## 2026-08-03: Two-Phase `heal-watch` Failure & Repair Verification

- Context: `docker kill storage-node-3` requires ~15 seconds for heartbeat missed thresholds to mark the node dead in metadata. Premature `watchHealing` checks could exit immediately if run before node death was registered.
- Decision: Refactor CLI `watchHealing` to run in two explicit phases: Phase 1 waits until failure/under-replication is observed, and Phase 2 waits until repair completes (under-replicated chunks = 0 and RF=3 restored).
- Rationale: Ensures deterministic and reliable failure-demo verification logs during automated and manual testing.
- Impact: `heal-watch` reliably tracks and logs the complete failure detection and self-healing lifecycle.



