export type RiskAssessmentStatus = 'draft' | 'submitted' | 'approved' | 'rejected';
export type SafetyChecklistType = 'ppe' | 'working_at_height' | 'electrical_isolation' | 'loto_lockout';
export type SafetyIncidentSeverity = 'near_miss' | 'minor' | 'major' | 'critical';
export type InspectionRecordStatus = 'draft' | 'submitted' | 'passed' | 'failed';
export type InspectionItemResult = 'pass' | 'fail' | 'na';
export type CorrectiveActionStatus = 'open' | 'resolved' | 'verified';

export interface RiskAssessmentRecord {
  id: string;
  organizationId: string;
  installationJobId: string;
  assessedByUserId: string;
  workingAtHeightRequired: boolean;
  electricalIsolationVerified: boolean;
  ppeComplianceVerified: boolean;
  hazardNotes: string;
  status: RiskAssessmentStatus;
  approvedByUserId: string | null;
  approvedAt: string | null;
  rejectionNotes: string | null;
  rowVersion: number;
  createdAt: string;
}

export interface SafetyChecklistItem {
  code: string;
  label: string;
  verified: boolean;
  notes?: string;
}

export interface SafetyChecklistRecord {
  id: string;
  organizationId: string;
  installationJobId: string;
  checklistType: SafetyChecklistType;
  items: SafetyChecklistItem[];
  completedByUserId: string;
  completedAt: string;
  rowVersion: number;
}

export interface SafetyIncidentRecord {
  id: string;
  organizationId: string;
  installationJobId: string | null;
  reportedByUserId: string;
  severity: SafetyIncidentSeverity;
  description: string;
  immediateActionTaken: string | null;
  resolved: boolean;
  occurredAt: string;
}

export interface InspectionItemRecord {
  id: string;
  organizationId: string;
  inspectionRecordId: string;
  checkCode: string;
  description: string;
  result: InspectionItemResult;
  notes: string | null;
}

export interface TestReadingRecord {
  id: string;
  organizationId: string;
  inspectionRecordId: string;
  parameterName: string;
  measuredValue: number;
  unit: string;
  withinTolerance: boolean;
}

export interface CorrectiveActionRecord {
  id: string;
  organizationId: string;
  inspectionRecordId: string;
  assignedToUserId: string | null;
  description: string;
  status: CorrectiveActionStatus;
  dueDate: string | null;
  resolvedAt: string | null;
}

export interface InspectionApprovalRecord {
  id: string;
  organizationId: string;
  inspectionRecordId: string;
  approverUserId: string;
  decision: 'approved' | 'rejected';
  comments: string;
  decidedAt: string;
}

export interface InspectionRecordDetail {
  id: string;
  organizationId: string;
  installationJobId: string;
  inspectorUserId: string;
  status: InspectionRecordStatus;
  items: InspectionItemRecord[];
  testReadings: TestReadingRecord[];
  correctiveActions: CorrectiveActionRecord[];
  approvals: InspectionApprovalRecord[];
  rowVersion: number;
  createdAt: string;
}

export interface SafetyGateEvaluation {
  cleared: boolean;
  blocked: boolean;
  reasons: string[];
}

export const DEFAULT_PV_CHECKLIST_ITEMS: Record<SafetyChecklistType, SafetyChecklistItem[]> = {
  ppe: [
    { code: 'PPE-01', label: 'Insulated electrical gloves (Class 0 / 1000V) worn', verified: true },
    { code: 'PPE-02', label: 'EN 397 safety helmet with chin strap & arc-rated eyewear', verified: true },
    { code: 'PPE-03', label: 'Dielectric safety footwear (EH rated) verified on crew', verified: true },
  ],
  working_at_height: [
    { code: 'WAH-01', label: 'Full-body harness EN 361 & double-lanyard shock absorber', verified: true },
    { code: 'WAH-02', label: 'Certified lifeline / roof anchor points load-checked', verified: true },
    { code: 'WAH-03', label: 'Perimeter barricade & exclusion zone established below roof', verified: true },
  ],
  electrical_isolation: [
    { code: 'ISO-01', label: 'DC array isolators & inverter breaker locked OFF', verified: true },
    { code: 'ISO-02', label: 'AC main distribution isolator verified zero-voltage with CAT III meter', verified: true },
    { code: 'ISO-03', label: 'SPD & protective equipotential bonding continuity confirmed', verified: true },
  ],
  loto_lockout: [
    { code: 'LOTO-01', label: 'Personal padlock & danger tag attached at AC/DC isolators', verified: true },
    { code: 'LOTO-02', label: 'Battery DC breaker isolated before busbar termination', verified: true },
  ],
};

export function evaluateSafetyGateStatus(params: {
  riskAssessments: ReadonlyArray<RiskAssessmentRecord>;
  incidents: ReadonlyArray<SafetyIncidentRecord>;
  inspections: ReadonlyArray<InspectionRecordDetail>;
}): SafetyGateEvaluation {
  const reasons: string[] = [];
  let blocked = false;

  const approvedRisk = params.riskAssessments.find(
    (r) =>
      r.status === 'approved' &&
      r.ppeComplianceVerified &&
      r.electricalIsolationVerified,
  );
  if (!approvedRisk) {
    reasons.push('Approved Risk Assessment with PPE & Electrical Isolation verification required');
  }

  const unresolvedSevereIncidents = params.incidents.filter(
    (inc) => !inc.resolved && (inc.severity === 'major' || inc.severity === 'critical'),
  );
  if (unresolvedSevereIncidents.length > 0) {
    blocked = true;
    reasons.push(`${unresolvedSevereIncidents.length} unresolved major/critical safety incident(s)`);
  }

  const failedInspections = params.inspections.filter((i) => i.status === 'failed');
  if (failedInspections.length > 0) {
    blocked = true;
    reasons.push('Inspection failed — remedial verification required before clearing safety gate');
  }

  const openActions = params.inspections.flatMap((i) =>
    i.correctiveActions.filter((a) => a.status !== 'verified'),
  );
  if (openActions.length > 0) {
    blocked = true;
    reasons.push(`${openActions.length} unverified corrective action(s) remaining`);
  }

  const passedInspection = params.inspections.find((i) => i.status === 'passed');
  if (!passedInspection) {
    reasons.push('Passed IEC 62446-1 final inspection required for commissioning clearance');
  }

  const cleared = Boolean(approvedRisk && passedInspection && !blocked && reasons.length === 0);
  return { cleared, blocked, reasons };
}
