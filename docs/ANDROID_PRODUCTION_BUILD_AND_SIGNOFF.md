# VNex Solar | Android Production Build, Security & Sign-Off Guide

**Application:** VNex Solar | Solar Business Management (`com.vnexsolar.app`)  
**Version:** `1.0.0` (`versionCode = 100`)  
**SDK Targets:** `minSdk = 26` (Android 8.0 Oreo) · `compileSdk = 35` · `targetSdk = 35` (Android 15)  
**Architecture:** Offline-First Native Kotlin + Jetpack Compose + Material 3 + Clean MVVM + Hilt + Room + WorkManager + Retrofit/OkHttp + CameraX + ML Kit

---

## 1. Final Web-to-Android Feature Parity Matrix

Every existing web workflow in VNex Solar has been converted to a native Android module backed by the shared `/api/v1/*` backend (zero WebView wrappers):

| # | Module | Android Route | Native Implementation | Offline Support |
| --- | --- | --- | --- | --- |
| 1 | Authentication & Biometrics | Session Gate | `LoginScreen`, `AuthViewModel`, `KeystoreManager` (AES-256-GCM), `SessionVault`, `TokenRefreshAuthenticator`, `BiometricHelper` | Cached encrypted session + Biometric unlock |
| 2 | Operations Dashboard | `dashboard` | `FieldHomeScreen`, `DashboardViewModel` — 12 live KPIs, interactive Compose Canvas 6-month Revenue vs Expenses chart, date range filters | Room `dashboard_snapshots` cache |
| 3 | Projects Pipeline | `projects` | `ProjectsScreen`, `ProjectsViewModel` — adaptive phone/tablet split pane, stage filters, project creation, survey/quote/install tabs, incremental pagination | Room `projects` cache |
| 4 | Customers & Sites CRM | `customers` | `CustomersScreen`, `CustomersViewModel` — adaptive split pane, search, customer onboarding, multi-site addresses (LESCO/MEPCO/KE, phase), pagination | Room `customers` + `sites` + offline outbox creation |
| 5 | Finance & Accounting | `finance` | `FinanceScreen`, `FinanceViewModel` — invoices, payments (`Cash`, `Bank Transfer`, `JazzCash`, `Easypaisa`), expenses, customer ledgers, P&L | Room `draft_expenses` + offline `expense_draft` queue |
| 6 | More Hub | `more` | `MoreHubScreen` — RBAC-filtered access to all operational & engineering modules | Fully local navigation |
| 7 | Site Surveys & CameraX + GPS | `surveys` | `SiteSurveyScreen`, `SiteSurveyViewModel`, `NativeCameraCapture`, `SiteLocationHelper` — roof sections, load profiles, optional GPS coordinates, JPEG compression + SHA-256 photo queue | Full offline draft & photo queue |
| 8 | Solar Engineering Suite | `engineering` | `SolarEngineeringScreen`, `SolarEngineeringViewModel`, `SolarCalculatorEngine` — 20 deterministic SI formulas (`vnex-eng-v1.0.0`), Voc cold safety blocker, MPPT bounds, cable V-drop, battery sizing, ROI/NPV/LCOE | 100% offline local calculation + `solar_design_draft` queue |
| 9 | Quotations & Native PDF | `quotations` | `QuotationsScreen`, `QuotationsViewModel`, `QuotationCalculator`, `QuotationPdfExporter` — integer minor-unit math, BOM/tax/discounts/labor/transport, native `PdfDocument`, `PdfRenderer` preview, `PrintManager`, `FileProvider` Sharesheet | Room `cached_quotations` + `quotation_draft` queue |
| 10 | Inventory & Stock Control | `inventory` | `InventoryScreen`, `InventoryViewModel`, `QrBarcodeScannerDialog` — PV panels, inverters, batteries, cables, low-stock alerts, serial tracking, ML Kit barcode scanning, idempotent stock transactions | Room `cached_equipment` catalog |
| 11 | Suppliers & Purchase Orders | `suppliers` | `SuppliersScreen` — supplier directory, PO creation, issue & stock receipt flows | Online transactional sync |
| 12 | Field Installations | `installations` | `InstallationTasksScreen`, `InstallationTasksViewModel`, `NativeCameraCapture` — checklist tasks, daily site diary, CameraX proof photos | Full offline outbox + media queue |
| 13 | Safety & IEC 62446-1 | `safety` | `SafetyInspectionScreen`, `SafetyInspectionViewModel`, `NativeCameraCapture` — PPE/LOTO/height controls, earth & insulation resistance readings, evidence photos | Full offline `inspection_draft` + media queue |
| 14 | Commissioning & Handover | `commissioning` | `CommissioningScreen`, `CommissioningViewModel`, `CustomerSignatureDialog`, `CommissioningPdfExporter` — IEC verification suite, engineer approval, native Canvas customer signature (PNG + SHA-256), QR asset register, PDF preview/print/share | Signature PNG queued in Room media queue |
| 15 | Maintenance & QR Lookup | `maintenance` | `MaintenanceWarrantyScreen`, `MaintenanceWarrantyViewModel`, `QrBarcodeScannerDialog` — live ML Kit QR lookup (`/api/v1/assets/qr/{token}`), warranty verification, O&M schedules, field service notes | Offline `maintenance_note` queue |
| 16 | Reports & Analytics | `reports` | `ReportsScreen`, `ReportsViewModel` — P&L, receivables/payables, inventory valuation, project pipeline | Live server reports |
| 17 | Offline Sync Queue | `sync` | `SyncQueueScreen`, `SyncQueueViewModel`, `SyncEngine`, `SyncWorker`, `VNexNotificationHelper` — manual `Sync Now`, exponential backoff, `accept_server` / `merge_client` conflict resolution, dead-letter recovery, media SHA-256 retry | Core offline engine |
| 18 | Team RBAC & Settings | `employees`, `settings` | `EmployeesScreen`, `SettingsScreen` — 9-role RBAC overview, currency selector (`PKR`, `USD`, `EUR`, `GBP`, `AED`, `SAR`), Light/Dark theme, Biometric lock, Notification permissions, HTTPS Server URL validation | Persisted in Jetpack DataStore |

---

## 2. Verified Security & Quality Safeguards

1. **Encrypted Credential Storage:** Access & rotating refresh tokens are encrypted at rest with Android Keystore AES-256-GCM (`KeystoreManager` + `SessionVault`) and `android:allowBackup="false"`.
2. **Strict Release Transport Security:**
   - `src/main/res/xml/network_security_config.xml` enforces `<base-config cleartextTrafficPermitted="false" />`.
   - Emulator/localhost cleartext overrides are isolated strictly to `src/debug/res/xml/network_security_config.xml`.
   - `ApiUrlValidator` and `AuthInterceptor` reject non-HTTPS server URLs in release builds and block embedded credentials or unsafe schemes.
3. **Zero Hardcoded Secrets & Log Stripping:** Signing credentials are read only from environment variables or Gradle properties (`VNEX_KEYSTORE_*`), and `proguard-rules.pro` strips `android.util.Log.v/d/i` calls in release APKs.
4. **Offline Data Protection:** Room database migrations (`MIGRATION_1_2`, `MIGRATION_2_3`) run deterministically; destructive downgrade fallback is disabled in release builds (`BuildConfig.DEBUG` guard).
5. **Financial & Engineering Integrity:** All currency math uses integer minor units (`Long`) matching the backend PostgreSQL `BIGINT` schema; electrical calculations use deterministic SI units (`vnex-eng-v1.0.0`) clearly distinguishing engineering calculations from design estimates.

---

## 3. Building & Testing the Android Application

### Prerequisites (Local Workstation or CI Runner)
- **JDK 17** (`JAVA_HOME` pointing to Temurin/Corretto/OpenJDK 17)
- **Android SDK** with `platforms;android-35` and `build-tools;35.0.0`
- **Gradle 8.10+** (or Android Studio Ladybug / Meerkat+)

### 3.1 Run Android Unit Tests
```bash
cd apps/android
./gradlew :app:testDebugUnitTest
```
Executes all 7 Kotlin JUnit test suites:
- `ApiUrlValidatorAndSecurityTest`
- `DesignSystemAndNavTest`
- `OfflineOutboxRecoveryTest`
- `QuotationCalculatorTest`
- `RbacAndCurrencyTest`
- `SolarCalculatorEngineTest`
- `SyncBackoffAndChecksumTest`

### 3.2 Build Debug APK (Local Development / Emulator)
```bash
cd apps/android
./gradlew :app:assembleDebug
# Output: apps/android/app/build/outputs/apk/debug/app-debug.apk
```
To target a custom LAN backend during development:
```bash
./gradlew :app:assembleDebug -PVNEX_DEBUG_API_BASE_URL=https://staging.vnexsolar.com/
```

### 3.3 Build Signed Release APK & Play Store App Bundle (AAB)
Export your release keystore credentials in CI secrets (never commit keystores or passwords to Git):
```bash
export VNEX_KEYSTORE_PATH="/secure/path/vnex-release.jks"
export VNEX_KEYSTORE_PASSWORD="<keystore-password>"
export VNEX_KEY_ALIAS="vnex-release"
export VNEX_KEY_PASSWORD="<key-password>"

cd apps/android
./gradlew :app:assembleRelease :app:bundleRelease \
  -PVNEX_RELEASE_API_BASE_URL=https://api.vnexsolar.com/
```
Outputs:
- Signed APK: `apps/android/app/build/outputs/apk/release/app-release.apk`
- Play Store AAB: `apps/android/app/build/outputs/bundle/release/app-release.aab`

---

## 4. Environment Limitations & Pre-Release Checklist

- **Container Runtime Disclosure:** This Node.js workspace container does not have `java`, `gradle`, or the Android SDK installed. All backend APIs, shared domain math, security contracts, and Android Kotlin source assertions were verified via `npm test`, `npm run lint`, and `npm run build`. Execute `./gradlew :app:testDebugUnitTest :app:assembleRelease` in Android Studio or CI before Play Store distribution.
- **Pre-Production Checklist:**
  1. Generate a dedicated upload keystore and store credentials in CI secret management.
  2. Configure production HTTPS API domain (`VNEX_RELEASE_API_BASE_URL`) and backend CORS allowlist.
  3. Run `./gradlew :app:lintRelease :app:testReleaseUnitTest :app:bundleRelease` on an Android CI runner.
  4. Perform on-device smoke testing on a physical Android phone and tablet covering CameraX capture, ML Kit QR scanning, Biometric unlock, Canvas customer signature, PDF print/share, and airplane-mode offline sync recovery.
