import { randomUUID } from 'node:crypto';
import {
  UserRole,
  type DailySiteLogRecord,
  type InstallationJobRecord,
  type InstallationMaterialIssueRecord,
  type InstallationPhotoRecord,
  type InstallationTaskRecord,
  type InstallationTaskStatus,
  type TeamAssignmentRecord,
} from '../packages/domain/src/index.ts';
import { AuthServiceError, type AccessTokenClaims } from './auth-service.ts';
import type { InMemoryCustomersSurveysService } from './customers-surveys-service.ts';
import type { InMemoryInventoryService } from './inventory-service.ts';

const DEFAULT_SOLAR_TASKS = [
  'Verify roof layout, structural anchors & waterproofing seals',
  'Assemble mounting rails, torque clamps & equipotential earthing',
  'Mount inverter enclosure, DC/AC surge arrestors & isolation breakers',
  'Pull solar DC XLPO strings, crimp MC4 connectors & label conduits',
];

export class InMemoryInstallationService {
  private readonly jobs = new Map<string, InstallationJobRecord>();
  private readonly idempotentMaterialIssues = new Map<
    string,
    { job: InstallationJobRecord; materialIssue: InstallationMaterialIssueRecord }
  >();
  private readonly pendingPhotoUploads = new Map<
    string,
    {
      fileAttachmentId: string;
      organizationId: string;
      installationJobId: string;
      filename: string;
      mimeType: string;
      byteSize: number;
      sha256Checksum: string;
      storageKey: string;
      caption: string | null;
      status: 'pending' | 'verified';
    }
  >();

  constructor(
    private readonly customersSurveys: InMemoryCustomersSurveysService,
    private readonly inventory: InMemoryInventoryService,
  ) {}

  private canTechnicianAccessJob(claims: AccessTokenClaims, job: InstallationJobRecord): boolean {
    if (claims.role !== UserRole.FIELD_TECHNICIAN) return true;
    const inTeam = job.teamAssignments.some((a) => a.userId === claims.sub);
    const assignedTask = job.tasks.some((t) => t.assignedUserId === claims.sub);
    if (inTeam || assignedTask) return true;
    try {
      const proj = this.customersSurveys.getProject(claims, job.projectId);
      return proj.assignedUserIds.includes(claims.sub);
    } catch {
      return false;
    }
  }

  listJobs(claims: AccessTokenClaims, projectId?: string): InstallationJobRecord[] {
    return [...this.jobs.values()]
      .filter((j) => j.organizationId === claims.orgId)
      .filter((j) => !projectId || j.projectId === projectId)
      .filter((j) => this.canTechnicianAccessJob(claims, j))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  getJob(claims: AccessTokenClaims, jobId: string): InstallationJobRecord {
    const job = this.jobs.get(jobId);
    if (!job || job.organizationId !== claims.orgId) {
      throw new AuthServiceError(404, 'Installation job not found in active organization', 'NOT_FOUND');
    }
    if (!this.canTechnicianAccessJob(claims, job)) {
      throw new AuthServiceError(403, 'Field Technician not assigned to this installation job', 'FORBIDDEN');
    }
    return job;
  }

  createJob(
    claims: AccessTokenClaims,
    input: {
      projectId: string;
      supervisorUserId?: string;
      scheduledStartDate: string;
      scheduledEndDate?: string | null;
      taskTitles?: string[];
      teamAssignments?: Array<{ userId: string; fullName: string; roleOnSite: string }>;
    },
  ): InstallationJobRecord {
    const project = this.customersSurveys.getProject(claims, input.projectId);
    const jobId = randomUUID();
    const now = new Date().toISOString();
    const orgCount = [...this.jobs.values()].filter((j) => j.organizationId === claims.orgId).length;

    const titles =
      input.taskTitles && input.taskTitles.length > 0 ? input.taskTitles : DEFAULT_SOLAR_TASKS;

    const tasks: InstallationTaskRecord[] = titles.map((t, idx) => ({
      id: randomUUID(),
      organizationId: claims.orgId,
      installationJobId: jobId,
      assignedUserId: input.teamAssignments?.[0]?.userId ?? null,
      title: t.trim(),
      status: 'pending',
      sortOrder: idx + 1,
      completedAt: null,
      rowVersion: 1,
    }));

    const teamAssignments: TeamAssignmentRecord[] = (input.teamAssignments ?? []).map((m) => ({
      id: randomUUID(),
      organizationId: claims.orgId,
      installationJobId: jobId,
      userId: m.userId,
      fullName: m.fullName.trim(),
      roleOnSite: m.roleOnSite.trim(),
    }));

    const job: InstallationJobRecord = {
      id: jobId,
      organizationId: claims.orgId,
      projectId: project.id,
      supervisorUserId: input.supervisorUserId ?? claims.sub,
      jobCode: `JOB-${String(orgCount + 1).padStart(4, '0')}`,
      scheduledStartDate: input.scheduledStartDate,
      scheduledEndDate: input.scheduledEndDate ?? null,
      status: 'scheduled',
      safetyCleared: false,
      tasks,
      teamAssignments,
      dailyLogs: [],
      materialIssues: [],
      photos: [],
      rowVersion: 1,
      createdAt: now,
      updatedAt: now,
    };

    this.jobs.set(jobId, job);
    for (const member of teamAssignments) {
      this.customersSurveys.addProjectAssignee(claims, project.id, member.userId);
    }
    this.customersSurveys.advanceProjectStage(claims, project.id, 'installation_scheduled');
    return job;
  }

  assignTeamMember(
    claims: AccessTokenClaims,
    jobId: string,
    input: { userId: string; fullName: string; roleOnSite: string },
  ): InstallationJobRecord {
    const job = this.getJob(claims, jobId);
    const existing = job.teamAssignments.find((t) => t.userId === input.userId);
    if (existing) {
      throw new AuthServiceError(409, 'User is already assigned to this installation job', 'DUPLICATE_ASSIGNMENT');
    }
    job.teamAssignments.push({
      id: randomUUID(),
      organizationId: claims.orgId,
      installationJobId: job.id,
      userId: input.userId,
      fullName: input.fullName.trim(),
      roleOnSite: input.roleOnSite.trim(),
    });
    // Assign unassigned tasks to the newly added crew lead if none assigned yet
    for (const task of job.tasks) {
      if (!task.assignedUserId) {
        task.assignedUserId = input.userId;
      }
    }
    job.rowVersion += 1;
    job.updatedAt = new Date().toISOString();
    this.customersSurveys.addProjectAssignee(claims, job.projectId, input.userId);
    return job;
  }

  updateTaskStatus(
    claims: AccessTokenClaims,
    jobId: string,
    taskId: string,
    input: {
      baseRowVersion: number;
      status: InstallationTaskStatus;
      assignedUserId?: string | null;
    },
  ): { job: InstallationJobRecord; task: InstallationTaskRecord } {
    const job = this.getJob(claims, jobId);
    const task = job.tasks.find((t) => t.id === taskId);
    if (!task) {
      throw new AuthServiceError(404, 'Installation task not found', 'NOT_FOUND');
    }

    if (claims.role === UserRole.FIELD_TECHNICIAN) {
      const assignedToTask = task.assignedUserId === claims.sub;
      const inCrew = job.teamAssignments.some((m) => m.userId === claims.sub);
      if (!assignedToTask && !inCrew) {
        throw new AuthServiceError(
          403,
          'Field Technician can only update tasks on assigned jobs',
          'FORBIDDEN',
        );
      }
    }

    if (task.rowVersion !== input.baseRowVersion) {
      throw new AuthServiceError(
        409,
        `Task rowVersion conflict: expected ${task.rowVersion}, got ${input.baseRowVersion}`,
        'VERSION_CONFLICT',
      );
    }

    if (job.status === 'safety_blocked' && input.status === 'completed') {
      throw new AuthServiceError(
        422,
        'Installation job is safety-blocked pending hazard clearance',
        'SAFETY_GATE_BLOCKED',
      );
    }

    task.status = input.status;
    if (input.assignedUserId !== undefined) {
      task.assignedUserId = input.assignedUserId;
    }
    task.completedAt = input.status === 'completed' ? new Date().toISOString() : null;
    task.rowVersion += 1;

    if (job.status === 'scheduled' && (input.status === 'in_progress' || input.status === 'completed')) {
      job.status = 'in_progress';
      this.customersSurveys.advanceProjectStage(claims, job.projectId, 'installation_in_progress');
    }
    job.rowVersion += 1;
    job.updatedAt = new Date().toISOString();
    return { job, task };
  }

  setJobSafetyGate(claims: AccessTokenClaims, jobId: string, safetyCleared: boolean, blocked: boolean) {
    const job = this.getJob(claims, jobId);
    job.safetyCleared = safetyCleared;
    if (blocked) {
      job.status = 'safety_blocked';
    } else if (job.status === 'safety_blocked') {
      job.status = 'in_progress';
    }
    job.rowVersion += 1;
    job.updatedAt = new Date().toISOString();
    return job;
  }

  completeJob(claims: AccessTokenClaims, jobId: string): InstallationJobRecord {
    const job = this.getJob(claims, jobId);
    if (job.status === 'safety_blocked') {
      throw new AuthServiceError(
        422,
        'Cannot complete installation while safety gate is blocked',
        'SAFETY_GATE_BLOCKED',
      );
    }
    const incomplete = job.tasks.filter((t) => t.status !== 'completed');
    if (incomplete.length > 0) {
      throw new AuthServiceError(
        409,
        `${incomplete.length} installation task(s) are not completed yet`,
        'INCOMPLETE_TASKS',
      );
    }

    job.status = 'completed';
    job.rowVersion += 1;
    job.updatedAt = new Date().toISOString();
    this.customersSurveys.advanceProjectStage(claims, job.projectId, 'installation_completed');
    return job;
  }

  addDailySiteLog(
    claims: AccessTokenClaims,
    jobId: string,
    input: { logDate: string; weatherConditions?: string | null; workSummary: string },
  ): { job: InstallationJobRecord; log: DailySiteLogRecord } {
    const job = this.getJob(claims, jobId);
    const log: DailySiteLogRecord = {
      id: randomUUID(),
      organizationId: claims.orgId,
      installationJobId: job.id,
      logDate: input.logDate,
      authorUserId: claims.sub,
      weatherConditions: input.weatherConditions?.trim() || null,
      workSummary: input.workSummary.trim(),
      rowVersion: 1,
      createdAt: new Date().toISOString(),
    };
    job.dailyLogs.unshift(log);
    job.rowVersion += 1;
    job.updatedAt = new Date().toISOString();
    return { job, log };
  }

  issueJobMaterial(
    claims: AccessTokenClaims,
    jobId: string,
    input: {
      idempotencyKey: string;
      warehouseId: string;
      equipmentCatalogId: string;
      quantity: number;
      reservationId?: string;
      serialNumbers?: string[];
      notes?: string;
    },
  ) {
    const idemKey = `${claims.orgId}:job:${jobId}:${input.idempotencyKey}`;
    const cached = this.idempotentMaterialIssues.get(idemKey);
    if (cached) {
      return { deduplicated: true, ...cached };
    }

    const job = this.getJob(claims, jobId);
    const catalogItem = this.inventory
      .listCatalog(claims)
      .find((c) => c.id === input.equipmentCatalogId);
    if (!catalogItem) {
      throw new AuthServiceError(404, 'Equipment SKU not found in active organization', 'NOT_FOUND');
    }

    const issueResult = this.inventory.issueToProject(claims, {
      idempotencyKey: `job-${job.id}-${input.idempotencyKey}`,
      projectId: job.projectId,
      warehouseId: input.warehouseId,
      equipmentCatalogId: input.equipmentCatalogId,
      quantity: input.quantity,
      reservationId: input.reservationId,
      serialNumbers: input.serialNumbers,
      notes: input.notes ?? `Material issued for ${job.jobCode}`,
    });

    const materialIssue: InstallationMaterialIssueRecord = {
      id: randomUUID(),
      organizationId: claims.orgId,
      installationJobId: job.id,
      warehouseId: input.warehouseId,
      equipmentCatalogId: catalogItem.id,
      sku: catalogItem.sku,
      modelName: catalogItem.modelName,
      stockMovementId: issueResult.movement.id,
      quantityIssued: input.quantity,
      serialNumbers: (issueResult.serials ?? []).map((s) => s.serialNumber),
      issuedByUserId: claims.sub,
      issuedAt: new Date().toISOString(),
    };

    job.materialIssues.unshift(materialIssue);
    job.rowVersion += 1;
    job.updatedAt = new Date().toISOString();

    const payload = { job, materialIssue };
    this.idempotentMaterialIssues.set(idemKey, payload);
    return { deduplicated: false, ...payload };
  }

  presignInstallationPhoto(
    claims: AccessTokenClaims,
    jobId: string,
    input: {
      filename: string;
      mimeType: string;
      byteSize: number;
      sha256Checksum: string;
      caption?: string | null;
    },
  ) {
    const job = this.getJob(claims, jobId);
    const fileAttachmentId = randomUUID();
    const storageKey = `org/${claims.orgId}/installations/${job.id}/${fileAttachmentId}-${input.filename}`;
    this.pendingPhotoUploads.set(fileAttachmentId, {
      fileAttachmentId,
      organizationId: claims.orgId,
      installationJobId: job.id,
      filename: input.filename,
      mimeType: input.mimeType,
      byteSize: input.byteSize,
      sha256Checksum: input.sha256Checksum.toLowerCase(),
      storageKey,
      caption: input.caption ?? null,
      status: 'pending',
    });

    return {
      fileAttachmentId,
      storageKey,
      uploadMethod: 'PUT',
      uploadUrl: `https://storage.vnex.internal/upload/${storageKey}?sig=${randomUUID()}`,
      expectedSha256: input.sha256Checksum.toLowerCase(),
      expiresInSeconds: 300,
    };
  }

  commitInstallationPhoto(
    claims: AccessTokenClaims,
    jobId: string,
    input: { fileAttachmentId: string; sha256Checksum: string },
  ): InstallationPhotoRecord {
    const job = this.getJob(claims, jobId);
    const pending = this.pendingPhotoUploads.get(input.fileAttachmentId);
    if (
      !pending ||
      pending.organizationId !== claims.orgId ||
      pending.installationJobId !== job.id
    ) {
      throw new AuthServiceError(404, 'Presigned installation photo upload not found', 'NOT_FOUND');
    }
    if (pending.sha256Checksum !== input.sha256Checksum.toLowerCase()) {
      throw new AuthServiceError(
        422,
        'Uploaded file SHA-256 checksum does not match presigned digest',
        'CHECKSUM_MISMATCH',
      );
    }

    pending.status = 'verified';
    const photo: InstallationPhotoRecord = {
      id: randomUUID(),
      organizationId: claims.orgId,
      installationJobId: job.id,
      fileAttachmentId: pending.fileAttachmentId,
      filename: pending.filename,
      mimeType: pending.mimeType,
      byteSize: pending.byteSize,
      sha256Checksum: pending.sha256Checksum,
      caption: pending.caption,
      capturedAt: new Date().toISOString(),
    };
    job.photos.push(photo);
    job.rowVersion += 1;
    job.updatedAt = new Date().toISOString();
    return photo;
  }

  applyOfflineSyncedInstallationTask(
    claims: AccessTokenClaims,
    entityId: string,
    operationType: 'create' | 'update' | 'delete',
    payload: Record<string, unknown>,
  ) {
    if (operationType === 'delete') return;
    const jobId = typeof payload.installationJobId === 'string' ? payload.installationJobId : '';
    const status = typeof payload.status === 'string' ? (payload.status as InstallationTaskStatus) : 'in_progress';
    const baseRowVersion = typeof payload.baseRowVersion === 'number' ? payload.baseRowVersion : 1;

    if (!jobId) return;
    const job = this.jobs.get(jobId);
    if (!job || job.organizationId !== claims.orgId) return;

    const existingTask = job.tasks.find((t) => t.id === entityId);
    if (existingTask) {
      this.updateTaskStatus(claims, job.id, existingTask.id, {
        baseRowVersion,
        status,
      });
    } else if (typeof payload.workSummary === 'string') {
      this.addDailySiteLog(claims, job.id, {
        logDate:
          typeof payload.logDate === 'string'
            ? payload.logDate
            : new Date().toISOString().slice(0, 10),
        weatherConditions:
          typeof payload.weatherConditions === 'string' ? payload.weatherConditions : null,
        workSummary: payload.workSummary,
      });
    }
  }
}
