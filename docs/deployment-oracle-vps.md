# Oracle Free Tier VPS Deployment

## Setup

Provision an Oracle Linux or Ubuntu ARM/x86 instance with Docker and Docker Compose installed. Clone the repo onto the VPS.

Install runtime tools:

```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-plugin git
sudo usermod -aG docker $USER
```

Log out and back in after adding the Docker group.

## Firewall

Expose only the metadata service if remote observability is needed:

- TCP 4000 from your IP
- SSH 22 from your IP

Keep Postgres and storage nodes private to the Docker network for the default demo. Run demo CLI commands through the Compose `cli` profile so chunk upload/download traffic can reach private storage-node DNS names.

## Environment

The Compose file provides local defaults:

- `DATABASE_URL=postgres://dfs:dfs@postgres:5432/dfs`
- `METADATA_URL=http://metadata-service:4000`
- `ADVERTISED_ADDRESS=http://storage-node-N:7001`

## Host Storage Setup

Before starting the containers, create the required host directories under `/var/lib/dfs` with correct ownership (`70:70` for Postgres, `0:0` for storage nodes):

```bash
sudo ./scripts/setup-host-dirs.sh
```

Or manually:

```bash
sudo mkdir -p /var/lib/dfs/postgres \
              /var/lib/dfs/storage-node-1 \
              /var/lib/dfs/storage-node-2 \
              /var/lib/dfs/storage-node-3 \
              /var/lib/dfs/storage-node-4
sudo chown -R 70:70 /var/lib/dfs/postgres
sudo chown -R 0:0 /var/lib/dfs/storage-node-1 /var/lib/dfs/storage-node-2 /var/lib/dfs/storage-node-3 /var/lib/dfs/storage-node-4
sudo chmod 755 /var/lib/dfs/*
```

## Deploy

```bash
docker compose up --build -d
docker compose ps
```

## Failure Demo

```bash
docker compose run --rm cli demo seed
docker kill storage-node-3
docker compose run --rm cli status
docker compose run --rm cli demo heal-watch
```

## Teardown

```bash
docker compose down
```

Data is persisted in `/var/lib/dfs/` on the host filesystem. To remove persisted data:

```bash
sudo rm -rf /var/lib/dfs/*
```

## Troubleshooting

- If nodes do not register, check `docker compose logs metadata-service storage-node-1`.
- If repair does not converge, confirm at least three storage nodes are healthy.
- If the CLI cannot upload chunks, run it through `docker compose run --rm cli ...` so it shares the Docker network with storage nodes.