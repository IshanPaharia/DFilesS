# Design

## Components

The system follows a GFS/HDFS-style split between metadata and storage. The metadata service owns file records, chunk records, node health, chunk locations, and repair decisions. Storage nodes only store, serve, delete, and replicate chunk bytes.

The CLI is intentionally part of the data path. It splits files into 4 MB chunks, computes SHA-256 checksums, uploads directly to storage nodes, commits chunks only after quorum, and reassembles verified chunks during download.

## Write Path

1. CLI registers a file with name, size, and chunk count.
2. For each chunk, CLI asks metadata for a placement plan.
3. Metadata chooses three healthy storage nodes without duplicates.
4. CLI uploads the chunk bytes to all three targets.
5. Storage nodes reject bytes whose SHA-256 does not match `x-checksum`.
6. CLI commits the chunk only if at least two replicas stored it durably.
7. Metadata marks the file complete after all chunks are committed.

This gives a simple 2-of-3 write quorum. A third failed replica does not fail the user write, and the repair loop can restore full replication later.

## Read Path

1. CLI asks metadata for committed chunks and healthy locations.
2. Metadata returns only committed chunks and locations on healthy nodes.
3. CLI tries each chunk's replicas until bytes match the expected size and checksum.
4. CLI reports corrupt or unreadable replicas to metadata.

Reads survive any single storage-node failure because every committed chunk has at least two acknowledged replicas at commit time.

## Failure Detection

Metadata polls every registered node's `/health` endpoint every 5 seconds. A node is marked dead after 3 consecutive misses. When a node is marked dead, metadata also marks all chunk locations on that node unhealthy so future downloads skip it.

## Repair

The repair loop scans committed chunks whose healthy replica count is below 3. For each chunk, it chooses a healthy source replica and a healthy target node that does not already have that chunk. The target pulls bytes from the source through `POST /chunks/:chunkId/replicate`, verifies the checksum, then metadata records the new healthy location.

## Scope Boundaries

Metadata-service high availability, Raft, erasure coding, auth, a web UI, and cross-region deployment are deliberately out of scope for the MVP.
