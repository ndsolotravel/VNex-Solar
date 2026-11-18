import { randomUUID } from 'node:crypto';
import {
  calculateSolarDesignEngineering,
  type BatterySpec,
  type DesignApprovalRecord,
  type DesignRevisionRecord,
  type InverterSpec,
  type SolarDesignCalculationInput,
  type SolarDesignRecord,
  type SolarModuleSpec,
} from '../packages/domain/src/index.ts';
import { AuthServiceError, type AccessTokenClaims } from './auth-service.ts';
import type { InMemoryCustomersSurveysService } from './customers-surveys-service.ts';

interface TenantEngineeringCatalog {
  modules: SolarModuleSpec[];
  inverters: InverterSpec[];
  batteries: BatterySpec[];
}

function createDefaultCatalog(orgId: string): TenantEngineeringCatalog {
  const suffix = orgId.slice(0, 6);
  return {
    modules: [
      {
        id: `${suffix}-mod-longi-580`,
        modelName: 'Hi-MO 6 Explorer LR5-72HTH 580M',
        manufacturer: 'LONGi Solar',
        pmaxW: 580,
        vocV: 52.21,
        vmpV: 44.06,
        iscA: 14.2,
        impA: 13.17,
        tempCoeffVocPctPerC: -0.26,
        tempCoeffPmaxPctPerC: -0.29,
        maxSystemVoltageV: 1500,
        areaM2: 2.58,
        weightKg: 27.5,
      },
      {
        id: `${suffix}-mod-jinko-585`,
        modelName: 'Tiger Neo N-Type 72HL4-(V) 585W',
        manufacturer: 'JinkoSolar',
        pmaxW: 585,
        vocV: 52.7,
        vmpV: 43.91,
        iscA: 14.07,
        impA: 13.32,
        tempCoeffVocPctPerC: -0.25,
        tempCoeffPmaxPctPerC: -0.29,
        maxSystemVoltageV: 1500,
        areaM2: 2.58,
        weightKg: 28.0,
      },
    ],
    inverters: [
      {
        id: `${suffix}-inv-nitrox-12kw`,
        modelName: 'Nitrox Hybrid 12K-3P IP65',
        manufacturer: 'Inverex / Deye',
        inverterType: 'hybrid',
        ratedAcPowerW: 12000,
        maxDcInputW: 15600,
        maxDcVoltageV: 800,
        mpptMinV: 200,
        mpptMaxV: 650,
        mpptCount: 2,
        maxInputCurrentPerMpptA: 26,
        efficiencyPct: 97.6,
        phases: 'three',
      },
      {
        id: `${suffix}-inv-huawei-20ktl`,
        modelName: 'SUN2000-20KTL-M5 Three-Phase',
        manufacturer: 'Huawei FusionSolar',
        inverterType: 'on_grid',
        ratedAcPowerW: 20000,
        maxDcInputW: 30000,
        maxDcVoltageV: 1100,
        mpptMinV: 200,
        mpptMaxV: 1000,
        mpptCount: 2,
        maxInputCurrentPerMpptA: 30,
        efficiencyPct: 98.4,
        phases: 'three',
      },
      {
        id: `${suffix}-inv-goodwe-6kw`,
        modelName: 'GW6000-EH Single-Phase Hybrid',
        manufacturer: 'GoodWe',
        inverterType: 'hybrid',
        ratedAcPowerW: 6000,
        maxDcInputW: 9600,
        maxDcVoltageV: 580,
        mpptMinV: 120,
        mpptMaxV: 550,
        mpptCount: 2,
        maxInputCurrentPerMpptA: 16,
        efficiencyPct: 97.6,
        phases: 'single',
      },
    ],
    batteries: [
      {
        id: `${suffix}-bat-pylon-us5000`,
        modelName: 'US5000 48V 100Ah LFP',
        manufacturer: 'Pylontech',
        chemistry: 'LFP',
        nominalVoltageV: 48,
        capacityAh: 100,
        energyWh: 4800,
        maxDodPct: 90,
        roundTripEfficiencyPct: 95,
      },
      {
        id: `${suffix}-bat-narada-512`,
        modelName: 'NESR 51.2V 100Ah Rack LFP',
        manufacturer: 'Narada',
        chemistry: 'LFP',
        nominalVoltageV: 51.2,
        capacityAh: 100,
        energyWh: 5120,
        maxDodPct: 85,
        roundTripEfficiencyPct: 94,
      },
    ],
  };
}

export class InMemorySolarEngineeringService {
  private readonly catalogs = new Map<string, TenantEngineeringCatalog>();
  private readonly designs = new Map<string, SolarDesignRecord>();
  private readonly revisions = new Map<string, DesignRevisionRecord[]>();
  private readonly approvals = new Map<string, DesignApprovalRecord[]>();

  constructor(private readonly customersSurveys: InMemoryCustomersSurveysService) {}

  getCatalog(claims: AccessTokenClaims): TenantEngineeringCatalog {
    let catalog = this.catalogs.get(claims.orgId);
    if (!catalog) {
      catalog = createDefaultCatalog(claims.orgId);
      this.catalogs.set(claims.orgId, catalog);
    }
    return catalog;
  }

  listDesigns(claims: AccessTokenClaims, projectId?: string): Array<{
    design: SolarDesignRecord;
    latestRevision: DesignRevisionRecord;
    approvals: DesignApprovalRecord[];
  }> {
    return [...this.designs.values()]
      .filter((d) => d.organizationId === claims.orgId)
      .filter((d) => !projectId || d.projectId === projectId)
      .filter((d) => {
        try {
          this.customersSurveys.getProject(claims, d.projectId);
          return true;
        } catch {
          return false;
        }
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((design) => {
        const revs = this.revisions.get(design.id) ?? [];
        const latestRevision = revs[revs.length - 1];
        return {
          design,
          latestRevision,
          approvals: [...(this.approvals.get(design.id) ?? [])],
        };
      });
  }

  getDesignDetail(claims: AccessTokenClaims, designId: string) {
    const design = this.designs.get(designId);
    if (!design || design.organizationId !== claims.orgId) {
      throw new AuthServiceError(404, 'Solar design not found in active organization', 'NOT_FOUND');
    }
    this.customersSurveys.getProject(claims, design.projectId);
    return {
      design,
      revisions: [...(this.revisions.get(designId) ?? [])],
      approvals: [...(this.approvals.get(designId) ?? [])],
    };
  }

  createDesign(
    claims: AccessTokenClaims,
    input: {
      id?: string;
      projectId: string;
      siteSurveyId?: string | null;
      title: string;
      notes?: string;
      calculationInput: SolarDesignCalculationInput;
    },
  ) {
    const project = this.customersSurveys.getProject(claims, input.projectId);
    const id = input.id ?? randomUUID();
    if (this.designs.has(id)) {
      throw new AuthServiceError(409, 'Solar design ID already exists', 'DUPLICATE_DESIGN');
    }

    const calculations = calculateSolarDesignEngineering(input.calculationInput);
    const orgCount = [...this.designs.values()].filter(
      (d) => d.organizationId === claims.orgId,
    ).length;
    const now = new Date().toISOString();

    const design: SolarDesignRecord = {
      id,
      organizationId: claims.orgId,
      projectId: project.id,
      siteSurveyId: input.siteSurveyId ?? null,
      designCode: `ENG-${String(orgCount + 1).padStart(4, '0')}`,
      title: input.title.trim(),
      currentRevisionNumber: 1,
      status: 'draft',
      createdByUserId: claims.sub,
      rowVersion: 1,
      createdAt: now,
      updatedAt: now,
    };

    const rev1: DesignRevisionRecord = {
      id: randomUUID(),
      organizationId: claims.orgId,
      solarDesignId: id,
      revisionNumber: 1,
      status: 'draft',
      formulaVersion: calculations.formulaVersion,
      inputs: input.calculationInput,
      calculations,
      notes: input.notes?.trim() ?? '',
      approvedAt: null,
      createdByUserId: claims.sub,
      createdAt: now,
    };

    this.designs.set(id, design);
    this.revisions.set(id, [rev1]);
    this.approvals.set(id, []);

    return {
      design,
      revisions: [rev1],
      approvals: [] as DesignApprovalRecord[],
    };
  }

  updateDraftRevision(
    claims: AccessTokenClaims,
    designId: string,
    revisionNumber: number,
    patch: {
      baseRowVersion: number;
      notes?: string;
      calculationInput: SolarDesignCalculationInput;
    },
  ) {
    const design = this.designs.get(designId);
    if (!design || design.organizationId !== claims.orgId) {
      throw new AuthServiceError(404, 'Solar design not found in active organization', 'NOT_FOUND');
    }
    this.customersSurveys.getProject(claims, design.projectId);

    if (patch.baseRowVersion !== design.rowVersion) {
      throw new AuthServiceError(
        409,
        `Design version conflict: expected ${design.rowVersion}, got ${patch.baseRowVersion}`,
        'VERSION_CONFLICT',
      );
    }

    const revs = this.revisions.get(designId) ?? [];
    const targetRev = revs.find((r) => r.revisionNumber === revisionNumber);
    if (!targetRev) {
      throw new AuthServiceError(404, `Revision ${revisionNumber} not found`, 'NOT_FOUND');
    }

    if (targetRev.status === 'approved' || targetRev.status === 'submitted') {
      throw new AuthServiceError(
        409,
        `Revision v${revisionNumber} is ${targetRev.status} and immutable. Create a new revision instead.`,
        'REVISION_IMMUTABLE',
      );
    }

    const recalculated = calculateSolarDesignEngineering(patch.calculationInput);
    targetRev.inputs = patch.calculationInput;
    targetRev.calculations = recalculated;
    if (patch.notes !== undefined) {
      targetRev.notes = patch.notes.trim();
    }

    design.rowVersion += 1;
    design.updatedAt = new Date().toISOString();

    return {
      design,
      revision: targetRev,
      revisions: [...revs],
    };
  }

  createNewRevision(
    claims: AccessTokenClaims,
    designId: string,
    input: {
      notes?: string;
      calculationInput: SolarDesignCalculationInput;
    },
  ) {
    const design = this.designs.get(designId);
    if (!design || design.organizationId !== claims.orgId) {
      throw new AuthServiceError(404, 'Solar design not found in active organization', 'NOT_FOUND');
    }
    this.customersSurveys.getProject(claims, design.projectId);

    const revs = this.revisions.get(designId) ?? [];
    const nextRevNumber = revs.length + 1;
    const calculations = calculateSolarDesignEngineering(input.calculationInput);
    const now = new Date().toISOString();

    const nextRev: DesignRevisionRecord = {
      id: randomUUID(),
      organizationId: claims.orgId,
      solarDesignId: designId,
      revisionNumber: nextRevNumber,
      status: 'draft',
      formulaVersion: calculations.formulaVersion,
      inputs: input.calculationInput,
      calculations,
      notes: input.notes?.trim() ?? '',
      approvedAt: null,
      createdByUserId: claims.sub,
      createdAt: now,
    };

    revs.push(nextRev);
    design.currentRevisionNumber = nextRevNumber;
    design.status = 'draft';
    design.rowVersion += 1;
    design.updatedAt = now;

    return {
      design,
      revision: nextRev,
      revisions: [...revs],
    };
  }

  submitRevision(
    claims: AccessTokenClaims,
    designId: string,
    revisionNumber: number,
  ) {
    const design = this.designs.get(designId);
    if (!design || design.organizationId !== claims.orgId) {
      throw new AuthServiceError(404, 'Solar design not found in active organization', 'NOT_FOUND');
    }
    this.customersSurveys.getProject(claims, design.projectId);

    const revs = this.revisions.get(designId) ?? [];
    const rev = revs.find((r) => r.revisionNumber === revisionNumber);
    if (!rev) {
      throw new AuthServiceError(404, `Revision ${revisionNumber} not found`, 'NOT_FOUND');
    }
    if (rev.status === 'approved') {
      throw new AuthServiceError(409, 'Approved revision is already locked', 'REVISION_IMMUTABLE');
    }
    if (!rev.calculations.safetyChecksPassed) {
      throw new AuthServiceError(
        422,
        rev.calculations.hardSafetyErrors.join(' '),
        'SAFETY_VALIDATION_FAILED',
      );
    }

    rev.status = 'submitted';
    design.status = 'submitted';
    design.rowVersion += 1;
    design.updatedAt = new Date().toISOString();

    return { design, revision: rev };
  }

  approveOrRejectRevision(
    claims: AccessTokenClaims,
    designId: string,
    decision: 'approved' | 'rejected',
    reviewNotes: string,
    revisionNumber?: number,
  ) {
    const design = this.designs.get(designId);
    if (!design || design.organizationId !== claims.orgId) {
      throw new AuthServiceError(404, 'Solar design not found in active organization', 'NOT_FOUND');
    }
    this.customersSurveys.getProject(claims, design.projectId);

    const revs = this.revisions.get(designId) ?? [];
    const targetRevNumber = revisionNumber ?? design.currentRevisionNumber;
    const rev = revs.find((r) => r.revisionNumber === targetRevNumber);
    if (!rev) {
      throw new AuthServiceError(404, `Revision ${targetRevNumber} not found`, 'NOT_FOUND');
    }
    if (rev.status === 'approved') {
      throw new AuthServiceError(409, 'Revision is already approved and immutable', 'REVISION_IMMUTABLE');
    }
    if (decision === 'approved' && !rev.calculations.safetyChecksPassed) {
      throw new AuthServiceError(
        422,
        `Cannot approve unsafe electrical design: ${rev.calculations.hardSafetyErrors.join(' ')}`,
        'SAFETY_VALIDATION_FAILED',
      );
    }

    const now = new Date().toISOString();
    rev.status = decision;
    if (decision === 'approved') {
      rev.approvedAt = now;
      design.status = 'approved';
      this.customersSurveys.advanceProjectStage(claims, design.projectId, 'design_approved');
    } else {
      design.status = 'draft';
    }
    design.rowVersion += 1;
    design.updatedAt = now;

    const approval: DesignApprovalRecord = {
      id: randomUUID(),
      organizationId: claims.orgId,
      designRevisionId: rev.id,
      reviewerUserId: claims.sub,
      reviewerRole: claims.role,
      decision,
      reviewNotes: reviewNotes.trim(),
      decidedAt: now,
    };

    const existingApprovals = this.approvals.get(designId) ?? [];
    existingApprovals.push(approval);
    this.approvals.set(designId, existingApprovals);

    return {
      design,
      revision: rev,
      approval,
      approvals: [...existingApprovals],
    };
  }

  applyOfflineSyncedDraft(
    claims: AccessTokenClaims,
    entityId: string,
    operationType: 'create' | 'update' | 'delete',
    payload: Record<string, unknown>,
  ) {
    if (operationType === 'create' && !this.designs.has(entityId)) {
      const projectId = typeof payload.projectId === 'string' ? payload.projectId : '';
      const calcInput = payload.calculationInput as SolarDesignCalculationInput | undefined;
      if (projectId && calcInput) {
        try {
          this.createDesign(claims, {
            id: entityId,
            projectId,
            siteSurveyId: typeof payload.siteSurveyId === 'string' ? payload.siteSurveyId : null,
            title: typeof payload.title === 'string' ? payload.title : 'Offline Solar Design Draft',
            notes: typeof payload.notes === 'string' ? payload.notes : '',
            calculationInput: calcInput,
          });
        } catch {
          // Project/validation errors do not crash batch ingestion
        }
      }
    } else if (operationType === 'update') {
      const existing = this.designs.get(entityId);
      const calcInput = payload.calculationInput as SolarDesignCalculationInput | undefined;
      if (existing && existing.organizationId === claims.orgId && calcInput) {
        try {
          this.updateDraftRevision(claims, entityId, existing.currentRevisionNumber, {
            baseRowVersion: existing.rowVersion,
            notes: typeof payload.notes === 'string' ? payload.notes : undefined,
            calculationInput: calcInput,
          });
        } catch {
          // Immutable revision or conflict remains safely isolated
        }
      }
    }
  }
}
