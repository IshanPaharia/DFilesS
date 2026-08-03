# Failure Recovery & Self-Healing Demo

This guide walks through demonstrating DFilesS fault tolerance, failover reads, and automated re-replication repair.

## Local & VPS Demo Sequence

### 1. Start the Cluster

Start all 4 storage nodes, PostgreSQL, metadata-service, and Caddy reverse proxy:

```bash
docker compose up --build -d
```

### 2. Seed Test File

Seed a multi-chunk (~9 MB) test file into the cluster via the CLI container:

```bash
docker compose run --rm cli demo seed
```

*Output shape:*
```text
Created tmp/demo-seed.bin (9437184 bytes)
Chunking /app/tmp/demo-seed.bin (9437184 bytes -> 3 chunks)...
Uploading chunk 1/3...
Chunk 1/3 committed (storage-node-1, storage-node-2)
Uploading chunk 2/3...
Chunk 2/3 committed (storage-node-2, storage-node-3)
Uploading chunk 3/3...
Chunk 3/3 committed (storage-node-3, storage-node-4)
Upload complete. file_id: <file-id-uuid>
```

Copy the generated `file_id`.

### 3. Abrupt Node Failure Injection

Abruptly crash one storage node container:

```bash
docker kill storage-node-3
```

> [!NOTE]
> **Heartbeat Window Delay (~15 Seconds)**:
> Storage nodes heartbeat to `metadata-service` every 5 seconds. `metadata-service` marks a node dead after 3 consecutive missed heartbeats (~15 seconds). Immediately after killing the node, cluster status may still temporarily show the node as `healthy`.

### 4. Verify Failure Detection

Check cluster status via CLI:

```bash
docker compose run --rm cli status
```

*Output shape:*
```text
Nodes:
  storage-node-1: healthy (http://storage-node-1:7001, missed=0)
  storage-node-2: healthy (http://storage-node-2:7001, missed=0)
  storage-node-3: dead (http://storage-node-3:7001, missed=3)
  storage-node-4: healthy (http://storage-node-4:7001, missed=0)
Metrics:
  files=1
  chunks=3
  healthy_nodes=3
  dead_nodes=1
  under_replicated_chunks=2
  repairs succeeded=0 failed=0
```

### 5. Prove Failover Download While Degraded

Download the file while `storage-node-3` is dead:

```bash
docker compose run --rm cli download <file-id-uuid> --out downloads/demo-seed.bin
```

Verify that the downloaded file checksum matches the seeded file:

```bash
sha256sum downloads/demo-seed.bin tmp/demo-seed.bin
```

*(Both SHA-256 hashes must match perfectly. Reads succeed because 2-of-3 write quorum guarantees at least one surviving replica exists on healthy nodes).*

### 6. Two-Phase Healing Watch

Watch automated background repair re-replicate missing chunks to the spare healthy node:

```bash
docker compose run --rm cli demo heal-watch
```

*Output shape:*
```text
Waiting for metadata to mark node dead...
Failure detected: dead=1 under_replicated=2
Waiting for repair to restore RF=3...
healthy=3 dead=1 under_replicated=2
healthy=3 dead=1 under_replicated=0
Repair complete: under_replicated=0
```

Verify final cluster state:

```bash
docker compose run --rm cli status
```

Confirm `under_replicated_chunks=0`, proving RF=3 has been fully restored across the 3 remaining healthy nodes.

## Graceful Maintenance Variant

To test planned maintenance instead of an ungraceful crash:

```bash
docker compose stop storage-node-3
```

The repair loop and status behavior are identical.

## What This Demo Proves

1. **Quorum Writes (2-of-3)**: Every chunk is stored durably across multiple nodes before upload completion.
2. **Heartbeat Failure Detection**: Control plane detects node death within ~15s.
3. **Failover Reads**: Downloads succeed seamlessly without data loss even when nodes die.
4. **Re-Replication Repair**: background repair engine detects degraded chunks and restores RF=3 replication factor onto spare healthy nodes.