# DFilesS Web Frontend Implementation Plan

## Summary

Build `apps/dfs-web` as a bare-minimum React + TypeScript + Vite + Tailwind dashboard for DFilesS. This frontend is presentation polish only: it visually demos upload, download, file listing, cluster health, and repair state without adding new distributed-systems logic.

Record this frontend addition and every future deviation from the PRD or this plan in `docs/decisions.md`.

## Key Changes

Frontend:

- Add `apps/dfs-web` to the pnpm workspace.
- Use React, TypeScript, Vite, and Tailwind CSS.
- Brand all visible product text as `DFilesS`.
- Use the approximate design tokens from `docs/dfs-web-frontend-prd.md`; no external styleguide asset blocks implementation.
- Keep a single-page layout with three tabs: `Upload`, `Files`, and `Cluster`.
- Build only the PRD component set: buttons, text/search inputs, status chips, tabs, alerts, and cards.

Backend/API:

- Add `GET /files` to `metadata-service` for the Files tab.
- Enable CORS for the Vercel frontend origin.
- Add a VPS gateway/proxy path for browser chunk traffic, because Vercel cannot call Docker-internal storage-node addresses directly.
- Keep individual storage-node containers private on the VPS Docker network.

Deployment:

- Deploy DFilesS web on Vercel.
- Deploy metadata service, Postgres, storage nodes, and gateway/proxy on the Oracle Free Tier VPS.
- Browser calls one public VPS API/gateway origin.
- Gateway forwards chunk PUT/GET requests to private storage-node containers.

## Frontend Behavior

Upload tab:

- Select a file with a standard file input.
- Browser splits the file into 4 MB chunks.
- Browser computes SHA-256 checksums with `crypto.subtle.digest`.
- Flow mirrors the CLI: create file, plan chunk, upload replicas, commit chunk, complete file.
- Show chunk progress with chips.
- Show success or error alert at the end.

Files tab:

- Fetch `GET /files`.
- Render one card per file with name, size, chunk count, status, and created time.
- Provide a `Download` button for complete files.
- Download through the gateway, verify checksums, rebuild a `Blob`, and trigger browser download.

Cluster tab:

- Poll `GET /nodes` and `GET /metrics` every 5 seconds.
- Render one card per storage node with `Healthy` or `Dead` chip.
- Show cluster-level counts for files, chunks, healthy nodes, dead nodes, under-replicated chunks, and repair jobs.
- Show warning alerts while degraded and success alerts when RF=3 is restored.

## Public Interfaces

New metadata endpoint:

- `GET /files`
- Returns files ordered newest-first.
- Uses the existing `FileRecord` shape from `@dfs/shared`.

Gateway/proxy behavior:

- Frontend never calls Docker-internal storage addresses directly.
- Gateway exposes browser-safe routes such as:
  - `PUT /gateway/nodes/:nodeId/chunks/:chunkId`
  - `GET /gateway/nodes/:nodeId/chunks/:chunkId`
- Gateway resolves `nodeId` to the private storage-node address and forwards the binary request/response.
- Gateway preserves checksum headers.

## Manual Acceptance Demo

Run this as the only frontend validation scope:

- Open DFilesS on Vercel.
- Upload a multi-chunk file.
- Confirm the file appears in the Files tab.
- Download it from the Files tab.
- Verify the downloaded file matches the original.
- On the VPS, run `docker kill storage-node-3`.
- Confirm the Cluster tab shows one dead node and under-replicated chunks.
- Download the same file again and confirm it still succeeds.
- Wait for repair.
- Confirm the Cluster tab shows RF=3 restored.

## Assumptions

- This frontend starts only after the CLI MVP, core fault-injection tests, and resume-critical docs are complete.
- The frontend remains a thin client and does not replace CLI demo scripts.
- No frontend unit tests or component/integration tests are part of this PRD-only frontend scope.
- No auth, accounts, drag-and-drop, pagination, dark mode, mobile-specific layout, or custom animation.
- Vercel is the frontend hosting target.
- Oracle VPS remains the backend/storage deployment target.
- Storage nodes stay private behind the VPS gateway.
- Any change from this plan or the frontend PRD must be logged in `docs/decisions.md`.
