import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createApiV1Router } from '../server/api-v1.ts';

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

test('Phase 6 Android: SyncEngine, SyncWorker exponential backoff, SyncQueueScreen & MainActivity reconnect triggers', () => {
  const androidRoot = path.resolve(
    process.cwd(),
    'apps/android/app/src/main/java/com/vnexsolar/app',
  );

  const engineSrc = fs.readFileSync(path.join(androidRoot, 'core/sync/SyncEngine.kt'), 'utf8');
  const workerSrc = fs.readFileSync(path.join(androidRoot, 'core/sync/SyncWorker.kt'), 'utf8');
  const daosSrc = fs.readFileSync(path.join(androidRoot, 'core/database/dao/OfflineDaos.kt'), 'utf8');
  const syncVmSrc = fs.readFileSync(path.join(androidRoot, 'feature/sync/SyncQueueViewModel.kt'), 'utf8');
  const syncScreenSrc = fs.readFileSync(path.join(androidRoot, 'feature/sync/SyncQueueScreen.kt'), 'utf8');
  const mainActivitySrc = fs.readFileSync(path.join(androidRoot, 'MainActivity.kt'), 'utf8');
  const navSrc = fs.readFileSync(path.join(androidRoot, 'core/navigation/VNexNavGraph.kt'), 'utf8');
  const apiSrc = fs.readFileSync(path.join(androidRoot, 'core/network/SyncApiService.kt'), 'utf8');

  // SyncEngine orchestrates recovery, outbox batching, exponential backoff, media SHA-256 verification, delta pull, and conflict resolution
  assert.match(engineSrc, /recoverInterruptedInFlightOps/);
  assert.match(engineSrc, /recoverInterruptedUploads/);
  assert.match(engineSrc, /computeRetryBackoffMs/);
  assert.match(engineSrc, /presignMediaUpload/);
  assert.match(engineSrc, /verifyMediaUpload/);
  assert.match(engineSrc, /pullDelta/);
  assert.match(engineSrc, /updateCheckpoint/);
  assert.match(engineSrc, /resolveConflict/);

  // WorkManager periodic & immediate triggers with exponential backoff
  assert.match(workerSrc, /BackoffPolicy\.EXPONENTIAL/);
  assert.match(workerSrc, /PeriodicWorkRequestBuilder/);
  assert.match(workerSrc, /enqueueOneTime/);
  assert.match(workerSrc, /schedulePeriodicSync/);

  // MainActivity schedules periodic sync and triggers immediate sync on connectivity restore
  assert.match(mainActivitySrc, /networkMonitor\.isOnlineFlow\.collectAsState/);
  assert.match(mainActivitySrc, /SyncWorker\.schedulePeriodicSync/);
  assert.match(mainActivitySrc, /SyncWorker\.enqueueOneTime/);

  // SyncApiService exposes complete Phase 13 server endpoints
  assert.match(apiSrc, /api\/v1\/sync\/batch/);
  assert.match(apiSrc, /api\/v1\/sync\/delta/);
  assert.match(apiSrc, /api\/v1\/sync\/conflicts/);
  assert.match(apiSrc, /api\/v1\/sync\/checkpoints/);
  assert.match(apiSrc, /api\/v1\/sync\/metrics/);
  assert.match(apiSrc, /api\/v1\/sync\/dead-letters/);
  assert.match(apiSrc, /api\/v1\/sync\/media\/presign/);

  // Outbox reactive DAOs and SyncQueueScreen UI wired into NavGraph
  assert.match(daosSrc, /resetRetryNow/);
  assert.match(daosSrc, /observeCheckpoint/);
  assert.match(syncVmSrc, /syncNow/);
  assert.match(syncVmSrc, /resolveConflict/);
  assert.match(syncVmSrc, /"merge_client"/);
  assert.match(syncVmSrc, /"accept_server"/);
  assert.match(syncScreenSrc, /Sync Now/);
  assert.match(syncScreenSrc, /Keep Server/);
  assert.match(syncScreenSrc, /Merge Client/);
  assert.match(navSrc, /SyncQueueScreen\(/);
});

test('Phase 6 Android E2E Backend Sync Cycle: Outbox Batch, Idempotent Replay, Conflict Resolution, Media SHA-256 & Checkpoint', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const regRes = await fetch(`${baseUrl}/auth/register-organization`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        legalName: 'Phase 6 Sync Solar Ltd',
        displayName: 'VNex Phase 6 Sync',
        slug: `vnex-p6-${Date.now()}`,
        businessAddress: 'Gulberg III, Lahore',
        countryCode: 'PK',
        defaultCurrency: 'PKR',
        ownerFullName: 'Hamza Raza',
        ownerEmail: 'hamza@vnexp6.pk',
        password: 'StrongPassword!2026',
      }),
    });
    assert.equal(regRes.status, 201);
    const { accessToken } = await regRes.json();
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` };

    const deviceId = `android-${randomUUID()}`;
    const custId = randomUUID();
    const opId = randomUUID();
    const idemKey = `customer:create:${custId}:${opId}`;
    const createPayload = {
      customerType: 'residential',
      fullName: 'Offline Field Customer',
      primaryPhone: '+923001112233',
    };
    const payloadSha = createHash('sha256').update(JSON.stringify(createPayload)).digest('hex');

    // 1. Push offline customer creation
    const batch1 = await (
      await fetch(`${baseUrl}/sync/batch`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          deviceId,
          operations: [
            {
              syncOperationId: opId,
              idempotencyKey: idemKey,
              entityType: 'customer',
              entityId: custId,
              operationType: 'create',
              baseRowVersion: 0,
              payloadSha256: payloadSha,
              clientTimestamp: new Date().toISOString(),
              payload: createPayload,
            },
          ],
        }),
      })
    ).json();
    assert.equal(batch1.results[0].status, 'applied');
    assert.equal(batch1.results[0].deduplicated, false);

    // 2. Idempotent replay returns deduplicated: true
    const batchReplay = await (
      await fetch(`${baseUrl}/sync/batch`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          deviceId,
          operations: [
            {
              syncOperationId: opId,
              idempotencyKey: idemKey,
              entityType: 'customer',
              entityId: custId,
              operationType: 'create',
              baseRowVersion: 0,
              payloadSha256: payloadSha,
              clientTimestamp: new Date().toISOString(),
              payload: createPayload,
            },
          ],
        }),
      })
    ).json();
    assert.equal(batchReplay.results[0].status, 'applied');
    assert.equal(batchReplay.results[0].deduplicated, true);

    // 3. Stale rowVersion update triggers conflict -> resolve via merged_client
    const conflictOpId = randomUUID();
    const stalePayload = { fullName: 'Merged Offline Name' };
    const staleSha = createHash('sha256').update(JSON.stringify(stalePayload)).digest('hex');
    const batchConflict = await (
      await fetch(`${baseUrl}/sync/batch`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          deviceId,
          operations: [
            {
              syncOperationId: conflictOpId,
              idempotencyKey: `customer:update:${custId}:${conflictOpId}`,
              entityType: 'customer',
              entityId: custId,
              operationType: 'update',
              baseRowVersion: 0, // stale vs v1
              payloadSha256: staleSha,
              clientTimestamp: new Date().toISOString(),
              payload: stalePayload,
            },
          ],
        }),
      })
    ).json();
    assert.equal(batchConflict.results[0].status, 'conflict');
    assert.ok(batchConflict.results[0].conflictId);

    const resolveRes = await fetch(
      `${baseUrl}/sync/conflicts/${batchConflict.results[0].conflictId}/resolve`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          decision: 'merge_client',
          mergedPayload: stalePayload,
        }),
      },
    );
    assert.equal(resolveRes.status, 200);

    // 4. Media queue presign + SHA-256 verification
    const mediaBytes = Buffer.from('android-site-photo-bytes');
    const mediaSha = createHash('sha256').update(mediaBytes).digest('hex');
    const presignRes = await fetch(`${baseUrl}/sync/media/presign`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        deviceId,
        entityType: 'site_survey',
        entityId: randomUUID(),
        filename: 'roof_north.jpg',
        mimeType: 'image/jpeg',
        byteSize: mediaBytes.length,
        expectedSha256: mediaSha,
      }),
    });
    assert.equal(presignRes.status, 201);
    const presignBody = await presignRes.json();

    const verifyRes = await fetch(`${baseUrl}/sync/media/${presignBody.id}/verify`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ actualSha256: mediaSha }),
    });
    assert.equal(verifyRes.status, 200);

    // 5. Delta pull + checkpoint persistence + sync metrics
    const delta = await (await fetch(`${baseUrl}/sync/delta?sinceSeq=0&limit=50`, { headers })).json();
    assert.ok(delta.nextServerSeq >= 1);

    const cpRes = await fetch(`${baseUrl}/sync/checkpoints/${deviceId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ lastServerSeq: delta.nextServerSeq }),
    });
    assert.equal(cpRes.status, 200);

    const metrics = await (await fetch(`${baseUrl}/sync/metrics`, { headers })).json();
    assert.ok(metrics.appliedOpsCount >= 1);
    assert.ok(metrics.deduplicatedOpsCount >= 1);
    assert.equal(metrics.pendingConflictsCount, 0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
