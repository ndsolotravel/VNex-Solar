export type InstallationJobStatus = 'scheduled' | 'safety_blocked' | 'in_progress' | 'completed';
export type InstallationTaskStatus = 'pending' | 'in_progress' | 'completed' | 'blocked';

export interface InstallationTaskRecord {
  id: string;
  organizationId: string;
  installationJobId: string;
  assignedUserId: string | null;
  title: string;
  status: InstallationTaskStatus;
  sortOrder: number;
  completedAt: string | null;
  rowVersion: number;
}

export interface TeamAssignmentRecord {
  id: string;
  organizationId: string;
  installationJobId: string;
  userId: string;
  fullName: string;
  roleOnSite: string;
}

export interface DailySiteLogRecord {
  id: string;
  organizationId: string;
  installationJobId: string;
  logDate: string;
  authorUserId: string;
  weatherConditions: string | null;
  workSummary: string;
  rowVersion: number;
  createdAt: string;
}

export interface InstallationMaterialIssueRecord {
  id: string;
  organizationId: string;
  installationJobId: string;
  warehouseId: string;
  equipmentCatalogId: string;
  sku: string;
  modelName: string;
  stockMovementId: string;
  quantityIssued: number;
  serialNumbers: string[];
  issuedByUserId: string;
  issuedAt: string;
}

export interface InstallationPhotoRecord {
  id: string;
  organizationId: string;
  installationJobId: string;
  fileAttachmentId: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  sha256Checksum: string;
  caption: string | null;
  capturedAt: string;
}

export interface InstallationJobRecord {
  id: string;
  organizationId: string;
  projectId: string;
  supervisorUserId: string;
  jobCode: string;
  scheduledStartDate: string;
  scheduledEndDate: string | null;
  status: InstallationJobStatus;
  safetyCleared: boolean;
  tasks: InstallationTaskRecord[];
  teamAssignments: TeamAssignmentRecord[];
  dailyLogs: DailySiteLogRecord[];
  materialIssues: InstallationMaterialIssueRecord[];
  photos: InstallationPhotoRecord[];
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
}

export function computeInstallationProgress(tasks: ReadonlyArray<InstallationTaskRecord>): {
  total: number;
  completed: number;
  inProgress: number;
  blocked: number;
  pct: number;
} {
  const total = tasks.length;
  if (total === 0) {
    return { total: 0, completed: 0, inProgress: 0, blocked: 0, pct: 0 };
  }
  const completed = tasks.filter((t) => t.status === 'completed').length;
  const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
  const blocked = tasks.filter((t) => t.status === 'blocked').length;
  return {
    total,
    completed,
    inProgress,
    blocked,
    pct: Math.round((completed / total) * 100),
  };
}
