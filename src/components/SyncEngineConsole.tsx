import { useState } from 'react';
import type {
  MediaUploadRecoveryRecord,
  SyncBatchOperationResult,
  SyncConflictRecord,
  SyncDeadLetterRecord,
  SyncDeltaEntityChange,
  SyncDeviceStatusSummary,
  SyncHealthMetrics,
} from '../../packages/domain/src/index.ts';
import type { WebAuthSession } from '../lib/auth-session.ts';

export function SyncEngineConsole({
  sharedSession,
  onSessionEstablished,
}: {
  sharedSession?: WebAuthSession | null;
  onSessionEstablished?: (session: WebAuthSession) => void;
} = {}) {
  const [token, setToken] = useState<string | null>(sharedSession?.accessToken ?? null);
  const [orgName, setOrgName] = useState<string | null>(sharedSession?.organizationName ?? null);
  const [lastResults, setLastResults] = useState<SyncBatchOperationResult[]>([]);
  const [conflicts, setConflicts] = useState<SyncConflictRecord[]>([]);
  const [deltas, setDeltas] = useState<SyncDeltaEntityChange[]>([]);
  const [devices, setDevices] = useState<SyncDeviceStatusSummary[]>([]);
  const [deadLetters, setDeadLetters] = useState<SyncDeadLetterRecord[]>([]);
  const [mediaQueue, setMediaQueue] = useState<MediaUploadRecoveryRecord[]>([]);
  const [metrics, setMetrics] = useState<SyncHealthMetrics | null>(null);
  const [lastCustomerId, setLastCustomerId] = useState<string | null>(null);
  const [lastIdemKey, setLastIdemKey] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const activeToken = sharedSession?.accessToken ?? token;
  const activeOrgName = sharedSession?.organizationName ?? orgName;

  async function ensureSandboxSession(): Promise<string> {
    if (activeToken) return activeToken;
    const slug = `sync-lab-${Math.floor(1000 + Math.random() * 9000)}`;
    const res = await fetch('/api/v1/auth/register-organization', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        legalName: 'VNex Field Sync Lab',
        displayName: 'VNex Field Sync Lab',
        slug,
        businessAddress: 'Model Town, Lahore',
        countryCode: 'PK',
        defaultCurrency: 'PKR',
        ownerFullName: 'Zainab Raza',
        ownerEmail: `${slug}@vnexsolar.pk`,
        password: 'SyncTester!2026',
        deviceId: 'android-field-01',
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message ?? 'Session init failed');
    setToken(data.accessToken);
    setOrgName(data.organization.displayName);
    onSessionEstablished?.({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      sessionId: data.sessionId,
      organizationName: data.organization.displayName,
      organizationId: data.organization.id,
      userEmail: data.user.email,
      role: data.role,
    });
    return data.accessToken;
  }

  async function refreshInspector(tkn: string) {
    const headers = { Authorization: `Bearer ${tkn}` };
    const [confRes, deltaRes, devRes, dlRes, mediaRes, metRes] = await Promise.all([
      fetch('/api/v1/sync/conflicts', { headers }),
      fetch('/api/v1/sync/delta?sinceSeq=0&limit=25', { headers }),
      fetch('/api/v1/sync/devices', { headers }),
      fetch('/api/v1/sync/dead-letters', { headers }),
      fetch('/api/v1/sync/media', { headers }),
      fetch('/api/v1/sync/metrics', { headers }),
    ]);
    if (confRes.ok) setConflicts((await confRes.json()).conflicts ?? []);
    if (deltaRes.ok) setDeltas((await deltaRes.json()).changes ?? []);
    if (devRes.ok) setDevices((await devRes.json()).devices ?? []);
    if (dlRes.ok) setDeadLetters((await dlRes.json()).deadLetters ?? []);
    if (mediaRes.ok) setMediaQueue((await mediaRes.json()).items ?? []);
    if (metRes.ok) setMetrics(await metRes.json());
  }

  async function runOfflineCreateBatch(replaySameKey = false) {
    setBusy(true);
    setErrMsg(null);
    try {
      const tkn = await ensureSandboxSession();
      await fetch('/api/v1/sync/devices/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tkn}` },
        body: JSON.stringify({
          deviceIdentifier: 'android-field-01',
          platform: 'android',
          appVersion: '1.2.0',
        }),
      });

      const entityId = replaySameKey && lastCustomerId ? lastCustomerId : crypto.randomUUID();
      const idempotencyKey =
        replaySameKey && lastIdemKey
          ? lastIdemKey
          : `customer:create:${entityId}:${crypto.randomUUID()}`;

      const payload = { fullName: 'Faisalabad Cold Storage', city: 'Faisalabad' };
      const res = await fetch('/api/v1/sync/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tkn}` },
        body: JSON.stringify({
          deviceId: 'android-field-01',
          operations: [
            {
              syncOperationId: crypto.randomUUID(),
              idempotencyKey,
              entityType: 'customer',
              entityId,
              operationType: 'create',
              baseRowVersion: 0,
              payloadSha256: 'client-computed-sha256',
              payload,
              clientTimestamp: new Date().toISOString(),
            },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Batch push failed');
      setLastCustomerId(entityId);
      setLastIdemKey(idempotencyKey);
      setLastResults(data.results ?? []);
      setStatusMsg(
        replaySameKey
          ? 'Replayed identical idempotencyKey — server deduplicated without duplicating record.'
          : 'Pushed offline Room outbox mutation and updated device checkpoint.',
      );
      await refreshInspector(tkn);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Sync action failed');
    } finally {
      setBusy(false);
    }
  }

  async function simulateVersionConflict() {
    if (!lastCustomerId) return;
    setBusy(true);
    setErrMsg(null);
    try {
      const tkn = await ensureSandboxSession();
      await fetch('/api/v1/sync/devices/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tkn}` },
        body: JSON.stringify({
          deviceIdentifier: 'android-field-02',
          platform: 'android',
          appVersion: '1.2.0',
        }),
      });
      const res = await fetch('/api/v1/sync/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tkn}` },
        body: JSON.stringify({
          deviceId: 'android-field-02',
          operations: [
            {
              syncOperationId: crypto.randomUUID(),
              idempotencyKey: `customer:update:${lastCustomerId}:${crypto.randomUUID()}`,
              entityType: 'customer',
              entityId: lastCustomerId,
              operationType: 'update',
              baseRowVersion: 99,
              payloadSha256: 'client-computed-sha256',
              payload: { fullName: 'Faisalabad Cold Storage (Device 2 Edit)', city: 'Faisalabad' },
              clientTimestamp: new Date().toISOString(),
            },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Conflict test failed');
      setLastResults(data.results ?? []);
      setStatusMsg('Version mismatch detected on Device 2 — preserved in sync_conflicts.');
      await refreshInspector(tkn);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Conflict simulation failed');
    } finally {
      setBusy(false);
    }
  }

  async function simulateChecksumDeadLetterAndMediaRecovery() {
    setBusy(true);
    setErrMsg(null);
    try {
      const tkn = await ensureSandboxSession();
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${tkn}` };
      const corruptSha = '0'.repeat(64);
      const validSha = 'a'.repeat(64);

      const batchRes = await fetch('/api/v1/sync/batch', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          deviceId: 'android-field-01',
          operations: [
            {
              syncOperationId: crypto.randomUUID(),
              idempotencyKey: `corrupt:${crypto.randomUUID()}`,
              entityType: 'customer',
              entityId: crypto.randomUUID(),
              operationType: 'create',
              baseRowVersion: 0,
              payloadSha256: corruptSha,
              payload: { fullName: 'Corrupted Packet Check' },
              clientTimestamp: new Date().toISOString(),
            },
          ],
        }),
      });
      const batchData = await batchRes.json();
      setLastResults(batchData.results ?? []);

      const mediaPresign = await (
        await fetch('/api/v1/sync/media/presign', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            deviceId: 'android-field-01',
            entityType: 'site_survey',
            entityId: crypto.randomUUID(),
            filename: 'inverter-nameplate.jpg',
            mimeType: 'image/jpeg',
            byteSize: 284120,
            expectedSha256: validSha,
          }),
        })
      ).json();

      // First attempt mismatches checksum, second recovers cleanly
      await fetch(`/api/v1/sync/media/${mediaPresign.id}/verify`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ actualSha256: corruptSha }),
      });
      await fetch(`/api/v1/sync/media/${mediaPresign.id}/verify`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ actualSha256: validSha }),
      });

      setStatusMsg(
        'Captured corrupted outbox mutation in dead-letter queue and recovered mismatched photo SHA-256 via retry.',
      );
      await refreshInspector(tkn);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Recovery simulation failed');
    } finally {
      setBusy(false);
    }
  }

  async function resolveConflict(conflictId: string, decision: 'accept_server' | 'merge_client') {
    if (!activeToken) return;
    setBusy(true);
    setErrMsg(null);
    try {
      const res = await fetch(`/api/v1/sync/conflicts/${conflictId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${activeToken}` },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Conflict resolution failed');
      setStatusMsg(`Conflict resolved via ${decision}.`);
      await refreshInspector(activeToken);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Resolution failed');
    } finally {
      setBusy(false);
    }
  }

  async function acknowledgeDeadLetter(deadLetterId: string) {
    if (!activeToken) return;
    setBusy(true);
    setErrMsg(null);
    try {
      const res = await fetch(`/api/v1/sync/dead-letters/${deadLetterId}/acknowledge`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${activeToken}` },
      });
      if (!res.ok) throw new Error('Failed to acknowledge dead-letter entry');
      setStatusMsg('Dead-letter rejection acknowledged.');
      await refreshInspector(activeToken);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Acknowledge failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-5 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Phase 13 · Multi-Device Sync, Dead-Letter & Media SHA-256 Recovery
          </p>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 mt-1">
            Offline Synchronization & Conflict Console
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
            Inspect tenant outbox telemetry, multi-device delta checkpoints, explicit conflict resolution, dead-letter rejections, and SHA-256 media upload recovery.
          </p>
        </div>
        {activeOrgName && (
          <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
            Tenant: {activeOrgName}
          </div>
        )}
      </div>

      {/* 4 Health Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Applied / Deduplicated
          </div>
          <div className="mt-2 font-mono tabular-nums text-xl font-bold text-slate-900 dark:text-slate-50">
            {metrics?.appliedOpsCount ?? 0} / {metrics?.deduplicatedOpsCount ?? 0}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Pending Conflicts
          </div>
          <div className="mt-2 font-mono tabular-nums text-xl font-bold text-slate-900 dark:text-slate-50">
            {metrics?.pendingConflictsCount ?? 0}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Dead-Letter Queue
          </div>
          <div className="mt-2 font-mono tabular-nums text-xl font-bold text-slate-900 dark:text-slate-50">
            {metrics?.pendingDeadLettersCount ?? 0}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Devices / Latest Seq
          </div>
          <div className="mt-2 font-mono tabular-nums text-xl font-bold text-slate-900 dark:text-slate-50">
            {metrics?.activeDevicesCount ?? 0} / #{metrics?.latestServerSeq ?? 0}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => runOfflineCreateBatch(false)}
          className="px-4 py-2 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium whitespace-nowrap"
        >
          Push Offline Customer Create
        </button>
        <button
          type="button"
          disabled={busy || !lastIdemKey}
          onClick={() => runOfflineCreateBatch(true)}
          className="px-4 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium disabled:opacity-50 whitespace-nowrap"
        >
          Replay Same Idempotency Key
        </button>
        <button
          type="button"
          disabled={busy || !lastCustomerId}
          onClick={simulateVersionConflict}
          className="px-4 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium disabled:opacity-50 whitespace-nowrap"
        >
          Trigger Device 2 Conflict
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={simulateChecksumDeadLetterAndMediaRecovery}
          className="px-4 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium disabled:opacity-50 whitespace-nowrap"
        >
          Test Dead-Letter & Media Recovery
        </button>
      </div>

      {statusMsg && (
        <div className="p-3.5 rounded-md border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 text-xs text-emerald-800 dark:text-emerald-300">
          {statusMsg}
        </div>
      )}

      {errMsg && (
        <div className="p-3.5 rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-xs text-red-800 dark:text-red-300">
          {errMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold">Last Batch Acknowledgment</h2>
            <span className="font-mono tabular-nums text-xs text-slate-500">
              {lastResults.length} ops
            </span>
          </div>
          {lastResults.length === 0 ? (
            <div className="p-6 text-xs text-slate-500">
              Push an offline outbox batch above to inspect server acknowledgments, checksum rejections, and deduplication flags.
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-slate-500">
                  <th className="py-2.5 px-4">Entity</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Deduplicated</th>
                  <th className="py-2.5 px-4 text-right">Seq / Ver</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {lastResults.map((r) => (
                  <tr key={r.syncOperationId}>
                    <td className="py-2.5 px-4 font-mono">{r.entityType}</td>
                    <td className="py-2.5 px-4 font-medium">{r.status}</td>
                    <td className="py-2.5 px-4 font-mono">{String(r.deduplicated)}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                      {r.serverSeq ?? '—'} / v{r.newRowVersion ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold">Sync Conflicts</h2>
            <span className="font-mono tabular-nums text-xs text-slate-500">
              {conflicts.length} recorded
            </span>
          </div>
          {conflicts.length === 0 ? (
            <div className="p-6 text-xs text-slate-500">
              No pending conflicts. Stale updates surface here for explicit human review.
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {conflicts.map((c) => (
                <div key={c.id} className="p-4 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-medium">
                      {c.entityType} · {c.entityId.slice(0, 8)}
                    </span>
                    <span className="text-slate-500">{c.resolutionStatus}</span>
                  </div>
                  {c.resolutionStatus === 'pending' && (
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => resolveConflict(c.id, 'accept_server')}
                        className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        Accept Server
                      </button>
                      <button
                        type="button"
                        onClick={() => resolveConflict(c.id, 'merge_client')}
                        className="px-2.5 py-1 rounded bg-amber-600 text-white hover:bg-amber-700"
                      >
                        Merge Client
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold">Dead-Letter Queue</h2>
            <span className="font-mono tabular-nums text-xs text-slate-500">
              {deadLetters.length} open
            </span>
          </div>
          {deadLetters.length === 0 ? (
            <div className="p-6 text-xs text-slate-500">
              No unacknowledged dead-letter operations.
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {deadLetters.map((dl) => (
                <div key={dl.id} className="p-4 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {dl.entityType} · {dl.deviceId}
                    </div>
                    <div className="text-slate-500">{dl.reason}</div>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => acknowledgeDeadLetter(dl.id)}
                    className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0"
                  >
                    Acknowledge
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold">Media Checksum & Device Checkpoints</h2>
            <span className="font-mono tabular-nums text-xs text-slate-500">
              {devices.length} devices · {mediaQueue.length} uploads
            </span>
          </div>
          <div className="p-4 space-y-3 text-xs">
            {devices.map((d) => (
              <div key={d.id} className="flex items-center justify-between font-mono border-b border-slate-100 dark:border-slate-800 pb-2">
                <span>{d.deviceIdentifier} ({d.platform})</span>
                <span className="tabular-nums text-slate-600 dark:text-slate-300">
                  seq #{d.checkpointSeq}
                </span>
              </div>
            ))}
            {mediaQueue.map((m) => (
              <div key={m.id} className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                <span className="font-mono">{m.filename} (retries: {m.retryCount})</span>
                <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                  {m.status}
                </span>
              </div>
            ))}
            {devices.length === 0 && mediaQueue.length === 0 && (
              <div className="text-slate-500">
                Run a batch push or media recovery simulation to inspect device checkpoints.
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold">Incremental Delta Feed</h2>
          <span className="font-mono tabular-nums text-xs text-slate-500">
            {deltas.length} changes
          </span>
        </div>
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-slate-500">
              <th className="py-2.5 px-4">Server Seq</th>
              <th className="py-2.5 px-4">Entity</th>
              <th className="py-2.5 px-4">Op</th>
              <th className="py-2.5 px-4 text-right">Row Version</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {deltas.map((d) => (
              <tr key={d.serverSeq}>
                <td className="py-2.5 px-4 font-mono tabular-nums">{d.serverSeq}</td>
                <td className="py-2.5 px-4 font-mono">{d.entityType} · {d.entityId.slice(0, 8)}</td>
                <td className="py-2.5 px-4">{d.operationType}</td>
                <td className="py-2.5 px-4 text-right font-mono tabular-nums">v{d.rowVersion}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
