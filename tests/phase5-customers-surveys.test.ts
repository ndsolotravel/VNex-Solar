import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { createApiV1Router } from '../server/api-v1.ts';
import { UserRole, computeSurveyLoadSummary } from '../packages/domain/src/index.ts';

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
      legalName: `Company ${slug}`,
      displayName: `Display ${slug}`,
      slug,
      businessAddress: 'Gulberg III, Lahore',
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

test('Phase 5: Customer -> Site -> Project creation and optimistic rowVersion concurrency check', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const org = await registerOrg(baseUrl, 'lahore-crm');
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${org.accessToken}`,
    };

    const custRes = await fetch(`${baseUrl}/customers`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customerType: 'commercial',
        fullName: 'Ravi Textiles Spinning Mill',
        primaryPhone: '+92-300-1234567',
        email: 'energy@ravitextiles.pk',
      }),
    });
    assert.equal(custRes.status, 201);
    const customer = await custRes.json();
    assert.equal(customer.customerCode, 'CUST-0001');
    assert.equal(customer.rowVersion, 1);

    // Valid optimistic update advances rowVersion to 2
    const patchRes = await fetch(`${baseUrl}/customers/${customer.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        baseRowVersion: 1,
        fullName: 'Ravi Textiles Spinning Mill (Unit II)',
      }),
    });
    assert.equal(patchRes.status, 200);
    const patched = await patchRes.json();
    assert.equal(patched.rowVersion, 2);

    // Stale baseRowVersion returns 409 VERSION_CONFLICT
    const staleRes = await fetch(`${baseUrl}/customers/${customer.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ baseRowVersion: 1, fullName: 'Stale Overwrite' }),
    });
    assert.equal(staleRes.status, 409);

    // Site and Project creation
    const siteRes = await fetch(`${baseUrl}/customers/${customer.id}/sites`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        siteName: 'Main Weaving Shed',
        addressLine: 'Multan Road Km 18',
        city: 'Lahore',
        countryCode: 'PK',
        utilityProvider: 'LESCO',
        connectionPhase: 'three',
      }),
    });
    assert.equal(siteRes.status, 201);
    const site = await siteRes.json();

    const projRes = await fetch(`${baseUrl}/projects`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customerId: customer.id,
        siteId: site.id,
        title: '120 kWp Hybrid Industrial Rooftop',
        systemType: 'hybrid',
        targetCapacityKwp: 120,
        currency: 'PKR',
      }),
    });
    assert.equal(projRes.status, 201);
    const project = await projRes.json();
    assert.equal(project.projectCode, 'PRJ-0001');
    assert.equal(project.currentStage, 'survey_scheduled');
  } finally {
    server.close();
  }
});

test('Phase 5: Complete Site Survey workflow, SHA-256 photo presign/commit, load calculations, and project stage transition', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const org = await registerOrg(baseUrl, 'survey-flow');
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${org.accessToken}`,
    };

    const cust = await (
      await fetch(`${baseUrl}/customers`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ customerType: 'residential', fullName: 'Hamza Tariq' }),
      })
    ).json();
    const site = await (
      await fetch(`${baseUrl}/customers/${cust.id}/sites`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          siteName: 'Residence Sector F-7/2',
          addressLine: 'Street 14, F-7/2',
          city: 'Islamabad',
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
          title: '15 kWp Hybrid Home System',
          systemType: 'hybrid',
          targetCapacityKwp: 15,
        }),
      })
    ).json();

    // Create empty draft survey
    const createSurveyRes = await fetch(`${baseUrl}/surveys`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ projectId: project.id }),
    });
    assert.equal(createSurveyRes.status, 201);
    const draftSurvey = await createSurveyRes.json();

    // Cannot submit without roof section measurements
    const emptySubmitRes = await fetch(`${baseUrl}/surveys/${draftSurvey.id}/submit`, {
      method: 'POST',
      headers,
    });
    assert.equal(emptySubmitRes.status, 400);

    const roofSections = [
      {
        id: 'r1',
        sectionName: 'Upper RCC Roof',
        roofType: 'rcc_flat',
        usableAreaM2: 100,
        tiltDegrees: 22,
        azimuthDegrees: 180,
        shadingFactorPct: 10,
      },
    ];
    const loadProfiles = [
      {
        id: 'l1',
        applianceName: 'Inverter AC',
        quantity: 2,
        ratedPowerW: 1500,
        dailyHours: 6,
        isCriticalBackupLoad: false,
        surgeFactor: 1.5,
      },
      {
        id: 'l2',
        applianceName: 'Refrigerator',
        quantity: 1,
        ratedPowerW: 250,
        dailyHours: 24,
        isCriticalBackupLoad: true,
        surgeFactor: 2,
      },
    ];

    const expectedSummary = computeSurveyLoadSummary(roofSections, loadProfiles);
    assert.equal(expectedSummary.totalConnectedPowerW, 3250);
    assert.equal(expectedSummary.peakSurgePowerW, 5000);
    assert.equal(expectedSummary.dailyEnergyKwh, 24);
    assert.equal(expectedSummary.criticalBackupEnergyKwh, 6);
    assert.equal(expectedSummary.effectiveUnshadedRoofAreaM2, 90);

    // Update survey with roof geometry, loads, and site hazards
    const updateRes = await fetch(`${baseUrl}/surveys/${draftSurvey.id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        baseRowVersion: 1,
        earthingAvailable: true,
        roofSections,
        loadProfiles,
        siteHazards: [
          {
            id: 'h1',
            hazardType: 'overhead_line',
            severity: 'medium',
            description: '11kV line 8m west of boundary wall',
            mitigationPlan: 'Keep scaffold clearance > 3m',
          },
        ],
      }),
    });
    assert.equal(updateRes.status, 200);
    const updated = await updateRes.json();
    assert.equal(updated.rowVersion, 2);
    assert.equal(updated.summary.dailyEnergyKwh, 24);

    // Presign & commit SHA-256 survey photo
    const sha = createHash('sha256').update('mock-jpeg-bytes').digest('hex');
    const presignRes = await fetch(`${baseUrl}/surveys/${draftSurvey.id}/photos/presign`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        filename: 'roof-south.jpg',
        mimeType: 'image/jpeg',
        byteSize: 204800,
        sha256Checksum: sha,
        caption: 'South facing parapet view',
      }),
    });
    assert.equal(presignRes.status, 201);
    const presigned = await presignRes.json();

    // Checksum mismatch fails cleanly with 422
    const badCommitRes = await fetch(`${baseUrl}/surveys/${draftSurvey.id}/photos/commit`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        fileAttachmentId: presigned.fileAttachmentId,
        sha256Checksum: '0'.repeat(64),
      }),
    });
    assert.equal(badCommitRes.status, 422);

    const commitRes = await fetch(`${baseUrl}/surveys/${draftSurvey.id}/photos/commit`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        fileAttachmentId: presigned.fileAttachmentId,
        sha256Checksum: sha,
      }),
    });
    assert.equal(commitRes.status, 201);

    // Authorized download succeeds
    const dlRes = await fetch(`${baseUrl}/files/${presigned.fileAttachmentId}/download`, {
      headers: { Authorization: `Bearer ${org.accessToken}` },
    });
    assert.equal(dlRes.status, 200);
    const dlData = await dlRes.json();
    assert.equal(dlData.sha256Checksum, sha);

    // Submit survey -> project stage advances to survey_completed
    const submitRes = await fetch(`${baseUrl}/surveys/${draftSurvey.id}/submit`, {
      method: 'POST',
      headers,
    });
    assert.equal(submitRes.status, 200);
    const submitted = await submitRes.json();
    assert.equal(submitted.surveyStatus, 'submitted');

    const refreshedProject = await (
      await fetch(`${baseUrl}/projects/${project.id}`, { headers })
    ).json();
    assert.equal(refreshedProject.currentStage, 'survey_completed');
  } finally {
    server.close();
  }
});

test('Phase 5: Offline sync batch for customer and site_survey reconciles into server CRM & Surveys state', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const org = await registerOrg(baseUrl, 'offline-survey-sync');
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${org.accessToken}`,
    };

    const offlineCustomerId = randomUUID();
    const syncRes = await fetch(`${baseUrl}/sync/batch`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        deviceId: 'pixel-field-9',
        operations: [
          {
            syncOperationId: randomUUID(),
            idempotencyKey: `customer:create:${offlineCustomerId}`,
            entityType: 'customer',
            entityId: offlineCustomerId,
            operationType: 'create',
            baseRowVersion: 0,
            payloadSha256: 'abc12345',
            payload: {
              customerType: 'agricultural',
              fullName: 'Multan Mango Orchards Tubewell',
              primaryPhone: '+92-301-8899001',
            },
            clientTimestamp: new Date().toISOString(),
          },
        ],
      }),
    });
    assert.equal(syncRes.status, 200);

    // Verify customer now exists in /api/v1/customers search
    const custListRes = await fetch(`${baseUrl}/customers?q=Mango`, { headers });
    assert.equal(custListRes.status, 200);
    const custList = await custListRes.json();
    assert.equal(custList.customers.length, 1);
    assert.equal(custList.customers[0].id, offlineCustomerId);

    // Update customer offline via sync/batch and verify reconciliation
    const syncUpdateRes = await fetch(`${baseUrl}/sync/batch`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        deviceId: 'pixel-field-9',
        operations: [
          {
            syncOperationId: randomUUID(),
            idempotencyKey: `customer:update:${offlineCustomerId}:1`,
            entityType: 'customer',
            entityId: offlineCustomerId,
            operationType: 'update',
            baseRowVersion: 1,
            payloadSha256: 'def67890',
            payload: {
              fullName: 'Multan Mango Orchards Solar Tubewell',
            },
            clientTimestamp: new Date().toISOString(),
          },
        ],
      }),
    });
    assert.equal(syncUpdateRes.status, 200);
    const updatedList = await (await fetch(`${baseUrl}/customers?q=Orchards`, { headers })).json();
    assert.equal(updatedList.customers[0].fullName, 'Multan Mango Orchards Solar Tubewell');
    assert.equal(updatedList.customers[0].rowVersion, 2);
  } finally {
    server.close();
  }
});

test('Phase 5: RBAC and cross-tenant isolation across customers, surveys, and survey photo downloads', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const orgA = await registerOrg(baseUrl, 'iso-alpha');
    const orgB = await registerOrg(baseUrl, 'iso-beta');

    const headersA = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${orgA.accessToken}`,
    };

    // Provision a Field Technician and a Customer user in Org A
    await fetch(`${baseUrl}/organizations/members`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({
        email: 'tech@iso-alpha.pk',
        fullName: 'Asad Tech',
        role: UserRole.FIELD_TECHNICIAN,
        temporaryPassword: 'TechPassword!2026',
      }),
    });
    await fetch(`${baseUrl}/organizations/members`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({
        email: 'client@iso-alpha.pk',
        fullName: 'Client User',
        role: UserRole.CUSTOMER,
        temporaryPassword: 'ClientPassword!2026',
      }),
    });

    const techLogin = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'tech@iso-alpha.pk', password: 'TechPassword!2026' }),
      })
    ).json();
    const customerLogin = await (
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'client@iso-alpha.pk', password: 'ClientPassword!2026' }),
      })
    ).json();

    // Org A creates customer -> site -> unassigned project (assigned only to Owner) -> survey -> photo
    const cust = await (
      await fetch(`${baseUrl}/customers`, {
        method: 'POST',
        headers: headersA,
        body: JSON.stringify({ customerType: 'residential', fullName: 'Secret Client' }),
      })
    ).json();
    const site = await (
      await fetch(`${baseUrl}/customers/${cust.id}/sites`, {
        method: 'POST',
        headers: headersA,
        body: JSON.stringify({
          siteName: 'Main Villa',
          addressLine: 'Street 1',
          city: 'Karachi',
        }),
      })
    ).json();
    const project = await (
      await fetch(`${baseUrl}/projects`, {
        method: 'POST',
        headers: headersA,
        body: JSON.stringify({
          customerId: cust.id,
          siteId: site.id,
          title: 'Private Roof Array',
          systemType: 'on_grid',
          assignedUserIds: [orgA.user.id],
        }),
      })
    ).json();
    const survey = await (
      await fetch(`${baseUrl}/surveys`, {
        method: 'POST',
        headers: headersA,
        body: JSON.stringify({ projectId: project.id }),
      })
    ).json();
    const sha = createHash('sha256').update('org-a-photo').digest('hex');
    const presign = await (
      await fetch(`${baseUrl}/surveys/${survey.id}/photos/presign`, {
        method: 'POST',
        headers: headersA,
        body: JSON.stringify({
          filename: 'evidence.jpg',
          mimeType: 'image/jpeg',
          byteSize: 4096,
          sha256Checksum: sha,
        }),
      })
    ).json();
    await fetch(`${baseUrl}/surveys/${survey.id}/photos/commit`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({ fileAttachmentId: presign.fileAttachmentId, sha256Checksum: sha }),
    });

    // Customer role cannot create surveys (403)
    const custSurveyAttempt = await fetch(`${baseUrl}/surveys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerLogin.accessToken}`,
      },
      body: JSON.stringify({ projectId: project.id }),
    });
    assert.equal(custSurveyAttempt.status, 403);

    // Unassigned Field Technician cannot read Org A's unassigned survey (403)
    const techSurveyAttempt = await fetch(`${baseUrl}/surveys/${survey.id}`, {
      headers: { Authorization: `Bearer ${techLogin.accessToken}` },
    });
    assert.equal(techSurveyAttempt.status, 403);

    // Cross-tenant Org B receives 404 on Org A customer, survey, and file download
    const headersB = { Authorization: `Bearer ${orgB.accessToken}` };
    const crossCust = await fetch(`${baseUrl}/customers/${cust.id}/sites`, { headers: headersB });
    assert.equal(crossCust.status, 404);
    const crossSurvey = await fetch(`${baseUrl}/surveys/${survey.id}`, { headers: headersB });
    assert.equal(crossSurvey.status, 404);
    const crossFile = await fetch(`${baseUrl}/files/${presign.fileAttachmentId}/download`, {
      headers: headersB,
    });
    assert.equal(crossFile.status, 404);
  } finally {
    server.close();
  }
});
