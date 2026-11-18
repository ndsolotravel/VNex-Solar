import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { createApiV1Router } from '../server/api-v1.ts';
import {
  DEFAULT_COMMISSIONING_TESTS,
  DEFAULT_PV_CHECKLIST_ITEMS,
  UserRole,
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

async function registerOrg(baseUrl: string, slug: string, displayName?: string) {
  const res = await fetch(`${baseUrl}/auth/register-organization`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      legalName: `Comm Corp ${slug}`,
      displayName: displayName ?? `Comm ${slug}`,
      slug,
      businessAddress: 'Lahore, Pakistan',
      countryCode: 'PK',
      defaultCurrency: 'PKR',
      ownerFullName: `Owner ${slug}`,
      ownerEmail: `owner@${slug}.pk`,
      password: 'CommPassword!2026',
    }),
  });
  assert.equal(res.status, 201);
  return res.json();
}

async function inviteAndLogin(
  baseUrl: string,
  ownerToken: string,
  slug: string,
  email: string,
  role: UserRole,
) {
  const password = 'RoleUserPass!2026';
  const invRes = await fetch(`${baseUrl}/organizations/members`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ownerToken}`,
    },
    body: JSON.stringify({
      email,
      fullName: `Staff ${role}`,
      role,
      temporaryPassword: password,
    }),
  });
  assert.equal(invRes.status, 201);

  const loginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, organizationSlug: slug }),
  });
  assert.equal(loginRes.status, 200);
  return loginRes.json();
}

async function setupProjectWithStockAndJob(baseUrl: string, ownerToken: string, projectTitle: string) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` };

  const cust = await (
    await fetch(`${baseUrl}/customers`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customerType: 'commercial',
        fullName: 'Crescent Industrial Cold Storage',
      }),
    })
  ).json();

  const site = await (
    await fetch(`${baseUrl}/customers/${cust.id}/sites`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        siteName: 'South Shed Roof',
        addressLine: 'Sundar Industrial Estate',
        city: 'Lahore',
        countryCode: 'PK',
        connectionPhase: 'three',
      }),
    })
  ).json();

  const project = await (
    await fetch(`${baseUrl}/projects`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customerId: cust.id,
        siteId: site.id,
        title: projectTitle,
        systemType: 'hybrid',
        targetCapacityKwp: 50,
        currency: 'PKR',
      }),
    })
  ).json();

  // Warehouse + Supplier + Serialized Inverter issued to project
  const wh = await (
    await fetch(`${baseUrl}/inventory/warehouses`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        code: `WH-${Math.floor(100 + Math.random() * 899)}`,
        name: 'Lahore Main Warehouse',
        isDefault: true,
      }),
    })
  ).json();

  const sup = await (
    await fetch(`${baseUrl}/inventory/suppliers`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'Sungrow Distribution MENA',
      }),
    })
  ).json();

  const cat = await (
    await fetch(`${baseUrl}/inventory/catalog`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sku: `INV-SG50-${Math.floor(100 + Math.random() * 899)}`,
        category: 'inverter',
        manufacturerName: 'Sungrow',
        modelName: 'SH50T Hybrid 50kW',
        unitOfMeasure: 'pcs',
        unitCostMinor: 150000000,
        unitSellPriceMinor: 185000000,
        currency: 'PKR',
        warrantyMonths: 60,
        isSerialized: true,
      }),
    })
  ).json();

  const po = await (
    await fetch(`${baseUrl}/inventory/purchase-orders`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        supplierId: sup.id,
        warehouseId: wh.id,
        currency: 'PKR',
        items: [{ equipmentCatalogId: cat.id, quantityOrdered: 1, unitCostMinor: 150000000 }],
      }),
    })
  ).json();

  await fetch(`${baseUrl}/inventory/purchase-orders/${po.id}/issue`, {
    method: 'POST',
    headers,
  });

  const serialNumber = `SG50T-${Math.floor(100000 + Math.random() * 899999)}`;
  await fetch(`${baseUrl}/inventory/purchase-orders/${po.id}/receive`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      idempotencyKey: `rcv-${randomUUID()}`,
      equipmentCatalogId: cat.id,
      quantityReceived: 1,
      serialNumbers: [serialNumber],
    }),
  });

  await fetch(`${baseUrl}/inventory/issues`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      idempotencyKey: `iss-${randomUUID()}`,
      projectId: project.id,
      warehouseId: wh.id,
      equipmentCatalogId: cat.id,
      quantity: 1,
      serialNumbers: [serialNumber],
    }),
  });

  const job = await (
    await fetch(`${baseUrl}/installations`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        projectId: project.id,
        scheduledStartDate: '2026-11-18',
        taskTitles: ['Mount inverter & DC combiner', 'Terminate PV strings'],
      }),
    })
  ).json();

  return { cust, site, project, job, serialNumber, cat };
}

async function clearSafetyGate(baseUrl: string, safetyToken: string, jobId: string) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${safetyToken}` };

  const ra = await (
    await fetch(`${baseUrl}/safety/risk-assessments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        installationJobId: jobId,
        workingAtHeightRequired: true,
        ppeComplianceVerified: true,
        electricalIsolationVerified: true,
        hazardNotes: 'Harnesses & LOTO verified.',
      }),
    })
  ).json();
  const raApprove = await fetch(`${baseUrl}/safety/risk-assessments/${ra.id}/approve`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ notes: 'Risk assessment approved' }),
  });
  assert.equal(raApprove.status, 200);

  const insp = await (
    await fetch(`${baseUrl}/safety/inspections`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        installationJobId: jobId,
        items: DEFAULT_PV_CHECKLIST_ITEMS.electrical_isolation.map((i) => ({
          checkCode: i.code,
          description: i.label,
          result: 'pass',
        })),
        testReadings: [
          { parameterName: 'Earth Loop Resistance', measuredValue: 1.4, unit: 'Ohm', withinTolerance: true },
          { parameterName: 'DC Insulation Resistance', measuredValue: 500, unit: 'MOhm', withinTolerance: true },
        ],
      }),
    })
  ).json();
  const inspApprove = await fetch(`${baseUrl}/safety/inspections/${insp.id}/approve`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ notes: 'IEC 62446-1 inspection passed' }),
  });
  assert.equal(inspApprove.status, 200);
}

test('Test 34: Hard safety gate, installation completion, test readiness, and immutable commissioning approval', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const owner = await registerOrg(baseUrl, 'comm-gate');
    const engineer = await inviteAndLogin(
      baseUrl,
      owner.accessToken,
      'comm-gate',
      'eng@comm-gate.pk',
      UserRole.SOLAR_ENGINEER,
    );
    const safetyOfficer = await inviteAndLogin(
      baseUrl,
      owner.accessToken,
      'comm-gate',
      'safe@comm-gate.pk',
      UserRole.SAFETY_OFFICER,
    );

    const { project, job } = await setupProjectWithStockAndJob(
      baseUrl,
      owner.accessToken,
      '50kW Hybrid Array <script>alert(1)</script>',
    );

    const engHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${engineer.accessToken}`,
    };

    // Open commissioning package before safety clearance -> status pending_safety
    const commCreate = await fetch(`${baseUrl}/commissioning`, {
      method: 'POST',
      headers: engHeaders,
      body: JSON.stringify({ projectId: project.id, installationJobId: job.id }),
    });
    assert.equal(commCreate.status, 201);
    const comm = await commCreate.json();
    assert.equal(comm.status, 'pending_safety');
    assert.equal(comm.safetyClearedSnapshot, false);

    // 1) Safety gate block -> 422 SAFETY_GATE_BLOCKED
    const blockedBySafety = await fetch(`${baseUrl}/commissioning/${comm.id}/approve`, {
      method: 'POST',
      headers: engHeaders,
      body: JSON.stringify({ notes: 'Attempt premature approval' }),
    });
    assert.equal(blockedBySafety.status, 422);
    const safetyErr = await blockedBySafety.json();
    assert.equal(safetyErr.error.code, 'SAFETY_GATE_BLOCKED');

    // Clear safety gate, verify live snapshot flips to ready_for_review
    await clearSafetyGate(baseUrl, safetyOfficer.accessToken, job.id);
    const refreshed = await (
      await fetch(`${baseUrl}/commissioning/${comm.id}`, {
        headers: { Authorization: `Bearer ${engineer.accessToken}` },
      })
    ).json();
    assert.equal(refreshed.safetyClearedSnapshot, true);
    assert.equal(refreshed.status, 'ready_for_review');

    // 2) Installation job still in progress -> 409 INSTALLATION_NOT_COMPLETED
    const blockedByInstall = await fetch(`${baseUrl}/commissioning/${comm.id}/approve`, {
      method: 'POST',
      headers: engHeaders,
      body: JSON.stringify({ notes: 'Attempt approval before job completion' }),
    });
    assert.equal(blockedByInstall.status, 409);
    assert.equal((await blockedByInstall.json()).error.code, 'INSTALLATION_NOT_COMPLETED');

    // Complete tasks & finish installation job
    for (const task of job.tasks) {
      const tRes = await fetch(`${baseUrl}/installations/${job.id}/tasks/${task.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${owner.accessToken}`,
        },
        body: JSON.stringify({ baseRowVersion: task.rowVersion, status: 'completed' }),
      });
      assert.equal(tRes.status, 200);
    }
    const compRes = await fetch(`${baseUrl}/installations/${job.id}/complete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${owner.accessToken}` },
    });
    assert.equal(compRes.status, 200);

    // 3) No commissioning tests logged yet -> 422 COMMISSIONING_CHECKS_UNMET
    const blockedByNoTests = await fetch(`${baseUrl}/commissioning/${comm.id}/approve`, {
      method: 'POST',
      headers: engHeaders,
      body: JSON.stringify({ notes: 'Missing electrical tests' }),
    });
    assert.equal(blockedByNoTests.status, 422);
    assert.equal((await blockedByNoTests.json()).error.code, 'COMMISSIONING_CHECKS_UNMET');

    // 4) Record standard IEC tests & approve cleanly
    for (const item of DEFAULT_COMMISSIONING_TESTS) {
      const testRes = await fetch(`${baseUrl}/commissioning/${comm.id}/tests`, {
        method: 'POST',
        headers: engHeaders,
        body: JSON.stringify(item),
      });
      assert.equal(testRes.status, 201);
    }

    const approvedRes = await fetch(`${baseUrl}/commissioning/${comm.id}/approve`, {
      method: 'POST',
      headers: engHeaders,
      body: JSON.stringify({
        notes: 'All Voc, anti-islanding & BMS tests within spec.',
        telemetryProvider: 'Solarman / Modbus TCP',
      }),
    });
    assert.equal(approvedRes.status, 200);
    const approved = await approvedRes.json();
    assert.equal(approved.status, 'approved');
    assert.ok(approved.commissionedAt);
    assert.equal(approved.handoverDocuments.length, 1);

    // Project stage advanced to 'commissioned'
    const projRes = await (
      await fetch(`${baseUrl}/projects`, {
        headers: { Authorization: `Bearer ${owner.accessToken}` },
      })
    ).json();
    const updatedProj = projRes.projects.find((p: { id: string }) => p.id === project.id);
    assert.equal(updatedProj.currentStage, 'commissioned');

    // 5) Immutability: subsequent approval or test modification -> 409 COMMISSIONING_IMMUTABLE
    const reApprove = await fetch(`${baseUrl}/commissioning/${comm.id}/approve`, {
      method: 'POST',
      headers: engHeaders,
      body: JSON.stringify({ notes: 'Second approve attempt' }),
    });
    assert.equal(reApprove.status, 409);
    assert.equal((await reApprove.json()).error.code, 'COMMISSIONING_IMMUTABLE');

    const postApprovalTest = await fetch(`${baseUrl}/commissioning/${comm.id}/tests`, {
      method: 'POST',
      headers: engHeaders,
      body: JSON.stringify({ testName: 'Tamper test', measuredValue: '0 V', passed: false }),
    });
    assert.equal(postApprovalTest.status, 409);
    assert.equal((await postApprovalTest.json()).error.code, 'COMMISSIONING_IMMUTABLE');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Test 35: QR Asset Register generation, XSS-escaped printable certificate, and customer handover acknowledgement', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const owner = await registerOrg(baseUrl, 'comm-assets', 'VNex <b>Solar</b> PK');
    const engineer = await inviteAndLogin(
      baseUrl,
      owner.accessToken,
      'comm-assets',
      'eng@comm-assets.pk',
      UserRole.SOLAR_ENGINEER,
    );
    const safetyOfficer = await inviteAndLogin(
      baseUrl,
      owner.accessToken,
      'comm-assets',
      'safe@comm-assets.pk',
      UserRole.SAFETY_OFFICER,
    );
    const customerUser = await inviteAndLogin(
      baseUrl,
      owner.accessToken,
      'comm-assets',
      'client@comm-assets.pk',
      UserRole.CUSTOMER,
    );

    const { project, job, serialNumber } = await setupProjectWithStockAndJob(
      baseUrl,
      owner.accessToken,
      '75kW Plant <img src=x onerror=alert(1)>',
    );

    for (const task of job.tasks) {
      await fetch(`${baseUrl}/installations/${job.id}/tasks/${task.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${owner.accessToken}`,
        },
        body: JSON.stringify({ baseRowVersion: task.rowVersion, status: 'completed' }),
      });
    }
    await clearSafetyGate(baseUrl, safetyOfficer.accessToken, job.id);
    await fetch(`${baseUrl}/installations/${job.id}/complete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${owner.accessToken}` },
    });

    const comm = await (
      await fetch(`${baseUrl}/commissioning`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${engineer.accessToken}`,
        },
        body: JSON.stringify({ projectId: project.id, installationJobId: job.id }),
      })
    ).json();

    await fetch(`${baseUrl}/commissioning/${comm.id}/tests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${engineer.accessToken}`,
      },
      body: JSON.stringify(DEFAULT_COMMISSIONING_TESTS[0]),
    });

    const approved = await (
      await fetch(`${baseUrl}/commissioning/${comm.id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${engineer.accessToken}`,
        },
        body: JSON.stringify({ notes: 'Handover ready', telemetryProvider: 'Sungrow iSolarCloud' }),
      })
    ).json();

    assert.equal(approved.generatedAssets.length, 1);
    assert.equal(approved.generatedAssets[0].serialNumber, serialNumber);
    assert.ok(approved.generatedAssets[0].qrCodeToken.startsWith('VNEX-QR-CERT-0001-'));
    assert.ok(approved.generatedAssets[0].warrantyExpiresOn);

    // GET /assets exposes the registered QR asset
    const assetsRes = await fetch(`${baseUrl}/assets`, {
      headers: { Authorization: `Bearer ${customerUser.accessToken}` },
    });
    assert.equal(assetsRes.status, 200);
    const assetsBody = await assetsRes.json();
    assert.equal(assetsBody.assets.length, 1);
    assert.equal(assetsBody.assets[0].serialNumber, serialNumber);
    assert.equal(assetsBody.assets[0].telemetryProvider, 'Sungrow iSolarCloud');

    // Customer acknowledges handover document -> advances project stage to handed_over
    const handoverId = approved.handoverDocuments[0].id;
    const ackRes = await fetch(
      `${baseUrl}/commissioning/${comm.id}/handovers/${handoverId}/acknowledge`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customerUser.accessToken}`,
        },
        body: JSON.stringify({ signoffName: 'Tariq <script>alert(2)</script>' }),
      },
    );
    assert.equal(ackRes.status, 200);
    const ackBody = await ackRes.json();
    assert.ok(ackBody.handoverDocuments[0].customerAcknowledgedAt);

    const projRes = await (
      await fetch(`${baseUrl}/projects`, {
        headers: { Authorization: `Bearer ${owner.accessToken}` },
      })
    ).json();
    assert.equal(projRes.projects[0].currentStage, 'handed_over');

    // Printable HTML certificate is XSS-escaped and contains QR token
    const printRes = await fetch(`${baseUrl}/commissioning/${comm.id}/printable`, {
      headers: { Authorization: `Bearer ${customerUser.accessToken}` },
    });
    assert.equal(printRes.status, 200);
    const printBody = await printRes.json();
    assert.ok(!printBody.html.includes('<script>'));
    assert.ok(!printBody.html.includes('<img src=x'));
    assert.ok(printBody.html.includes('&lt;script&gt;'));
    assert.ok(printBody.html.includes(approved.generatedAssets[0].qrCodeToken));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Test 36: Commissioning RBAC, cross-tenant isolation, and server-authoritative sync rejection', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const orgA = await registerOrg(baseUrl, 'comm-rbac-a');
    const orgB = await registerOrg(baseUrl, 'comm-rbac-b');

    const techA = await inviteAndLogin(
      baseUrl,
      orgA.accessToken,
      'comm-rbac-a',
      'tech@comm-rbac-a.pk',
      UserRole.FIELD_TECHNICIAN,
    );
    const supA = await inviteAndLogin(
      baseUrl,
      orgA.accessToken,
      'comm-rbac-a',
      'sup@comm-rbac-a.pk',
      UserRole.INSTALLATION_SUPERVISOR,
    );
    const safeA = await inviteAndLogin(
      baseUrl,
      orgA.accessToken,
      'comm-rbac-a',
      'safe@comm-rbac-a.pk',
      UserRole.SAFETY_OFFICER,
    );
    const salesA = await inviteAndLogin(
      baseUrl,
      orgA.accessToken,
      'comm-rbac-a',
      'sales@comm-rbac-a.pk',
      UserRole.SALES_EXECUTIVE,
    );
    const custA = await inviteAndLogin(
      baseUrl,
      orgA.accessToken,
      'comm-rbac-a',
      'cust@comm-rbac-a.pk',
      UserRole.CUSTOMER,
    );

    const { project, job } = await setupProjectWithStockAndJob(baseUrl, orgA.accessToken, 'RBAC Array');
    const comm = await (
      await fetch(`${baseUrl}/commissioning`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supA.accessToken}`,
        },
        body: JSON.stringify({ projectId: project.id, installationJobId: job.id }),
      })
    ).json();

    // Non-approver roles MUST receive 403 on POST /commissioning/:id/approve
    for (const user of [techA, supA, safeA, salesA, custA]) {
      const res = await fetch(`${baseUrl}/commissioning/${comm.id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.accessToken}`,
        },
        body: JSON.stringify({ notes: 'Unauthorized signoff' }),
      });
      assert.equal(res.status, 403);
    }

    // Customer can read commissioning & assets (200), but cannot create commissioning package (403)
    const custRead = await fetch(`${baseUrl}/commissioning/${comm.id}`, {
      headers: { Authorization: `Bearer ${custA.accessToken}` },
    });
    assert.equal(custRead.status, 200);

    const custCreate = await fetch(`${baseUrl}/commissioning`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${custA.accessToken}`,
      },
      body: JSON.stringify({ projectId: project.id, installationJobId: job.id }),
    });
    assert.equal(custCreate.status, 403);

    // Cross-tenant access -> 404 NOT_FOUND
    const crossGet = await fetch(`${baseUrl}/commissioning/${comm.id}`, {
      headers: { Authorization: `Bearer ${orgB.accessToken}` },
    });
    assert.equal(crossGet.status, 404);

    // Offline sync batch attempting commissioning_approval MUST be rejected cleanly
    const deviceRes = await fetch(`${baseUrl}/sync/devices/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${orgA.accessToken}`,
      },
      body: JSON.stringify({
        deviceIdentifier: 'android-comm-field-01',
        platform: 'android',
        appVersion: '1.0.0',
      }),
    });
    assert.equal(deviceRes.status, 200);

    const payload = { commissioningId: comm.id, decision: 'approved' };
    const sha = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const batchRes = await fetch(`${baseUrl}/sync/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${orgA.accessToken}`,
      },
      body: JSON.stringify({
        deviceId: 'android-comm-field-01',
        operations: [
          {
            syncOperationId: randomUUID(),
            idempotencyKey: `comm-offline-${randomUUID()}`,
            entityType: 'commissioning_approval',
            entityId: comm.id,
            operationType: 'create',
            baseRowVersion: 0,
            payloadSha256: sha,
            payload,
            clientTimestamp: new Date().toISOString(),
          },
        ],
      }),
    });
    assert.equal(batchRes.status, 200);
    const batchBody = await batchRes.json();
    assert.equal(batchBody.results[0].status, 'rejected');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
