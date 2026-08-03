#!/usr/bin/env sh
set -e

# Host directory setup for Distributed File Store bind mounts
# Must be executed before running `docker compose up`.

BASE_DIR="/var/lib/dfs"

echo "Creating DFS host storage directories in $BASE_DIR..."

mkdir -p "$BASE_DIR/postgres" \
         "$BASE_DIR/storage-node-1" \
         "$BASE_DIR/storage-node-2" \
         "$BASE_DIR/storage-node-3" \
         "$BASE_DIR/storage-node-4"

# Set ownership and permissions:
# - postgres:16-alpine container runs as UID 70 (postgres:postgres).
# - storage-node containers build from node:22-alpine with no USER instruction, running as UID 0 (root:root).
chown -R 70:70 "$BASE_DIR/postgres"
chown -R 0:0 "$BASE_DIR/storage-node-1" \
             "$BASE_DIR/storage-node-2" \
             "$BASE_DIR/storage-node-3" \
             "$BASE_DIR/storage-node-4"

chmod 755 "$BASE_DIR/postgres" \
          "$BASE_DIR/storage-node-1" \
          "$BASE_DIR/storage-node-2" \
          "$BASE_DIR/storage-node-3" \
          "$BASE_DIR/storage-node-4"

echo "DFS host directories setup completed successfully."
