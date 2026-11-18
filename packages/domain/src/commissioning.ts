export type CommissioningStatus = 'pending_safety' | 'ready_for_review' | 'approved' | 'rejected';

export interface CommissioningTestRecord {
  id: string;
  organizationId: string;
  commissioningRecordId: string;
  testName: string;
  measuredValue: string;
  passed: boolean;
  testedByUserId: string;
  testedAt: string;
}

export interface CommissioningApprovalRecord {
  id: string;
  organizationId: string;
  commissioningRecordId: string;
  approverUserId: string;
  approverRole: string;
  decision: 'approved' | 'rejected';
  notes: string;
  decidedAt: string;
}

export interface HandoverDocumentRecord {
  id: string;
  organizationId: string;
  commissioningRecordId: string;
  documentTitle: string;
  certificateNumber: string;
  fileAttachmentId: string;
  sha256Digest: string;
  customerAcknowledgedAt: string | null;
  customerSignoffName: string | null;
  createdAt: string;
}

export interface AssetRegisterRecord {
  id: string;
  organizationId: string;
  projectId: string;
  siteId: string;
  equipmentCatalogId: string;
  sku: string;
  modelName: string;
  serialNumber: string;
  qrCodeToken: string;
  installedOn: string;
  warrantyExpiresOn: string | null;
  telemetryProvider: string | null;
  externalDeviceId: string | null;
}

export interface CommissioningRecordDetail {
  id: string;
  organizationId: string;
  projectId: string;
  installationJobId: string;
  certificateCode: string;
  status: CommissioningStatus;
  safetyClearedSnapshot: boolean;
  commissionedAt: string | null;
  tests: CommissioningTestRecord[];
  approvals: CommissioningApprovalRecord[];
  handoverDocuments: HandoverDocumentRecord[];
  generatedAssets: AssetRegisterRecord[];
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_COMMISSIONING_TESTS: ReadonlyArray<{
  testName: string;
  measuredValue: string;
  passed: boolean;
}> = [
  { testName: 'Open Circuit String Voltage (Voc)', measuredValue: '642 V DC (Within 1100V limit)', passed: true },
  { testName: 'Grid Synchronization & Anti-Islanding Trip', measuredValue: '0.18 s trip (< 2.0 s IEC 62116)', passed: true },
  { testName: 'Zero-Export / CT Meter Polarity Check', measuredValue: '+0.99 PF synchronized', passed: true },
  { testName: 'Battery BMS Cut-Off & Charge/Discharge Loop', measuredValue: '52.4 V LFP nominal', passed: true },
];

export function evaluateCommissioningReadiness(
  safetyCleared: boolean,
  installationCompleted: boolean,
  tests: ReadonlyArray<CommissioningTestRecord>,
): { ready: boolean; blockers: string[] } {
  const blockers: string[] = [];
  if (!safetyCleared) {
    blockers.push('Hard safety gate not cleared (approved PPE/LOTO risk assessment & passed inspection required)');
  }
  if (!installationCompleted) {
    blockers.push('Installation job tasks must be completed before commissioning sign-off');
  }
  if (tests.length === 0) {
    blockers.push('At least one commissioning verification test must be recorded');
  }
  const failed = tests.filter((t) => !t.passed);
  if (failed.length > 0) {
    blockers.push(`${failed.length} commissioning test(s) failed`);
  }
  return { ready: blockers.length === 0, blockers };
}
