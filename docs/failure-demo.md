# Failure Demo

## Local Demo

Start the cluster:

```bash
docker compose up --build
```

Seed a multi-chunk file from inside the Compose network:

```bash
docker compose run --rm cli demo seed
```

Copy the printed `file_id`, then kill one node abruptly:

```bash
docker kill storage-node-3
```

Check status:

```bash
docker compose run --rm cli status
```

After up to 15 seconds, metadata should mark `storage-node-3` dead and report under-replicated chunks.

Download the file:

```bash
docker compose run --rm cli download <file-id> --out downloads/demo-seed.bin
```

Watch repair:

```bash
docker compose run --rm cli demo heal-watch
```

The repair loop should copy missing replicas to the spare fourth node until `under_replicated_chunks=0`.

## Graceful Variant

Use this when demonstrating planned maintenance instead of a crash:

```bash
docker compose stop storage-node-3
```

The expected metadata and repair behavior is the same, but `docker kill` is the default resume demo.