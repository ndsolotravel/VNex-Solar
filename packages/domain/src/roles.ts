export enum UserRole {
  ORG_OWNER = 'ORG_OWNER',
  COMPANY_MANAGER = 'COMPANY_MANAGER',
  SOLAR_ENGINEER = 'SOLAR_ENGINEER',
  SALES_EXECUTIVE = 'SALES_EXECUTIVE',
  INSTALLATION_SUPERVISOR = 'INSTALLATION_SUPERVISOR',
  SAFETY_OFFICER = 'SAFETY_OFFICER',
  FINANCE_OFFICER = 'FINANCE_OFFICER',
  FIELD_TECHNICIAN = 'FIELD_TECHNICIAN',
  CUSTOMER = 'CUSTOMER',
}

export type PermissionKey =
  | 'org:manage'
  | 'users:manage'
  | 'customers:read'
  | 'customers:write'
  | 'surveys:read'
  | 'surveys:write'
  | 'engineering:read'
  | 'engineering:write'
  | 'engineering:approve'
  | 'inventory:read'
  | 'inventory:transact'
  | 'quotations:read'
  | 'quotations:write'
  | 'quotations:approve'
  | 'finance:read'
  | 'finance:post'
  | 'installation:read'
  | 'installation:update_assigned'
  | 'installation:manage'
  | 'safety:read'
  | 'safety:write'
  | 'safety:approve'
  | 'commissioning:read'
  | 'commissioning:approve'
  | 'maintenance:read'
  | 'maintenance:write'
  | 'infrastructure:read';

export interface RoleDefinition {
  role: UserRole;
  label: string;
  scopeSummary: string;
  permissions: ReadonlyArray<PermissionKey>;
}

export const ROLE_DEFINITIONS: Record<UserRole, RoleDefinition> = {
  [UserRole.ORG_OWNER]: {
    role: UserRole.ORG_OWNER,
    label: 'Organization Owner',
    scopeSummary: 'Full tenant governance, financial controls, role assignments, and infrastructure telemetry.',
    permissions: [
      'org:manage', 'users:manage', 'customers:read', 'customers:write', 'surveys:read', 'surveys:write',
      'engineering:read', 'engineering:write', 'engineering:approve', 'inventory:read', 'inventory:transact',
      'quotations:read', 'quotations:write', 'quotations:approve', 'finance:read', 'finance:post',
      'installation:read', 'installation:update_assigned', 'installation:manage',
      'safety:read', 'safety:write', 'safety:approve', 'commissioning:read', 'commissioning:approve',
      'maintenance:read', 'maintenance:write', 'infrastructure:read',
    ],
  },
  [UserRole.COMPANY_MANAGER]: {
    role: UserRole.COMPANY_MANAGER,
    label: 'Company Manager',
    scopeSummary: 'Operational oversight across projects, inventory, quotations, and installation teams.',
    permissions: [
      'users:manage', 'customers:read', 'customers:write', 'surveys:read', 'surveys:write',
      'engineering:read', 'inventory:read', 'inventory:transact', 'quotations:read', 'quotations:write',
      'quotations:approve', 'finance:read', 'installation:read', 'installation:manage',
      'safety:read', 'commissioning:read', 'maintenance:read', 'maintenance:write', 'infrastructure:read',
    ],
  },
  [UserRole.SOLAR_ENGINEER]: {
    role: UserRole.SOLAR_ENGINEER,
    label: 'Solar Engineer',
    scopeSummary: 'Site survey review, PV sizing, string/MPPT calculations, design revisions, and engineering approvals.',
    permissions: [
      'customers:read', 'surveys:read', 'surveys:write', 'engineering:read', 'engineering:write',
      'engineering:approve', 'inventory:read', 'quotations:read', 'installation:read',
      'safety:read', 'commissioning:read', 'commissioning:approve', 'maintenance:read',
    ],
  },
  [UserRole.SALES_EXECUTIVE]: {
    role: UserRole.SALES_EXECUTIVE,
    label: 'Sales Executive',
    scopeSummary: 'Customer onboarding, site survey scheduling, and quotation drafting. Cannot approve engineering or commissioning.',
    permissions: [
      'customers:read', 'customers:write', 'surveys:read', 'surveys:write',
      'engineering:read', 'inventory:read', 'quotations:read', 'quotations:write',
    ],
  },
  [UserRole.INSTALLATION_SUPERVISOR]: {
    role: UserRole.INSTALLATION_SUPERVISOR,
    label: 'Installation Supervisor',
    scopeSummary: 'Crew scheduling, material requisitions, daily site logs, and safety gate readiness.',
    permissions: [
      'customers:read', 'surveys:read', 'engineering:read', 'inventory:read', 'inventory:transact',
      'installation:read', 'installation:update_assigned', 'installation:manage',
      'safety:read', 'safety:write', 'commissioning:read', 'maintenance:read',
    ],
  },
  [UserRole.SAFETY_OFFICER]: {
    role: UserRole.SAFETY_OFFICER,
    label: 'Safety Officer',
    scopeSummary: 'Risk assessments, PPE/height checklists, electrical isolation, corrective actions, and safety approvals. No finance writes.',
    permissions: [
      'customers:read', 'surveys:read', 'engineering:read', 'installation:read',
      'safety:read', 'safety:write', 'safety:approve', 'commissioning:read', 'maintenance:read',
    ],
  },
  [UserRole.FINANCE_OFFICER]: {
    role: UserRole.FINANCE_OFFICER,
    label: 'Finance Officer',
    scopeSummary: 'Invoices, payment allocations, credit notes, tax rules, and double-entry ledgers. Cannot approve electrical designs.',
    permissions: [
      'customers:read', 'quotations:read', 'quotations:approve', 'finance:read', 'finance:post',
      'inventory:read', 'maintenance:read', 'infrastructure:read',
    ],
  },
  [UserRole.FIELD_TECHNICIAN]: {
    role: UserRole.FIELD_TECHNICIAN,
    label: 'Field Technician',
    scopeSummary: 'Offline site surveys, assigned installation task updates, safety checklists, and service visits.',
    permissions: [
      'customers:read', 'surveys:read', 'surveys:write', 'installation:read',
      'installation:update_assigned', 'safety:read', 'safety:write', 'maintenance:read', 'maintenance:write',
    ],
  },
  [UserRole.CUSTOMER]: {
    role: UserRole.CUSTOMER,
    label: 'Customer',
    scopeSummary: 'Read-only portal for project progress, approved quotations, invoices, handover docs, and service tickets.',
    permissions: [
      'quotations:read', 'finance:read', 'commissioning:read', 'maintenance:read', 'maintenance:write',
    ],
  },
};

export function hasPermission(role: UserRole, permission: PermissionKey): boolean {
  return ROLE_DEFINITIONS[role].permissions.includes(permission);
}
