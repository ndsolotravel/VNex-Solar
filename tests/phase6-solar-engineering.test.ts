import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { createApiV1Router } from '../server/api-v1.ts';
import {
  SOLAR_ENGINEERING_FORMULA_VERSION,
  UserRole,
  calculateSolarDesignEngineering,
  type SolarDesignCalculationInput,
} from '../packages/domain/src/index.ts';

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

async function registerOrg(baseUrl: string, slug: string) {
  const res = await fetch(`${baseUrl}/auth/register-organization`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      legalName: `Solar Engineering ${slug}`,
      displayName: `Engineering ${slug}`,
      slug,
      businessAddress: 'Lahore, Pakistan',
      countryCode: 'PK',
      defaultCurrency: 'PKR',
      ownerFullName: `Owner ${slug}`,
      ownerEmail: `owner@${slug}.pk`,
      password: 'SolarPassword!2026',
    }),
  });
  assert.equal(res.status, 201);
  return res.json();
}

function makeReferenceInput(overrides?: Partial<SolarDesignCalculationInput>): SolarDesignCalculationInput {
  return {
    currency: 'PKR',
    overrideDailyEnergyKwh: 40,
    overridePeakPowerKw: 8,
    overrideCriticalBackupKwh: 12,
    usableRoofAreaM2: 150,
    shadingLossPct: 0,
    ambientMinTempC: 0,
    ambientMaxTempC: 45,
    cellTempRiseAboveAmbientC: 25,
    peakSunHoursPerDay: 5,
    tiltDegrees: 27.5,
    azimuthDegrees: 180,
    siteLatitudeDeg: 31.5,
    windSpeedMs: 30,
    module: {
      id: 'mod-ref-500',
      modelName: 'Reference 500W Mono',
      manufacturer: 'Reference PV',
      pmaxW: 500,
      vocV: 50,
      vmpV: 42,
      iscA: 13,
      impA: 12,
      tempCoeffVocPctPerC: -0.28,
      tempCoeffPmaxPctPerC: -0.35,
      maxSystemVoltageV: 1500,
      areaM2: 2.5,
      weightKg: 25,
    },
    inverter: {
      id: 'inv-ref-10k',
      modelName: 'Reference 10K Hybrid',
      manufacturer: 'Reference Inv',
      inverterType: 'hybrid',
      ratedAcPowerW: 10000,
      maxDcInputW: 15000,
      maxDcVoltageV: 800,
      mpptMinV: 200,
      mpptMaxV: 650,
      mpptCount: 2,
      maxInputCurrentPerMpptA: 26,
      efficiencyPct: 97.5,
      phases: 'three',
    },
    battery: {
      id: 'bat-ref-5k',
      modelName: 'Reference 5kWh LFP',
      manufacturer: 'Reference Bat',
      chemistry: 'LFP',
      nominalVoltageV: 48,
      capacityAh: 100,
      energyWh: 5000,
      maxDodPct: 90,
      roundTripEfficiencyPct: 95,
    },
    modulesInSeries: 10,
    parallelStringsPerMppt: 1,
    activeMpptCount: 2,
    inverterCount: 1,
    dcCableOneWayLengthM: 25,
    dcCableCrossSectionMm2: 6,
    acCableOneWayLengthM: 20,
    acCableCrossSectionMm2: 10,
    acPowerFactor: 1.0,
    performanceRatio: 0.8,
    panelDegradationPctPerYear: 0.5,
    gridEmissionFactorKgPerKwh: 0.6,
    systemCapexAmount: 2000000,
    gridTariffPerKwh: 60,
    exportTariffPerKwh: 20,
    tariffEscalationPctPerYear: 0,
    annualOmCost: 20000,
    discountRatePct: 10,
    ...overrides,
  };
}

test('Phase 6: All 20 deterministic solar engineering calculators match independent hand-computed reference values', () => {
  const res = calculateSolarDesignEngineering(makeReferenceInput());

  assert.equal(res.formulaVersion, SOLAR_ENGINEERING_FORMULA_VERSION);
  // 1-4: Sizing & DC/AC ratio
  assert.equal(res.dailyEnergyKwh, 40);
  assert.equal(res.requiredPvKwp, 10); // 40 / (5 * 0.8) = 10.0 kWp
  assert.equal(res.totalPanelCount, 20); // 10 series * 1 parallel * 2 MPPT = 20
  assert.equal(res.actualDcKwp, 10); // 20 * 500W / 1000 = 10.0 kWp
  assert.equal(res.dcAcRatio, 1);

  // 5: Cold Voc at 0C -> dT = -25C => Voc_mod = 50 * (1 + (-0.0028)*(-25)) = 53.5V -> 535.0V
  assert.equal(res.moduleColdVocV, 53.5);
  assert.equal(res.stringColdVocV, 535);
  assert.equal(res.vocOvervoltageFault, false);

  // 6: Hot cell Vmp at 45+25=70C -> dT = +45C => Vmp_mod = 42 * (1 - 0.0035*45) = 35.385V -> 353.85V
  assert.equal(res.moduleHotVmpV, 35.385);
  assert.equal(res.stringHotVmpV, 353.85);
  assert.equal(res.mpptWindowValid, true);

  // 7-8: Min/Max series & MPPT current
  assert.equal(res.minModulesInSeries, 6); // ceil(200 / 35.385) = 6
  assert.equal(res.maxModulesInSeries, 14); // floor(800 / 53.5) = 14
  assert.equal(res.mpptOperatingCurrentA, 12);
  assert.equal(res.mpptCurrentExceeded, false);

  // 9: Battery bank sizing (autonomy 0.5 day * 12kWh = 6kWh usable)
  assert.equal(res.requiredUsableBatteryKwh, 6);
  // 6 / (0.9 * 0.95 * 0.975) = 7.1974 kWh -> ceil(7197.4 / 5000) = 2 units
  assert.equal(res.recommendedBatteryUnits, 2);
  assert.equal(res.installedNominalBatteryKwh, 10);

  // 10-11: Optimal tilt = 31.5 - 4 = 27.5 -> orientationFactor = 1.0 -> 10 * 5 * 0.8 * 365 = 14600 kWh/yr
  assert.equal(res.orientationFactor, 1);
  assert.equal(res.expectedAnnualYieldKwh, 14600);
  assert.equal(res.annualSolarOffsetPct, 100);

  // 12-15: DC drop = 2 * 25 * 12 * 0.0178 / 6 = 1.78V / 420V = 0.424%
  assert.equal(res.dcVoltageDropV, 1.78);
  assert.equal(res.dcVoltageDropPct, 0.424);
  assert.equal(res.dcCablePass, true);
  // AC 3-phase current = 10000 / (sqrt(3)*400*1) = 14.43A; drop = sqrt(3)*20*14.43*0.0178/10 = 0.89V (0.222%)
  assert.equal(res.acCurrentPerInverterA, 14.43);
  assert.equal(res.acCablePass, true);
  assert.equal(res.recommendedStringFuseA, 25); // ceil to standard >= 13*1.56=20.28 -> 25A
  assert.equal(res.recommendedAcBreakerA, 20); // >= 14.43*1.25=18.04 -> 20A
  assert.equal(res.recommendedEarthingMm2, 10);

  // 16-20: Roof fit, structural weight, 25-yr degraded yield, CO2, financial NPV/LCOE
  assert.equal(res.roofFitPass, true);
  assert.equal(res.totalArrayMassKg, 590); // 20 * (25 + 4.5)
  assert.ok(res.lifetime25YrYieldKwh > 340000 && res.lifetime25YrYieldKwh < 365000);
  assert.equal(res.annualCo2AvoidedKg, 8760); // 14600 * 0.6
  assert.ok(res.simplePaybackYears !== null && res.simplePaybackYears > 0 && res.simplePaybackYears < 4);
  assert.ok(res.netPresentValue > 0);
  assert.ok(res.lcoePerKwh > 0 && res.lcoePerKwh < 25);
});

test('Phase 6: Electrical safety blocker prevents submitting or approving over-voltage Voc string designs', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const owner = await registerOrg(baseUrl, 'voc-blocker');
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${owner.accessToken}`,
    };

    const cust = await (
      await fetch(`${baseUrl}/customers`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ customerType: 'commercial', fullName: 'Highland Cold Storage' }),
      })
    ).json();
    const site = await (
      await fetch(`${baseUrl}/customers/${cust.id}/sites`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ siteName: 'Murree Ridge Plant', addressLine: 'Mall Rd', city: 'Murree' }),
      })
    ).json();
    const project = await (
      await fetch(`${baseUrl}/projects`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customerId: cust.id,
          siteId: site.id,
          title: '20kW Alpine Hybrid',
          systemType: 'hybrid',
        }),
      })
    ).json();

    // Unsafe: 16 modules * 53.5V = 856V > 800V max inverter DC voltage
    const unsafeRes = await fetch(`${baseUrl}/engineering/designs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        projectId: project.id,
        title: 'Unsafe Overvoltage Design',
        calculationInput: makeReferenceInput({ modulesInSeries: 16, ambientMinTempC: 0 }),
      }),
    });
    assert.equal(unsafeRes.status, 201);
    const unsafeDesign = await unsafeRes.json();
    assert.equal(unsafeDesign.revisions[0].calculations.vocOvervoltageFault, true);

    // Submitting unsafe design fails with 422
    const submitRes = await fetch(
      `${baseUrl}/engineering/designs/${unsafeDesign.design.id}/revisions/1/submit`,
      { method: 'POST', headers },
    );
    assert.equal(submitRes.status, 422);

    // Direct approval of unsafe design ALSO fails with 422
    const approveRes = await fetch(
      `${baseUrl}/engineering/designs/${unsafeDesign.design.id}/approve`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ reviewNotes: 'Attempt override' }),
      },
    );
    assert.equal(approveRes.status, 422);
  } finally {
    server.close();
  }
});

test('Phase 6: Approved revision immutability, Revision 2 creation, RBAC guards, and tenant isolation', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const orgA = await registerOrg(baseUrl, 'eng-alpha');
    const orgB = await registerOrg(baseUrl, 'eng-beta');
    const headersA = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${orgA.accessToken}`,
    };

    // Provision Solar Engineer & Finance Officer in Org A
    await fetch(`${baseUrl}/organizations/members`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({
        email: 'engineer@eng-alpha.pk',
        fullName: 'Engr. Nadia',
        role: UserRole.SOLAR_ENGINEER,
        temporaryPassword: 'EngPassword!2026',
      }),
    });
    await fetch(`${baseUrl}/organizations/members`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({
        email: 'finance@eng-alpha.pk',
        fullName: 'Bilal Finance',
        role: UserRole.FINANCE_OFFICER,
        temporaryPassword: 'FinPassword!2026',
      }),
    });

    const engLogin = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'engineer@eng-alpha.pk', password: 'EngPassword!2026' }),
      })
    ).json();
    const finLogin = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'finance@eng-alpha.pk', password: 'FinPassword!2026' }),
      })
    ).json();

    const engHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${engLogin.accessToken}`,
    };
    const finHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${finLogin.accessToken}`,
    };

    const cust = await (
      await fetch(`${baseUrl}/customers`, {
        method: 'POST',
        headers: headersA,
        body: JSON.stringify({ customerType: 'commercial', fullName: 'Indus Cold Logistics' }),
      })
    ).json();
    const site = await (
      await fetch(`${baseUrl}/customers/${cust.id}/sites`, {
        method: 'POST',
        headers: headersA,
        body: JSON.stringify({ siteName: 'Hub Plant', addressLine: 'Plot 5', city: 'Karachi' }),
      })
    ).json();
    const project = await (
      await fetch(`${baseUrl}/projects`, {
        method: 'POST',
        headers: headersA,
        body: JSON.stringify({
          customerId: cust.id,
          siteId: site.id,
          title: '10 kWp Warehouse Rooftop',
          systemType: 'hybrid',
        }),
      })
    ).json();

    // Solar Engineer creates Revision 1
    const createRes = await fetch(`${baseUrl}/engineering/designs`, {
      method: 'POST',
      headers: engHeaders,
      body: JSON.stringify({
        projectId: project.id,
        title: 'Warehouse Rooftop Rev 1',
        calculationInput: makeReferenceInput(),
      }),
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();

    // Finance Officer cannot approve design (403)
    const finApproveAttempt = await fetch(
      `${baseUrl}/engineering/designs/${created.design.id}/approve`,
      {
        method: 'POST',
        headers: finHeaders,
        body: JSON.stringify({ reviewNotes: 'Finance override' }),
      },
    );
    assert.equal(finApproveAttempt.status, 403);

    // Solar Engineer approves Revision 1 -> locks Revision 1 and advances project stage
    const engApproveRes = await fetch(
      `${baseUrl}/engineering/designs/${created.design.id}/approve`,
      {
        method: 'POST',
        headers: engHeaders,
        body: JSON.stringify({ reviewNotes: 'Verified IEC 62548 compliant' }),
      },
    );
    assert.equal(engApproveRes.status, 200);
    const approvedData = await engApproveRes.json();
    assert.equal(approvedData.revision.status, 'approved');

    // Mutating approved Revision 1 MUST be blocked with 409 REVISION_IMMUTABLE
    const mutateApprovedRes = await fetch(
      `${baseUrl}/engineering/designs/${created.design.id}/revisions/1`,
      {
        method: 'PUT',
        headers: engHeaders,
        body: JSON.stringify({
          baseRowVersion: approvedData.design.rowVersion,
          calculationInput: makeReferenceInput({ modulesInSeries: 11 }),
        }),
      },
    );
    assert.equal(mutateApprovedRes.status, 409);

    // Creating Revision 2 preserves Revision 1 intact
    const rev2Res = await fetch(`${baseUrl}/engineering/designs/${created.design.id}/revisions`, {
      method: 'POST',
      headers: engHeaders,
      body: JSON.stringify({
        notes: 'Customer expanded battery autonomy to 1 full day',
        calculationInput: makeReferenceInput({ autonomyDays: 1 }),
      }),
    });
    assert.equal(rev2Res.status, 201);
    const rev2Data = await rev2Res.json();
    assert.equal(rev2Data.revisions.length, 2);
    assert.equal(rev2Data.revisions[0].status, 'approved');
    assert.equal(rev2Data.revisions[1].status, 'draft');

    // Cross-tenant Org B cannot read Org A's solar design (404)
    const crossRead = await fetch(`${baseUrl}/engineering/designs/${created.design.id}`, {
      headers: { Authorization: `Bearer ${orgB.accessToken}` },
    });
    assert.equal(crossRead.status, 404);
  } finally {
    server.close();
  }
});

test('Phase 6: Offline sync batch reconciles solar_design_draft while rejecting offline design_approval', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const owner = await registerOrg(baseUrl, 'offline-eng-sync');
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${owner.accessToken}`,
    };

    const cust = await (
      await fetch(`${baseUrl}/customers`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ customerType: 'residential', fullName: 'Quetta Solar Home' }),
      })
    ).json();
    const site = await (
      await fetch(`${baseUrl}/customers/${cust.id}/sites`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ siteName: 'Jinnah Town', addressLine: 'St 4', city: 'Quetta' }),
      })
    ).json();
    const project = await (
      await fetch(`${baseUrl}/projects`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customerId: cust.id,
          siteId: site.id,
          title: '10kW High-Altitude Array',
          systemType: 'hybrid',
        }),
      })
    ).json();

    const offlineDesignId = randomUUID();
    const syncRes = await fetch(`${baseUrl}/sync/batch`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        deviceId: 'android-eng-tablet',
        operations: [
          {
            syncOperationId: randomUUID(),
            idempotencyKey: `solar_design_draft:create:${offlineDesignId}`,
            entityType: 'solar_design_draft',
            entityId: offlineDesignId,
            operationType: 'create',
            baseRowVersion: 0,
            payloadSha256: 'sha256-offline-draft',
            payload: {
              projectId: project.id,
              title: 'Offline Quetta Design Draft',
              calculationInput: makeReferenceInput({ ambientMinTempC: -5 }),
            },
            clientTimestamp: new Date().toISOString(),
          },
          {
            syncOperationId: randomUUID(),
            idempotencyKey: `design_approval:create:${offlineDesignId}`,
            entityType: 'design_approval',
            entityId: offlineDesignId,
            operationType: 'create',
            baseRowVersion: 0,
            payloadSha256: 'sha256-illegal-approval',
            payload: { approved: true },
            clientTimestamp: new Date().toISOString(),
          },
        ],
      }),
    });
    assert.equal(syncRes.status, 200);
    const syncBody = await syncRes.json();
    assert.equal(syncBody.results[0].status, 'applied');
    assert.equal(syncBody.results[1].status, 'rejected');

    // Reconciled draft is now persisted on server with ambientMinTempC = -5 recalculated
    const listRes = await fetch(`${baseUrl}/engineering/designs?projectId=${project.id}`, {
      headers,
    });
    assert.equal(listRes.status, 200);
    const listBody = await listRes.json();
    assert.equal(listBody.designs.length, 1);
    assert.equal(listBody.designs[0].design.id, offlineDesignId);
    assert.equal(listBody.designs[0].design.status, 'draft');
    assert.ok(listBody.designs[0].latestRevision.calculations.stringColdVocV > 535);
  } finally {
    server.close();
  }
});
