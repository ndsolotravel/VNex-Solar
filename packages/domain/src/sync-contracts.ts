export type OfflineSyncEntityType =
  | 'customer'
  | 'site_survey'
  | 'solar_design_draft'
  | 'quotation_draft'
  | 'installation_task'
  | 'inspection_draft'
  | 'maintenance_note';

export type ServerAuthoritativeAction =
  | 'finance_posting'
  | 'stock_deduction'
  | 'design_approval'
  | 'commissioning_approval';

export type SyncOperationType = 'create' | 'update' | 'delete';

export type SyncResultStatus = 'applied' | 'conflict' | 'rejected';

export interface SyncBatchOperationInput {
  syncOperationId: string;
  idempotencyKey: string;
  entityType: OfflineSyncEntityType | ServerAuthoritativeAction;
  entityId: string;
  operationType: SyncOperationType;
  baseRowVersion: number;
  payloadSha256: string;
  payload: Record<string, unknown>;
  clientTimestamp: string;
}

export interface SyncBatchRequest {
  deviceId: string;
  operations: SyncBatchOperationInput[];
}

export interface SyncBatchOperationResult {
  syncOperationId: string;
  idempotencyKey: string;
  entityType: string;
  entityId: string;
  status: SyncResultStatus;
  deduplicated: boolean;
  serverSeq: number | null;
  newRowVersion: number | null;
  conflictId: string | null;
  serverSnapshot: Record<string, unknown> | null;
  reason: string | null;
}

export interface SyncConflictRecord {
  id: string;
  organizationId: string;
  syncOperationId: string;
  entityType: string;
  entityId: string;
  clientPayload: Record<string, unknown>;
  serverSnapshot: Record<string, unknown>;
  resolutionStatus: 'pending' | 'accepted_server' | 'merged_client';
  resolvedByUserId: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface SyncDeltaEntityChange {
  serverSeq: number;
  entityType: string;
  entityId: string;
  operationType: SyncOperationType;
  rowVersion: number;
  data: Record<string, unknown>;
  updatedAt: string;
}

export interface SyncDeltaResponse {
  sinceSeq: number;
  nextServerSeq: number;
  hasMore: boolean;
  changes: SyncDeltaEntityChange[];
}

export interface SyncDeviceStatusSummary {
  id: string;
  organizationId: string;
  userId: string;
  deviceIdentifier: string;
  platform: 'android' | 'ios' | 'web';
  appVersion: string;
  lastSyncAt: string;
  checkpointSeq: number;
}

export interface SyncDeadLetterRecord {
  id: string;
  organizationId: string;
  deviceId: string;
  syncOperationId: string;
  idempotencyKey: string;
  entityType: string;
  entityId: string;
  operationType: SyncOperationType;
  reason: string;
  acknowledged: boolean;
  acknowledgedByUserId: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
}

export interface SyncHealthMetrics {
  appliedOpsCount: number;
  deduplicatedOpsCount: number;
  rejectedOpsCount: number;
  pendingConflictsCount: number;
  resolvedConflictsCount: number;
  pendingDeadLettersCount: number;
  activeDevicesCount: number;
  latestServerSeq: number;
}

export interface MediaUploadRecoveryRecord {
  id: string;
  organizationId: string;
  deviceId: string;
  entityType: string;
  entityId: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  expectedSha256: string;
  receivedSha256: string | null;
  status: 'presigned' | 'uploaded' | 'checksum_mismatch' | 'recovered';
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}
