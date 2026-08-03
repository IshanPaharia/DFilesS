# Demo Readiness and Passkey Implementation Plan

## Goal

Fix the remaining demo-readiness gaps without expanding the project beyond its resume/system-design purpose. Add a simple passkey gate before the DFilesS dashboard so only someone with the configured passkey can access the frontend.

## 1. Fix Failure Demo Reliability

Update `packages/dfs-cli/src/client.ts`.

Change `watchHealing` so it does not pass immediately when `underReplicatedChunks === 0`.

Make it run in two phases:

- Phase 1: wait until failure is observed:
  - `deadNodes > 0` or `underReplicatedChunks > 0`
- Phase 2: wait until repair completes:
  - `underReplicatedChunks === 0`
  - enough healthy nodes exist for RF=3 restoration

Print clear demo logs:

- `Waiting for metadata to mark node dead...`
- `Failure detected: dead=1 under_replicated=N`
- `Waiting for repair to restore RF=3...`
- `Repair complete: under_replicated=0`

Add a short note in `docs/failure-demo.md` explaining heartbeat delay: after `docker kill storage-node-3`, metadata needs roughly 15 seconds to mark the node dead.

## 2. Prove End-to-End Demo

Run and document one real local/VPS acceptance demo:

```bash
docker compose up --build -d
docker compose run --rm cli demo seed
docker kill storage-node-3
docker compose run --rm cli status
docker compose run --rm cli download <file-id> --out downloads/demo-seed.bin
docker compose run --rm cli demo heal-watch
```

Update `docs/failure-demo.md` with:

- Exact commands
- Expected output shape
- Expected timing
- How to verify downloaded file correctness
- What the demo proves: quorum write, heartbeat failure detection, failover reads, and re-replication

## 3. Make Vercel and VPS Browser Access Clean

Update frontend networking so Vercel never tries Docker-internal storage-node URLs.

In `apps/dfs-web/src/api/client.ts`:

- Remove direct storage-node fetch attempts.
- Always use gateway routes:
  - `PUT /gateway/nodes/:nodeId/chunks/:chunkId`
  - `GET /gateway/nodes/:nodeId/chunks/:chunkId`
- Keep storage-node addresses private implementation details.

Update docs:

- `README.md`: list `GET /files` and gateway endpoints.
- `docs/deployment-oracle-vps.md`: add Vercel setup:
  - `VITE_METADATA_URL=https://api.<your-domain>`
  - metadata/gateway exposed through HTTPS
  - storage nodes remain private Docker services

## 4. Add HTTPS Reverse Proxy Plan

On the Oracle VPS, add Caddy or Nginx in front of `metadata-service`.

Recommended: Caddy for simpler TLS.

Add to deployment docs:

- Domain/subdomain points to VPS IP, for example `api.dfiless.com`.
- Caddy terminates HTTPS.
- Caddy proxies to `metadata-service:4000`.
- Vercel frontend uses only the HTTPS API origin.

Target shape:

```text
Browser / Vercel
  -> https://api.dfiless.com
    -> Caddy on VPS
      -> metadata-service:4000
        -> private storage-node-N:7001 through gateway
```

## 5. Add Frontend Passkey Gate

Use a lightweight server-side gate on Vercel, not a client-only passkey.

Reason: a client-only passkey would be visible in bundled JavaScript. That is acceptable only for superficial UI hiding, but not defensible. A Vercel middleware/function gate is still simple and cleaner.

Implementation shape:

- Add `apps/dfs-web/src/AccessGate.tsx` or a simple `/access` view.
- Add Vercel serverless route:
  - `POST /api/access`
  - Reads passkey from request body.
  - Compares to server env var, for example `DFILESS_DASHBOARD_PASSKEY`.
  - If correct, sets an HTTP-only cookie like `dfiless_access=1`.
- Add Vercel middleware:
  - Allows `/access`, `/api/access`, static assets, and favicon.
  - Blocks dashboard routes unless `dfiless_access` cookie is present.
  - Redirects unauthenticated users to `/access`.
- Add logout action:
  - Clear cookie and return to access screen.

Docs:

- Add `DFILESS_DASHBOARD_PASSKEY=<your-passkey>` to Vercel env setup.
- State clearly: this is a demo access gate, not full auth/user management.

## 6. Decision Log Updates

Append entries to `docs/decisions.md` for:

- Frontend always uses gateway instead of direct node URLs.
- Vercel + HTTPS reverse proxy deployment.
- Passkey-gated dashboard access.
- `heal-watch` two-phase failure/repair verification.

## Verification

Run:

```bash
corepack pnpm typecheck
corepack pnpm build
corepack pnpm test
```

Manual checks:

- Open Vercel site without passkey: redirected to access screen.
- Wrong passkey: dashboard remains blocked.
- Correct passkey: dashboard loads.
- Upload works through gateway.
- Download works through gateway.
- `docker kill storage-node-3` shows degraded cluster.
- Download still succeeds.
- `heal-watch` waits for failure first, then repair completion.
- Cluster tab eventually shows RF=3 restored.
