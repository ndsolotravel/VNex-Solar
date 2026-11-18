# VNex Solar | Solar Business Management — Phase 0 Repository Audit & Architecture Plan

## 1. Repository & Environment Audit

### 1.1 Existing Workspace & GitHub Repository Inventory
Inspection of both `/app/applet` and the upstream GitHub repository `https://github.com/ndsolotravel/VNex-Solar` (branch `main`, HEAD `74ac331`, parent `49659a4`) confirms this is a **greenfield starter project** with no legacy production modules or BaaS lock-in:

| Item | Current State | Notes |
| --- | --- | --- |
| Git Repository | `ndsolotravel/VNex-Solar` (`main` @ `74ac331`) | Two commits: `49659a4` (Initial README) and `74ac331` (starter React/Vite scaffold + Phase 0 doc); no `.git` folder inside `/app/applet` sandbox |
| Android App (Kotlin / Compose / Room) | Not present | No `settings.gradle.kts`, `build.gradle.kts`, or Kotlin sources |
| Web Admin (Next.js App Router) | Not present | Current web entry is a blank React 19 + Vite 8 SPA (`src/App.tsx`) |
| Backend API (NestJS) | Not present | Express `^4.21.2` and `tsx` are installed in `package.json`, no `server.ts` yet |
| Database / ORM | Not present | No PostgreSQL instance, Prisma/Drizzle config, or migrations |
| Supabase / Firebase Dependencies | None detected | Zero BaaS packages, auth hooks, or storage clients in any commit |
| Existing Tests | None present | Only `npm run lint` (`tsc --noEmit`) and `npm run build` (`vite build`) |
| Security Findings | No secrets exposed | `.env.example` holds placeholder vars; `.gitignore` excludes `.env*` |

### 1.2 Runtime & Tooling Capabilities
- **Available**: Node.js `v22.23.2`, npm `10.9.8`, TypeScript `^7.0.2`, React `19.0.1`, Vite `8.3.0`, Tailwind CSS `^4.3.3`, Express `^4.21.2`.
- **Missing on Host**: `docker`, `psql` / PostgreSQL server, `java`, `gradle` / Android SDK, `nest` CLI, `next` CLI.
- **Environment Constraints**: The active runtime serves port `3000` via Vite / Express (`server.ts`). Native Android compilation (Gradle/ADB/Emulator), Docker Compose orchestration, and self-hosted PostgreSQL/MinIO containers cannot execute directly inside this Node-only container without external CI/VPS or toolchain installation.

---

## 2. Target System Architecture

```text
+-----------------------------------+       +-----------------------------------+
|      Android Field App            |       |       Web Admin Portal            |
|  Kotlin + Jetpack Compose + M3    |       |  Next.js App Router + TypeScript  |
|  Room SQLite (Local Truth)        |       |  Tailwind + TanStack Query + Zod  |
|  WorkManager + CameraX + Keystore |       |  RHF + Server-Side AuthZ          |
+-----------------+-----------------+       +-----------------+-----------------+
                  |                                           |
                  | Persistent Sync Outbox (HTTPS REST)       | HTTPS REST + Cookies/Bearer
                  v                                           v
+-------------------------------------------------------------------------------+
|                     NestJS REST API (/api/v1, OpenAPI)                        |
|  Argon2id Auth + Refresh Rotation | RBAC + Resource AuthZ | Rate Limiting     |
|  Domain Services: Engineering, Quotations, Finance, Inventory, Safety, Sync   |
+-------------------------+---------------------------------+-------------------+
                          |                                 |
                          v                                 v
+-----------------------------------+       +-----------------------------------+
|  Self-Hosted PostgreSQL (Shared)  |       |  Private S3 / MinIO Storage       |
|  organization_id + RLS + UUIDv7   |       |  Photos, PDFs, Datasheets, Certs  |
|  Prisma/Drizzle + Audit Events    |       |  Signed URLs / Authorized Proxy   |
+-----------------------------------+       +-----------------------------------+
```

### 2.1 Core Architectural Decisions
1. **ORM Selection**: **Drizzle ORM** (or Prisma with explicit SQL migrations) evaluated for strict TypeScript decimal/UUID handling, deterministic SQL generation, and clean PostgreSQL Row-Level Security (`SET LOCAL app.current_organization_id`) inside `$transaction` blocks.
2. **Multi-Tenancy & Isolation**: Every tenant-owned table includes `organization_id UUID NOT NULL REFERENCES organizations(id)`. Isolation is enforced across 3 layers:
   - NestJS Tenant Guard deriving `organizationId` exclusively from verified session/token claims (never trusting client payload org IDs).
   - Scoped repository queries (`WHERE organization_id = $ctxOrgId`).
   - PostgreSQL Row-Level Security (`RLS`) policies bound to transaction-local session GUCs.
3. **Authentication & RBAC**:
   - Argon2id password hashing; opaque/JWT access tokens + rotating refresh tokens stored as SHA-256 hashes in `user_sessions` with reuse detection and family revocation.
   - Configurable 9-role matrix (`Organization Owner`, `Company Manager`, `Solar Engineer`, `Sales Executive`, `Installation Supervisor`, `Safety Officer`, `Finance Officer`, `Field Technician`, `Customer`) enforced via permission guards + resource ownership checks + immutable `audit_events`.
4. **Offline-First Android & Sync Engine**:
   - Room SQLite is local source of truth; client generates UUIDs and monotonic `sync_operation_id` + `idempotency_key`.
   - Durable `sync_outbox` table processed by `WorkManager` with `NetworkType.CONNECTED` constraint and exponential backoff.
   - Separate `media_upload_queue` computes SHA-256 checksums, compresses photos, requests pre-signed upload URLs, and commits metadata after upload verification.
   - **No silent Last-Write-Wins** for critical records: server tracks `row_version` and rejects stale mutations with `409 Conflict` + server snapshot into `sync_conflicts` for explicit human resolution. Financial postings, stock deductions, approved designs, and safety/commissioning sign-offs are server-authoritative.
5. **Deterministic Solar Engineering & Exact Finance**:
   - Canonical SI units (`W`, `Wh`, `V`, `A`, `m`, `mm2`, `degC`) with versioned formula snapshots (`formula_version`, `inputs_json`, `outputs_json`, `assumptions_json`). Never auto-certifies electrical code compliance.
   - Exact decimal arithmetic (`NUMERIC(18,4)` in PostgreSQL, integer minor units / `Decimal.js` in TypeScript) for PKR and international currencies; immutable approved quotation revisions and double-entry `journal_entries` / `journal_lines`.
6. **Safety & Commissioning Hard Gates**:
   - Server-side state machines block `installation_jobs` and `commissioning_records` progression when mandatory `risk_assessments`, `safety_checklists`, `electrical_isolation` records, or `test_readings` lack authorized human sign-off.
7. **Cost Optimization & VPS Deployment**:
   - Single shared PostgreSQL instance on private Docker network (no public port 5432), server-side cursor/offset pagination, selective column projections, compressed photos + thumbnails on S3/MinIO, incremental delta sync (`updated_at` / `server_seq` checkpoints), and encrypted off-server `pg_dump` backups with automated restore verification.

---

## 3. Migration Strategy (If Existing Supabase-Backed Code Is Imported)

Because no existing VNex Solar source files or Supabase artifacts are present in this workspace yet, the following zero-data-loss migration plan stands ready if an existing repository is brought in:
1. **Inventory & Freeze**: Export existing `auth.users`, `public.*` tables, RLS policies, and Storage bucket objects with checksums before any code swap.
2. **Identity Migration**: Preserve UUID primary keys (`users.id`). Migrate password hashes where extractable or trigger seamless first-login Argon2id re-hash / reset flow without changing user/org UUIDs.
3. **Schema Mapping**: Map existing tables onto normalized `organization_id`-scoped PostgreSQL tables, preserving historical IDs, timestamps, and attachment paths.
4. **Object Storage Migration**: Sync private bucket objects to MinIO/S3 preserving keys, verify SHA-256 checksums, and backfill `file_attachments` metadata.
5. **Parallel Cutover & Verification**: Run row-count, financial balance, and cross-tenant isolation verification suites prior to decommissioning any legacy endpoint.

---

## 4. Phase Gate Roadmap (Phases 0–16)

- **Phase 0 (Current)**: Repository & REA audit, architecture blueprint, migration plan. *Gate: Architecture approved.*
- **Phase 1**: Monorepo / workspace scaffolding (Android Kotlin+Compose, Next.js Web Admin, NestJS API, shared contracts & design system).
- **Phase 2**: NestJS core, PostgreSQL schema & migrations, OpenAPI, structured logging, health checks.
- **Phase 3**: Argon2id auth, refresh rotation, 9-role RBAC, multi-tenant RLS & isolation tests.
- **Phase 4**: Android Room schema, local repositories, durable outbox, WorkManager sync contracts.
- **Phase 5–12**: Domain modules sequentially — Customers/Surveys -> Solar Engineering -> Inventory -> Quotations/Billing -> Installation -> Safety/Inspection -> Commissioning -> Maintenance/Warranty.
- **Phase 13**: Advanced sync conflict resolution UI/API, media queue checksums, process-death recovery tests.
- **Phase 14**: Web Admin analytics, cost monitoring dashboard, Playwright E2E & accessibility tests.
- **Phase 15**: Security hardening, backup/restore drills, VPS Docker Compose deployment readiness.
- **Phase 16**: Native iOS (SwiftUI) against stabilized REST/OpenAPI contracts.
