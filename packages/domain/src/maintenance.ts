export type MaintenanceScheduleType = 'cleaning' | 'preventive' | 'inverter_check';
export type ServiceTicketType = 'preventive' | 'corrective' | 'cleaning' | 'warranty';
export type ServiceTicketPriority = 'low' | 'medium' | 'high' | 'critical';
export type ServiceTicketStatus = 'open' | 'assigned' | 'in_progress' | 'resolved' | 'closed';
export type WarrantyClaimStatus = 'draft' | 'submitted' | 'approved' | 'replaced' | 'rejected';

export interface MaintenanceScheduleRecord {
  id: string;
  organizationId: string;
  projectId: string;
  scheduleType: MaintenanceScheduleType;
  intervalDays: number;
  nextDueDate: string;
  isActive: boolean;
  lastTriggeredAt: string | null;
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceVisitRecord {
  id: string;
  organizationId: string;
  serviceTicketId: string;
  technicianUserId: string;
  visitedAt: string;
  findings: string;
  actionsTaken: string;
  rowVersion: number;
}

export interface OfflineMaintenanceNote {
  id: string;
  authorUserId: string;
  note: string;
  syncedAt: string;
}

export interface ServiceTicketRecord {
  id: string;
  organizationId: string;
  projectId: string;
  assetId: string | null;
  ticketNumber: string;
  ticketType: ServiceTicketType;
  priority: ServiceTicketPriority;
  status: ServiceTicketStatus;
  summary: string;
  description: string;
  assignedTechnicianId: string | null;
  visits: ServiceVisitRecord[];
  offlineNotes: OfflineMaintenanceNote[];
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface WarrantyClaimRecord {
  id: string;
  organizationId: string;
  assetId: string;
  serviceTicketId: string | null;
  claimNumber: string;
  status: WarrantyClaimStatus;
  faultDescription: string;
  submittedAt: string | null;
  resolutionNotes: string | null;
  replacementSerialNumber: string | null;
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
}

export function isAssetWarrantyActive(
  warrantyExpiresOn: string | null,
  asOfIsoDate: string = new Date().toISOString().slice(0, 10),
): boolean {
  if (!warrantyExpiresOn) return false;
  return warrantyExpiresOn >= asOfIsoDate;
}

export function addDaysIsoDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
