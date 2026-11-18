import { randomUUID } from 'node:crypto';
import {
  addDaysIsoDate,
  isAssetWarrantyActive,
  UserRole,
  type AssetRegisterRecord,
  type MaintenanceScheduleRecord,
  type MaintenanceScheduleType,
  type ServiceTicketPriority,
  type ServiceTicketRecord,
  type ServiceTicketStatus,
  type ServiceTicketType,
  type ServiceVisitRecord,
  type WarrantyClaimRecord,
} from '../packages/domain/src/index.ts';
import { AuthServiceError, type AccessTokenClaims } from './auth-service.ts';
import type { InMemoryCommissioningService } from './commissioning-service.ts';
import type { InMemoryCustomersSurveysService } from './customers-surveys-service.ts';

export class InMemoryMaintenanceService {
  private readonly schedules = new Map<string, MaintenanceScheduleRecord>();
  private readonly tickets = new Map<string, ServiceTicketRecord>();
  private readonly warrantyClaims = new Map<string, WarrantyClaimRecord>();

  constructor(
    private readonly customersSurveys: InMemoryCustomersSurveysService,
    private readonly commissioningService: InMemoryCommissioningService,
  ) {}

  private assertTechnicianTicketAccess(claims: AccessTokenClaims, ticket: ServiceTicketRecord): void {
    if (claims.role !== UserRole.FIELD_TECHNICIAN) return;
    if (ticket.assignedTechnicianId === claims.sub) return;
    const project = this.customersSurveys.getProject(claims, ticket.projectId);
    if (!project.assignedUserIds.includes(claims.sub)) {
      throw new AuthServiceError(
        403,
        'Field Technician is not assigned to this maintenance ticket',
        'FORBIDDEN',
      );
    }
  }

  listSchedules(claims: AccessTokenClaims, projectId?: string): MaintenanceScheduleRecord[] {
    return [...this.schedules.values()]
      .filter((s) => s.organizationId === claims.orgId)
      .filter((s) => !projectId || s.projectId === projectId)
      .sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));
  }

  createSchedule(
    claims: AccessTokenClaims,
    input: {
      projectId: string;
      scheduleType: MaintenanceScheduleType;
      intervalDays: number;
      nextDueDate: string;
      isActive?: boolean;
    },
  ): MaintenanceScheduleRecord {
    const project = this.customersSurveys.getProject(claims, input.projectId);
    if (input.intervalDays <= 0) {
      throw new AuthServiceError(400, 'Interval days must be greater than zero', 'INVALID_INTERVAL');
    }
    const now = new Date().toISOString();
    const record: MaintenanceScheduleRecord = {
      id: randomUUID(),
      organizationId: claims.orgId,
      projectId: project.id,
      scheduleType: input.scheduleType,
      intervalDays: input.intervalDays,
      nextDueDate: input.nextDueDate,
      isActive: input.isActive ?? true,
      lastTriggeredAt: null,
      rowVersion: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.schedules.set(record.id, record);
    return record;
  }

  triggerSchedule(
    claims: AccessTokenClaims,
    scheduleId: string,
  ): { schedule: MaintenanceScheduleRecord; ticket: ServiceTicketRecord } {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule || schedule.organizationId !== claims.orgId) {
      throw new AuthServiceError(404, 'Maintenance schedule not found', 'NOT_FOUND');
    }
    if (!schedule.isActive) {
      throw new AuthServiceError(409, 'Maintenance schedule is inactive', 'SCHEDULE_INACTIVE');
    }

    const ticketType: ServiceTicketType =
      schedule.scheduleType === 'cleaning' ? 'cleaning' : 'preventive';
    const labelMap: Record<MaintenanceScheduleType, string> = {
      cleaning: 'Scheduled Solar Array Module Cleaning',
      preventive: 'Scheduled Preventive Maintenance Inspection',
      inverter_check: 'Scheduled Inverter & String Diagnostics Check',
    };

    const ticket = this.createTicket(claims, {
      projectId: schedule.projectId,
      ticketType,
      priority: 'medium',
      summary: labelMap[schedule.scheduleType],
      description: `Auto-generated preventive visit for ${schedule.scheduleType} schedule (due ${schedule.nextDueDate}).`,
    });

    const now = new Date().toISOString();
    schedule.lastTriggeredAt = now;
    schedule.nextDueDate = addDaysIsoDate(schedule.nextDueDate, schedule.intervalDays);
    schedule.rowVersion += 1;
    schedule.updatedAt = now;

    return { schedule, ticket };
  }

  listTickets(
    claims: AccessTokenClaims,
    filters?: { projectId?: string; assetId?: string; status?: ServiceTicketStatus },
  ): ServiceTicketRecord[] {
    return [...this.tickets.values()]
      .filter((t) => t.organizationId === claims.orgId)
      .filter((t) => !filters?.projectId || t.projectId === filters.projectId)
      .filter((t) => !filters?.assetId || t.assetId === filters.assetId)
      .filter((t) => !filters?.status || t.status === filters.status)
      .filter((t) => {
        if (claims.role !== UserRole.FIELD_TECHNICIAN) return true;
        if (t.assignedTechnicianId === claims.sub) return true;
        try {
          const p = this.customersSurveys.getProject(claims, t.projectId);
          return p.assignedUserIds.includes(claims.sub);
        } catch {
          return false;
        }
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  getTicket(claims: AccessTokenClaims, ticketId: string): ServiceTicketRecord {
    const ticket = this.tickets.get(ticketId);
    if (!ticket || ticket.organizationId !== claims.orgId) {
      throw new AuthServiceError(404, 'Service ticket not found in active organization', 'NOT_FOUND');
    }
    this.assertTechnicianTicketAccess(claims, ticket);
    return ticket;
  }

  createTicket(
    claims: AccessTokenClaims,
    input: {
      id?: string;
      projectId: string;
      assetId?: string | null;
      ticketType: ServiceTicketType;
      priority?: ServiceTicketPriority;
      summary: string;
      description: string;
    },
  ): ServiceTicketRecord {
    const project = this.customersSurveys.getProject(claims, input.projectId);
    let resolvedAssetId: string | null = null;
    if (input.assetId) {
      const asset = this.commissioningService.getAsset(claims, input.assetId);
      if (asset.projectId !== project.id) {
        throw new AuthServiceError(
          400,
          'Referenced asset does not belong to the specified project',
          'ASSET_PROJECT_MISMATCH',
        );
      }
      resolvedAssetId = asset.id;
    }

    const orgCount = [...this.tickets.values()].filter((t) => t.organizationId === claims.orgId).length;
    const now = new Date().toISOString();
    const ticket: ServiceTicketRecord = {
      id: input.id ?? randomUUID(),
      organizationId: claims.orgId,
      projectId: project.id,
      assetId: resolvedAssetId,
      ticketNumber: `TKT-${String(orgCount + 1).padStart(4, '0')}`,
      ticketType: input.ticketType,
      priority: input.priority ?? 'medium',
      status: 'open',
      summary: input.summary.trim(),
      description: input.description.trim(),
      assignedTechnicianId: null,
      visits: [],
      offlineNotes: [],
      rowVersion: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.tickets.set(ticket.id, ticket);
    return ticket;
  }

  assignTechnician(
    claims: AccessTokenClaims,
    ticketId: string,
    technicianUserId: string,
  ): ServiceTicketRecord {
    const ticket = this.getTicket(claims, ticketId);
    if (ticket.status === 'closed') {
      throw new AuthServiceError(409, 'Closed ticket cannot be reassigned', 'TICKET_CLOSED');
    }
    ticket.assignedTechnicianId = technicianUserId;
    if (ticket.status === 'open') {
      ticket.status = 'assigned';
    }
    ticket.rowVersion += 1;
    ticket.updatedAt = new Date().toISOString();
    this.customersSurveys.addProjectAssignee(claims, ticket.projectId, technicianUserId);
    return ticket;
  }

  updateTicketStatus(
    claims: AccessTokenClaims,
    ticketId: string,
    input: { baseRowVersion: number; status: ServiceTicketStatus },
  ): ServiceTicketRecord {
    const ticket = this.getTicket(claims, ticketId);
    if (input.baseRowVersion !== ticket.rowVersion) {
      throw new AuthServiceError(
        409,
        `Ticket version conflict (expected ${ticket.rowVersion}, got ${input.baseRowVersion})`,
        'VERSION_CONFLICT',
      );
    }
    if (ticket.status === 'closed') {
      throw new AuthServiceError(409, 'Closed ticket cannot change status', 'TICKET_CLOSED');
    }
    ticket.status = input.status;
    ticket.rowVersion += 1;
    ticket.updatedAt = new Date().toISOString();
    return ticket;
  }

  addServiceVisit(
    claims: AccessTokenClaims,
    ticketId: string,
    input: { findings: string; actionsTaken: string },
  ): { ticket: ServiceTicketRecord; visit: ServiceVisitRecord } {
    const ticket = this.getTicket(claims, ticketId);
    if (ticket.status === 'closed') {
      throw new AuthServiceError(409, 'Cannot log visit on a closed service ticket', 'TICKET_CLOSED');
    }
    const now = new Date().toISOString();
    const visit: ServiceVisitRecord = {
      id: randomUUID(),
      organizationId: claims.orgId,
      serviceTicketId: ticket.id,
      technicianUserId: claims.sub,
      visitedAt: now,
      findings: input.findings.trim(),
      actionsTaken: input.actionsTaken.trim(),
      rowVersion: 1,
    };
    ticket.visits.push(visit);
    if (ticket.status === 'open' || ticket.status === 'assigned') {
      ticket.status = 'in_progress';
    }
    ticket.rowVersion += 1;
    ticket.updatedAt = now;
    return { ticket, visit };
  }

  listWarrantyClaims(claims: AccessTokenClaims, assetId?: string): WarrantyClaimRecord[] {
    return [...this.warrantyClaims.values()]
      .filter((w) => w.organizationId === claims.orgId)
      .filter((w) => !assetId || w.assetId === assetId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  createWarrantyClaim(
    claims: AccessTokenClaims,
    input: { assetId: string; serviceTicketId?: string | null; faultDescription: string },
  ): WarrantyClaimRecord {
    const asset = this.commissioningService.getAsset(claims, input.assetId);
    let ticketId: string | null = null;
    if (input.serviceTicketId) {
      const ticket = this.getTicket(claims, input.serviceTicketId);
      ticketId = ticket.id;
    }

    const orgCount = [...this.warrantyClaims.values()].filter(
      (w) => w.organizationId === claims.orgId,
    ).length;
    const now = new Date().toISOString();
    const claim: WarrantyClaimRecord = {
      id: randomUUID(),
      organizationId: claims.orgId,
      assetId: asset.id,
      serviceTicketId: ticketId,
      claimNumber: `WRN-${String(orgCount + 1).padStart(4, '0')}`,
      status: 'draft',
      faultDescription: input.faultDescription.trim(),
      submittedAt: null,
      resolutionNotes: null,
      replacementSerialNumber: null,
      rowVersion: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.warrantyClaims.set(claim.id, claim);
    return claim;
  }

  submitWarrantyClaim(claims: AccessTokenClaims, claimId: string): WarrantyClaimRecord {
    const claim = this.warrantyClaims.get(claimId);
    if (!claim || claim.organizationId !== claims.orgId) {
      throw new AuthServiceError(404, 'Warranty claim not found in active organization', 'NOT_FOUND');
    }
    if (claim.status !== 'draft') {
      throw new AuthServiceError(409, 'Warranty claim already submitted', 'INVALID_STATE');
    }

    const asset = this.commissioningService.getAsset(claims, claim.assetId);
    if (!isAssetWarrantyActive(asset.warrantyExpiresOn)) {
      throw new AuthServiceError(
        422,
        `Asset warranty expired on ${asset.warrantyExpiresOn ?? 'unknown date'}; cannot submit manufacturer warranty claim`,
        'WARRANTY_EXPIRED',
      );
    }

    const now = new Date().toISOString();
    claim.status = 'submitted';
    claim.submittedAt = now;
    claim.rowVersion += 1;
    claim.updatedAt = now;
    return claim;
  }

  decideWarrantyClaim(
    claims: AccessTokenClaims,
    claimId: string,
    input: {
      decision: 'approved' | 'replaced' | 'rejected';
      resolutionNotes: string;
      replacementSerialNumber?: string | null;
    },
  ): { claim: WarrantyClaimRecord; updatedAsset: AssetRegisterRecord } {
    const claim = this.warrantyClaims.get(claimId);
    if (!claim || claim.organizationId !== claims.orgId) {
      throw new AuthServiceError(404, 'Warranty claim not found in active organization', 'NOT_FOUND');
    }
    if (claim.status === 'rejected' || claim.status === 'replaced') {
      throw new AuthServiceError(409, 'Finalized warranty claim is immutable', 'WARRANTY_FINALIZED');
    }
    if (claim.status === 'draft') {
      throw new AuthServiceError(409, 'Warranty claim must be submitted before decision', 'NOT_SUBMITTED');
    }

    let asset = this.commissioningService.getAsset(claims, claim.assetId);
    if (input.decision === 'replaced') {
      const replacement = input.replacementSerialNumber?.trim();
      if (!replacement) {
        throw new AuthServiceError(
          422,
          'Replacement serial number is required when marking a warranty claim replaced',
          'REPLACEMENT_SERIAL_REQUIRED',
        );
      }
      asset = this.commissioningService.updateAssetReplacementSerial(claims, asset.id, replacement);
      claim.replacementSerialNumber = replacement;
    }

    claim.status = input.decision;
    claim.resolutionNotes = input.resolutionNotes.trim();
    claim.rowVersion += 1;
    claim.updatedAt = new Date().toISOString();

    return { claim, updatedAsset: asset };
  }

  lookupQrAssetWorkspace(claims: AccessTokenClaims, qrToken: string): {
    asset: AssetRegisterRecord;
    warrantyActive: boolean;
    tickets: ServiceTicketRecord[];
    warrantyClaims: WarrantyClaimRecord[];
    schedules: MaintenanceScheduleRecord[];
  } {
    const asset = this.commissioningService.findAssetByQrToken(claims, qrToken);
    return {
      asset,
      warrantyActive: isAssetWarrantyActive(asset.warrantyExpiresOn),
      tickets: this.listTickets(claims, { assetId: asset.id }),
      warrantyClaims: this.listWarrantyClaims(claims, asset.id),
      schedules: this.listSchedules(claims, asset.projectId),
    };
  }

  applyOfflineSyncedMaintenanceNote(
    claims: AccessTokenClaims,
    entityId: string,
    _operationType: 'create' | 'update' | 'delete',
    payload: Record<string, unknown>,
  ): void {
    const ticketId =
      typeof payload.serviceTicketId === 'string' ? payload.serviceTicketId : entityId;
    const ticket = this.tickets.get(ticketId);
    if (!ticket || ticket.organizationId !== claims.orgId) {
      return;
    }
    const noteText =
      typeof payload.note === 'string' && payload.note.trim().length > 0
        ? payload.note.trim()
        : typeof payload.findings === 'string'
          ? payload.findings.trim()
          : 'Offline field diagnostic note recorded';
    const actionsTaken =
      typeof payload.actionsTaken === 'string' && payload.actionsTaken.trim().length > 0
        ? payload.actionsTaken.trim()
        : 'Logged offline on technician mobile client';

    const now = new Date().toISOString();
    if (!ticket.offlineNotes.some((n) => n.id === entityId)) {
      ticket.offlineNotes.push({
        id: entityId,
        authorUserId: claims.sub,
        note: noteText,
        syncedAt: now,
      });
      ticket.visits.push({
        id: randomUUID(),
        organizationId: claims.orgId,
        serviceTicketId: ticket.id,
        technicianUserId: claims.sub,
        visitedAt: now,
        findings: noteText,
        actionsTaken,
        rowVersion: 1,
      });
      if (ticket.status === 'open' || ticket.status === 'assigned') {
        ticket.status = 'in_progress';
      }
      ticket.rowVersion += 1;
      ticket.updatedAt = now;
    }
  }
}
