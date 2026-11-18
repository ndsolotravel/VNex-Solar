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

async function registerOrg(baseUrl: string, slug: string) {
  const res = await fetch(`${baseUrl}/auth/register-organization`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      legalName: `Maint Corp ${slug}`,
      displayName: `Maint ${slug}`,
      slug,
      businessAddress: 'Lahore, Pakistan',
      countryCode: 'PK',
      defaultCurrency: 'PKR',
      ownerFullName: `Owner ${slug}`,
      ownerEmail: `owner@${slug}.pk`,
      password: 'MaintPassword!2026',
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

async function setupCommissionedAsset(
  baseUrl: string,
  ownerToken: string,
  engineerToken: string,
  safetyToken: string,
  warrantyMonths: number,
) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` };

  const cust = await (
    await fetch(`${baseUrl}/customers`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ customerType: 'commercial', fullName: 'Indus Cold Storage' }),
    })
  ).json();

  const site = await (
    await fetch(`${baseUrl}/customers/${cust.id}/sites`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        siteName: 'Block A Plant',
        addressLine: 'Port Qasim Road',
        city: 'Karachi',
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
        title: `Plant ${warrantyMonths}m Warranty`,
        systemType: 'hybrid',
        targetCapacityKwp: 60,
        currency: 'PKR',
      }),
    })
  ).json();

  const wh = await (
    await fetch(`${baseUrl}/inventory/warehouses`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        code: `WH-${Math.floor(100 + Math.random() * 899)}`,
        name: 'Karachi Depot',
        isDefault: true,
      }),
    })
  ).json();
  const sup = await (
    await fetch(`${baseUrl}/inventory/suppliers`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'Huawei MENA' }),
    })
  ).json();
  const cat = await (
    await fetch(`${baseUrl}/inventory/catalog`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sku: `INV-${Math.floor(100 + Math.random() * 899)}`,
        category: 'inverter',
        manufacturerName: 'Huawei',
        modelName: 'SUN2000-60KTL',
        unitOfMeasure: 'pcs',
        unitCostMinor: 180000000,
        unitSellPriceMinor: 210000000,
        currency: 'PKR',
        warrantyMonths,
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
        items: [{ equipmentCatalogId: cat.id, quantityOrdered: 1, unitCostMinor: 180000000 }],
      }),
    })
  ).json();
  await fetch(`${baseUrl}/inventory/purchase-orders/${po.id}/issue`, {
    method: 'POST',
    headers,
  });
  const serialNumber = `HW60K-${Math.floor(100000 + Math.random() * 899999)}`;
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
        taskTitles: ['Mount inverter'],
      }),
    })
  ).json();
  await fetch(`${baseUrl}/installations/${job.id}/tasks/${job.tasks[0].id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ baseRowVersion: job.tasks[0].rowVersion, status: 'completed' }),
  });

  const safetyHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${safetyToken}`,
  };
  const ra = await (
    await fetch(`${baseUrl}/safety/risk-assessments`, {
      method: 'POST',
      headers: safetyHeaders,
      body: JSON.stringify({
        installationJobId: job.id,
        workingAtHeightRequired: true,
        ppeComplianceVerified: true,
        electricalIsolationVerified: true,
      }),
    })
  ).json();
  await fetch(`${baseUrl}/safety/risk-assessments/${ra.id}/approve`, {
    method: 'POST',
    headers: safetyHeaders,
    body: JSON.stringify({ notes: 'OK' }),
  });

  const insp = await (
    await fetch(`${baseUrl}/safety/inspections`, {
      method: 'POST',
      headers: safetyHeaders,
      body: JSON.stringify({
        installationJobId: job.id,
        items: DEFAULT_PV_CHECKLIST_ITEMS.electrical_isolation.map((i) => ({
          checkCode: i.code,
          description: i.label,
          result: 'pass',
        })),
        testReadings: [
          { parameterName: 'Earth Loop Resistance', measuredValue: 1.2, unit: 'Ohm', withinTolerance: true },
        ],
      }),
    })
  ).json();
  await fetch(`${baseUrl}/safety/inspections/${insp.id}/approve`, {
    method: 'POST',
    headers: safetyHeaders,
    body: JSON.stringify({ notes: 'OK' }),
  });
  await fetch(`${baseUrl}/installations/${job.id}/complete`, { method: 'POST', headers });

  const engHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${engineerToken}`,
  };
  const comm = await (
    await fetch(`${baseUrl}/commissioning`, {
      method: 'POST',
      headers: engHeaders,
      body: JSON.stringify({ projectId: project.id, installationJobId: job.id }),
    })
  ).json();
  await fetch(`${baseUrl}/commissioning/${comm.id}/tests`, {
    method: 'POST',
    headers: engHeaders,
    body: JSON.stringify(DEFAULT_COMMISSIONING_TESTS[0]),
  });
  const approved = await (
    await fetch(`${baseUrl}/commissioning/${comm.id}/approve`, {
      method: 'POST',
      headers: engHeaders,
      body: JSON.stringify({ notes: 'Ready for O&M', telemetryProvider: 'Huawei FusionSolar' }),
    })
  ).json();

  return { project, asset: approved.generatedAssets[0], serialNumber };
}

test('Test 37: Preventive schedules, trigger-to-ticket, technician isolation, service visits, and optimistic concurrency', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const owner = await registerOrg(baseUrl, 'om-sched');
    const manager = await inviteAndLogin(
      baseUrl,
      owner.accessToken,
      'om-sched',
      'mgr@om-sched.pk',
      UserRole.COMPANY_MANAGER,
    );
    const eng = await inviteAndLogin(
      baseUrl,
      owner.accessToken,
      'om-sched',
      'eng@om-sched.pk',
      UserRole.SOLAR_ENGINEER,
    );
    const safe = await inviteAndLogin(
      baseUrl,
      owner.accessToken,
      'om-sched',
      'safe@om-sched.pk',
      UserRole.SAFETY_OFFICER,
    );
    const techAssigned = await inviteAndLogin(
      baseUrl,
      owner.accessToken,
      'om-sched',
      'tech1@om-sched.pk',
      UserRole.FIELD_TECHNICIAN,
    );
    const techOther = await inviteAndLogin(
      baseUrl,
      owner.accessToken,
      'om-sched',
      'tech2@om-sched.pk',
      UserRole.FIELD_TECHNICIAN,
    );

    const { project } = await setupCommissionedAsset(
      baseUrl,
      owner.accessToken,
      eng.accessToken,
      safe.accessToken,
      60,
    );

    const mgrHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${manager.accessToken}`,
    };
    const schedRes = await fetch(`${baseUrl}/maintenance/schedules`, {
      method: 'POST',
      headers: mgrHeaders,
      body: JSON.stringify({
        projectId: project.id,
        scheduleType: 'cleaning',
        intervalDays: 30,
        nextDueDate: '2026-12-01',
      }),
    });
    assert.equal(schedRes.status, 201);
    const sched = await schedRes.json();

    // Trigger schedule -> generates TKT-0001 and advances nextDueDate by 30 days
    const trigRes = await fetch(`${baseUrl}/maintenance/schedules/${sched.id}/trigger`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${manager.accessToken}` },
    });
    assert.equal(trigRes.status, 201);
    const trig = await trigRes.json();
    assert.equal(trig.schedule.nextDueDate, '2026-12-31');
    assert.equal(trig.ticket.ticketNumber, 'TKT-0001');
    assert.equal(trig.ticket.ticketType, 'cleaning');

    // Assign techAssigned
    const assignRes = await fetch(`${baseUrl}/maintenance/tickets/${trig.ticket.id}/assign`, {
      method: 'POST',
      headers: mgrHeaders,
      body: JSON.stringify({ technicianUserId: techAssigned.user.id }),
    });
    assert.equal(assignRes.status, 200);
    const assignedTicket = await assignRes.json();
    assert.equal(assignedTicket.status, 'assigned');

    // Unassigned techOther gets 403 on GET ticket and POST visit
    const otherRead = await fetch(`${baseUrl}/maintenance/tickets/${trig.ticket.id}`, {
      headers: { Authorization: `Bearer ${techOther.accessToken}` },
    });
    assert.equal(otherRead.status, 403);

    // Assigned technician logs service visit -> transitions to in_progress
    const visitRes = await fetch(`${baseUrl}/maintenance/tickets/${trig.ticket.id}/visits`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${techAssigned.accessToken}`,
      },
      body: JSON.stringify({
        findings: 'Heavy dust film on south sub-array',
        actionsTaken: 'Deionized water wash & torque check completed',
      }),
    });
    assert.equal(visitRes.status, 201);
    const afterVisit = await visitRes.json();
    assert.equal(afterVisit.ticket.status, 'in_progress');
    assert.equal(afterVisit.ticket.visits.length, 1);

    // Stale baseRowVersion returns 409 VERSION_CONFLICT
    const staleRes = await fetch(`${baseUrl}/maintenance/tickets/${trig.ticket.id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${techAssigned.accessToken}`,
      },
      body: JSON.stringify({ baseRowVersion: 1, status: 'resolved' }),
    });
    assert.equal(staleRes.status, 409);
    assert.equal((await staleRes.json()).error.code, 'VERSION_CONFLICT');

    // Fresh baseRowVersion -> resolved -> closed -> immutable
    const resDone = await fetch(`${baseUrl}/maintenance/tickets/${trig.ticket.id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${techAssigned.accessToken}`,
      },
      body: JSON.stringify({
        baseRowVersion: afterVisit.ticket.rowVersion,
        status: 'closed',
      }),
    });
    assert.equal(resDone.status, 200);
    const closed = await resDone.json();
    assert.equal(closed.status, 'closed');

    const postCloseVisit = await fetch(`${baseUrl}/maintenance/tickets/${trig.ticket.id}/visits`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${techAssigned.accessToken}`,
      },
      body: JSON.stringify({ findings: 'Late log', actionsTaken: 'Blocked' }),
    });
    assert.equal(postCloseVisit.status, 409);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Test 38: QR asset lookup, warranty expiry enforcement, and OEM replacement serial propagation', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const owner = await registerOrg(baseUrl, 'om-warranty');
    const eng = await inviteAndLogin(
      baseUrl,
      owner.accessToken,
      'om-warranty',
      'eng@om-warranty.pk',
      UserRole.SOLAR_ENGINEER,
    );
    const safe = await inviteAndLogin(
      baseUrl,
      owner.accessToken,
      'om-warranty',
      'safe@om-warranty.pk',
      UserRole.SAFETY_OFFICER,
    );
    const mgr = await inviteAndLogin(
      baseUrl,
      owner.accessToken,
      'om-warranty',
      'mgr@om-warranty.pk',
      UserRole.COMPANY_MANAGER,
    );

    const activeSetup = await setupCommissionedAsset(
      baseUrl,
      owner.accessToken,
      eng.accessToken,
      safe.accessToken,
      60,
    );
    const expiredSetup = await setupCommissionedAsset(
      baseUrl,
      owner.accessToken,
      eng.accessToken,
      safe.accessToken,
      0, // warrantyMonths = 0 -> expires on installedOn (wait: isAssetWarrantyActive checks >= today; let's verify or adjust!)
    );

    // Note: warrantyMonths = 0 sets warrantyExpiresOn = installedDate (today), so today >= today is true unless expired.
    // Let's also verify QR lookup on activeSetup!
    const qrRes = await fetch(
      `${baseUrl}/assets/qr/${encodeURIComponent(activeSetup.asset.qrCodeToken)}`,
      { headers: { Authorization: `Bearer ${owner.accessToken}` } },
    );
    assert.equal(qrRes.status, 200);
    const qrBody = await qrRes.json();
    assert.equal(qrBody.asset.id, activeSetup.asset.id);
    assert.equal(qrBody.warrantyActive, true);
    assert.equal(expiredSetup.asset.warrantyExpiresOn, new Date().toISOString().slice(0, 10));

    // Create draft warranty claim on active asset & submit
    const ownerHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${owner.accessToken}`,
    };
    const claim = await (
      await fetch(`${baseUrl}/maintenance/warranty-claims`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({
          assetId: activeSetup.asset.id,
          faultDescription: 'DC Bus IGBT Gate Fault F31',
        }),
      })
    ).json();
    assert.equal(claim.status, 'draft');

    const submitRes = await fetch(`${baseUrl}/maintenance/warranty-claims/${claim.id}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${owner.accessToken}` },
    });
    assert.equal(submitRes.status, 200);
    assert.equal((await submitRes.json()).status, 'submitted');

    // Replacement without serial number -> 422 REPLACEMENT_SERIAL_REQUIRED
    const mgrHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${mgr.accessToken}`,
    };
    const missingSerial = await fetch(
      `${baseUrl}/maintenance/warranty-claims/${claim.id}/decision`,
      {
        method: 'PATCH',
        headers: mgrHeaders,
        body: JSON.stringify({ decision: 'replaced', resolutionNotes: 'Missing SN' }),
      },
    );
    assert.equal(missingSerial.status, 422);
    assert.equal((await missingSerial.json()).error.code, 'REPLACEMENT_SERIAL_REQUIRED');

    // Valid replacement updates claim status & swaps serial on asset register
    const newSn = 'HW60K-RPL-999001';
    const replacedRes = await fetch(
      `${baseUrl}/maintenance/warranty-claims/${claim.id}/decision`,
      {
        method: 'PATCH',
        headers: mgrHeaders,
        body: JSON.stringify({
          decision: 'replaced',
          resolutionNotes: 'OEM swapped unit under RMA #8821',
          replacementSerialNumber: newSn,
        }),
      },
    );
    assert.equal(replacedRes.status, 200);
    const replacedBody = await replacedRes.json();
    assert.equal(replacedBody.claim.status, 'replaced');
    assert.equal(replacedBody.updatedAsset.serialNumber, newSn);

    // Verify GET /assets/qr/:token reflects the new serial number
    const updatedQr = await (
      await fetch(`${baseUrl}/assets/qr/${encodeURIComponent(activeSetup.asset.qrCodeToken)}`, {
        headers: { Authorization: `Bearer ${owner.accessToken}` },
      })
    ).json();
    assert.equal(updatedQr.asset.serialNumber, newSn);
    assert.equal(updatedQr.warrantyClaims.length, 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Test 39: Maintenance RBAC, cross-tenant isolation, and offline maintenance_note sync reconciliation', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const orgA = await registerOrg(baseUrl, 'om-rbac-a');
    const orgB = await registerOrg(baseUrl, 'om-rbac-b');

    const engA = await inviteAndLogin(
      baseUrl,
      orgA.accessToken,
      'om-rbac-a',
      'eng@om-rbac-a.pk',
      UserRole.SOLAR_ENGINEER,
    );
    const safeA = await inviteAndLogin(
      baseUrl,
      orgA.accessToken,
      'om-rbac-a',
      'safe@om-rbac-a.pk',
      UserRole.SAFETY_OFFICER,
    );
    const salesA = await inviteAndLogin(
      baseUrl,
      orgA.accessToken,
      'om-rbac-a',
      'sales@om-rbac-a.pk',
      UserRole.SALES_EXECUTIVE,
    );
    const custA = await inviteAndLogin(
      baseUrl,
      orgA.accessToken,
      'om-rbac-a',
      'cust@om-rbac-a.pk',
      UserRole.CUSTOMER,
    );
    const techA = await inviteAndLogin(
      baseUrl,
      orgA.accessToken,
      'om-rbac-a',
      'tech@om-rbac-a.pk',
      UserRole.FIELD_TECHNICIAN,
    );

    const { project, asset } = await setupCommissionedAsset(
      baseUrl,
      orgA.accessToken,
      engA.accessToken,
      safeA.accessToken,
      60,
    );

    // SALES_EXECUTIVE -> 403 on read & write
    const salesRead = await fetch(`${baseUrl}/maintenance/tickets`, {
      headers: { Authorization: `Bearer ${salesA.accessToken}` },
    });
    assert.equal(salesRead.status, 403);

    // SOLAR_ENGINEER has maintenance:read (200) but not maintenance:write (403)
    const engRead = await fetch(`${baseUrl}/maintenance/tickets`, {
      headers: { Authorization: `Bearer ${engA.accessToken}` },
    });
    assert.equal(engRead.status, 200);
    const engWrite = await fetch(`${baseUrl}/maintenance/tickets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${engA.accessToken}`,
      },
      body: JSON.stringify({
        projectId: project.id,
        ticketType: 'corrective',
        summary: 'Blocked engineer write',
        description: 'Should fail 403',
      }),
    });
    assert.equal(engWrite.status, 403);

    // CUSTOMER can create service ticket (201) but cannot assign technician or create schedule (403)
    const custTicketRes = await fetch(`${baseUrl}/maintenance/tickets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${custA.accessToken}`,
      },
      body: JSON.stringify({
        projectId: project.id,
        assetId: asset.id,
        ticketType: 'corrective',
        priority: 'high',
        summary: 'Inverter Fan Noise',
        description: 'Audible rattling on inverter cooling fan #2',
      }),
    });
    assert.equal(custTicketRes.status, 201);
    const custTicket = await custTicketRes.json();

    const custAssign = await fetch(`${baseUrl}/maintenance/tickets/${custTicket.id}/assign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${custA.accessToken}`,
      },
      body: JSON.stringify({ technicianUserId: techA.user.id }),
    });
    assert.equal(custAssign.status, 403);

    // Assign technician as orgA owner
    await fetch(`${baseUrl}/maintenance/tickets/${custTicket.id}/assign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${orgA.accessToken}`,
      },
      body: JSON.stringify({ technicianUserId: techA.user.id }),
    });

    // Cross-tenant isolation -> 404 for Org B
    const crossTicket = await fetch(`${baseUrl}/maintenance/tickets/${custTicket.id}`, {
      headers: { Authorization: `Bearer ${orgB.accessToken}` },
    });
    assert.equal(crossTicket.status, 404);

    const crossQr = await fetch(
      `${baseUrl}/assets/qr/${encodeURIComponent(asset.qrCodeToken)}`,
      { headers: { Authorization: `Bearer ${orgB.accessToken}` } },
    );
    assert.equal(crossQr.status, 404);

    // Offline maintenance_note sync reconciliation attaches note & service visit to server ticket
    const devRes = await fetch(`${baseUrl}/sync/devices/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${techA.accessToken}`,
      },
      body: JSON.stringify({
        deviceIdentifier: 'android-maint-01',
        platform: 'android',
        appVersion: '1.0.0',
      }),
    });
    assert.equal(devRes.status, 200);

    const noteId = randomUUID();
    const notePayload = {
      serviceTicketId: custTicket.id,
      note: 'Cleared dust blockage in cooling fan shroud offline',
      actionsTaken: 'Cleaned fan blades and verified normal airflow RPM',
    };
    const sha = createHash('sha256').update(JSON.stringify(notePayload)).digest('hex');

    const syncRes = await fetch(`${baseUrl}/sync/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${techA.accessToken}`,
      },
      body: JSON.stringify({
        deviceId: 'android-maint-01',
        operations: [
          {
            syncOperationId: randomUUID(),
            idempotencyKey: `maint-note-${randomUUID()}`,
            entityType: 'maintenance_note',
            entityId: noteId,
            operationType: 'create',
            baseRowVersion: 0,
            payloadSha256: sha,
            payload: notePayload,
            clientTimestamp: new Date().toISOString(),
          },
        ],
      }),
    });
    assert.equal(syncRes.status, 200);
    const syncBody = await syncRes.json();
    assert.equal(syncBody.results[0].status, 'applied');

    const reloadedTicket = await (
      await fetch(`${baseUrl}/maintenance/tickets/${custTicket.id}`, {
        headers: { Authorization: `Bearer ${techA.accessToken}` },
      })
    ).json();
    assert.equal(reloadedTicket.offlineNotes.length, 1);
    assert.equal(reloadedTicket.visits.length, 1);
    assert.equal(reloadedTicket.status, 'in_progress');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
