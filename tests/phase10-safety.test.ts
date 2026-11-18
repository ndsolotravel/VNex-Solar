import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { createApiV1Router } from '../server/api-v1.ts';
import { DEFAULT_PV_CHECKLIST_ITEMS, UserRole } from '../packages/domain/src/index.ts';

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
      legalName: `Safety Corp ${slug}`,
      displayName: `Safety ${slug}`,
      slug,
      businessAddress: 'Lahore, Pakistan',
      countryCode: 'PK',
      defaultCurrency: 'PKR',
      ownerFullName: `Owner ${slug}`,
      ownerEmail: `owner@${slug}.pk`,
      password: 'SafetyPassword!2026',
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

async function createSampleJob(baseUrl: string, token: string, crewIds?: Array<{ userId: string; fullName: string; roleOnSite: string }>) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const cust = await (
    await fetch(`${baseUrl}/customers`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customerType: 'commercial',
        fullName: 'National Cold Storage',
      }),
    })
  ).json();

  const site = await (
    await fetch(`${baseUrl}/customers/${cust.id}/sites`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        siteName: 'Block D Roof',
        addressLine: 'Sundar Industrial Area',
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
        title: '30 kW Safety Gate Solar Site',
        systemType: 'hybrid',
        targetCapacityKwp: 30,
        currency: 'PKR',
      }),
    })
  ).json();

  const jobRes = await fetch(`${baseUrl}/installations`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      projectId: project.id,
      scheduledStartDate: '2026-05-10',
      taskTitles: ['Install structural rails & earthing'],
      teamAssignments: crewIds,
    }),
  });
  assert.equal(jobRes.status, 201);
  const job = await jobRes.json();
  return { project, job };
}

test('Test 31: Risk assessment PPE/isolation enforcement, safety checklists, and critical incident hard-blocking installation completion', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const slug = `safe31-${Date.now()}`;
    const org = await registerOrg(baseUrl, slug);
    const safetyOfficer = await inviteAndLogin(
      baseUrl,
      org.accessToken,
      slug,
      `safety@${slug}.pk`,
      UserRole.SAFETY_OFFICER,
    );
    const supervisor = await inviteAndLogin(
      baseUrl,
      org.accessToken,
      slug,
      `sup@${slug}.pk`,
      UserRole.INSTALLATION_SUPERVISOR,
    );

    const { job } = await createSampleJob(baseUrl, org.accessToken);
    const supHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${supervisor.accessToken}`,
    };
    const safeHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${safetyOfficer.accessToken}`,
    };

    // Unverified PPE/isolation risk assessment cannot be approved (422)
    const badRiskRes = await fetch(`${baseUrl}/safety/risk-assessments`, {
      method: 'POST',
      headers: supHeaders,
      body: JSON.stringify({
        installationJobId: job.id,
        workingAtHeightRequired: true,
        electricalIsolationVerified: false,
        ppeComplianceVerified: false,
        hazardNotes: 'Pending LOTO lockset',
      }),
    });
    assert.equal(badRiskRes.status, 201);
    const badRisk = await badRiskRes.json();

    const failApprove = await fetch(`${baseUrl}/safety/risk-assessments/${badRisk.id}/approve`, {
      method: 'POST',
      headers: safeHeaders,
      body: JSON.stringify({ notes: 'Attempt approve without PPE' }),
    });
    assert.equal(failApprove.status, 422);

    // Valid risk assessment approved by Safety Officer
    const goodRisk = await (
      await fetch(`${baseUrl}/safety/risk-assessments`, {
        method: 'POST',
        headers: supHeaders,
        body: JSON.stringify({
          installationJobId: job.id,
          workingAtHeightRequired: true,
          electricalIsolationVerified: true,
          ppeComplianceVerified: true,
          hazardNotes: 'LOTO + Class 0 gloves + anchor lines verified',
        }),
      })
    ).json();

    const approveRiskRes = await fetch(`${baseUrl}/safety/risk-assessments/${goodRisk.id}/approve`, {
      method: 'POST',
      headers: safeHeaders,
      body: JSON.stringify({ notes: 'All pre-work controls active' }),
    });
    assert.equal(approveRiskRes.status, 200);
    assert.equal((await approveRiskRes.json()).status, 'approved');

    // Record PPE checklist
    const chkRes = await fetch(`${baseUrl}/safety/checklists`, {
      method: 'POST',
      headers: supHeaders,
      body: JSON.stringify({
        installationJobId: job.id,
        checklistType: 'ppe',
        items: DEFAULT_PV_CHECKLIST_ITEMS.ppe,
      }),
    });
    assert.equal(chkRes.status, 201);

    // Complete task first
    const task = job.tasks[0];
    await fetch(`${baseUrl}/installations/${job.id}/tasks/${task.id}`, {
      method: 'PATCH',
      headers: supHeaders,
      body: JSON.stringify({ baseRowVersion: task.rowVersion, status: 'completed' }),
    });

    // Report CRITICAL safety incident -> job immediately enters safety_blocked
    const incRes = await fetch(`${baseUrl}/safety/incidents`, {
      method: 'POST',
      headers: supHeaders,
      body: JSON.stringify({
        installationJobId: job.id,
        severity: 'critical',
        description: 'Live DC combiner arc fault detected during harness inspection',
        immediateActionTaken: 'Area cordoned off and DC switch opened',
      }),
    });
    assert.equal(incRes.status, 201);
    const incident = await incRes.json();

    const bundleBlocked = await (
      await fetch(`${baseUrl}/safety/jobs/${job.id}`, { headers: safeHeaders })
    ).json();
    assert.equal(bundleBlocked.jobStatus, 'safety_blocked');
    assert.equal(bundleBlocked.evaluation.blocked, true);

    // Completing installation job is blocked with 422 SAFETY_GATE_BLOCKED
    const blockedComplete = await fetch(`${baseUrl}/installations/${job.id}/complete`, {
      method: 'POST',
      headers: supHeaders,
    });
    assert.equal(blockedComplete.status, 422);

    // Resolve incident -> job unblocked
    const resolveRes = await fetch(`${baseUrl}/safety/incidents/${incident.id}/resolve`, {
      method: 'POST',
      headers: safeHeaders,
      body: JSON.stringify({ actionNotes: 'Replaced damaged DC lug and re-torqued' }),
    });
    assert.equal(resolveRes.status, 200);

    const completeOk = await fetch(`${baseUrl}/installations/${job.id}/complete`, {
      method: 'POST',
      headers: supHeaders,
    });
    assert.equal(completeOk.status, 200);
  } finally {
    server.close();
  }
});

test('Test 32: IEC 62446-1 inspection tolerance/fail blocks, corrective action remediation, immutable pass approval, and project stage safety_approved', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const slug = `safe32-${Date.now()}`;
    const org = await registerOrg(baseUrl, slug);
    const safetyOfficer = await inviteAndLogin(
      baseUrl,
      org.accessToken,
      slug,
      `safety@${slug}.pk`,
      UserRole.SAFETY_OFFICER,
    );
    const { project, job } = await createSampleJob(baseUrl, org.accessToken);
    const safeHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${safetyOfficer.accessToken}`,
    };

    // Submit & approve risk assessment first
    const risk = await (
      await fetch(`${baseUrl}/safety/risk-assessments`, {
        method: 'POST',
        headers: safeHeaders,
        body: JSON.stringify({
          installationJobId: job.id,
          workingAtHeightRequired: true,
          electricalIsolationVerified: true,
          ppeComplianceVerified: true,
        }),
      })
    ).json();
    await fetch(`${baseUrl}/safety/risk-assessments/${risk.id}/approve`, {
      method: 'POST',
      headers: safeHeaders,
      body: JSON.stringify({ notes: 'Verified' }),
    });

    // Record inspection with a FAIL item + out-of-tolerance earth reading (8.4 Ohm) + initial corrective action
    const insRes = await fetch(`${baseUrl}/safety/inspections`, {
      method: 'POST',
      headers: safeHeaders,
      body: JSON.stringify({
        installationJobId: job.id,
        items: [
          {
            checkCode: 'IEC-GND-01',
            description: 'Earthing rod resistance below 5 Ohm',
            result: 'fail',
          },
        ],
        testReadings: [
          {
            parameterName: 'Earth Electrode Resistance',
            measuredValue: 8.4,
            unit: 'ohm',
            withinTolerance: false,
          },
        ],
        initialCorrectiveAction: 'Drive secondary copper earth rod & bond to pit',
      }),
    });
    assert.equal(insRes.status, 201);
    const inspection = await insRes.json();
    const actionId = inspection.correctiveActions[0].id;

    // Attempt to pass inspection while failing -> 422 SAFETY_GATE_BLOCKED
    const blockedApprove = await fetch(`${baseUrl}/safety/inspections/${inspection.id}/approve`, {
      method: 'POST',
      headers: safeHeaders,
      body: JSON.stringify({ notes: 'Try premature pass' }),
    });
    assert.equal(blockedApprove.status, 422);

    // Resolve and verify corrective action
    const resAction = await fetch(
      `${baseUrl}/safety/inspections/${inspection.id}/corrective-actions/${actionId}`,
      {
        method: 'PATCH',
        headers: safeHeaders,
        body: JSON.stringify({ status: 'resolved' }),
      },
    );
    assert.equal(resAction.status, 200);

    const verAction = await fetch(
      `${baseUrl}/safety/inspections/${inspection.id}/corrective-actions/${actionId}`,
      {
        method: 'PATCH',
        headers: safeHeaders,
        body: JSON.stringify({ status: 'verified' }),
      },
    );
    assert.equal(verAction.status, 200);

    // Now Safety Officer approves inspection -> status='passed', job.safetyCleared=true, project stage='safety_approved'
    const passRes = await fetch(`${baseUrl}/safety/inspections/${inspection.id}/approve`, {
      method: 'POST',
      headers: safeHeaders,
      body: JSON.stringify({ notes: 'Earth resistance lowered to 1.9 Ohm and verified' }),
    });
    assert.equal(passRes.status, 200);
    const passedIns = await passRes.json();
    assert.equal(passedIns.status, 'passed');
    assert.equal(passedIns.approvals.length, 1);

    // Re-approving/modifying passed inspection returns 409 INSPECTION_IMMUTABLE
    const reApprove = await fetch(`${baseUrl}/safety/inspections/${inspection.id}/approve`, {
      method: 'POST',
      headers: safeHeaders,
      body: JSON.stringify({ notes: 'Duplicate pass' }),
    });
    assert.equal(reApprove.status, 409);

    const bundleCleared = await (
      await fetch(`${baseUrl}/safety/jobs/${job.id}`, { headers: safeHeaders })
    ).json();
    assert.equal(bundleCleared.safetyCleared, true);
    assert.equal(bundleCleared.evaluation.cleared, true);

    const projAfter = await (
      await fetch(`${baseUrl}/projects/${project.id}`, {
        headers: { Authorization: `Bearer ${org.accessToken}` },
      })
    ).json();
    assert.equal(projAfter.currentStage, 'safety_approved');
  } finally {
    server.close();
  }
});

test('Test 33: Safety RBAC separation, cross-tenant isolation, and offline inspection_draft sync reconciliation', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const slugA = `safe33a-${Date.now()}`;
    const slugB = `safe33b-${Date.now()}`;
    const orgA = await registerOrg(baseUrl, slugA);
    const orgB = await registerOrg(baseUrl, slugB);

    const tech = await inviteAndLogin(
      baseUrl,
      orgA.accessToken,
      slugA,
      `tech@${slugA}.pk`,
      UserRole.FIELD_TECHNICIAN,
    );
    const supervisor = await inviteAndLogin(
      baseUrl,
      orgA.accessToken,
      slugA,
      `sup@${slugA}.pk`,
      UserRole.INSTALLATION_SUPERVISOR,
    );
    const sales = await inviteAndLogin(
      baseUrl,
      orgA.accessToken,
      slugA,
      `sales@${slugA}.pk`,
      UserRole.SALES_EXECUTIVE,
    );

    const { job } = await createSampleJob(baseUrl, orgA.accessToken, [
      { userId: tech.user.id, fullName: 'Assigned Tech', roleOnSite: 'Installer' },
    ]);

    // Field Technician can submit a risk assessment (201) but CANNOT approve it (403)
    const techRisk = await (
      await fetch(`${baseUrl}/safety/risk-assessments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tech.accessToken}`,
        },
        body: JSON.stringify({
          installationJobId: job.id,
          workingAtHeightRequired: true,
          electricalIsolationVerified: true,
          ppeComplianceVerified: true,
        }),
      })
    ).json();
    assert.ok(techRisk.id);

    const techApproveRisk = await fetch(`${baseUrl}/safety/risk-assessments/${techRisk.id}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tech.accessToken}` },
    });
    assert.equal(techApproveRisk.status, 403);

    const supApproveRisk = await fetch(`${baseUrl}/safety/risk-assessments/${techRisk.id}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${supervisor.accessToken}` },
    });
    assert.equal(supApproveRisk.status, 403);

    // Sales Executive lacks safety:read -> 403
    const salesSafetyRead = await fetch(`${baseUrl}/safety/jobs/${job.id}`, {
      headers: { Authorization: `Bearer ${sales.accessToken}` },
    });
    assert.equal(salesSafetyRead.status, 403);

    // Cross-tenant isolation -> 404
    const crossRead = await fetch(`${baseUrl}/safety/jobs/${job.id}`, {
      headers: { Authorization: `Bearer ${orgB.accessToken}` },
    });
    assert.equal(crossRead.status, 404);

    // Offline inspection_draft sync reconciliation via /sync/batch
    const offlineInspectionId = randomUUID();
    const payload = {
      installationJobId: job.id,
      items: [
        { checkCode: 'IEC-01', description: 'PV Polarity & Voc check', result: 'pass' },
      ],
      testReadings: [
        { parameterName: 'Earth Resistance', measuredValue: 1.7, unit: 'ohm', withinTolerance: true },
      ],
    };
    const payloadStr = JSON.stringify(payload);
    const syncRes = await fetch(`${baseUrl}/sync/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tech.accessToken}`,
      },
      body: JSON.stringify({
        deviceId: 'android-safety-tablet-01',
        operations: [
          {
            syncOperationId: randomUUID(),
            idempotencyKey: `insp-draft-${offlineInspectionId}`,
            entityType: 'inspection_draft',
            entityId: offlineInspectionId,
            operationType: 'create',
            baseRowVersion: 0,
            payloadSha256: createHash('sha256').update(payloadStr).digest('hex'),
            payload,
            clientTimestamp: new Date().toISOString(),
          },
        ],
      }),
    });
    assert.equal(syncRes.status, 200);
    const syncBody = await syncRes.json();
    assert.equal(syncBody.results[0].status, 'applied');

    const syncedInspections = await (
      await fetch(`${baseUrl}/safety/inspections?jobId=${job.id}`, {
        headers: { Authorization: `Bearer ${tech.accessToken}` },
      })
    ).json();
    assert.equal(syncedInspections.inspections.length, 1);
    assert.equal(syncedInspections.inspections[0].id, offlineInspectionId);

    // Field Technician CANNOT approve the synced inspection (403)
    const techApproveIns = await fetch(
      `${baseUrl}/safety/inspections/${offlineInspectionId}/approve`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${tech.accessToken}` },
      },
    );
    assert.equal(techApproveIns.status, 403);
  } finally {
    server.close();
  }
});
