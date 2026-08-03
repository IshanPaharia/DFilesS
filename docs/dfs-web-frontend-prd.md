# PRD: DFS Web Dashboard (Bare-Minimum Frontend)

**Status:** Stretch addition — only starts after the Week-3 CLI MVP and resume deliverables are complete
**Target:** Visual/demo layer on top of the existing Distributed File Store system
**Timeline:** ~3-4 day time-box, treated as optional Week 4

---

## 1. Problem & Motivation

The CLI already fully proves the system: chunking, quorum writes, failure detection, failover reads, and self-healing. This frontend adds **nothing new to the distributed-systems logic** — it exists purely so the project is easier to demo to a non-technical viewer (recruiter, interviewer skimming a portfolio link) and to give the resume a live-clickable artifact alongside the CLI.

**This is explicitly presentation polish, not systems work.** If it competes with Week 3's core deliverables (metrics, fault-injection tests, design docs — the things that actually get you through an interview), it loses every time. The CLI alone is sufficient for the resume story; this is a bonus.

## 2. Goals

- Visually surface the same capabilities the CLI already proves: upload, download, cluster health, and live repair after a node failure.
- Match the provided design system as closely as possible (colors, type scale, spacing, components) so it reads as a finished product, not a scaffold.
- Reuse the existing REST API surface with minimal backend changes.

## 3. Non-Goals

- No auth, no user accounts, no multi-tenancy
- No mobile-optimized layout
- No new distributed-systems logic — the browser is a thin client over the existing metadata/storage APIs
- No drag-and-drop, pagination, dark mode, or animation beyond the hover/active states already defined in the styleguide
- Not a replacement for the CLI demo scripts — both should work independently

---

## 4. Stack

**React + TypeScript + Vite + Tailwind CSS**, as a new `apps/dfs-web` package inside the existing pnpm monorepo, importing types from `shared`.

| Choice | Reasoning |
|---|---|
| React | Already proven on your resume (Pixnette, CoursessionAI) — zero new learning curve |
| TypeScript | Consistent with the rest of the monorepo; shares types with `shared` package |
| Vite over Next.js | This is an admin-style dashboard hitting a REST API — no need for SSR, file-based routing, or server components. Vite is faster to set up and keeps scope tight |
| Tailwind CSS | Already on your resume; its config system maps directly onto the styleguide's token system (colors, spacing, radius) as a theme extension, with almost no hand-written CSS |

---

## 5. Design System Mapping

Implement the provided styleguide (v2.1) as a Tailwind theme extension. Approximate starting values below — sample exact hex codes from the reference image during setup rather than trusting these blindly.

**Color tokens**

| Token | Approx. value | Usage |
|---|---|---|
| `primary` | dark teal (~`#1E4B49`) | Primary buttons, active tabs, focus ring, active chips |
| `surface` | off-white (~`#F7F5F0`) | Page/card backgrounds |
| `border` | light warm gray (~`#DAD7D0`) | Card/input borders |
| `gray-900` → `gray-50` | near-black to near-white, 6-step scale | Text, secondary surfaces, disabled states |

**Typography scale:** H1 Display, H2 Heading, H3 Subheading, Body Large, Body Medium, Body Small, Caption — map to a Tailwind `fontSize` scale with matching `fontWeight`/`lineHeight` pairs.

**Spacing scale:** 4 / 8 / 16 / 24 / 32 / 48 / 64px — matches Tailwind's default scale closely enough to use almost as-is.

**Radius scale:** 0 / 4 / 8 / 12 / 16px / full — custom `borderRadius` theme values.

**Elevation:** 4 shadow levels (`Level 1`–`Level 4`) — custom `boxShadow` theme values, used sparingly (cards = Level 1–2, nothing needs Level 3–4 in this scope).

**Components to build** (this is the full component set — nothing beyond what's shown):
- Buttons: Primary / Secondary / Tertiary × Default / Hover / Active
- Inputs: text + search variants
- Chips: status indicators (e.g. `Active`, `Dead`, `Healthy`, `Under-replicated`)
- Tabs: page navigation
- Alerts: Success / Info / Warning / Error, for operation feedback
- Cards: file list items, node list items

---

## 6. Information Architecture

Single page, three tabs (using the Tabs component from the styleguide):

**Upload** — file picker + upload button. On submit: chunk progress shown as a sequence of Chips (`Chunk 1/3 ✓`, `Chunk 2/3 ✓`...), final state as a Success or Error Alert.

**Files** — Card grid, one Card per uploaded file (name, size, chunk count, "Download" action button).

**Cluster** — Card per storage node, with a status Chip (`Active` / `Dead`) and replica health. An Alert banner appears on state changes (e.g. "Warning: Node 3 unresponsive," "Success: RF=3 restored"), driven by polling — no new backend event system needed.

---

## 7. API Integration

Reuses the existing metadata/storage REST surface with two small additions:

- **New endpoint needed:** `GET /files` (list all files) — not currently in the metadata API surface, needed for the Files tab. Small, low-risk addition.
- **CORS:** both `metadata-service` and `storage-node` need CORS enabled for the browser origin — currently only the CLI talks to them, so this wasn't needed before. Flag this explicitly as a backend change, not just frontend work.

**Upload flow** (mirrors the CLI exactly, just in-browser): `POST /files` → `POST /files/:fileId/chunks/plan` → compute chunk checksums client-side via `crypto.subtle.digest` → `PUT` each chunk directly to its assigned storage nodes → `POST .../commit` → `POST .../complete`.

**Download flow:** `GET /files/:fileId/chunks` → fetch chunks from healthy replica locations → verify checksums → reassemble via `Blob` → trigger browser download.

**Cluster polling:** `GET /nodes` + `GET /metrics` every 5s to drive the Cluster tab and Alert banners.

---

## 8. Milestones (if pursued)

| Day | Deliverable |
|---|---|
| 1 | Vite + Tailwind setup, design tokens configured, static components built (Buttons, Inputs, Chips, Tabs, Alerts, Cards) with no live data |
| 2 | Cluster + Files tabs wired to live API, polling working |
| 3 | Upload + Download wired with in-browser chunking/checksums |
| 4 | Polish, error states, demo recording |

**Explicit stop condition:** if Week 3's core CLI deliverables (metrics, fault-injection tests, design docs, interview notes) are behind schedule, this entire PRD is cut first. It adds nothing to interview defensibility — the CLI does that job alone.

---

## 9. Out of Scope

Auth, multi-user support, mobile layout, drag-and-drop upload, dark mode, pagination (demo-scale file counts assumed), animations beyond the hover/active states already defined in the styleguide.

---

## 10. Decision Log Note

If this is greenlit, log it in `docs/decisions.md`: date, "added minimal web dashboard post-MVP," rationale (demo/presentation polish), and impact (one new `GET /files` endpoint, CORS enabled on both services — no change to core distributed-systems logic).
