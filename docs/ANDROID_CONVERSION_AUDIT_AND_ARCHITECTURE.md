# VNex Solar | Android Conversion — Phase 1 Audit & Architecture Specification

**Audit Date:** 2026-11-18  
**Source of Truth:** `/app/applet` (`server.ts`, `server/*`, `packages/domain/src/*`, `apps/api/drizzle/*`, `apps/api/src/openapi/openapi-spec.ts`, `src/*`, `apps/android/*`)  
**Target Platform:** Native Android (Kotlin + Jetpack Compose + Material 3 + Room + WorkManager + Hilt) supporting Phones & Tablets (Android 8.0 / API 26 to Android 15 / API 35)

---

## 1. Existing Architecture Audit

### 1.1 Current Frontend Framework & Dependencies (`package.json`, `src/`)
- **Framework:** React `19.0.1` SPA compiled with Vite `8.3.0` (`@vitejs/plugin-react ^6.1.1`) and TypeScript `^7.0.2`.
- **Styling & Animation:** Tailwind CSS `^4.3.3` (`@tailwindcss/vite`), `lucide-react ^0.546.0`, `motion ^12.23.24`.
- **Validation:** `zod ^4.6.7`.
- **Existing Web Screens (`src/components/`):**
  1. `OperationsOverview.tsx` — Executive architecture dashboard & role switcher preview.
  2. `TenantAuthConsole.tsx` — Organization registration, Argon2id login, refresh token rotation, staff provisioning, immutable audit log, and security posture display.
  3. `CustomersProjectsWorkspace.tsx` — Customer CRM, multi-site addresses, project pipeline creation & stage view.
  4. `SiteSurveysWorkspace.tsx` — Roof sections, appliance load profiles, hazards, SHA-256 photo presign/commit, survey submission.
  5. `SolarEngineeringWorkbench.tsx` — 20-formula PV sizing, Voc/MPPT validation, design revisions, Solar Engineer approval/rejection.
  6. `InventoryWorkspace.tsx` — Warehouses, suppliers, equipment catalog, purchase orders (issue/partial receive/full receive), reservations, issues, returns, write-offs, serialized tracking.
  7. `QuotationsBillingWorkspace.tsx` — Design-to-BOM quotations, revisioning, sandboxed printable HTML proposal, invoices, payments, credit notes, tax rules, balanced double-entry journals.
  8. `InstallationWorkspace.tsx` — Scheduled jobs, crew assignment, optimistic checklist tasks, daily logs, linked material issues, SHA-256 progress photos, completion gates.
  9. `SafetyInspectionWorkspace.tsx` — Risk assessments (PPE/height/electrical isolation), checklists, incidents (auto-blocking major/critical), IEC 62446-1 inspections, corrective actions, hard safety gate.
  10. `CommissioningWorkspace.tsx` — Commissioning test suite, human engineer sign-off, SHA-256 handover pack, customer sign-off, QR asset register generation, printable certificate.
  11. `MaintenanceWarrantyWorkspace.tsx` — QR asset lookup, preventive maintenance schedules & triggering, service tickets, technician visits, warranty claim expiry/replacement decisions.
  12. `SyncEngineConsole.tsx` — Device registration, batch sync, conflict resolution, dead-letter queue acknowledgement, monotonic checkpoints, media SHA-256 recovery.

### 1.2 Backend Architecture & Dependencies (`server.ts`, `server/*`)
- **Runtime:** Node.js Express `^4.21.2` (`server.ts` mounts Vite middleware in dev and `/api/v1` router via `server/api-v1.ts`).
- **Authentication & Cryptography:** `argon2 ^0.45.2` (Argon2id `memoryCost=65536, timeCost=3, parallelism=1`), `jose ^6.2.17` (`HS256` 15-min JWT access tokens + opaque 30-day SHA-256-hashed rotating refresh tokens with reuse-family revocation), Node `crypto` SHA-256 checksums.
- **Hardening Verified:** `x-powered-by` disabled, `nosniff`, `X-Frame-Options: DENY` on API routes, `Cache-Control: no-store`, strict CSP, non-reflecting CORS allowlist, malformed JSON `400 BAD_JSON` handler, 5-attempt failed-login lockout (`429 ACCOUNT_LOCKED`), 120 req/min IP rate limiter.
- **API Scope:** `142` route handlers across `116` unique `/api/v1` endpoints with **100% OpenAPI 3.1 parity** (`apps/api/src/openapi/openapi-spec.ts`), verified by **46 passing automated tests** (`npm test`).

### 1.3 Database Schema, Relationships & Migrations (`apps/api/drizzle/`)
- `0001_initial_schema.sql`: **85 normalized PostgreSQL tables** with UUID primary keys, `organization_id` tenant foreign keys, `BIGINT` / `NUMERIC(18,4)` currency columns (zero floating-point money types), `row_version` optimistic concurrency counters, and `14` targeted indexes.
- `0002_rls_and_immutability.sql`: PostgreSQL Row-Level Security (`ENABLE` + `FORCE ROW LEVEL SECURITY`) across **80 tenant-scoped tables** using `vnex_current_org_id()`, plus **4 BEFORE UPDATE/DELETE immutability triggers** on `audit_events`, `design_revisions`, `quotation_revisions`, and `journal_entries`.
- **Host Note:** Local runtime uses tenant-scoped in-memory service stores aligned to the Drizzle SQL schema because `docker` and `psql` binaries are absent on this host.

### 1.4 Solar Engineering Calculations (`packages/domain/src/solar-engineering.ts`)
- Formula version: `vnex-eng-v1.0.0` (20 deterministic SI-unit calculations):
  - Daily energy & peak surge power, required PV kWp, total panel count & actual DC kWp, DC/AC ratio, cold-temperature open-circuit string voltage (`Voc_cold` safety blocker), hot-cell `Vmp` & MPPT window bounds, min/max series bounds, MPPT operating current & limit check, battery bank usable/nominal capacity & unit recommendation, tilt/azimuth & shading yield, annual solar offset %, DC/AC copper cable voltage drop (`rho = 0.0178 Ohm*mm2/m`), string fuse (1.56x Isc), AC breaker (1.25x I_ac), earthing conductor size, roof area & array structural mass, 25-year degraded yield & CO2 avoided, simple payback, NPV, and LCOE.
- Already mirrored in Android Kotlin (`SolarCalculatorEngine.kt`) with 2 unit tests (`SolarCalculatorEngineTest.kt`).

### 1.5 Inventory & Accounting Logic
- **Currency:** Integer minor units (`*Minor`, `PKR`, `USD`, `AED`, `EUR`, `GBP`) in `packages/domain/src/quotations-billing.ts`.
  - **Gap:** `SAR` (Saudi Riyal) and payment methods `jazzcash` / `easypaisa` need to be added to both shared domain contracts and Android/Backend validators.
- **Double-Entry Journals:** `verifyJournalEntryBalanced()` enforces `totalDebitMinor === totalCreditMinor > 0`; automatically posts balanced entries on invoice issue, payment receipt/allocation, and credit note issuance.
- **Gap:** While `expenses` exists in `0001_initial_schema.sql`, `/api/v1/finance/expenses` and `/api/v1/reports/*` / `/api/v1/dashboard/summary` endpoints are not yet exposed in `server/api-v1.ts` and must be added cleanly without breaking existing routes.

### 1.6 User Roles & Permissions (`packages/domain/src/roles.ts`)
- 9 roles (`ORG_OWNER`, `COMPANY_MANAGER`, `SOLAR_ENGINEER`, `SALES_EXECUTIVE`, `INSTALLATION_SUPERVISOR`, `SAFETY_OFFICER`, `FINANCE_OFFICER`, `FIELD_TECHNICIAN`, `CUSTOMER`) across 27 permission keys (`org:manage` through `infrastructure:read`).
- Resource-level isolation enforced on `FIELD_TECHNICIAN` (assigned projects, installation jobs, and service tickets only) and `CUSTOMER` (`403` on staff sync endpoints).

### 1.7 Existing Android Prototype (`apps/android/`) — Audit Findings & Bugs
Inspecting all **34** existing files in `apps/android/`:
1. **DI Missing Provider Bug (`DatabaseModule.kt`):** `VNexDatabase` declares `cachedEquipmentDao()`, but `DatabaseModule.kt` omits `@Provides fun provideCachedEquipmentDao(db: VNexDatabase)`.
2. **Incomplete Navigation (`VNexNavGraph.kt`):** Uses 6 bottom destinations (`Home`, `Surveys`, `Solar Calc`, `Tasks`, `Safety`, `Sync`) instead of the required 5-tab mobile architecture (`Dashboard`, `Projects`, `Customers`, `Finance`, `More`) + tablet `NavigationRail`; `"sync"` maps to `ModuleFoundationPlaceholder`; `"maintenance"` has no UI navigation trigger.
3. **Missing Network / Auth Foundation:** `SyncApiService.kt` defines only 3 sync endpoints; there is no `NetworkModule` (Retrofit/OkHttp), no `AuthInterceptor` / `TokenRefreshAuthenticator`, no Login/Session restoration UI, and `KeystoreManager` is not wired to secure JWT/refresh token persistence.
4. **Incomplete Sync Engine (`SyncWorker.kt` & `OfflineEntities.kt`):** `VNexDatabase` covers only 7 tables; `SyncWorker.pullDelta()` advances the checkpoint without persisting pulled `delta.changes` into Room DAOs, and `MediaUploadQueueDao` uploads are not yet executed in a worker loop.
5. **Missing Business Modules on Android:** No Dashboard KPI/Chart screen (only static `FieldHomeScreen`), no Customers CRM screen, no Projects lifecycle screen, no Quotations/PDF/Sharesheet workflow, no Finance/Payments/Expenses/Ledger screens, no Inventory/Suppliers screens, no Commissioning/Customer Signature screen, no Reports export screen, no ML Kit QR scanner, and no Biometric prompt.

---

## 2. Web-to-Android Feature Parity Matrix

| Module | Web Implementation | Current Android State | Target Android Conversion Plan |
| --- | --- | --- | --- |
| Auth, Session & Biometrics | `TenantAuthConsole.tsx`, `/auth/*` | `KeystoreManager.kt` stub only | Login, Org switcher, Keystore-encrypted JWT/Refresh storage, auto refresh interceptor, Biometric lock |
| Executive Dashboard | `OperationsOverview.tsx` | Static `FieldHomeScreen.kt` | Real KPI dashboard (12 metrics), Compose charts, date filters, `/api/v1/dashboard/summary` |
| Customers & Sites | `CustomersProjectsWorkspace.tsx` | `CustomerEntity`/`CustomerDao` only (no UI) | Offline-capable Customer list, search, detail + ledger, create/edit, site address capture |
| Projects Pipeline | `CustomersProjectsWorkspace.tsx` | None | Full Project list, creation, customer/site binding, stage timeline, audit history |
| Site Surveys & Camera | `SiteSurveysWorkspace.tsx` | `SiteSurveyScreen.kt`, `SurveyCameraScreen.kt` | Enhance with GPS location capture (optional), load summary preview, media recovery status |
| Solar Engineering | `SolarEngineeringWorkbench.tsx` | `SolarCalculatorEngine.kt` + basic screen | Full 20-calc UI (load, panels, inverter, battery, cable drop, tilt, ROI/NPV/LCOE, draft approval sync) |
| Quotations & PDFs | `QuotationsBillingWorkspace.tsx` | None | Quotation builder, BOM from design, tax/discounts/labor/transport, native `PdfDocument`, Print & Sharesheet |
| Finance & Accounting | `QuotationsBillingWorkspace.tsx` | None | Invoices, payments (`Cash`, `Bank`, `JazzCash`, `Easypaisa`), credit notes, expenses, customer ledgers, P&L |
| Inventory & Suppliers | `InventoryWorkspace.tsx` | `CachedEquipmentEntity` only | Catalog (panels/inverters/batteries/cables/etc.), warehouses, suppliers, POs, issues, low-stock alerts, QR scan |
| Installations | `InstallationWorkspace.tsx` | `InstallationTasksScreen.kt` | Job list synced from server, crew view, material issue, daily logs, CameraX progress photos |
| Safety & Inspections | `SafetyInspectionWorkspace.tsx` | `SafetyInspectionScreen.kt` | Risk assessments, checklists, incidents, IEC readings, corrective actions, Safety Officer sign-off view |
| Commissioning & Handover | `CommissioningWorkspace.tsx` | None | Commissioning tests, engineer approval status, Canvas customer signature, handover PDF certificate |
| Maintenance & Warranty | `MaintenanceWarrantyWorkspace.tsx` | Basic `MaintenanceWarrantyScreen.kt` | ML Kit QR scanner lookup, preventive schedule list, ticket lifecycle, warranty claim submission |
| Offline Sync Engine | `SyncEngineConsole.tsx` | `OfflineRepository.kt` + `SyncWorker.kt` | Complete Sync Queue screen (`SYNC NOW`, dead letters, conflicts, media checksum retry, last sync timestamp) |
| Reports & Notifications | Partial (admin/audit) | None | Multi-report screen + PDF/CSV export, WorkManager + NotificationManager local alerts |

---

## 3. Android Conversion Strategy & Backend Reuse Plan

1. **Zero Backend Duplication:** Android calls the existing `/api/v1/*` REST API directly via Retrofit + OkHttp (`kotlinx.serialization`). Shared JWTs, Argon2id credentials, and 9-role RBAC rules guarantee seamless Web + Android co-operation.
2. **Targeted Non-Destructive Backend Additions (Phase 2/3/5):**
   - Extend `SupportedCurrency` to include `'SAR'` alongside `'PKR' | 'USD' | 'AED' | 'EUR' | 'GBP'`.
   - Extend `PaymentMethod` to include `'jazzcash'` and `'easypaisa'` as recordable payment methods (explicitly without claiming direct gateway integration).
   - Add missing API v1 endpoints backing existing SQL tables: `/api/v1/dashboard/summary`, `/api/v1/finance/expenses`, `/api/v1/finance/ledgers`, `/api/v1/reports/*` — preserving 100% OpenAPI parity.
3. **Native UI First (Zero WebView Wrapper):** All screens implemented natively in Jetpack Compose + Material 3 using VNex Solar color tokens (`Amber #D97706 / #F59E0B`, `Slate #0F172A / #F8FAFC`).

---

## 4. Database Compatibility Assessment

- Server PostgreSQL uses UUIDv4/v7 primary keys, `organization_id` tenant scoping, `row_version` integer counters, and `NUMERIC(18,4)` / integer minor units.
- Android Room (`VNexDatabase` upgraded cleanly with explicit migrations, removing destructive fallback on release builds) stores identical UUIDs, `organizationId`, `rowVersion`, and `Long` minor-unit money values (`amountMinor`, `unitCostMinor`, `unitSellPriceMinor`) so rounding drift between Web and Android is impossible.

---

## 5. Recommended Android Project Structure (`apps/android/app/src/main/java/com/vnexsolar/app/`)

```text
core/
  database/        VNexDatabase, Migrations, entity/*, dao/*
  designsystem/    Theme, VNexColors, AdaptiveNavigation, Charts, Components
  di/              DatabaseModule, NetworkModule, RepositoryModule
  network/         AuthInterceptor, TokenRefreshAuthenticator, AuthApiService, CoreApiServices, SyncApiService
  preferences/     AppPreferences (DataStore)
  security/        KeystoreManager, SessionVault, BiometricHelper
  sync/            OfflineRepository, SyncWorker, MediaUploadWorker, NetworkMonitor, ChecksumUtil
  pdf/             PdfDocumentGenerator, PrintAndShareHelper
  notifications/   VNexNotificationScheduler
feature/
  auth/            LoginScreen, AuthViewModel, SessionGate
  dashboard/       DashboardScreen, DashboardViewModel
  projects/        ProjectsScreen, ProjectDetailScreen, ProjectsViewModel
  customers/       CustomersScreen, CustomerDetailScreen, CustomersViewModel
  finance/         FinanceHubScreen, InvoicesTab, PaymentsTab, ExpensesTab, LedgersTab, FinanceViewModel
  more/            MoreHubScreen, SettingsScreen, EmployeesRbacScreen
  surveys/         SiteSurveyScreen, SurveyCameraScreen, SiteSurveyViewModel
  engineering/     SolarCalculatorEngine, SolarEngineeringScreen, SolarEngineeringViewModel
  quotations/      QuotationsScreen, QuotationBuilderScreen, QuotationsViewModel
  inventory/       InventoryScreen, SuppliersScreen, QrBarcodeScannerScreen, InventoryViewModel
  installations/   InstallationTasksScreen, InstallationTasksViewModel
  safety/          SafetyInspectionScreen, SafetyInspectionViewModel
  commissioning/   CommissioningScreen, SignaturePadCanvas, CommissioningViewModel
  maintenance/     MaintenanceWarrantyScreen, MaintenanceWarrantyViewModel
  reports/         ReportsScreen, ReportsViewModel
  sync/            SyncStatusScreen, SyncConflictScreen, SyncViewModel
```

---

## 6. Phased Implementation Plan

- **Phase 1 (Current):** Complete Audit, Feature Parity Matrix, Conversion Strategy & Architecture Blueprint. *(Stop at Confirmation Gate)*
- **Phase 2:** Android Foundation — Fix `DatabaseModule` DI bug, implement Keystore `SessionVault`, Retrofit/OkHttp auth + token refresh, 5-tab adaptive navigation (`Dashboard`, `Projects`, `Customers`, `Finance`, `More` + Tablet Rail), Login + Biometric lock, and `SAR` / `JazzCash` / `Easypaisa` shared contracts.
- **Phase 3:** Dashboard & Core Business Modules — Backend `/dashboard/summary`, native Dashboard KPIs + Compose charts + date filters, Projects lifecycle, Customers CRM, and More hub.
- **Phase 4:** Solar Engineering — Enhance `SolarCalculatorEngine.kt` & multi-calculator Compose UI (load, PV sizing, inverter, battery, cable/V-drop, tilt/orientation, ROI/NPV/LCOE, design draft saving & tests).
- **Phase 5:** Quotations, Finance & Inventory — Backend `/finance/expenses` + `/finance/ledgers`, native Quotations builder, Invoices/Payments (Cash/Bank/JazzCash/Easypaisa)/Expenses/P&L, Warehouses/Suppliers/Catalog/POs/Issues.
- **Phase 6:** Offline Storage & Synchronization — Expand Room schema across all offline entities, full delta hydration in `SyncWorker`, `MediaUploadWorker` SHA-256 presign/verify retry, real `SyncStatusScreen` with conflict & dead-letter resolution.
- **Phase 7:** Native Android Features — ML Kit QR/Barcode scanner on CameraX, `PdfDocument` generation + PrintManager + FileProvider Sharesheet, WorkManager notifications, optional GPS site tagging.
- **Phase 8:** UI & Performance Optimization — Responsive tablet/landscape layouts, font-scaling checks, image compression, pagination, edge-to-edge & process-death state preservation.
- **Phase 9:** Security & Quality Assurance — Android JUnit tests, backend integration tests for new endpoints, RBAC & financial precision verification, security audit.
- **Phase 10:** Production Build & Documentation — Release Gradle config, ProGuard rules, environment/CI build instructions, final parity & known-issues sign-off report.

---

## 7. Identified Technical Risks & Mitigations

1. **No Local Android SDK / JDK in Container Runtime:** `java`, `gradle`, and Android SDK are unavailable in this Node.js container. *Mitigation:* Enforce strict Kotlin syntax/import/DI/Room consistency, run full backend + domain Jest/Node verification (`npm test`, `npm run lint`, `npm run build`), and never falsely claim a Gradle APK build succeeded when SDK tools are absent; provide exact Gradle wrapper/CI build commands in Phase 10.
2. **Offline Stock & Financial Conflict Risk:** Concurrent offline edits or unauthorized local stock/finance mutations can corrupt balances. *Mitigation:* Keep financial postings, approvals, and stock deductions server-authoritative while supporting safe offline drafts (`customer`, `site_survey`, `solar_design_draft`, `quotation_draft`, `expense_draft`, `installation_task`, `inspection_draft`, `maintenance_note`) with explicit `409 Conflict` resolution.
3. **Room Schema Migration Safety:** Removing `fallbackToDestructiveMigrationOnDowngrade()` / avoiding destructive schema drops requires explicit `Migration(1, 2)` definitions whenever expanding Room tables in Phase 2/6.
4. **ProGuard / R8 & Serialization:** Keep `@Serializable` DTOs, Retrofit interfaces, and Room entities protected in `proguard-rules.pro` so release builds do not strip reflection/serialization metadata.
