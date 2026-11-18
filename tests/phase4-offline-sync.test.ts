import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { createApiV1Router } from '../server/api-v1.ts';
import { computeCanonicalSha256 } from '../server/sync-service.ts';

async function startSyncTestServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createApiV1Router({ rateLimitMax: 500 }));
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  return {
    baseUrl: `http://127.0.0.1:${addr.port}/api/v1`,
    close: () => new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}

async function registerOrg(baseUrl: string, slug: string, email: string) {
  const res = await fetch(`${baseUrl}/auth/register-organization`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      legalName: `${slug} Solar`,
      displayName: `${slug} Solar`,
      slug,
      businessAddress: 'Lahore',
      countryCode: 'PK',
      defaultCurrency: 'PKR',
      ownerFullName: 'Sync Owner',
      ownerEmail: email,
      password: 'SyncPassword!2026',
    }),
  });
  assert.equal(res.status, 201);
  return res.json();
}

test('Offline sync batch applies mutations, deduplicates replayed idempotency keys, and pulls incremental deltas', async () => {
  const srv = await startSyncTestServer();
  try {
    const org = await registerOrg(srv.baseUrl, 'sync-alpha', 'owner@syncalpha.pk');
    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${org.accessToken}`,
    };

    const devRes = await fetch(`${srv.baseUrl}/sync/devices/register`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        deviceIdentifier: 'pixel-field-01',
        platform: 'android',
        appVersion: '0.1.0',
      }),
    });
    assert.equal(devRes.status, 200);

    const customerId = randomUUID();
    const payload = { fullName: 'Multan Textile Mills', city: 'Multan' };
    const idempotencyKey = `customer:create:${customerId}:op1`;

    const op = {
      syncOperationId: randomUUID(),
      idempotencyKey,
      entityType: 'customer',
      entityId: customerId,
      operationType: 'create',
      baseRowVersion: 0,
      payloadSha256: computeCanonicalSha256(payload),
      payload,
      clientTimestamp: new Date().toISOString(),
    };

    const push1 = await (
      await fetch(`${srv.baseUrl}/sync/batch`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ deviceId: 'pixel-field-01', operations: [op] }),
      })
    ).json();

    assert.equal(push1.results[0].status, 'applied');
    assert.equal(push1.results[0].deduplicated, false);
    assert.equal(push1.results[0].newRowVersion, 1);

    // Replay exact same idempotencyKey (simulating network interruption after server commit)
    const push2 = await (
      await fetch(`${srv.baseUrl}/sync/batch`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          deviceId: 'pixel-field-01',
          operations: [{ ...op, syncOperationId: randomUUID() }],
        }),
      })
    ).json();

    assert.equal(push2.results[0].status, 'applied');
    assert.equal(push2.results[0].deduplicated, true);
    assert.equal(push2.results[0].serverSeq, push1.results[0].serverSeq);

    // Incremental delta pull
    const delta = await (
      await fetch(`${srv.baseUrl}/sync/delta?sinceSeq=0&limit=50`, {
        headers: { Authorization: `Bearer ${org.accessToken}` },
      })
    ).json();
    assert.equal(delta.changes.length, 1);
    assert.equal(delta.changes[0].entityId, customerId);
  } finally {
    await srv.close();
  }
});

test('Server-authoritative actions are rejected offline, version conflicts are surfaced explicitly, and cross-tenant sync is isolated', async () => {
  const srv = await startSyncTestServer();
  try {
    const orgA = await registerOrg(srv.baseUrl, 'sync-org-a', 'a@sync.pk');
    const orgB = await registerOrg(srv.baseUrl, 'sync-org-b', 'b@sync.pk');

    const headersA = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${orgA.accessToken}`,
    };

    const surveyId = randomUUID();
    const createPayload = { notes: 'Initial roof check', earthingAvailable: true };

    // Attempt forbidden offline finalization + valid offline draft creation
    const batchRes = await (
      await fetch(`${srv.baseUrl}/sync/batch`, {
        method: 'POST',
        headers: headersA,
        body: JSON.stringify({
          deviceId: 'android-a1',
          operations: [
            {
              syncOperationId: randomUUID(),
              idempotencyKey: 'fin:post:1',
              entityType: 'finance_posting',
              entityId: randomUUID(),
              operationType: 'create',
              baseRowVersion: 0,
              payloadSha256: 'abc',
              payload: { amount: '500000' },
              clientTimestamp: new Date().toISOString(),
            },
            {
              syncOperationId: randomUUID(),
              idempotencyKey: `survey:create:${surveyId}`,
              entityType: 'site_survey',
              entityId: surveyId,
              operationType: 'create',
              baseRowVersion: 0,
              payloadSha256: computeCanonicalSha256(createPayload),
              payload: createPayload,
              clientTimestamp: new Date().toISOString(),
            },
          ],
        }),
      })
    ).json();

    assert.equal(batchRes.results[0].status, 'rejected');
    assert.equal(batchRes.results[1].status, 'applied');

    // Second device sends stale update (baseRowVersion = 0 when server is at v1) -> explicit conflict
    const staleRes = await (
      await fetch(`${srv.baseUrl}/sync/batch`, {
        method: 'POST',
        headers: headersA,
        body: JSON.stringify({
          deviceId: 'android-a2',
          operations: [
            {
              syncOperationId: randomUUID(),
              idempotencyKey: `survey:stale:${surveyId}`,
              entityType: 'site_survey',
              entityId: surveyId,
              operationType: 'update',
              baseRowVersion: 0,
              payloadSha256: 'def',
              payload: { notes: 'Offline stale overwrite attempt' },
              clientTimestamp: new Date().toISOString(),
            },
          ],
        }),
      })
    ).json();

    assert.equal(staleRes.results[0].status, 'conflict');
    const conflictId = staleRes.results[0].conflictId;
    assert.ok(conflictId);

    // Org B cannot see or resolve Org A conflict or pull Org A delta
    const crossDelta = await (
      await fetch(`${srv.baseUrl}/sync/delta?sinceSeq=0`, {
        headers: { Authorization: `Bearer ${orgB.accessToken}` },
      })
    ).json();
    assert.equal(crossDelta.changes.length, 0);

    const crossResolve = await fetch(`${srv.baseUrl}/sync/conflicts/${conflictId}/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${orgB.accessToken}`,
      },
      body: JSON.stringify({ decision: 'accept_server' }),
    });
    assert.equal(crossResolve.status, 404);

    // Org A explicitly resolves conflict via merge_client
    const resolveA = await fetch(`${srv.baseUrl}/sync/conflicts/${conflictId}/resolve`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({
        decision: 'merge_client',
        mergedPayload: { notes: 'Merged verified field notes' },
      }),
    });
    assert.equal(resolveA.status, 200);
    const resolved = await resolveA.json();
    assert.equal(resolved.resolutionStatus, 'merged_client');
  } finally {
    await srv.close();
  }
});
