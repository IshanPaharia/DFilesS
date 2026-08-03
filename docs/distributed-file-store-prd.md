# PRD: Distributed File Store

**Author:** Ishan Paharia
**Status:** Draft — MVP scoping
**Target:** SDE resume, project 3 of 3 (CoursessionAI → Pixnette → Distributed File Store)
**Timeline:** 3-week MVP, hard time-box

---

## 1. Problem & Motivation

Most student systems projects stop at "CRUD app with a database." This project exists to demonstrate understanding of **distributed systems fundamentals** — replication, failure detection, and failover — the kind of reasoning tested directly in SDE interviews at companies running real infra at scale.

The build is deliberately modeled on the **GFS/HDFS architecture**: a single logical file store backed by a metadata service and a fleet of storage nodes, where any individual node can die without data loss or service interruption.

**Non-goal:** This is not an attempt to build a production-grade distributed database. Every design decision should be the *simplest mechanism that is still fully defensible*, not the most sophisticated one available. Raft, gRPC, erasure coding, and true metadata-service HA are explicitly out of scope for MVP — see §7.

---

## 2. Goals

| Goal | Success metric |
|---|---|
| Files can be uploaded, chunked, and reassembled correctly | Byte-for-byte round trip on files of varying size |
| Data survives a single node failure | Reads succeed uninterrupted when any one storage node is killed |
| Cluster self-heals after a failure | Replication factor is restored automatically within a bounded time after a node death |
| Every design decision is whiteboard-defensible | Ishan can explain chunk size, replication factor, consistency model, and failure-detection timeout from first principles, unprompted |
| Ship inside the time-box | MVP complete in 3 weeks, stretch goals only attempted if MVP finishes early |

## 3. Non-Goals (MVP)

- Metadata service high availability (leader election / Raft) — stretch only
- Erasure coding — stretch only
- gRPC or any RPC framework beyond REST
- Authentication/authorization on file operations
- Web UI (CLI is the primary interface for MVP)
- Cross-region deployment or multi-datacenter awareness
- Rebalancing existing chunk placement when new nodes join (new nodes are only eligible for *future* writes)

---

## 4. System Overview

Three components:

1. **Metadata Service** — the source of truth for which files exist, how they're chunked, and which storage nodes hold which chunks. Runs heartbeat checks against storage nodes and orchestrates re-replication.
2. **Storage Nodes** — dumb, stateless-except-for-disk workers. Store/serve/delete individual chunks. No awareness of other nodes or of files as a whole.
3. **Client (CLI)** — splits files into chunks and checksums them, talks to the metadata service to discover placement, pushes/pulls chunks directly to/from storage nodes, reassembles on download.

```
        ┌──────────────┐
        │    Client    │
        │     (CLI)    │
        └──────┬───────┘
               │  1. ask for chunk placement
               │  4. upload/download chunks directly
       ┌───────▼────────┐
       │ Metadata Service│◄──── heartbeat ────┐
       │  (Postgres/Neon)│                    │
       └───────┬────────┘                    │
               │ 2. assign 3 nodes per chunk   │
     ┌─────────┼─────────┐                    │
     ▼         ▼         ▼                    │
 ┌───────┐ ┌───────┐ ┌───────┐                │
 │ Node A│ │ Node B│ │ Node C│────────────────┘
 └───────┘ └───────┘ └───────┘
```

---

## 5. Detailed Design

### 5.1 Chunking
- Fixed chunk size: **4 MB**.
- Each chunk gets a SHA-256 checksum, computed client-side before upload and verified on every read.
- **Why fixed-size over content-defined chunking:** content-defined (rolling hash) chunking is what real dedup-aware systems use, but it adds real complexity for no benefit at this scale — fixed-size is fully defensible and keeps the metadata schema simple (no variable boundaries to track).

### 5.2 Metadata Service
- **Store:** PostgreSQL (Neon).
- **Core tables:**
  - `files (id, name, size, created_at, chunk_count)`
  - `chunks (id, file_id, chunk_index, checksum, size)`
  - `nodes (id, address, status, last_heartbeat)`
  - `chunk_locations (chunk_id, node_id, is_healthy)`
- **API (REST):**
  - `POST /files` — register a new file, returns file_id
  - `POST /files/:id/chunks` — register a chunk, triggers node assignment, returns 3 target node addresses
  - `GET /files/:id/chunks` — get full chunk-to-node mapping for download/reassembly
  - `GET /nodes` — cluster status (used for demo/observability)
  - `POST /nodes/register` — a storage node announces itself on startup

### 5.3 Storage Nodes
- **API (REST):**
  - `PUT /chunk/:id` — store chunk bytes
  - `GET /chunk/:id` — retrieve chunk bytes
  - `DELETE /chunk/:id` — remove chunk
  - `GET /health` — liveness probe, used by metadata service's heartbeat loop
- Chunks stored as flat files on local disk, filename = chunk checksum.

### 5.4 Replication
- **Replication factor: 3.** Standard industry default — tolerates 2 simultaneous node failures without data loss, and is the number cited in the GFS paper for the same reason.
- **Consistency model: eventual.** Client write is acknowledged once the *primary* replica confirms; the other 2 replicas are written asynchronously. This is a deliberate simplicity tradeoff over strong consistency (wait for all 3 acks) — chosen because:
  - It's what most real-world object stores (S3, GFS) default to.
  - It avoids write-path complexity (quorum logic, coordinated commit) that would eat the time-box.
  - The tradeoff — a chunk might briefly be under-replicated right after a write — is explicitly understood and stated in the README, not hidden.

### 5.5 Failure Detection
- Metadata service polls every storage node's `/health` endpoint every **5 seconds**.
- A node is marked `dead` after **3 consecutive missed heartbeats** (15s total) — avoids false positives from a single transient network blip while keeping detection time bounded and demo-able.
- On marking a node dead: all `chunk_locations` rows for that node are flagged `is_healthy = false`.

### 5.6 Failover (Read Path)
- Client requests chunk locations from metadata service.
- Metadata service returns only `is_healthy = true` locations.
- If the primary is dead, client transparently reads from a healthy replica — no special-casing needed on the client beyond "try the returned list in order."

### 5.7 Re-replication (Self-Healing)
- Background job in the metadata service periodically scans for chunks with `healthy_replica_count < 3`.
- For each under-replicated chunk, it picks a healthy node not already holding that chunk, instructs it to pull the chunk from a healthy replica, and updates `chunk_locations` on success.
- **Bounded healing time** is a demo-able metric: kill a node, show replication factor restored within N seconds.

---

## 6. User-Facing Flows (CLI)

```
$ dfs upload myphoto.png
Chunking myphoto.png (12MB → 3 chunks)...
Uploading chunk 1/3... done (nodes: A, B, C)
Uploading chunk 2/3... done (nodes: B, C, A)
Uploading chunk 3/3... done (nodes: C, A, B)
Upload complete. file_id: 7f3a...

$ dfs download 7f3a...
Fetching chunk locations...
Downloading chunk 1/3 from node A... checksum OK
Downloading chunk 2/3 from node B... checksum OK
Downloading chunk 3/3 from node C... checksum OK
Reassembled myphoto.png

$ dfs status
Node A: healthy (last heartbeat 2s ago)
Node B: healthy (last heartbeat 3s ago)
Node C: DEAD (last heartbeat 47s ago)
Re-replication: 4 chunks in progress
```

---

## 7. Stretch Goals (only if MVP ships early)

| Stretch goal | Why it's deferred |
|---|---|
| Metadata service HA (hand-rolled leader election, e.g. simplified bully algorithm) | Highest scope-creep risk in the entire project — full Raft is a multi-week rabbit hole and a half-correct implementation is worse than a simple single-instance service you can fully defend |
| Erasure coding instead of full replication | Good "why X over Y" interview story (storage efficiency vs. rebuild complexity) but not needed to prove the core failover concept |
| Rebalancing on new node join | Nice-to-have; MVP's "new nodes only get future writes" is a defensible simplification |
| Minimal web UI | CLI already demonstrates the full flow; UI is presentation polish, not new systems understanding |

---

## 8. Milestones

| Week | Deliverable | Exit criteria |
|---|---|---|
| 1 | Single-node correctness | Upload → download round-trip correct for varying file sizes; checksum mismatch detected |
| 2 | Replication + failure detection | 3-node cluster; killing a node mid-demo still serves correct reads from replicas |
| 3 | Re-replication + polish | Replication factor auto-restores after node death within bounded time; README + architecture diagram + design-decision doc written; GCP demo recorded |

---

## 9. Deployment

- **Dev/demo:** Docker Compose simulating N storage nodes locally.
- **Live demo:** GCP Compute Engine VMs (using $300 trial credit) for a real multi-machine network demo — torn down after recording to avoid ongoing cost. Optionally scaled back to a single always-free e2-micro instance if a persistent link is wanted for the resume.

---

## 10. Interview Defensibility Checklist

Before this project is considered "resume-ready," Ishan should be able to answer, unprompted:

- Why chunk size is 4MB and what changing it would trade off
- Why replication factor is 3, not 2 or 5
- Why eventual consistency was chosen over strong consistency, and what could go wrong under eventual consistency (e.g., reading a chunk mid-replication)
- Why heartbeat/timeout values are 5s / 3 misses, and what false-positive vs. detection-latency tradeoff that represents
- What happens if the metadata service itself dies (single point of failure — and why that's explicitly out of scope for MVP, not an oversight)
- How this compares to GFS/HDFS, and where this implementation deliberately diverges for scope reasons
