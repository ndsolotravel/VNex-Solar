import type { PermissionKey } from './roles.ts';

export type NavSectionId =
  | 'overview'
  | 'customers'
  | 'surveys'
  | 'engineering'
  | 'inventory'
  | 'quotations'
  | 'finance'
  | 'installation'
  | 'safety'
  | 'commissioning'
  | 'maintenance'
  | 'sync'
  | 'admin';

export interface NavItem {
  id: NavSectionId;
  label: string;
  group: 'Operations' | 'Engineering & Supply' | 'Field & Safety' | 'Governance';
  targetPhase: string;
  offlineSupported: boolean;
  requiredPermission?: PermissionKey;
  description: string;
}

export const VNEX_NAVIGATION: ReadonlyArray<NavItem> = [
  {
    id: 'overview',
    label: 'Operations Overview',
    group: 'Operations',
    targetPhase: 'Phase 1',
    offlineSupported: true,
    description: 'Tenant-scoped executive workspace, module roadmap, and cross-platform architecture readiness.',
  },
  {
    id: 'customers',
    label: 'Customers & Projects',
    group: 'Operations',
    targetPhase: 'Phase 5',
    offlineSupported: true,
    requiredPermission: 'customers:read',
    description: 'Customer accounts, multi-site addresses, project stages, and document attachments.',
  },
  {
    id: 'surveys',
    label: 'Site Surveys',
    group: 'Operations',
    targetPhase: 'Phase 5',
    offlineSupported: true,
    requiredPermission: 'surveys:read',
    description: 'Offline-first roof measurements, shading hazards, CameraX site photos, and load profiles.',
  },
  {
    id: 'engineering',
    label: 'Solar Engineering',
    group: 'Engineering & Supply',
    targetPhase: 'Phase 6',
    offlineSupported: true,
    requiredPermission: 'engineering:read',
    description: 'Deterministic PV sizing, Voc temperature correction, MPPT checks, cable drop, and ROI/NPV.',
  },
  {
    id: 'inventory',
    label: 'Equipment & Inventory',
    group: 'Engineering & Supply',
    targetPhase: 'Phase 7',
    offlineSupported: false,
    requiredPermission: 'inventory:read',
    description: 'Cached catalogs, POs, transactional warehouse stock, reservations, and serial tracking.',
  },
  {
    id: 'quotations',
    label: 'Quotations',
    group: 'Engineering & Supply',
    targetPhase: 'Phase 8',
    offlineSupported: true,
    requiredPermission: 'quotations:read',
    description: 'Equipment BOM, labor/transport costing, margin rules, immutable approved versions, and PDFs.',
  },
  {
    id: 'finance',
    label: 'Billing & Ledger',
    group: 'Engineering & Supply',
    targetPhase: 'Phase 8',
    offlineSupported: false,
    requiredPermission: 'finance:read',
    description: 'Exact decimal PKR/international invoicing, payment allocations, credit notes, and journals.',
  },
  {
    id: 'installation',
    label: 'Installation Jobs',
    group: 'Field & Safety',
    targetPhase: 'Phase 9',
    offlineSupported: true,
    requiredPermission: 'installation:read',
    description: 'Team schedules, task checklists, daily site diaries, material issues, and progress photos.',
  },
  {
    id: 'safety',
    label: 'Safety & Inspection',
    group: 'Field & Safety',
    targetPhase: 'Phase 10',
    offlineSupported: true,
    requiredPermission: 'safety:read',
    description: 'Risk assessments, PPE/height checks, electrical isolation, test readings, and hard safety gates.',
  },
  {
    id: 'commissioning',
    label: 'Commissioning',
    group: 'Field & Safety',
    targetPhase: 'Phase 11',
    offlineSupported: false,
    requiredPermission: 'commissioning:read',
    description: 'Human-approved commissioning certificates, handover packs, and asset register creation.',
  },
  {
    id: 'maintenance',
    label: 'Maintenance & Warranty',
    group: 'Field & Safety',
    targetPhase: 'Phase 12',
    offlineSupported: true,
    requiredPermission: 'maintenance:read',
    description: 'QR asset register, preventive schedules, service tickets, and inverter/module warranty claims.',
  },
  {
    id: 'sync',
    label: 'Offline Sync Engine',
    group: 'Governance',
    targetPhase: 'Phase 4 & 13',
    offlineSupported: true,
    description: 'Room SQLite outbox queue, idempotency keys, SHA-256 media uploads, and conflict resolution.',
  },
  {
    id: 'admin',
    label: 'Tenant & Cost Admin',
    group: 'Governance',
    targetPhase: 'Phase 3 & 14',
    offlineSupported: false,
    requiredPermission: 'org:manage',
    description: 'Organization settings, RBAC policies, audit trail, PostgreSQL RLS isolation, and VPS cost monitor.',
  },
];
