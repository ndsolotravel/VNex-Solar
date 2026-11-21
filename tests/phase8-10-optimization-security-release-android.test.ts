import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createApiV1Router } from '../server/api-v1.ts';

function walkFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

async function startTestServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createApiV1Router({ rateLimitMax: 500 }));
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  return { server, baseUrl: `http://127.0.0.1:${addr.port}/api/v1` };
}

test('Phase 7-8 Android: Native Notifications, Optional GPS Tagging, Edge-to-Edge Contrast, Responsive Layouts & Pagination', () => {
  const androidAppRoot = path.resolve(process.cwd(), 'apps/android/app');
  const srcRoot = path.join(androidAppRoot, 'src/main/java/com/vnexsolar/app');

  const manifestSrc = fs.readFileSync(path.join(androidAppRoot, 'src/main/AndroidManifest.xml'), 'utf8');
  const appSrc = fs.readFileSync(path.join(srcRoot, 'VNexSolarApplication.kt'), 'utf8');
  const mainActivitySrc = fs.readFileSync(path.join(srcRoot, 'MainActivity.kt'), 'utf8');
  const notifSrc = fs.readFileSync(path.join(srcRoot, 'core/notifications/VNexNotificationHelper.kt'), 'utf8');
  const locSrc = fs.readFileSync(path.join(srcRoot, 'core/location/SiteLocationHelper.kt'), 'utf8');
  const respSrc = fs.readFileSync(path.join(srcRoot, 'core/designsystem/ResponsiveLayout.kt'), 'utf8');
  const compSrc = fs.readFileSync(path.join(srcRoot, 'core/designsystem/Components.kt'), 'utf8');
  const navSrc = fs.readFileSync(path.join(srcRoot, 'core/navigation/VNexNavGraph.kt'), 'utf8');
  const syncWorkerSrc = fs.readFileSync(path.join(srcRoot, 'core/sync/SyncWorker.kt'), 'utf8');
  const surveyScreenSrc = fs.readFileSync(path.join(srcRoot, 'feature/surveys/SiteSurveyScreen.kt'), 'utf8');
  const surveyVmSrc = fs.readFileSync(path.join(srcRoot, 'feature/surveys/SiteSurveyViewModel.kt'), 'utf8');
  const projectsSrc = fs.readFileSync(path.join(srcRoot, 'feature/projects/ProjectsScreen.kt'), 'utf8');
  const customersSrc = fs.readFileSync(path.join(srcRoot, 'feature/customers/CustomersScreen.kt'), 'utf8');
  const settingsSrc = fs.readFileSync(path.join(srcRoot, 'feature/settings/SettingsScreen.kt'), 'utf8');

  // Native Notifications & Channel Setup
  assert.match(notifSrc, /NotificationChannel/);
  assert.match(notifSrc, /PendingIntent\.FLAG_IMMUTABLE/);
  assert.match(notifSrc, /Manifest\.permission\.POST_NOTIFICATIONS/);
  assert.match(appSrc, /notificationHelper\.ensureChannels\(\)/);
  assert.match(syncWorkerSrc, /notifySyncConflicts/);
  assert.match(settingsSrc, /POST_NOTIFICATIONS/);

  // Optional GPS Tagging on Site Surveys
  assert.match(manifestSrc, /ACCESS_COARSE_LOCATION/);
  assert.match(manifestSrc, /android\.hardware\.location\.gps" android:required="false"/);
  assert.match(manifestSrc, /android:resizeableActivity="true"/);
  assert.match(locSrc, /LocationManager/);
  assert.match(surveyScreenSrc, /SiteLocationHelper/);
  assert.match(surveyScreenSrc, /Tag GPS/);
  assert.match(surveyVmSrc, /val latitude: Double\?/);
  assert.match(surveyVmSrc, /val longitude: Double\?/);

  // Edge-to-Edge Dynamic Light/Dark SystemBarStyle & Smooth Nav Transitions
  assert.match(mainActivitySrc, /SystemBarStyle\.dark/);
  assert.match(mainActivitySrc, /SystemBarStyle\.light/);
  assert.match(navSrc, /fadeIn\(/);
  assert.match(navSrc, /fadeOut\(/);

  // Responsive Tablet Constraints, Font-Scale Resilience, Saveable State & Pagination
  assert.match(respSrc, /VNexWindowWidthClass/);
  assert.match(respSrc, /VNexReadableContentBox/);
  assert.match(respSrc, /VNexPaginationFooter/);
  assert.match(compSrc, /Modifier\.weight\(1f\)/);
  assert.match(compSrc, /TextAlign\.End/);
  assert.match(projectsSrc, /rememberSaveable/);
  assert.match(projectsSrc, /VNexPaginationFooter/);
  assert.match(customersSrc, /rememberSaveable/);
  assert.match(customersSrc, /VNexPaginationFooter/);
});

test('Phase 9-10 Android: Security Hardening, Release Gradle Config, ProGuard, Zero WebView & Production Sign-Off Doc', () => {
  const androidAppRoot = path.resolve(process.cwd(), 'apps/android/app');
  const srcRoot = path.join(androidAppRoot, 'src/main/java/com/vnexsolar/app');

  const releaseNetSec = fs.readFileSync(path.join(androidAppRoot, 'src/main/res/xml/network_security_config.xml'), 'utf8');
  const debugNetSec = fs.readFileSync(path.join(androidAppRoot, 'src/debug/res/xml/network_security_config.xml'), 'utf8');
  const gradleSrc = fs.readFileSync(path.join(androidAppRoot, 'build.gradle.kts'), 'utf8');
  const proguardSrc = fs.readFileSync(path.join(androidAppRoot, 'proguard-rules.pro'), 'utf8');
  const authInterceptorSrc = fs.readFileSync(path.join(srcRoot, 'core/network/AuthInterceptor.kt'), 'utf8');
  const dbModuleSrc = fs.readFileSync(path.join(srcRoot, 'core/di/DatabaseModule.kt'), 'utf8');
  const urlValidatorSrc = fs.readFileSync(path.join(srcRoot, 'core/network/ApiUrlValidator.kt'), 'utf8');
  const junitSecurityTestSrc = fs.readFileSync(
    path.join(androidAppRoot, 'src/test/java/com/vnexsolar/app/ApiUrlValidatorAndSecurityTest.kt'),
    'utf8',
  );
  const signoffDoc = fs.readFileSync(
    path.resolve(process.cwd(), 'docs/ANDROID_PRODUCTION_BUILD_AND_SIGNOFF.md'),
    'utf8',
  );

  // Release network security config blocks all cleartext traffic; debug config isolates emulator loopback
  assert.match(releaseNetSec, /cleartextTrafficPermitted="false"/);
  assert.equal(releaseNetSec.includes('cleartextTrafficPermitted="true"'), false);
  assert.match(debugNetSec, /10\.0\.2\.2/);

  // AuthInterceptor + ApiUrlValidator enforce HTTPS in release builds
  assert.match(urlValidatorSrc, /Cleartext HTTP is blocked/);
  assert.match(authInterceptorSrc, /ApiUrlValidator\.validate/);
  assert.match(authInterceptorSrc, /!BuildConfig\.DEBUG && targetUrl\.scheme != "https"/);

  // Room destructive downgrade disabled in release
  assert.match(dbModuleSrc, /if \(com\.vnexsolar\.app\.BuildConfig\.DEBUG\)/);

  // Release Gradle build config: HTTPS default, non-debuggable, minified, env-based signing (zero hardcoded secrets)
  assert.match(gradleSrc, /https:\/\/api\.vnexsolar\.com\//);
  assert.match(gradleSrc, /isDebuggable = false/);
  assert.match(gradleSrc, /isMinifyEnabled = true/);
  assert.match(gradleSrc, /isShrinkResources = true/);
  assert.match(gradleSrc, /System\.getenv\("VNEX_KEYSTORE_PATH"\)/);

  // ProGuard strips debug logs and protects critical SDKs
  assert.match(proguardSrc, /-assumenosideeffects class android\.util\.Log/);
  assert.match(proguardSrc, /CoroutineWorker/);
  assert.match(proguardSrc, /com\.google\.mlkit\.vision\.barcode/);

  // Zero WebView wrapper & zero hardcoded secrets across all Kotlin source files
  const kotlinFiles = walkFiles(srcRoot).filter((f) => f.endsWith('.kt'));
  assert.ok(kotlinFiles.length >= 50, `Expected >= 50 Kotlin production files, found ${kotlinFiles.length}`);
  for (const file of kotlinFiles) {
    const content = fs.readFileSync(file, 'utf8');
    assert.equal(content.includes('android.webkit.WebView'), false, `WebView must not be used in ${file}`);
    assert.equal(/AIza[0-9A-Za-z\-_]{20,}|sk-[0-9A-Za-z]{20,}/.test(content), false, `Potential secret in ${file}`);
  }

  // Android JUnit security suite & Phase 10 production sign-off doc present
  assert.match(junitSecurityTestSrc, /releaseModeBlocksCleartextHttpEvenForLoopback/);
  assert.match(signoffDoc, /Feature Parity Matrix/);
  assert.match(signoffDoc, /assembleRelease/);
  assert.match(signoffDoc, /bundleRelease/);
});

test('Phase 9 Backend Security & Financial Precision E2E Verification', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const regRes = await fetch(`${baseUrl}/auth/register-organization`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        legalName: 'VNex QA Security Solar',
        displayName: 'VNex QA',
        slug: `vnex-qa-${Date.now()}`,
        businessAddress: 'Blue Area, Islamabad',
        countryCode: 'PK',
        defaultCurrency: 'PKR',
        ownerFullName: 'Zainab Khan',
        ownerEmail: 'zainab@vnexqa.pk',
        password: 'StrongPassword!2026',
      }),
    });
    assert.equal(regRes.status, 201);
    assert.equal(regRes.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(regRes.headers.get('cache-control'), 'no-store');
    const { accessToken } = await regRes.json();

    // Unauthenticated request to protected dashboard is rejected
    const unauthRes = await fetch(`${baseUrl}/dashboard/summary`);
    assert.equal(unauthRes.status, 401);

    // Authenticated SAR double-entry journal succeeds with exact minor-unit math
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` };
    const journalRes = await fetch(`${baseUrl}/finance/journals`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        currency: 'SAR',
        description: '[JazzCash] Site delivery van to Rawalpindi',
        lines: [
          { accountCode: '5100', accountName: 'Site & Operating Expenses', debitMinor: 145075, creditMinor: 0 },
          { accountCode: '1010', accountName: 'Cash & Mobile Wallet Clearing', debitMinor: 0, creditMinor: 145075 },
        ],
      }),
    });
    assert.equal(journalRes.status, 201);
    const journalBody = await journalRes.json();
    assert.equal(journalBody.currency, 'SAR');
    assert.equal(journalBody.totalDebitMinor, 145075);
    assert.equal(journalBody.totalCreditMinor, 145075);

    // Unbalanced double-entry journal is rejected by backend invariant
    const badJournalRes = await fetch(`${baseUrl}/finance/journals`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        currency: 'PKR',
        description: 'Unbalanced test',
        lines: [
          { accountCode: '5100', accountName: 'Expenses', debitMinor: 1000, creditMinor: 0 },
          { accountCode: '1010', accountName: 'Cash', debitMinor: 0, creditMinor: 900 },
        ],
      }),
    });
    assert.equal(badJournalRes.status, 422);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
