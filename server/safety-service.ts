import { randomUUID } from 'node:crypto';
import {
  evaluateSafetyGateStatus,
  type CorrectiveActionRecord,
  type CorrectiveActionStatus,
  type InspectionApprovalRecord,
  type InspectionItemRecord,
  type InspectionItemResult,
  type InspectionRecordDetail,
  type RiskAssessmentRecord,
  type SafetyChecklistItem,
  type SafetyChecklistRecord,
  type SafetyChecklistType,
  type SafetyGateEvaluation,
  type SafetyIncidentRecord,
  type SafetyIncidentSeverity,
  type TestReadingRecord,
} from '../packages/domain/src/index.ts';
import { AuthServiceError, type AccessTokenClaims } from './auth-service.ts';
import type { InMemoryCustomersSurveysService } from './customers-surveys-service.ts';
import type { InMemoryInstallationService } from './installation-service.ts';

export class InMemorySafetyService {
  private readonly riskAssessments = new Map<string, RiskAssessmentRecord>();
  private readonly checklists = new Map<string, SafetyChecklistRecord>();
  private readonly incidents = new Map<string, SafetyIncidentRecord>();
  private readonly inspections = new Map<string, InspectionRecordDetail>();

  constructor(
    private readonly customersSurveys: InMemoryCustomersSurveysService,
    private readonly installationService: InMemoryInstallationService,
  ) {}

  private syncJobGate(claims: AccessTokenClaims, jobId: string): SafetyGateEvaluation {
    const jobRisks = [...this.riskAssessments.values()].filter(
      (r) => r.organizationId === claims.orgId && r.installationJobId === jobId,
    );
    const jobIncidents = [...this.incidents.values()].filter(
      (i) => i.organizationId === claims.orgId && i.installationJobId === jobId,
    );
    const jobInspections = [...this.inspections.values()].filter(
      (i) => i.organizationId === claims.orgId && i.installationJobId === jobId,
    );

    const evaluation = evaluateSafetyGateStatus({
      riskAssessments: jobRisks,
      incidents: jobIncidents,
      inspections: jobInspections,
    });

    this.installationService.setJobSafetyGate(
      claims,
      jobId,
      evaluation.cleared,
      evaluation.blocked,
    );
    return evaluation;
  }

  getJobSafetyBundle(claims: AccessTokenClaims, jobId: string) {
    const job = this.installationService.getJob(claims, jobId);
    const riskAssessments = [...this.riskAssessments.values()]
      .filter((r) => r.organizationId === claims.orgId && r.installationJobId === job.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const checklists = [...this.checklists.values()]
      .filter((c) => c.organizationId === claims.orgId && c.installationJobId === job.id)
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
    const incidents = [...this.incidents.values()]
      .filter((i) => i.organizationId === claims.orgId && i.installationJobId === job.id)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    const inspections = [...this.inspections.values()]
      .filter((i) => i.organizationId === claims.orgId && i.installationJobId === job.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const evaluation = evaluateSafetyGateStatus({
      riskAssessments,
      incidents,
      inspections,
    });

    return {
      installationJobId: job.id,
      jobCode: job.jobCode,
      jobStatus: job.status,
      safetyCleared: job.safetyCleared,
      evaluation,
      riskAssessments,
      checklists,
      incidents,
      inspections,
    };
  }

  createRiskAssessment(
    claims: AccessTokenClaims,
    input: {
      installationJobId: string;
      workingAtHeightRequired: boolean;
      electricalIsolationVerified: boolean;
      ppeComplianceVerified: boolean;
      hazardNotes?: string;
    },
  ): RiskAssessmentRecord {
    const job = this.installationService.getJob(claims, input.installationJobId);
    const record: RiskAssessmentRecord = {
      id: randomUUID(),
      organizationId: claims.orgId,
      installationJobId: job.id,
      assessedByUserId: claims.sub,
      workingAtHeightRequired: input.workingAtHeightRequired,
      electricalIsolationVerified: input.electricalIsolationVerified,
      ppeComplianceVerified: input.ppeComplianceVerified,
      hazardNotes: input.hazardNotes?.trim() ?? '',
      status: 'submitted',
      approvedByUserId: null,
      approvedAt: null,
      rejectionNotes: null,
      rowVersion: 1,
      createdAt: new Date().toISOString(),
    };
    this.riskAssessments.set(record.id, record);
    return record;
  }

  approveOrRejectRiskAssessment(
    claims: AccessTokenClaims,
    riskId: string,
    decision: 'approved' | 'rejected',
    notes?: string,
  ): RiskAssessmentRecord {
    const risk = this.riskAssessments.get(riskId);
    if (!risk || risk.organizationId !== claims.orgId) {
      throw new AuthServiceError(404, 'Risk assessment not found in active organization', 'NOT_FOUND');
    }
    if (risk.status === 'approved' || risk.status === 'rejected') {
      throw new AuthServiceError(
        409,
        `Risk assessment is already ${risk.status} and immutable`,
        'RISK_IMMUTABLE',
      );
    }

    if (
      decision === 'approved' &&
      (!risk.ppeComplianceVerified || !risk.electricalIsolationVerified)
    ) {
      throw new AuthServiceError(
        422,
        'Cannot approve Risk Assessment until PPE compliance and electrical isolation are verified',
        'SAFETY_REQUIREMENTS_UNMET',
      );
    }

    risk.status = decision;
    risk.approvedByUserId = claims.sub;
    risk.approvedAt = new Date().toISOString();
    risk.rejectionNotes = decision === 'rejected' ? (notes?.trim() ?? 'Safety controls incomplete') : null;
    risk.rowVersion += 1;

    if (decision === 'rejected') {
      this.installationService.setJobSafetyGate(claims, risk.installationJobId, false, true);
    } else {
      this.syncJobGate(claims, risk.installationJobId);
    }
    return risk;
  }

  recordSafetyChecklist(
    claims: AccessTokenClaims,
    input: {
      installationJobId: string;
      checklistType: SafetyChecklistType;
      items: SafetyChecklistItem[];
    },
  ): SafetyChecklistRecord {
    const job = this.installationService.getJob(claims, input.installationJobId);
    const checklist: SafetyChecklistRecord = {
      id: randomUUID(),
      organizationId: claims.orgId,
      installationJobId: job.id,
      checklistType: input.checklistType,
      items: input.items.map((item) => ({
        code: item.code.trim(),
        label: item.label.trim(),
        verified: Boolean(item.verified),
        notes: item.notes?.trim(),
      })),
      completedByUserId: claims.sub,
      completedAt: new Date().toISOString(),
      rowVersion: 1,
    };
    this.checklists.set(checklist.id, checklist);
    return checklist;
  }

  listIncidents(claims: AccessTokenClaims, jobId?: string): SafetyIncidentRecord[] {
    return [...this.incidents.values()]
      .filter((inc) => inc.organizationId === claims.orgId)
      .filter((inc) => !jobId || inc.installationJobId === jobId)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }

  reportSafetyIncident(
    claims: AccessTokenClaims,
    input: {
      installationJobId?: string | null;
      severity: SafetyIncidentSeverity;
      description: string;
      immediateActionTaken?: string | null;
    },
  ): SafetyIncidentRecord {
    let resolvedJobId: string | null = null;
    if (input.installationJobId) {
      const job = this.installationService.getJob(claims, input.installationJobId);
      resolvedJobId = job.id;
    }
    const incident: SafetyIncidentRecord = {
      id: randomUUID(),
      organizationId: claims.orgId,
      installationJobId: resolvedJobId,
      reportedByUserId: claims.sub,
      severity: input.severity,
      description: input.description.trim(),
      immediateActionTaken: input.immediateActionTaken?.trim() || null,
      resolved: false,
      occurredAt: new Date().toISOString(),
    };
    this.incidents.set(incident.id, incident);

    if (resolvedJobId && (input.severity === 'major' || input.severity === 'critical')) {
      this.syncJobGate(claims, resolvedJobId);
    }
    return incident;
  }

  resolveSafetyIncident(claims: AccessTokenClaims, incidentId: string, actionNotes: string): SafetyIncidentRecord {
    const inc = this.incidents.get(incidentId);
    if (!inc || inc.organizationId !== claims.orgId) {
      throw new AuthServiceError(404, 'Safety incident not found in active organization', 'NOT_FOUND');
    }
    inc.resolved = true;
    inc.immediateActionTaken = actionNotes.trim();
    if (inc.installationJobId) {
      this.syncJobGate(claims, inc.installationJobId);
    }
    return inc;
  }

  listInspections(claims: AccessTokenClaims, jobId?: string): InspectionRecordDetail[] {
    return [...this.inspections.values()]
      .filter((ins) => ins.organizationId === claims.orgId)
      .filter((ins) => !jobId || ins.installationJobId === jobId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  createInspection(
    claims: AccessTokenClaims,
    input: {
      id?: string;
      installationJobId: string;
      items: Array<{
        checkCode: string;
        description: string;
        result: InspectionItemResult;
        notes?: string | null;
      }>;
      testReadings: Array<{
        parameterName: string;
        measuredValue: number;
        unit: string;
        withinTolerance: boolean;
      }>;
      initialCorrectiveAction?: string;
    },
  ): InspectionRecordDetail {
    const job = this.installationService.getJob(claims, input.installationJobId);
    const inspectionId = input.id ?? randomUUID();

    const items: InspectionItemRecord[] = input.items.map((item) => ({
      id: randomUUID(),
      organizationId: claims.orgId,
      inspectionRecordId: inspectionId,
      checkCode: item.checkCode.trim(),
      description: item.description.trim(),
      result: item.result,
      notes: item.notes?.trim() || null,
    }));

    const testReadings: TestReadingRecord[] = input.testReadings.map((r) => ({
      id: randomUUID(),
      organizationId: claims.orgId,
      inspectionRecordId: inspectionId,
      parameterName: r.parameterName.trim(),
      measuredValue: r.measuredValue,
      unit: r.unit.trim(),
      withinTolerance: Boolean(r.withinTolerance),
    }));

    const correctiveActions: CorrectiveActionRecord[] = [];
    if (input.initialCorrectiveAction && input.initialCorrectiveAction.trim().length >= 3) {
      correctiveActions.push({
        id: randomUUID(),
        organizationId: claims.orgId,
        inspectionRecordId: inspectionId,
        assignedToUserId: null,
        description: input.initialCorrectiveAction.trim(),
        status: 'open',
        dueDate: null,
        resolvedAt: null,
      });
    }

    const detail: InspectionRecordDetail = {
      id: inspectionId,
      organizationId: claims.orgId,
      installationJobId: job.id,
      inspectorUserId: claims.sub,
      status: 'submitted',
      items,
      testReadings,
      correctiveActions,
      approvals: [],
      rowVersion: 1,
      createdAt: new Date().toISOString(),
    };

    this.inspections.set(inspectionId, detail);
    if (correctiveActions.length > 0) {
      this.syncJobGate(claims, job.id);
    }
    return detail;
  }

  addCorrectiveAction(
    claims: AccessTokenClaims,
    inspectionId: string,
    input: { description: string; assignedToUserId?: string | null; dueDate?: string | null },
  ): CorrectiveActionRecord {
    const ins = this.inspections.get(inspectionId);
    if (!ins || ins.organizationId !== claims.orgId) {
      throw new AuthServiceError(404, 'Inspection record not found in active organization', 'NOT_FOUND');
    }
    const action: CorrectiveActionRecord = {
      id: randomUUID(),
      organizationId: claims.orgId,
      inspectionRecordId: ins.id,
      assignedToUserId: input.assignedToUserId ?? null,
      description: input.description.trim(),
      status: 'open',
      dueDate: input.dueDate ?? null,
      resolvedAt: null,
    };
    ins.correctiveActions.push(action);
    ins.rowVersion += 1;
    this.syncJobGate(claims, ins.installationJobId);
    return action;
  }

  updateCorrectiveActionStatus(
    claims: AccessTokenClaims,
    inspectionId: string,
    actionId: string,
    status: CorrectiveActionStatus,
  ): CorrectiveActionRecord {
    const ins = this.inspections.get(inspectionId);
    if (!ins || ins.organizationId !== claims.orgId) {
      throw new AuthServiceError(404, 'Inspection record not found in active organization', 'NOT_FOUND');
    }
    const action = ins.correctiveActions.find((a) => a.id === actionId);
    if (!action) {
      throw new AuthServiceError(404, 'Corrective action not found', 'NOT_FOUND');
    }
    action.status = status;
    if (status === 'resolved' || status === 'verified') {
      action.resolvedAt = action.resolvedAt ?? new Date().toISOString();
    }
    if (status === 'verified') {
      // Clear any failing inspection items / readings that triggered corrective action
      for (const item of ins.items) {
        if (item.result === 'fail') item.result = 'pass';
      }
      for (const reading of ins.testReadings) {
        if (!reading.withinTolerance) reading.withinTolerance = true;
      }
      if (ins.status === 'failed') {
        ins.status = 'submitted';
      }
    }
    ins.rowVersion += 1;
    this.syncJobGate(claims, ins.installationJobId);
    return action;
  }

  approveOrRejectInspection(
    claims: AccessTokenClaims,
    inspectionId: string,
    decision: 'approved' | 'rejected',
    comments: string,
  ): InspectionRecordDetail {
    const ins = this.inspections.get(inspectionId);
    if (!ins || ins.organizationId !== claims.orgId) {
      throw new AuthServiceError(404, 'Inspection record not found in active organization', 'NOT_FOUND');
    }
    if (ins.status === 'passed') {
      throw new AuthServiceError(
        409,
        'Passed inspection is immutable and cannot be modified',
        'INSPECTION_IMMUTABLE',
      );
    }

    if (decision === 'approved') {
      const approvedRisk = [...this.riskAssessments.values()].find(
        (r) =>
          r.organizationId === claims.orgId &&
          r.installationJobId === ins.installationJobId &&
          r.status === 'approved' &&
          r.ppeComplianceVerified &&
          r.electricalIsolationVerified,
      );
      if (!approvedRisk) {
        throw new AuthServiceError(
          422,
          'Cannot pass inspection without an approved Risk Assessment verifying PPE & electrical isolation',
          'SAFETY_GATE_BLOCKED',
        );
      }

      const failingItems = ins.items.filter((it) => it.result === 'fail');
      if (failingItems.length > 0) {
        throw new AuthServiceError(
          422,
          `${failingItems.length} failed inspection item(s) must be remediated and verified before passing`,
          'SAFETY_GATE_BLOCKED',
        );
      }

      const outOfTolerance = ins.testReadings.filter((r) => !r.withinTolerance);
      if (outOfTolerance.length > 0) {
        throw new AuthServiceError(
          422,
          `${outOfTolerance.length} test reading(s) are out of tolerance`,
          'SAFETY_GATE_BLOCKED',
        );
      }

      const unverifiedActions = ins.correctiveActions.filter((a) => a.status !== 'verified');
      if (unverifiedActions.length > 0) {
        throw new AuthServiceError(
          422,
          `${unverifiedActions.length} corrective action(s) remain unverified`,
          'SAFETY_GATE_BLOCKED',
        );
      }

      const openIncidents = [...this.incidents.values()].filter(
        (inc) =>
          inc.organizationId === claims.orgId &&
          inc.installationJobId === ins.installationJobId &&
          !inc.resolved &&
          (inc.severity === 'major' || inc.severity === 'critical'),
      );
      if (openIncidents.length > 0) {
        throw new AuthServiceError(
          422,
          'Major/critical safety incidents must be resolved before passing inspection',
          'SAFETY_GATE_BLOCKED',
        );
      }
    }

    const approval: InspectionApprovalRecord = {
      id: randomUUID(),
      organizationId: claims.orgId,
      inspectionRecordId: ins.id,
      approverUserId: claims.sub,
      decision,
      comments: comments.trim(),
      decidedAt: new Date().toISOString(),
    };
    ins.approvals.push(approval);
    ins.status = decision === 'approved' ? 'passed' : 'failed';
    ins.rowVersion += 1;

    const job = this.installationService.getJob(claims, ins.installationJobId);
    this.syncJobGate(claims, job.id);
    if (decision === 'approved') {
      this.customersSurveys.advanceProjectStage(claims, job.projectId, 'safety_approved');
    }
    return ins;
  }

  isJobClearedForCommissioning(orgId: string, installationJobId: string): boolean {
    const jobRisks = [...this.riskAssessments.values()].filter(
      (r) => r.organizationId === orgId && r.installationJobId === installationJobId,
    );
    const jobIncidents = [...this.incidents.values()].filter(
      (i) => i.organizationId === orgId && i.installationJobId === installationJobId,
    );
    const jobInspections = [...this.inspections.values()].filter(
      (i) => i.organizationId === orgId && i.installationJobId === installationJobId,
    );
    return evaluateSafetyGateStatus({
      riskAssessments: jobRisks,
      incidents: jobIncidents,
      inspections: jobInspections,
    }).cleared;
  }

  applyOfflineSyncedInspectionDraft(
    claims: AccessTokenClaims,
    entityId: string,
    operationType: 'create' | 'update' | 'delete',
    payload: Record<string, unknown>,
  ) {
    if (operationType === 'delete') return;
    const jobId = typeof payload.installationJobId === 'string' ? payload.installationJobId : '';
    if (!jobId) return;

    const rawItems = Array.isArray(payload.items) ? payload.items : [];
    const rawReadings = Array.isArray(payload.testReadings) ? payload.testReadings : [];

    if (!this.inspections.has(entityId) && (rawItems.length > 0 || rawReadings.length > 0)) {
      this.createInspection(claims, {
        id: entityId,
        installationJobId: jobId,
        items: rawItems.map((it: Record<string, unknown>, idx) => ({
          checkCode: typeof it.checkCode === 'string' ? it.checkCode : `CHK-${idx + 1}`,
          description:
            typeof it.description === 'string' ? it.description : 'Field safety verification check',
          result:
            it.result === 'fail' || it.result === 'na' ? it.result : ('pass' as InspectionItemResult),
          notes: typeof it.notes === 'string' ? it.notes : null,
        })),
        testReadings: rawReadings.map((r: Record<string, unknown>) => ({
          parameterName:
            typeof r.parameterName === 'string' ? r.parameterName : 'Earth Resistance',
          measuredValue: typeof r.measuredValue === 'number' ? r.measuredValue : 0,
          unit: typeof r.unit === 'string' ? r.unit : 'ohm',
          withinTolerance: Boolean(r.withinTolerance ?? true),
        })),
      });
    }
  }
}
