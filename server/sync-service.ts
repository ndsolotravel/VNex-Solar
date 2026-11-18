import { createHash, randomUUID } from 'node:crypto';
import type {
  MediaUploadRecoveryRecord,
  SyncBatchOperationInput,
  SyncBatchOperationResult,
  SyncConflictRecord,
  SyncDeadLetterRecord,
  SyncDeltaEntityChange,
  SyncDeltaResponse,
  SyncDeviceStatusSummary,
  SyncHealthMetrics,
} from '../packages/domain/src/index.ts';
import { AuthServiceError, type AccessTokenClaims } from './auth-service.ts';

const SERVER_AUTHORITATIVE_TYPES = new Set([
  'finance_posting',
  'stock_deduction',
  'design_approval',
  'commissioning_approval',
]);

const HEX64_REGEX = /^[a-f0-9]{64}$/i;

interface StoredEntityState {
  organizationId: string;
  entityType: string;
  entityId: string;
  rowVersion: number;
  deleted: boolean;
  data: Record<string, unknown>;
  updatedAt: string;
}

export interface DeviceRegistrationRecord {
  id: string;
  organizationId: string;
  userId: string;
  deviceIdentifier: string;
  platform: 'android' | 'ios' | 'web';
  appVersion: string;
  lastSyncAt: string;
}

export function computeCanonicalSha256(payload: Record<string, unknown>): string {
  const keys = Object.keys(payload).sort();
  const ordered: Record<string, unknown> = {};
  for (const k of keys) ordered[k] = payload[k];
  return createHash('sha256').update(JSON.stringify(ordered)).digest('hex');
}

function isPayloadDigestValid(payload: Record<string, unknown>, digest: string): boolean {
  if (!HEX64_REGEX.test(digest)) {
    return true;
  }
  const canonical = computeCanonicalSha256(payload);
  const raw = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const normalized = digest.toLowerCase();
  return normalized === canonical || normalized === raw;
}

export class InMemorySyncEngineService {
  private readonly devices = new Map<string, DeviceRegistrationRecord>();
  private readonly idempotencyCache = new Map<string, SyncBatchOperationResult>();
  private readonly entities = new Map<string, StoredEntityState>();
  private readonly conflicts = new Map<string, SyncConflictRecord>();
  private readonly deadLetters = new Map<string, SyncDeadLetterRecord>();
  private readonly mediaQueue = new Map<string, MediaUploadRecoveryRecord>();
  private readonly deltaLog: Array<SyncDeltaEntityChange & { organizationId: string }> = [];
  private readonly checkpoints = new Map<string, number>();
  private readonly orgStats = new Map<
    string,
    { applied: number; deduplicated: number; rejected: number }
  >();
  private globalSeq = 0;

  private getOrInitStats(orgId: string) {
    let stats = this.orgStats.get(orgId);
    if (!stats) {
      stats = { applied: 0, deduplicated: 0, rejected: 0 };
      this.orgStats.set(orgId, stats);
    }
    return stats;
  }

  private recordDeadLetter(
    orgId: string,
    deviceId: string,
    op: SyncBatchOperationInput,
    reason: string,
  ): void {
    const dl: SyncDeadLetterRecord = {
      id: randomUUID(),
      organizationId: orgId,
      deviceId,
      syncOperationId: op.syncOperationId,
      idempotencyKey: op.idempotencyKey,
      entityType: op.entityType,
      entityId: op.entityId,
      operationType: op.operationType,
      reason,
      acknowledged: false,
      acknowledgedByUserId: null,
      acknowledgedAt: null,
      createdAt: new Date().toISOString(),
    };
    this.deadLetters.set(dl.id, dl);
  }

  private entityKey(orgId: string, entityType: string, entityId: string): string {
    return `${orgId}:${entityType}:${entityId}`;
  }

  private idempotencyMapKey(orgId: string, idempotencyKey: string): string {
    return `${orgId}:${idempotencyKey}`;
  }

  upsertServerEntityState(
    organizationId: string,
    entityType: string,
    entityId: string,
    rowVersion: number,
    data: Record<string, unknown>,
  ): void {
    const key = this.entityKey(organizationId, entityType, entityId);
    const now = new Date().toISOString();
    this.entities.set(key, {
      organizationId,
      entityType,
      entityId,
      rowVersion,
      deleted: false,
      data: { ...data, id: entityId, organizationId },
      updatedAt: now,
    });
  }

  registerDevice(
    claims: AccessTokenClaims,
    input: { deviceIdentifier: string; platform: 'android' | 'ios' | 'web'; appVersion: string },
  ): DeviceRegistrationRecord {
    const key = `${claims.orgId}:${claims.sub}:${input.deviceIdentifier}`;
    const existing = this.devices.get(key);
    const now = new Date().toISOString();
    if (existing) {
      existing.appVersion = input.appVersion;
      existing.lastSyncAt = now;
      return existing;
    }

    const created: DeviceRegistrationRecord = {
      id: randomUUID(),
      organizationId: claims.orgId,
      userId: claims.sub,
      deviceIdentifier: input.deviceIdentifier,
      platform: input.platform,
      appVersion: input.appVersion,
      lastSyncAt: now,
    };
    this.devices.set(key, created);
    return created;
  }

  listDevices(claims: AccessTokenClaims): SyncDeviceStatusSummary[] {
    return [...this.devices.values()]
      .filter((d) => d.organizationId === claims.orgId)
      .map((d) => ({
        ...d,
        checkpointSeq: this.checkpoints.get(`${claims.orgId}:${d.deviceIdentifier}`) ?? 0,
      }))
      .sort((a, b) => b.lastSyncAt.localeCompare(a.lastSyncAt));
  }

  getCheckpoint(claims: AccessTokenClaims, deviceId: string): { deviceId: string; lastServerSeq: number } {
    return {
      deviceId,
      lastServerSeq: this.checkpoints.get(`${claims.orgId}:${deviceId}`) ?? 0,
    };
  }

  updateCheckpoint(
    claims: AccessTokenClaims,
    deviceId: string,
    lastServerSeq: number,
  ): { deviceId: string; lastServerSeq: number } {
    const key = `${claims.orgId}:${deviceId}`;
    const current = this.checkpoints.get(key) ?? 0;
    if (lastServerSeq < current) {
      throw new AuthServiceError(
        409,
        `Checkpoint regression rejected (${lastServerSeq} < ${current})`,
        'CHECKPOINT_REGRESSION',
      );
    }
    this.checkpoints.set(key, lastServerSeq);
    return { deviceId, lastServerSeq };
  }

  processBatch(
    claims: AccessTokenClaims,
    deviceId: string,
    operations: SyncBatchOperationInput[],
  ): { results: SyncBatchOperationResult[]; checkpointSeq: number } {
    const results: SyncBatchOperationResult[] = [];
    const stats = this.getOrInitStats(claims.orgId);

    for (const op of operations) {
      const idemKey = this.idempotencyMapKey(claims.orgId, op.idempotencyKey);
      const cached = this.idempotencyCache.get(idemKey);
      if (cached) {
        stats.deduplicated += 1;
        results.push({ ...cached, deduplicated: true });
        continue;
      }

      if (!isPayloadDigestValid(op.payload, op.payloadSha256)) {
        const reason = 'Payload SHA-256 integrity checksum mismatch';
        stats.rejected += 1;
        this.recordDeadLetter(claims.orgId, deviceId, op, reason);
        const rejected: SyncBatchOperationResult = {
          syncOperationId: op.syncOperationId,
          idempotencyKey: op.idempotencyKey,
          entityType: op.entityType,
          entityId: op.entityId,
          status: 'rejected',
          deduplicated: false,
          serverSeq: null,
          newRowVersion: null,
          conflictId: null,
          serverSnapshot: null,
          reason,
        };
        this.idempotencyCache.set(idemKey, rejected);
        results.push(rejected);
        continue;
      }

      if (SERVER_AUTHORITATIVE_TYPES.has(op.entityType)) {
        const reason = `${op.entityType} is server-authoritative and cannot be finalized offline`;
        stats.rejected += 1;
        this.recordDeadLetter(claims.orgId, deviceId, op, reason);
        const rejected: SyncBatchOperationResult = {
          syncOperationId: op.syncOperationId,
          idempotencyKey: op.idempotencyKey,
          entityType: op.entityType,
          entityId: op.entityId,
          status: 'rejected',
          deduplicated: false,
          serverSeq: null,
          newRowVersion: null,
          conflictId: null,
          serverSnapshot: null,
          reason,
        };
        this.idempotencyCache.set(idemKey, rejected);
        results.push(rejected);
        continue;
      }

      const key = this.entityKey(claims.orgId, op.entityType, op.entityId);
      const existing = this.entities.get(key);

      if (op.operationType === 'create') {
        if (existing) {
          const conflictId = randomUUID();
          const conflict: SyncConflictRecord = {
            id: conflictId,
            organizationId: claims.orgId,
            syncOperationId: op.syncOperationId,
            entityType: op.entityType,
            entityId: op.entityId,
            clientPayload: op.payload,
            serverSnapshot: existing.data,
            resolutionStatus: 'pending',
            resolvedByUserId: null,
            resolvedAt: null,
            createdAt: new Date().toISOString(),
          };
          this.conflicts.set(conflictId, conflict);
          const result: SyncBatchOperationResult = {
            syncOperationId: op.syncOperationId,
            idempotencyKey: op.idempotencyKey,
            entityType: op.entityType,
            entityId: op.entityId,
            status: 'conflict',
            deduplicated: false,
            serverSeq: null,
            newRowVersion: existing.rowVersion,
            conflictId,
            serverSnapshot: existing.data,
            reason: 'Entity UUID already exists on server; explicit conflict resolution required',
          };
          this.idempotencyCache.set(idemKey, result);
          results.push(result);
          continue;
        }

        const now = new Date().toISOString();
        const state: StoredEntityState = {
          organizationId: claims.orgId,
          entityType: op.entityType,
          entityId: op.entityId,
          rowVersion: 1,
          deleted: false,
          data: { ...op.payload, id: op.entityId, organizationId: claims.orgId },
          updatedAt: now,
        };
        this.entities.set(key, state);
        this.globalSeq += 1;
        this.deltaLog.push({
          organizationId: claims.orgId,
          serverSeq: this.globalSeq,
          entityType: op.entityType,
          entityId: op.entityId,
          operationType: 'create',
          rowVersion: 1,
          data: state.data,
          updatedAt: now,
        });

        stats.applied += 1;
        const applied: SyncBatchOperationResult = {
          syncOperationId: op.syncOperationId,
          idempotencyKey: op.idempotencyKey,
          entityType: op.entityType,
          entityId: op.entityId,
          status: 'applied',
          deduplicated: false,
          serverSeq: this.globalSeq,
          newRowVersion: 1,
          conflictId: null,
          serverSnapshot: null,
          reason: null,
        };
        this.idempotencyCache.set(idemKey, applied);
        results.push(applied);
        continue;
      }

      if (!existing) {
        const reason = 'Target entity does not exist in active organization';
        stats.rejected += 1;
        this.recordDeadLetter(claims.orgId, deviceId, op, reason);
        const rejected: SyncBatchOperationResult = {
          syncOperationId: op.syncOperationId,
          idempotencyKey: op.idempotencyKey,
          entityType: op.entityType,
          entityId: op.entityId,
          status: 'rejected',
          deduplicated: false,
          serverSeq: null,
          newRowVersion: null,
          conflictId: null,
          serverSnapshot: null,
          reason,
        };
        this.idempotencyCache.set(idemKey, rejected);
        results.push(rejected);
        continue;
      }

      if (op.baseRowVersion !== existing.rowVersion) {
        const conflictId = randomUUID();
        const conflict: SyncConflictRecord = {
          id: conflictId,
          organizationId: claims.orgId,
          syncOperationId: op.syncOperationId,
          entityType: op.entityType,
          entityId: op.entityId,
          clientPayload: op.payload,
          serverSnapshot: existing.data,
          resolutionStatus: 'pending',
          resolvedByUserId: null,
          resolvedAt: null,
          createdAt: new Date().toISOString(),
        };
        this.conflicts.set(conflictId, conflict);
        const conflictResult: SyncBatchOperationResult = {
          syncOperationId: op.syncOperationId,
          idempotencyKey: op.idempotencyKey,
          entityType: op.entityType,
          entityId: op.entityId,
          status: 'conflict',
          deduplicated: false,
          serverSeq: null,
          newRowVersion: existing.rowVersion,
          conflictId,
          serverSnapshot: existing.data,
          reason: `Version conflict: client baseRowVersion=${op.baseRowVersion}, server rowVersion=${existing.rowVersion}`,
        };
        this.idempotencyCache.set(idemKey, conflictResult);
        results.push(conflictResult);
        continue;
      }

      const now = new Date().toISOString();
      existing.rowVersion += 1;
      existing.deleted = op.operationType === 'delete';
      existing.data =
        op.operationType === 'delete'
          ? { ...existing.data, deleted: true }
          : { ...existing.data, ...op.payload, id: op.entityId, organizationId: claims.orgId };
      existing.updatedAt = now;

      this.globalSeq += 1;
      this.deltaLog.push({
        organizationId: claims.orgId,
        serverSeq: this.globalSeq,
        entityType: op.entityType,
        entityId: op.entityId,
        operationType: op.operationType,
        rowVersion: existing.rowVersion,
        data: existing.data,
        updatedAt: now,
      });

      stats.applied += 1;
      const applied: SyncBatchOperationResult = {
        syncOperationId: op.syncOperationId,
        idempotencyKey: op.idempotencyKey,
        entityType: op.entityType,
        entityId: op.entityId,
        status: 'applied',
        deduplicated: false,
        serverSeq: this.globalSeq,
        newRowVersion: existing.rowVersion,
        conflictId: null,
        serverSnapshot: null,
        reason: null,
      };
      this.idempotencyCache.set(idemKey, applied);
      results.push(applied);
    }

    const currentCheckpoint = this.checkpoints.get(`${claims.orgId}:${deviceId}`) ?? 0;
    const nextCheckpoint = Math.max(currentCheckpoint, this.globalSeq);
    this.checkpoints.set(`${claims.orgId}:${deviceId}`, nextCheckpoint);
    return { results, checkpointSeq: nextCheckpoint };
  }

  getDelta(claims: AccessTokenClaims, sinceSeq: number, limit = 50): SyncDeltaResponse {
    const matching = this.deltaLog.filter(
      (entry) => entry.organizationId === claims.orgId && entry.serverSeq > sinceSeq,
    );
    const sliced = matching.slice(0, limit).map(({ organizationId: _org, ...rest }) => rest);
    const nextServerSeq =
      sliced.length > 0 ? sliced[sliced.length - 1].serverSeq : sinceSeq;
    return {
      sinceSeq,
      nextServerSeq,
      hasMore: matching.length > limit,
      changes: sliced,
    };
  }

  listConflicts(claims: AccessTokenClaims): SyncConflictRecord[] {
    return [...this.conflicts.values()]
      .filter((c) => c.organizationId === claims.orgId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  resolveConflict(
    claims: AccessTokenClaims,
    conflictId: string,
    decision: 'accept_server' | 'merge_client',
    mergedPayload?: Record<string, unknown>,
  ): SyncConflictRecord {
    const conflict = this.conflicts.get(conflictId);
    if (!conflict || conflict.organizationId !== claims.orgId) {
      throw new AuthServiceError(404, 'Sync conflict not found in active organization', 'NOT_FOUND');
    }
    if (conflict.resolutionStatus !== 'pending') {
      throw new AuthServiceError(409, 'Conflict has already been resolved', 'ALREADY_RESOLVED');
    }

    const now = new Date().toISOString();
    if (decision === 'accept_server') {
      conflict.resolutionStatus = 'accepted_server';
    } else {
      const key = this.entityKey(claims.orgId, conflict.entityType, conflict.entityId);
      const existing = this.entities.get(key);
      if (existing) {
        existing.rowVersion += 1;
        existing.data = {
          ...existing.data,
          ...(mergedPayload ?? conflict.clientPayload),
          id: conflict.entityId,
          organizationId: claims.orgId,
        };
        existing.updatedAt = now;
        this.globalSeq += 1;
        this.deltaLog.push({
          organizationId: claims.orgId,
          serverSeq: this.globalSeq,
          entityType: conflict.entityType,
          entityId: conflict.entityId,
          operationType: 'update',
          rowVersion: existing.rowVersion,
          data: existing.data,
          updatedAt: now,
        });
      }
      conflict.resolutionStatus = 'merged_client';
    }

    conflict.resolvedByUserId = claims.sub;
    conflict.resolvedAt = now;
    return conflict;
  }

  listDeadLetters(claims: AccessTokenClaims, includeAcknowledged = false): SyncDeadLetterRecord[] {
    return [...this.deadLetters.values()]
      .filter((d) => d.organizationId === claims.orgId)
      .filter((d) => includeAcknowledged || !d.acknowledged)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  acknowledgeDeadLetter(claims: AccessTokenClaims, deadLetterId: string): SyncDeadLetterRecord {
    const dl = this.deadLetters.get(deadLetterId);
    if (!dl || dl.organizationId !== claims.orgId) {
      throw new AuthServiceError(404, 'Dead-letter record not found in active organization', 'NOT_FOUND');
    }
    if (dl.acknowledged) {
      throw new AuthServiceError(409, 'Dead-letter already acknowledged', 'ALREADY_ACKNOWLEDGED');
    }
    dl.acknowledged = true;
    dl.acknowledgedByUserId = claims.sub;
    dl.acknowledgedAt = new Date().toISOString();
    return dl;
  }

  presignMediaUpload(
    claims: AccessTokenClaims,
    input: {
      deviceId: string;
      entityType: string;
      entityId: string;
      filename: string;
      mimeType: string;
      byteSize: number;
      expectedSha256: string;
    },
  ): MediaUploadRecoveryRecord {
    const now = new Date().toISOString();
    const record: MediaUploadRecoveryRecord = {
      id: randomUUID(),
      organizationId: claims.orgId,
      deviceId: input.deviceId,
      entityType: input.entityType,
      entityId: input.entityId,
      filename: input.filename,
      mimeType: input.mimeType,
      byteSize: input.byteSize,
      expectedSha256: input.expectedSha256.toLowerCase(),
      receivedSha256: null,
      status: 'presigned',
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.mediaQueue.set(record.id, record);
    return record;
  }

  verifyMediaUpload(
    claims: AccessTokenClaims,
    mediaId: string,
    actualSha256: string,
  ): MediaUploadRecoveryRecord {
    const item = this.mediaQueue.get(mediaId);
    if (!item || item.organizationId !== claims.orgId) {
      throw new AuthServiceError(404, 'Media upload ticket not found in active organization', 'NOT_FOUND');
    }
    const normalized = actualSha256.trim().toLowerCase();
    item.receivedSha256 = normalized;
    item.updatedAt = new Date().toISOString();

    if (normalized !== item.expectedSha256) {
      item.status = 'checksum_mismatch';
      item.retryCount += 1;
      throw new AuthServiceError(
        422,
        `Media SHA-256 mismatch (expected ${item.expectedSha256}, received ${normalized})`,
        'MEDIA_CHECKSUM_MISMATCH',
      );
    }

    item.status = item.status === 'checksum_mismatch' ? 'recovered' : 'uploaded';
    return item;
  }

  listMediaQueue(claims: AccessTokenClaims, entityId?: string): MediaUploadRecoveryRecord[] {
    return [...this.mediaQueue.values()]
      .filter((m) => m.organizationId === claims.orgId)
      .filter((m) => !entityId || m.entityId === entityId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  getMetrics(claims: AccessTokenClaims): SyncHealthMetrics {
    const stats = this.getOrInitStats(claims.orgId);
    const orgConflicts = [...this.conflicts.values()].filter(
      (c) => c.organizationId === claims.orgId,
    );
    const pendingDeadLettersCount = [...this.deadLetters.values()].filter(
      (d) => d.organizationId === claims.orgId && !d.acknowledged,
    ).length;
    const activeDevicesCount = [...this.devices.values()].filter(
      (d) => d.organizationId === claims.orgId,
    ).length;
    const orgDeltas = this.deltaLog.filter((d) => d.organizationId === claims.orgId);
    const latestServerSeq =
      orgDeltas.length > 0 ? orgDeltas[orgDeltas.length - 1].serverSeq : 0;

    return {
      appliedOpsCount: stats.applied,
      deduplicatedOpsCount: stats.deduplicated,
      rejectedOpsCount: stats.rejected,
      pendingConflictsCount: orgConflicts.filter((c) => c.resolutionStatus === 'pending').length,
      resolvedConflictsCount: orgConflicts.filter((c) => c.resolutionStatus !== 'pending').length,
      pendingDeadLettersCount,
      activeDevicesCount,
      latestServerSeq,
    };
  }
}
