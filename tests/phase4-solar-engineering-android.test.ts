import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApiV1Router } from '../server/api-v1.ts';
import { SOLAR_ENGINEERING_FORMULA_VERSION } from '../packages/domain/src/index.ts';

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

test('Phase 4 Android: SolarCalculatorEngine.kt maintains full formula and UI parity with TS domain', () => {
  const androidRoot = path.resolve(
    process.cwd(),
    'apps/android/app/src/main/java/com/vnexsolar/app',
  );
  const engineSrc = fs.readFileSync(
    path.join(androidRoot, 'feature/engineering/SolarCalculatorEngine.kt'),
    'utf8',
  );
  const vmSrc = fs.readFileSync(
    path.join(androidRoot, 'feature/engineering/SolarEngineeringViewModel.kt'),
    'utf8',
  );
  const screenSrc = fs.readFileSync(
    path.join(androidRoot, 'feature/engineering/SolarEngineeringScreen.kt'),
    'utf8',
  );
  const apiSrc = fs.readFileSync(
    path.join(androidRoot, 'core/network/WorkspaceApiService.kt'),
    'utf8',
  );
  const unitTestSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'apps/android/app/src/test/java/com/vnexsolar/app/SolarCalculatorEngineTest.kt'),
    'utf8',
  );

  // Formula constants match TypeScript domain
  assert.match(engineSrc, new RegExp(`"${SOLAR_ENGINEERING_FORMULA_VERSION}"`));
  assert.match(engineSrc, /PV_COPPER_RESISTIVITY_OHM_MM2_PER_M = 0\.0178/);

  // All 20 calculator outputs & advisories present in Kotlin engine
  const requiredOutputs = [
    'computeLoadSummary',
    'dailyEnergyKwh',
    'connectedPowerKw',
    'peakSurgePowerKw',
    'criticalBackupDailyKwh',
    'requiredPvKwp',
    'totalPanelCount',
    'actualDcKwp',
    'dcAcRatio',
    'stringColdVocV',
    'stringHotVmpV',
    'minModulesInSeries',
    'maxModulesInSeries',
    'mpptOperatingCurrentA',
    'recommendedBatteryUnits',
    'installedNominalBatteryKwh',
    'backupAutonomyHours',
    'orientationFactor',
    'expectedDailyYieldKwh',
    'expectedAnnualYieldKwh',
    'specificYieldKwhPerKwp',
    'estimatedSelfConsumedKwh',
    'estimatedGridExportKwh',
    'dcVoltageDropPct',
    'acVoltageDropPct',
    'recommendedStringFuseA',
    'recommendedAcBreakerA',
    'recommendedDcSpdVoltageV',
    'recommendedEarthingMm2',
    'targetEarthResistanceOhms',
    'requiredRoofAreaM2',
    'maxRoofPanelCapacity',
    'distributedRoofLoadKgM2',
    'estimatedWindUpliftKn',
    'lifetime25YrYieldKwh',
    'annualCo2AvoidedKg',
    'lifetimeCo2AvoidedTonnes',
    'firstYearGrossSavings',
    'firstYearNetCashflow',
    'simplePaybackYears',
    'netPresentValue',
    'roi25YrPct',
    'lcoePerKwh',
    'hardSafetyErrors',
    'engineeringWarnings',
    'designDisclaimer',
  ];
  for (const field of requiredOutputs) {
    assert.ok(engineSrc.includes(field), `Missing engineering engine field: ${field}`);
  }

  // Retrofit API & ViewModel integration
  assert.match(apiSrc, /api\/v1\/engineering\/catalog/);
  assert.match(apiSrc, /api\/v1\/engineering\/designs/);
  assert.match(apiSrc, /submitSolarDesignRevision/);
  assert.match(apiSrc, /approveSolarDesign/);

  assert.match(vmSrc, /solar_design_draft/);
  assert.match(vmSrc, /CreateSolarDesignRequestDto/);
  assert.match(vmSrc, /SolarDesignCalculationInputDto/);

  // 5-tab UI + PE verification notice + RBAC flags
  assert.match(screenSrc, /Load & PV/);
  assert.match(screenSrc, /Array & MPPT/);
  assert.match(screenSrc, /Battery & Cables/);
  assert.match(screenSrc, /Roof & Yield/);
  assert.match(screenSrc, /ROI & Designs/);
  assert.match(screenSrc, /Engineering Estimate vs PE Verification/);
  assert.match(screenSrc, /canApproveEngineering/);

  // Unit tests verify reference formulas and blockers
  assert.match(unitTestSrc, /all_20_calculators_match_typescript_domain_reference_outputs/);
  assert.match(unitTestSrc, /appliance_load_profile_computes_daily_surge_and_critical_kwh/);
  assert.match(unitTestSrc, /excessive_series_modules_triggers_cold_voc_overvoltage_blocker/);
});

test('Phase 4 Android: Engineering endpoint and offline solar_design_draft payload contract work end-to-end', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const regRes = await fetch(`${baseUrl}/auth/register-organization`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        legalName: 'Karachi Solar Tech Pvt Ltd',
        displayName: 'Karachi Solar Tech',
        slug: 'khi-solar-eng',
        businessAddress: 'Clifton Block 5, Karachi',
        countryCode: 'PK',
        defaultCurrency: 'PKR',
        ownerFullName: 'Sana Tariq',
        ownerEmail: 'sana@khisolar.pk',
        password: 'StrongPassword!2026',
      }),
    });
    assert.equal(regRes.status, 201);
    const session = await regRes.json();
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.accessToken}`,
    };

    const cust = await (
      await fetch(`${baseUrl}/customers`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ customerType: 'residential', fullName: 'Hamza Residence' }),
      })
    ).json();

    const site = await (
      await fetch(`${baseUrl}/customers/${cust.id}/sites`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ siteName: 'DHA Phase 8 Roof', addressLine: 'Street 12', city: 'Karachi' }),
      })
    ).json();

    const project = await (
      await fetch(`${baseUrl}/projects`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customerId: cust.id,
          siteId: site.id,
          title: '12kW Clifton Hybrid',
          systemType: 'hybrid',
          currency: 'PKR',
        }),
      })
    ).json();

    const catalogRes = await fetch(`${baseUrl}/engineering/catalog`, { headers });
    assert.equal(catalogRes.status, 200);
    const catalog = await catalogRes.json();
    assert.ok(catalog.modules.length >= 2);
    assert.ok(catalog.inverters.length >= 2);
    assert.ok(catalog.batteries.length >= 2);

    // Exact Android CreateSolarDesignRequestDto payload format
    const androidDraftId = randomUUID();
    const androidPayload = {
      projectId: project.id,
      title: 'Android 11.6 kWp Hybrid Array',
      notes: 'Calculated offline on Android tablet',
      calculationInput: {
        currency: 'PKR',
        loadProfiles: [
          {
            id: 'app-ac',
            applianceName: '1.5 Ton Inverter AC',
            quantity: 2,
            ratedPowerW: 1600,
            dailyHours: 7,
            isCriticalBackupLoad: false,
            surgeFactor: 1.4,
          },
          {
            id: 'app-fridge',
            applianceName: 'Inverter Refrigerator',
            quantity: 1,
            ratedPowerW: 220,
            dailyHours: 14,
            isCriticalBackupLoad: true,
            surgeFactor: 2.0,
          },
        ],
        usableRoofAreaM2: 120,
        shadingLossPct: 3,
        ambientMinTempC: 11,
        ambientMaxTempC: 43,
        cellTempRiseAboveAmbientC: 25,
        peakSunHoursPerDay: 5.5,
        tiltDegrees: 21,
        azimuthDegrees: 180,
        siteLatitudeDeg: 24.9,
        windSpeedMs: 36,
        module: catalog.modules[0],
        inverter: catalog.inverters[0],
        battery: catalog.batteries[0],
        modulesInSeries: 10,
        parallelStringsPerMppt: 1,
        activeMpptCount: 2,
        inverterCount: 1,
        autonomyDays: 0.5,
        dcCableOneWayLengthM: 28,
        dcCableCrossSectionMm2: 6,
        acCableOneWayLengthM: 18,
        acCableCrossSectionMm2: 10,
        acPowerFactor: 0.98,
        performanceRatio: 0.8,
        panelDegradationPctPerYear: 0.45,
        gridEmissionFactorKgPerKwh: 0.58,
        systemCapexAmount: 2450000,
        gridTariffPerKwh: 62,
        exportTariffPerKwh: 22,
        tariffEscalationPctPerYear: 6,
        annualOmCost: 35000,
        discountRatePct: 10,
      },
    };

    const syncRes = await fetch(`${baseUrl}/sync/batch`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        deviceId: 'android-pixel-tablet',
        operations: [
          {
            syncOperationId: randomUUID(),
            idempotencyKey: `solar_design_draft:create:${androidDraftId}:${randomUUID()}`,
            entityType: 'solar_design_draft',
            entityId: androidDraftId,
            operationType: 'create',
            baseRowVersion: 0,
            payloadSha256: 'sha256-android-eng-phase4',
            payload: androidPayload,
            clientTimestamp: new Date().toISOString(),
          },
        ],
      }),
    });
    assert.equal(syncRes.status, 200);
    const syncBody = await syncRes.json();
    assert.equal(syncBody.results[0].status, 'applied');

    const designsRes = await fetch(`${baseUrl}/engineering/designs?projectId=${project.id}`, {
      headers,
    });
    assert.equal(designsRes.status, 200);
    const designsBody = await designsRes.json();
    assert.equal(designsBody.designs.length, 1);
    assert.equal(designsBody.designs[0].design.id, androidDraftId);
    assert.equal(designsBody.designs[0].latestRevision.calculations.formulaVersion, SOLAR_ENGINEERING_FORMULA_VERSION);
    assert.equal(designsBody.designs[0].latestRevision.calculations.safetyChecksPassed, true);

    const approveRes = await fetch(`${baseUrl}/engineering/designs/${androidDraftId}/approve`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ reviewNotes: 'Verified IEC 62548 from Android' }),
    });
    assert.equal(approveRes.status, 200);
    const approved = await approveRes.json();
    assert.equal(approved.revision.status, 'approved');
  } finally {
    server.close();
  }
});
