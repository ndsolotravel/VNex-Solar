import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { createApiV1Router } from '../server/api-v1.ts';
import { InMemoryCustomersSurveysService } from '../server/customers-surveys-service.ts';
import { InMemoryInventoryService } from '../server/inventory-service.ts';
import { InMemoryInstallationService } from '../server/installation-service.ts';
import type { AccessTokenClaims } from '../server/auth-service.ts';
import { UserRole } from '../packages/domain/src/index.ts';

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
      legalName: `Install Corp ${slug}`,
      displayName: `Install ${slug}`,
      slug,
      businessAddress: 'Lahore, Pakistan',
      countryCode: 'PK',
      defaultCurrency: 'PKR',
      ownerFullName: `Owner ${slug}`,
      ownerEmail: `owner@${slug}.pk`,
      password: 'InstallPassword!2026',
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
      fullName: `Crew ${role}`,
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

async function createSampleProject(baseUrl: string, token: string) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const cust = await (
    await fetch(`${baseUrl}/customers`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customerType: 'commercial',
        fullName: 'Indus Textile Mill',
        primaryPhone: '+92-300-4455667',
      }),
    })
  ).json();

  const site = await (
    await fetch(`${baseUrl}/customers/${cust.id}/sites`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        siteName: 'Weaving Shed Roof',
        addressLine: 'Quaid-e-Azam Industrial Estate',
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
        title: '50 kW Hybrid Industrial Solar',
        systemType: 'hybrid',
        targetCapacityKwp: 50,
        currency: 'PKR',
      }),
    })
  ).json();

  return { customer: cust, site, project };
}

test('Test 28: Job creation, crew assignment, optimistic task updates, safety_blocked / incomplete guards, and project stage completion', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const slug = `inst28-${Date.now()}`;
    const org = await registerOrg(baseUrl, slug);
    const supervisor = await inviteAndLogin(
      baseUrl,
      org.accessToken,
      slug,
      `sup@${slug}.pk`,
      UserRole.INSTALLATION_SUPERVISOR,
    );
    const tech = await inviteAndLogin(
      baseUrl,
      org.accessToken,
      slug,
      `tech@${slug}.pk`,
      UserRole.FIELD_TECHNICIAN,
    );

    const { project } = await createSampleProject(baseUrl, org.accessToken);

    const createJobRes = await fetch(`${baseUrl}/installations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supervisor.accessToken}`,
      },
      body: JSON.stringify({
        projectId: project.id,
        scheduledStartDate: '2026-05-01',
        scheduledEndDate: '2026-05-05',
        taskTitles: ['Mount L2 aluminum rails', 'Terminate DC combiner & SPD'],
      }),
    });
    assert.equal(createJobRes.status, 201);
    const job = await createJobRes.json();
    assert.equal(job.jobCode, 'JOB-0001');
    assert.equal(job.status, 'scheduled');
    assert.equal(job.tasks.length, 2);

    // Project advanced to installation_scheduled
    const projScheduled = await (
      await fetch(`${baseUrl}/projects/${project.id}`, {
        headers: { Authorization: `Bearer ${org.accessToken}` },
      })
    ).json();
    assert.equal(projScheduled.currentStage, 'installation_scheduled');

    // Assign technician to job crew
    const assignRes = await fetch(`${baseUrl}/installations/${job.id}/team`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supervisor.accessToken}`,
      },
      body: JSON.stringify({
        userId: tech.user.id,
        fullName: 'Asad Ali',
        roleOnSite: 'DC String Electrician',
      }),
    });
    assert.equal(assignRes.status, 201);
    const assignedJob = await assignRes.json();
    assert.equal(assignedJob.teamAssignments.length, 1);

    // Move first task to in_progress -> job advances project to installation_in_progress
    const task1 = assignedJob.tasks[0];
    const startRes = await fetch(`${baseUrl}/installations/${job.id}/tasks/${task1.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tech.accessToken}`,
      },
      body: JSON.stringify({ baseRowVersion: task1.rowVersion, status: 'in_progress' }),
    });
    assert.equal(startRes.status, 200);
    const startedPayload = await startRes.json();
    assert.equal(startedPayload.task.rowVersion, 2);
    assert.equal(startedPayload.job.status, 'in_progress');

    const projInProgress = await (
      await fetch(`${baseUrl}/projects/${project.id}`, {
        headers: { Authorization: `Bearer ${org.accessToken}` },
      })
    ).json();
    assert.equal(projInProgress.currentStage, 'installation_in_progress');

    // Stale baseRowVersion triggers 409 VERSION_CONFLICT
    const staleRes = await fetch(`${baseUrl}/installations/${job.id}/tasks/${task1.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tech.accessToken}`,
      },
      body: JSON.stringify({ baseRowVersion: 1, status: 'completed' }),
    });
    assert.equal(staleRes.status, 409);

    // Completing job with incomplete tasks fails with 409 INCOMPLETE_TASKS
    const earlyComplete = await fetch(`${baseUrl}/installations/${job.id}/complete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${supervisor.accessToken}` },
    });
    assert.equal(earlyComplete.status, 409);
    const earlyErr = await earlyComplete.json();
    assert.equal(earlyErr.error.code, 'INCOMPLETE_TASKS');

    // Complete both tasks
    const done1 = await fetch(`${baseUrl}/installations/${job.id}/tasks/${task1.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tech.accessToken}`,
      },
      body: JSON.stringify({ baseRowVersion: 2, status: 'completed' }),
    });
    assert.equal(done1.status, 200);

    const task2 = assignedJob.tasks[1];
    const done2 = await fetch(`${baseUrl}/installations/${job.id}/tasks/${task2.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tech.accessToken}`,
      },
      body: JSON.stringify({ baseRowVersion: task2.rowVersion, status: 'completed' }),
    });
    assert.equal(done2.status, 200);

    // Complete job cleanly -> project stage installation_completed
    const completeRes = await fetch(`${baseUrl}/installations/${job.id}/complete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${supervisor.accessToken}` },
    });
    assert.equal(completeRes.status, 200);
    const completedJob = await completeRes.json();
    assert.equal(completedJob.status, 'completed');

    const projDone = await (
      await fetch(`${baseUrl}/projects/${project.id}`, {
        headers: { Authorization: `Bearer ${org.accessToken}` },
      })
    ).json();
    assert.equal(projDone.currentStage, 'installation_completed');

    // Verify safety_blocked guard directly on InMemoryInstallationService
    const csSvc = new InMemoryCustomersSurveysService();
    const invSvc = new InMemoryInventoryService(csSvc);
    const instSvc = new InMemoryInstallationService(csSvc, invSvc);
    const ownerClaims: AccessTokenClaims = {
      sub: org.user.id,
      orgId: org.organization.id,
      role: UserRole.ORG_OWNER,
      sessionId: org.sessionId,
    };
    const cust = csSvc.createCustomer(ownerClaims, {
      customerType: 'residential',
      fullName: 'Safety Guard Home',
    });
    const site = csSvc.createSite(ownerClaims, cust.id, {
      siteName: 'Roof A',
      addressLine: 'Street 4',
      city: 'Lahore',
      countryCode: 'PK',
      connectionPhase: 'single',
    });
    const p2 = csSvc.createProject(ownerClaims, {
      customerId: cust.id,
      siteId: site.id,
      title: '10 kW Blocked Site',
      systemType: 'hybrid',
      currency: 'PKR',
    });
    const job2 = instSvc.createJob(ownerClaims, {
      projectId: p2.id,
      scheduledStartDate: '2026-05-02',
      taskTitles: ['Task A'],
    });
    instSvc.setJobSafetyGate(ownerClaims, job2.id, false, true);
    assert.throws(
      () =>
        instSvc.updateTaskStatus(ownerClaims, job2.id, job2.tasks[0].id, {
          baseRowVersion: 1,
          status: 'completed',
        }),
      /safety-blocked/i,
    );
    assert.throws(() => instSvc.completeJob(ownerClaims, job2.id), /safety gate is blocked/i);
  } finally {
    server.close();
  }
});

test('Test 29: Linked warehouse material issue + serial status update + idempotency, daily logs, and SHA-256 photo commit', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const slug = `inst29-${Date.now()}`;
    const org = await registerOrg(baseUrl, slug);
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${org.accessToken}`,
    };
    const { project } = await createSampleProject(baseUrl, org.accessToken);

    // Fetch warehouses, suppliers, and catalog, then receive serialized inverter stock
    const whData = await (await fetch(`${baseUrl}/inventory/warehouses`, { headers })).json();
    const supData = await (await fetch(`${baseUrl}/inventory/suppliers`, { headers })).json();
    const catData = await (await fetch(`${baseUrl}/inventory/catalog`, { headers })).json();
    const warehouseId = whData.warehouses[0].id;
    const supplierId = supData.suppliers[0].id;
    const inverter = catData.items.find((i: { isSerialized: boolean }) => i.isSerialized);
    assert.ok(inverter);

    const po = await (
      await fetch(`${baseUrl}/inventory/purchase-orders`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          supplierId,
          warehouseId,
          currency: 'PKR',
          items: [{ equipmentCatalogId: inverter.id, quantityOrdered: 2, unitCostMinor: 15000000 }],
        }),
      })
    ).json();
    await fetch(`${baseUrl}/inventory/purchase-orders/${po.id}/issue`, { method: 'POST', headers });
    const grnRes = await fetch(`${baseUrl}/inventory/purchase-orders/${po.id}/receive`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        idempotencyKey: `grn-${Date.now()}`,
        equipmentCatalogId: inverter.id,
        quantityReceived: 2,
        serialNumbers: ['SN-INST-001', 'SN-INST-002'],
      }),
    });
    assert.equal(grnRes.status, 201);

    const job = await (
      await fetch(`${baseUrl}/installations`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          projectId: project.id,
          scheduledStartDate: '2026-05-03',
        }),
      })
    ).json();

    // Issue 1 serialized inverter directly from installation job
    const matKey = `mat-issue-${Date.now()}`;
    const issueRes = await fetch(`${baseUrl}/installations/${job.id}/material-issues`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        idempotencyKey: matKey,
        warehouseId,
        equipmentCatalogId: inverter.id,
        quantity: 1,
        serialNumbers: ['SN-INST-001'],
        notes: 'Dispatched to site crew',
      }),
    });
    assert.equal(issueRes.status, 201);
    const issuedBody = await issueRes.json();
    assert.equal(issuedBody.deduplicated, false);
    assert.deepEqual(issuedBody.materialIssue.serialNumbers, ['SN-INST-001']);

    // Idempotent replay returns deduplicated=true and does not double-deduct
    const replayRes = await fetch(`${baseUrl}/installations/${job.id}/material-issues`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        idempotencyKey: matKey,
        warehouseId,
        equipmentCatalogId: inverter.id,
        quantity: 1,
        serialNumbers: ['SN-INST-001'],
      }),
    });
    assert.equal(replayRes.status, 201);
    const replayBody = await replayRes.json();
    assert.equal(replayBody.deduplicated, true);

    const balData = await (await fetch(`${baseUrl}/inventory/balances`, { headers })).json();
    const invBal = balData.balances.find(
      (b: { warehouseId: string; equipmentCatalogId: string }) =>
        b.warehouseId === warehouseId && b.equipmentCatalogId === inverter.id,
    );
    assert.equal(invBal.onHandQty, 1);

    const serialsData = await (
      await fetch(`${baseUrl}/inventory/serials?q=SN-INST-001`, { headers })
    ).json();
    assert.equal(serialsData.serials[0].status, 'installed');
    assert.equal(serialsData.serials[0].projectId, project.id);

    // Daily site diary log
    const logRes = await fetch(`${baseUrl}/installations/${job.id}/logs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        logDate: '2026-05-03',
        weatherConditions: 'Sunny 34C',
        workSummary: 'Installed main DC earthing busbar and inverter backboard',
      }),
    });
    assert.equal(logRes.status, 201);

    // SHA-256 installation photo presign + mismatch 422 + verified 201 commit
    const rawBytes = Buffer.from('installation-array-photo-bytes');
    const sha256 = createHash('sha256').update(rawBytes).digest('hex');
    const presignRes = await fetch(`${baseUrl}/installations/${job.id}/photos/presign`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        filename: 'inverter-mounted.jpg',
        mimeType: 'image/jpeg',
        byteSize: rawBytes.byteLength,
        sha256Checksum: sha256,
        caption: 'Inverter SPD wiring',
      }),
    });
    assert.equal(presignRes.status, 201);
    const presign = await presignRes.json();

    const badCommitRes = await fetch(`${baseUrl}/installations/${job.id}/photos/commit`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        fileAttachmentId: presign.fileAttachmentId,
        sha256Checksum: '0'.repeat(64),
      }),
    });
    assert.equal(badCommitRes.status, 422);

    const goodCommitRes = await fetch(`${baseUrl}/installations/${job.id}/photos/commit`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        fileAttachmentId: presign.fileAttachmentId,
        sha256Checksum: sha256,
      }),
    });
    assert.equal(goodCommitRes.status, 201);
    const photo = await goodCommitRes.json();
    assert.equal(photo.sha256Checksum, sha256);
  } finally {
    server.close();
  }
});

test('Test 30: Field Technician resource isolation, Role RBAC, cross-tenant isolation, and offline installation_task sync reconciliation', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const slugA = `inst30a-${Date.now()}`;
    const slugB = `inst30b-${Date.now()}`;
    const orgA = await registerOrg(baseUrl, slugA);
    const orgB = await registerOrg(baseUrl, slugB);

    const techAssigned = await inviteAndLogin(
      baseUrl,
      orgA.accessToken,
      slugA,
      `tech1@${slugA}.pk`,
      UserRole.FIELD_TECHNICIAN,
    );
    const techUnassigned = await inviteAndLogin(
      baseUrl,
      orgA.accessToken,
      slugA,
      `tech2@${slugA}.pk`,
      UserRole.FIELD_TECHNICIAN,
    );
    const safetyOfficer = await inviteAndLogin(
      baseUrl,
      orgA.accessToken,
      slugA,
      `safety@${slugA}.pk`,
      UserRole.SAFETY_OFFICER,
    );
    const salesExec = await inviteAndLogin(
      baseUrl,
      orgA.accessToken,
      slugA,
      `sales@${slugA}.pk`,
      UserRole.SALES_EXECUTIVE,
    );

    const { project } = await createSampleProject(baseUrl, orgA.accessToken);
    const jobRes = await fetch(`${baseUrl}/installations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${orgA.accessToken}`,
      },
      body: JSON.stringify({
        projectId: project.id,
        scheduledStartDate: '2026-05-06',
        teamAssignments: [
          { userId: techAssigned.user.id, fullName: 'Assigned Tech', roleOnSite: 'Rigger' },
        ],
      }),
    });
    assert.equal(jobRes.status, 201);
    const job = await jobRes.json();
    const task1 = job.tasks[0];

    // Assigned tech sees job; unassigned tech gets empty list and 403 on direct access/update
    const tech1List = await (
      await fetch(`${baseUrl}/installations`, {
        headers: { Authorization: `Bearer ${techAssigned.accessToken}` },
      })
    ).json();
    assert.equal(tech1List.installations.length, 1);

    const tech2List = await (
      await fetch(`${baseUrl}/installations`, {
        headers: { Authorization: `Bearer ${techUnassigned.accessToken}` },
      })
    ).json();
    assert.equal(tech2List.installations.length, 0);

    const tech2Get = await fetch(`${baseUrl}/installations/${job.id}`, {
      headers: { Authorization: `Bearer ${techUnassigned.accessToken}` },
    });
    assert.equal(tech2Get.status, 403);

    const tech2Patch = await fetch(`${baseUrl}/installations/${job.id}/tasks/${task1.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${techUnassigned.accessToken}`,
      },
      body: JSON.stringify({ baseRowVersion: 1, status: 'in_progress' }),
    });
    assert.equal(tech2Patch.status, 403);

    // Safety Officer can read (200) but cannot mutate tasks (403)
    const safetyRead = await fetch(`${baseUrl}/installations/${job.id}`, {
      headers: { Authorization: `Bearer ${safetyOfficer.accessToken}` },
    });
    assert.equal(safetyRead.status, 200);

    const safetyPatch = await fetch(`${baseUrl}/installations/${job.id}/tasks/${task1.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${safetyOfficer.accessToken}`,
      },
      body: JSON.stringify({ baseRowVersion: 1, status: 'in_progress' }),
    });
    assert.equal(safetyPatch.status, 403);

    // Sales Executive lacks installation:read -> 403
    const salesRead = await fetch(`${baseUrl}/installations`, {
      headers: { Authorization: `Bearer ${salesExec.accessToken}` },
    });
    assert.equal(salesRead.status, 403);

    // Cross-tenant isolation -> 404
    const crossTenantRes = await fetch(`${baseUrl}/installations/${job.id}`, {
      headers: { Authorization: `Bearer ${orgB.accessToken}` },
    });
    assert.equal(crossTenantRes.status, 404);

    // Offline installation_task sync reconciliation via /sync/batch
    const payload = {
      installationJobId: job.id,
      status: 'completed',
      baseRowVersion: 1,
    };
    const syncPayloadStr = JSON.stringify(payload);
    const syncRes = await fetch(`${baseUrl}/sync/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${techAssigned.accessToken}`,
      },
      body: JSON.stringify({
        deviceId: 'android-field-tablet-01',
        operations: [
          {
            syncOperationId: randomUUID(),
            idempotencyKey: `inst-task-${Date.now()}`,
            entityType: 'installation_task',
            entityId: task1.id,
            operationType: 'update',
            baseRowVersion: task1.rowVersion,
            payloadSha256: createHash('sha256').update(syncPayloadStr).digest('hex'),
            payload,
            clientTimestamp: new Date().toISOString(),
          },
        ],
      }),
    });
    assert.equal(syncRes.status, 200);
    const syncBody = await syncRes.json();
    assert.equal(syncBody.results[0].status, 'applied');

    const refreshedJob = await (
      await fetch(`${baseUrl}/installations/${job.id}`, {
        headers: { Authorization: `Bearer ${techAssigned.accessToken}` },
      })
    ).json();
    assert.equal(refreshedJob.tasks[0].status, 'completed');
    assert.equal(refreshedJob.tasks[0].rowVersion, 2);
  } finally {
    server.close();
  }
});
