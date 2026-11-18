import { ArrowLeft } from 'lucide-react';
import {
  ROLE_DEFINITIONS,
  hasPermission,
  type NavItem,
  type SupportedCurrency,
  type UserRole,
} from '../../packages/domain/src/index.ts';

interface ModuleBlueprintViewProps {
  module: NavItem;
  activeRole: UserRole;
  currency: SupportedCurrency;
  onBackToOverview: () => void;
}

const MODULE_CONTRACTS: Record<
  NavItem['id'],
  { tables: string[]; androidSurface: string; guardrails: string[] }
> = {
  overview: {
    tables: ['organizations', 'users', 'organization_memberships'],
    androidSurface: 'FieldHomeScreen.kt',
    guardrails: ['Tenant isolation via organization_id and RLS'],
  },
  customers: {
    tables: ['customers', 'customer_contacts', 'sites', 'projects', 'project_assignments', 'project_stages', 'project_documents'],
    androidSurface: 'Customer & Project Room DAOs',
    guardrails: ['Client UUID generation for offline drafts', 'Tenant-scoped search and file access'],
  },
  surveys: {
    tables: ['site_surveys', 'survey_measurements', 'roof_sections', 'survey_photos', 'load_profiles', 'site_hazards'],
    androidSurface: 'CameraX Survey Capture + Room Outbox',
    guardrails: ['SHA-256 photo checksum verification', 'Compressed uploads via S3/MinIO signed URLs'],
  },
  engineering: {
    tables: ['solar_designs', 'design_revisions', 'solar_modules', 'inverters', 'batteries', 'pv_arrays', 'pv_strings', 'design_calculations', 'design_approvals'],
    androidSurface: 'Deterministic Offline Load & Sizing Calculator',
    guardrails: ['Canonical SI units & stored formula versions', 'Never auto-certifies electrical code compliance'],
  },
  inventory: {
    tables: ['equipment_catalog', 'manufacturers', 'suppliers', 'warehouses', 'stock_movements', 'stock_reservations', 'purchase_orders', 'purchase_order_items', 'equipment_serial_numbers'],
    androidSurface: 'Cached Equipment Catalog (Read-Only Offline)',
    guardrails: ['Atomic transactional stock deductions', 'Idempotency keys prevent duplicate deductions on sync retry'],
  },
  quotations: {
    tables: ['quotations', 'quotation_revisions', 'quotation_items', 'quotation_approvals', 'quotation_templates'],
    androidSurface: 'Draft Quotation Builder (Room Outbox)',
    guardrails: ['Exact decimal arithmetic for PKR and international currencies', 'Approved quotation revisions are immutable'],
  },
  finance: {
    tables: ['invoices', 'invoice_items', 'payments', 'payment_allocations', 'expenses', 'credit_notes', 'journal_entries', 'journal_lines', 'tax_rules'],
    androidSurface: 'Server-Authoritative Financial Ledger',
    guardrails: ['Posted financial records cannot be silently overwritten', 'Double-entry balanced journals'],
  },
  installation: {
    tables: ['installation_jobs', 'installation_tasks', 'team_assignments', 'daily_site_logs', 'material_issues', 'installation_photos'],
    androidSurface: 'Technician Task Checklist & Daily Site Diary',
    guardrails: ['Field Technicians only mutate assigned projects', 'Blocked when mandatory safety gates are incomplete'],
  },
  safety: {
    tables: ['risk_assessments', 'safety_checklists', 'safety_incidents', 'inspection_records', 'inspection_items', 'test_readings', 'corrective_actions', 'inspection_approvals'],
    androidSurface: 'Offline Safety Drafts + Photo Evidence Queue',
    guardrails: ['Mandatory human Safety Officer / Engineer sign-off', 'No AI approval for safety-critical checks'],
  },
  commissioning: {
    tables: ['commissioning_records', 'commissioning_tests', 'commissioning_approvals', 'handover_documents'],
    androidSurface: 'Authorized Commissioning Review Gate',
    guardrails: ['Requires completed safety & inspection approvals', 'Generates immutable handover certificate metadata'],
  },
  maintenance: {
    tables: ['maintenance_schedules', 'service_tickets', 'service_visits', 'warranty_claims', 'asset_register'],
    androidSurface: 'QR Asset Lookup & Offline Service Notes',
    guardrails: ['Tracks serial-level warranty claims', 'Supports future inverter monitoring adapters'],
  },
  sync: {
    tables: ['sync_operations', 'sync_conflicts', 'sync_checkpoints', 'device_registrations', 'file_attachments'],
    androidSurface: 'WorkManager Outbox + Conflict Resolver',
    guardrails: ['No silent last-write-wins for critical records', 'Explicit conflict surfacing on row_version mismatch'],
  },
  admin: {
    tables: ['organizations', 'roles', 'permissions', 'role_permissions', 'user_sessions', 'invitations', 'audit_events'],
    androidSurface: 'Session Refresh & Keystore Rotation',
    guardrails: ['Argon2id + refresh token rotation', 'Cost monitoring dashboard for Postgres, S3, and active orgs'],
  },
};

export function ModuleBlueprintView({
  module,
  activeRole,
  currency,
  onBackToOverview,
}: ModuleBlueprintViewProps) {
  const contract = MODULE_CONTRACTS[module.id];
  const permitted =
    !module.requiredPermission || hasPermission(activeRole, module.requiredPermission);
  const roleLabel = ROLE_DEFINITIONS[activeRole].label;

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={onBackToOverview}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Operations Overview
      </button>

      <div className="border-b border-slate-200 dark:border-slate-800 pb-5 space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>{module.group}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">{module.targetPhase}</span>
          <span aria-hidden="true">·</span>
          <span>{module.offlineSupported ? 'Offline-First (Room)' : 'Server-Authoritative'}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono">{currency}</span>
        </div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
          {module.label}
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
          {module.description}
        </p>
      </div>

      {!permitted && (
        <div className="p-4 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-sm text-red-800 dark:text-red-300">
          Access notice: <span className="font-medium">{roleLabel}</span> does not hold{' '}
          <span className="font-mono text-xs">{module.requiredPermission}</span>. Backend NestJS guards will reject unauthorized API calls with HTTP 403.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 p-5 space-y-3">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            PostgreSQL Schema Scope
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Normalized organization-scoped tables scheduled for {module.targetPhase}:
          </p>
          <ul className="divide-y divide-slate-200 dark:divide-slate-800 border-t border-slate-200 dark:border-slate-800">
            {contract.tables.map((table) => (
              <li
                key={table}
                className="py-2 font-mono text-xs text-slate-800 dark:text-slate-200 flex items-center justify-between"
              >
                <span>{table}</span>
                <span className="text-slate-400 dark:text-slate-500">organization_id · UUID</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 p-5 space-y-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Android & Backend Guardrails
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Android target: <span className="font-mono text-slate-700 dark:text-slate-300">{contract.androidSurface}</span>
            </p>
          </div>

          <ul className="space-y-2.5 text-sm text-slate-700 dark:text-slate-300">
            {contract.guardrails.map((rule) => (
              <li
                key={rule}
                className="py-2 border-b border-slate-200 dark:border-slate-800 last:border-b-0"
              >
                {rule}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
