import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { createApiV1Router } from '../server/api-v1.ts';
import { computeCanonicalSha256 } from '../server/sync-service.ts';
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
      legalName: `Sync Corp ${slug}`,
      displayName: `Sync ${slug}`,
      slug,
      businessAddress: 'Lahore, Pakistan',
      countryCode: 'PK',
      defaultCurrency: 'PKR',
      ownerFullName: `Owner ${slug}`,
      ownerEmail: `owner@${slug}.pk`,
      password: 'SyncPassword!2026',
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

test('Test 40: Multi-device delta pagination, monotonic device checkpoints, and conflict merge propagation', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const org = await registerOrg(baseUrl, 'adv-sync-multi');
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${org.accessToken}`,
    };

    // Register Device A & Device B
    await fetch(`${baseUrl}/sync/devices/register`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ deviceIdentifier: 'device-a', platform: 'android', appVersion: '1.3.0' }),
    });
    await fetch(`${baseUrl}/sync/devices/register`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ deviceIdentifier: 'device-b', platform: 'web', appVersion: '1.3.0' }),
    });

    // Device A creates 3 offline customers in a batch
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    const ops = ids.map((id, idx) => {
      const payload = { fullName: `Customer ${idx + 1}`, city: 'Lahore' };
      return {
        syncOperationId: randomUUID(),
        idempotencyKey: `cust:${id}:1`,
        entityType: 'customer',
        entityId: id,
        operationType: 'create',
        baseRowVersion: 0,
        payloadSha256: computeCanonicalSha256(payload),
        payload,
        clientTimestamp: new Date().toISOString(),
      };
    });

    const pushA = await (
      await fetch(`${baseUrl}/sync/batch`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ deviceId: 'device-a', operations: ops }),
      })
    ).json();
    assert.equal(pushA.results.length, 3);
    assert.ok(pushA.results.every((r: { status: string }) => r.status === 'applied'));

    // Device B pulls incremental deltas with page limit=2 -> hasMore=true -> next page hasMore=false
    const page1 = await (
      await fetch(`${baseUrl}/sync/delta?sinceSeq=0&limit=2`, {
        headers: { Authorization: `Bearer ${org.accessToken}` },
      })
    ).json();
    assert.equal(page1.changes.length, 2);
    assert.equal(page1.hasMore, true);

    const page2 = await (
      await fetch(`${baseUrl}/sync/delta?sinceSeq=${page1.nextServerSeq}&limit=2`, {
        headers: { Authorization: `Bearer ${org.accessToken}` },
      })
    ).json();
    assert.equal(page2.changes.length, 1);
    assert.equal(page2.hasMore, false);

    // Persist monotonic checkpoint for device-b and verify regression fails with 409
    const cpSave = await fetch(`${baseUrl}/sync/checkpoints/device-b`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ lastServerSeq: page2.nextServerSeq }),
    });
    assert.equal(cpSave.status, 200);
    assert.equal((await cpSave.json()).lastServerSeq, page2.nextServerSeq);

    const cpRegress = await fetch(`${baseUrl}/sync/checkpoints/device-b`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ lastServerSeq: 1 }),
    });
    assert.equal(cpRegress.status, 409);
    assert.equal((await cpRegress.json()).error.code, 'CHECKPOINT_REGRESSION');

    // Device B sends stale update (baseRowVersion: 0 vs v1) on ids[0] -> explicit conflict
    const stalePayload = { fullName: 'Customer 1 (Field Corrected)', city: 'Islamabad' };
    const stalePush = await (
      await fetch(`${baseUrl}/sync/batch`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          deviceId: 'device-b',
          operations: [
            {
              syncOperationId: randomUUID(),
              idempotencyKey: `cust:stale:${ids[0]}`,
              entityType: 'customer',
              entityId: ids[0],
              operationType: 'update',
              baseRowVersion: 0,
              payloadSha256: computeCanonicalSha256(stalePayload),
              payload: stalePayload,
              clientTimestamp: new Date().toISOString(),
            },
          ],
        }),
      })
    ).json();
    assert.equal(stalePush.results[0].status, 'conflict');
    const conflictId = stalePush.results[0].conflictId;

    // Resolve conflict via merge_client -> emits delta v2 & blocks re-resolution 409
    const resolveRes = await fetch(`${baseUrl}/sync/conflicts/${conflictId}/resolve`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        decision: 'merge_client',
        mergedPayload: { fullName: 'Customer 1 (Merged)', city: 'Islamabad' },
      }),
    });
    assert.equal(resolveRes.status, 200);
    assert.equal((await resolveRes.json()).resolutionStatus, 'merged_client');

    const reResolve = await fetch(`${baseUrl}/sync/conflicts/${conflictId}/resolve`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ decision: 'accept_server' }),
    });
    assert.equal(reResolve.status, 409);

    // Device A pulls new delta after page2.nextServerSeq and receives v2 merged customer
    const postMergeDelta = await (
      await fetch(`${baseUrl}/sync/delta?sinceSeq=${page2.nextServerSeq}&limit=10`, {
        headers: { Authorization: `Bearer ${org.accessToken}` },
      })
    ).json();
    assert.equal(postMergeDelta.changes.length, 1);
    assert.equal(postMergeDelta.changes[0].rowVersion, 2);
    assert.equal(postMergeDelta.changes[0].data.city, 'Islamabad');

    // Device listing returns both devices with checkpoints
    const devList = await (
      await fetch(`${baseUrl}/sync/devices`, {
        headers: { Authorization: `Bearer ${org.accessToken}` },
      })
    ).json();
    assert.equal(devList.devices.length, 2);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Test 41: Corrupted checksum rejection, dead-letter acknowledgement, metrics, and media SHA-256 retry recovery', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const org = await registerOrg(baseUrl, 'adv-sync-recovery');
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${org.accessToken}`,
    };

    const validPayload = { fullName: 'Checksum Test Site' };
    const badSha = 'f'.repeat(64);
    const validSha = createHash('sha256').update(JSON.stringify(validPayload)).digest('hex');

    // Push corrupted 64-hex payloadSha256 + valid mutation
    const batch = await (
      await fetch(`${baseUrl}/sync/batch`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          deviceId: 'android-dl-01',
          operations: [
            {
              syncOperationId: randomUUID(),
              idempotencyKey: `corrupt-op-${randomUUID()}`,
              entityType: 'customer',
              entityId: randomUUID(),
              operationType: 'create',
              baseRowVersion: 0,
              payloadSha256: badSha,
              payload: validPayload,
              clientTimestamp: new Date().toISOString(),
            },
            {
              syncOperationId: randomUUID(),
              idempotencyKey: `valid-op-${randomUUID()}`,
              entityType: 'customer',
              entityId: randomUUID(),
              operationType: 'create',
              baseRowVersion: 0,
              payloadSha256: validSha,
              payload: validPayload,
              clientTimestamp: new Date().toISOString(),
            },
          ],
        }),
      })
    ).json();

    assert.equal(batch.results[0].status, 'rejected');
    assert.match(batch.results[0].reason, /checksum mismatch/i);
    assert.equal(batch.results[1].status, 'applied');

    // Dead-letter queue contains the checksum rejection
    const dlList = await (
      await fetch(`${baseUrl}/sync/dead-letters`, {
        headers: { Authorization: `Bearer ${org.accessToken}` },
      })
    ).json();
    assert.equal(dlList.deadLetters.length, 1);

    const metricsBefore = await (
      await fetch(`${baseUrl}/sync/metrics`, {
        headers: { Authorization: `Bearer ${org.accessToken}` },
      })
    ).json();
    assert.equal(metricsBefore.appliedOpsCount, 1);
    assert.equal(metricsBefore.rejectedOpsCount, 1);
    assert.equal(metricsBefore.pendingDeadLettersCount, 1);

    // Acknowledge dead-letter -> pendingDeadLettersCount drops to 0
    const ackRes = await fetch(
      `${baseUrl}/sync/dead-letters/${dlList.deadLetters[0].id}/acknowledge`,
      { method: 'POST', headers: { Authorization: `Bearer ${org.accessToken}` } },
    );
    assert.equal(ackRes.status, 200);
    assert.equal((await ackRes.json()).acknowledged, true);

    const metricsAfter = await (
      await fetch(`${baseUrl}/sync/metrics`, {
        headers: { Authorization: `Bearer ${org.accessToken}` },
      })
    ).json();
    assert.equal(metricsAfter.pendingDeadLettersCount, 0);

    // Media SHA-256 mismatch -> 422 -> retry with matching SHA-256 -> status 'recovered'
    const expectedMediaSha = createHash('sha256').update('solar-inverter-photo-bytes').digest('hex');
    const presign = await (
      await fetch(`${baseUrl}/sync/media/presign`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          deviceId: 'android-dl-01',
          entityType: 'site_survey',
          entityId: randomUUID(),
          filename: 'roof-array.jpg',
          mimeType: 'image/jpeg',
          byteSize: 4096,
          expectedSha256: expectedMediaSha,
        }),
      })
    ).json();
    assert.equal(presign.status, 'presigned');

    const failVerify = await fetch(`${baseUrl}/sync/media/${presign.id}/verify`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ actualSha256: badSha }),
    });
    assert.equal(failVerify.status, 422);
    assert.equal((await failVerify.json()).error.code, 'MEDIA_CHECKSUM_MISMATCH');

    const retryVerify = await fetch(`${baseUrl}/sync/media/${presign.id}/verify`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ actualSha256: expectedMediaSha }),
    });
    assert.equal(retryVerify.status, 200);
    const recovered = await retryVerify.json();
    assert.equal(recovered.status, 'recovered');
    assert.equal(recovered.retryCount, 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Test 42: Sync RBAC customer guards and cross-tenant isolation across dead-letters, checkpoints, and media recovery', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const orgA = await registerOrg(baseUrl, 'adv-sync-rbac-a');
    const orgB = await registerOrg(baseUrl, 'adv-sync-rbac-b');

    const custUser = await inviteAndLogin(
      baseUrl,
      orgA.accessToken,
      'adv-sync-rbac-a',
      'customer@adv-sync-rbac-a.pk',
      UserRole.CUSTOMER,
    );

    // Customer role cannot push sync batches, persist checkpoints, or upload field sync media
    const custBatch = await fetch(`${baseUrl}/sync/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${custUser.accessToken}`,
      },
      body: JSON.stringify({ deviceId: 'cust-web', operations: [] }),
    });
    assert.equal(custBatch.status, 403);

    const custCheckpoint = await fetch(`${baseUrl}/sync/checkpoints/cust-web`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${custUser.accessToken}`,
      },
      body: JSON.stringify({ lastServerSeq: 1 }),
    });
    assert.equal(custCheckpoint.status, 403);

    // Org A produces a dead letter & media ticket; Org B receives 404 on both
    const headersA = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${orgA.accessToken}`,
    };
    await fetch(`${baseUrl}/sync/batch`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({
        deviceId: 'org-a-dev',
        operations: [
          {
            syncOperationId: randomUUID(),
            idempotencyKey: `dl-${randomUUID()}`,
            entityType: 'finance_posting',
            entityId: randomUUID(),
            operationType: 'create',
            baseRowVersion: 0,
            payloadSha256: 'abc',
            payload: { amountMinor: 1000 },
            clientTimestamp: new Date().toISOString(),
          },
        ],
      }),
    });

    const dlA = await (
      await fetch(`${baseUrl}/sync/dead-letters`, {
        headers: { Authorization: `Bearer ${orgA.accessToken}` },
      })
    ).json();
    assert.equal(dlA.deadLetters.length, 1);

    const mediaA = await (
      await fetch(`${baseUrl}/sync/media/presign`, {
        method: 'POST',
        headers: headersA,
        body: JSON.stringify({
          deviceId: 'org-a-dev',
          entityType: 'installation_job',
          entityId: randomUUID(),
          filename: 'earthing.jpg',
          mimeType: 'image/jpeg',
          byteSize: 2048,
          expectedSha256: 'a'.repeat(64),
        }),
      })
    ).json();

    const crossDlAck = await fetch(
      `${baseUrl}/sync/dead-letters/${dlA.deadLetters[0].id}/acknowledge`,
      { method: 'POST', headers: { Authorization: `Bearer ${orgB.accessToken}` } },
    );
    assert.equal(crossDlAck.status, 404);

    const crossMediaVerify = await fetch(`${baseUrl}/sync/media/${mediaA.id}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${orgB.accessToken}`,
      },
      body: JSON.stringify({ actualSha256: 'a'.repeat(64) }),
    });
    assert.equal(crossMediaVerify.status, 404);

    const orgBMetrics = await (
      await fetch(`${baseUrl}/sync/metrics`, {
        headers: { Authorization: `Bearer ${orgB.accessToken}` },
      })
    ).json();
    assert.equal(orgBMetrics.pendingDeadLettersCount, 0);
    assert.equal(orgBMetrics.appliedOpsCount, 0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
