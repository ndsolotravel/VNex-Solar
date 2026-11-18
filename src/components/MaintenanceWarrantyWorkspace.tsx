import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  DEFAULT_COMMISSIONING_TESTS,
  DEFAULT_PV_CHECKLIST_ITEMS,
  isAssetWarrantyActive,
  type AssetRegisterRecord,
  type MaintenanceScheduleRecord,
  type MaintenanceScheduleType,
  type ProjectRecord,
  type ServiceTicketPriority,
  type ServiceTicketRecord,
  type ServiceTicketStatus,
  type ServiceTicketType,
  type SupportedCurrency,
  type WarrantyClaimRecord,
} from '../../packages/domain/src/index.ts';
import type { WebAuthSession } from '../lib/auth-session.ts';

interface Props {
  currency: SupportedCurrency;
  session: WebAuthSession | null;
  onSessionEstablished: (session: WebAuthSession) => void;
}

interface QrLookupBundle {
  asset: AssetRegisterRecord;
  warrantyActive: boolean;
  tickets: ServiceTicketRecord[];
  warrantyClaims: WarrantyClaimRecord[];
  schedules: MaintenanceScheduleRecord[];
}

const TICKET_STATUS_CLASS: Record<ServiceTicketStatus, string> = {
  open: 'bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-800',
  assigned:
    'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800',
  in_progress:
    'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
  resolved:
    'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800',
  closed:
    'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700',
};

const WARRANTY_STATUS_CLASS: Record<WarrantyClaimRecord['status'], string> = {
  draft: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700',
  submitted:
    'bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-800',
  approved:
    'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800',
  replaced:
    'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800',
  rejected:
    'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800',
};

export function MaintenanceWarrantyWorkspace({
  currency,
  session,
  onSessionEstablished,
}: Props) {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [assets, setAssets] = useState<AssetRegisterRecord[]>([]);
  const [schedules, setSchedules] = useState<MaintenanceScheduleRecord[]>([]);
  const [tickets, setTickets] = useState<ServiceTicketRecord[]>([]);
  const [warrantyClaims, setWarrantyClaims] = useState<WarrantyClaimRecord[]>([]);

  const [qrInput, setQrInput] = useState('');
  const [qrBundle, setQrBundle] = useState<QrLookupBundle | null>(null);

  // Schedule form
  const [schedProjectId, setSchedProjectId] = useState('');
  const [schedType, setSchedType] = useState<MaintenanceScheduleType>('cleaning');
  const [schedIntervalDays, setSchedIntervalDays] = useState(90);
  const [schedNextDueDate, setSchedNextDueDate] = useState(
    new Date().toISOString().slice(0, 10),
  );

  // Ticket form
  const [ticketProjectId, setTicketProjectId] = useState('');
  const [ticketAssetId, setTicketAssetId] = useState('');
  const [ticketType, setTicketType] = useState<ServiceTicketType>('corrective');
  const [ticketPriority, setTicketPriority] = useState<ServiceTicketPriority>('high');
  const [ticketSummary, setTicketSummary] = useState('Inverter DC Bus Overvoltage Alert');
  const [ticketDesc, setTicketDesc] = useState(
    'Customer reported intermittent string isolation alarm during peak irradiance.',
  );

  // Selected ticket visit & status form
  const [selectedTicketId, setSelectedTicketId] = useState('');
  const [visitFindings, setVisitFindings] = useState(
    'Inspected MC4 combiner terminal; slight moisture ingress on String 2 gland.',
  );
  const [visitActions, setVisitActions] = useState(
    'Replaced MC4 seal, torqued isolator lugs, and verified insulation resistance > 500 MOhm.',
  );

  // Warranty claim form
  const [claimAssetId, setClaimAssetId] = useState('');
  const [claimFault, setClaimFault] = useState(
    'MPPT Channel B IGBT gate fault code F31 under normal load.',
  );
  const [replacementSerial, setReplacementSerial] = useState(
    `GW-RPL-${Math.floor(100000 + Math.random() * 899999)}`,
  );

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  async function ensureActiveSession(): Promise<WebAuthSession> {
    if (session) return session;
    const slug = `vnex-om-${Math.floor(1000 + Math.random() * 9000)}`;
    const res = await fetch('/api/v1/auth/register-organization', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        legalName: 'VNex Solar O&M Services Pvt Ltd',
        displayName: 'VNex Solar O&M Services',
        slug,
        businessAddress: 'DHA Phase 5, Lahore',
        countryCode: 'PK',
        defaultCurrency: currency,
        ownerFullName: 'Engr.Bilal Aslam',
        ownerEmail: `${slug}@vnexsolar.pk`,
        password: 'MaintOps!2026',
        deviceId: 'web-maintenance-console',
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message ?? 'Failed to initialize tenant session');
    const created: WebAuthSession = {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      sessionId: data.sessionId,
      organizationName: data.organization.displayName,
      organizationId: data.organization.id,
      userEmail: data.user.email,
      role: data.role,
    };
    onSessionEstablished(created);
    return created;
  }

  async function loadWorkspace(active: WebAuthSession) {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${active.accessToken}` };
      const [schedRes, tickRes, claimRes, assetRes, projRes] = await Promise.all([
        fetch('/api/v1/maintenance/schedules', { headers }),
        fetch('/api/v1/maintenance/tickets', { headers }),
        fetch('/api/v1/maintenance/warranty-claims', { headers }),
        fetch('/api/v1/assets', { headers }),
        fetch('/api/v1/projects', { headers }),
      ]);

      if (!tickRes.ok) {
        const b = await tickRes.json().catch(() => ({}));
        throw new Error(b?.error?.message ?? `Role (${active.role}) cannot access O&M module`);
      }

      const schedData = await schedRes.json();
      const tickData = await tickRes.json();
      const claimData = await claimRes.json();
      const assetData = assetRes.ok ? await assetRes.json() : { assets: [] };
      const projData = projRes.ok ? await projRes.json() : { projects: [] };

      const nextSchedules: MaintenanceScheduleRecord[] = schedData.schedules ?? [];
      const nextTickets: ServiceTicketRecord[] = tickData.tickets ?? [];
      const nextClaims: WarrantyClaimRecord[] = claimData.claims ?? [];
      const nextAssets: AssetRegisterRecord[] = assetData.assets ?? [];
      const nextProjects: ProjectRecord[] = projData.projects ?? [];

      setSchedules(nextSchedules);
      setTickets(nextTickets);
      setWarrantyClaims(nextClaims);
      setAssets(nextAssets);
      setProjects(nextProjects);

      if (!schedProjectId && nextProjects[0]) setSchedProjectId(nextProjects[0].id);
      if (!ticketProjectId && nextProjects[0]) setTicketProjectId(nextProjects[0].id);
      if (!ticketAssetId && nextAssets[0]) setTicketAssetId(nextAssets[0].id);
      if (!claimAssetId && nextAssets[0]) setClaimAssetId(nextAssets[0].id);
      if (!qrInput && nextAssets[0]) setQrInput(nextAssets[0].qrCodeToken);
      if ((!selectedTicketId || !nextTickets.some((t) => t.id === selectedTicketId)) && nextTickets[0]) {
        setSelectedTicketId(nextTickets[0].id);
      }

      setErrMsg(null);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Unable to load maintenance workspace');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (session) {
      void loadWorkspace(session);
    }
  }, [session?.accessToken, session?.organizationId]);

  const activeTicket = useMemo(
    () => tickets.find((t) => t.id === selectedTicketId) ?? null,
    [tickets, selectedTicketId],
  );

  async function handleBootstrapCommissionedAssets() {
    setBusy(true);
    setErrMsg(null);
    setStatusMsg(null);
    try {
      const active = await ensureActiveSession();
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${active.accessToken}`,
      };

      const cust = await (
        await fetch('/api/v1/customers', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            customerType: 'industrial',
            fullName: 'Al-Noor Textile Mills',
          }),
        })
      ).json();

      const site = await (
        await fetch(`/api/v1/customers/${cust.id}/sites`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            siteName: 'Weaving Shed 2 Roof',
            addressLine: 'Faisalabad Industrial Corridor',
            city: 'Faisalabad',
            countryCode: 'PK',
            connectionPhase: 'three',
          }),
        })
      ).json();

      const project: ProjectRecord = await (
        await fetch('/api/v1/projects', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            customerId: cust.id,
            siteId: site.id,
            title: '100kW Commercial Grid-Tie O&M Site',
            systemType: 'on_grid',
            targetCapacityKwp: 100,
            currency,
          }),
        })
      ).json();

      // Seed inventory & receive serialized inverter
      const wh = await (
        await fetch('/api/v1/inventory/warehouses', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            code: `WH-${Math.floor(100 + Math.random() * 899)}`,
            name: 'Faisalabad Depot',
            isDefault: true,
          }),
        })
      ).json();
      const sup = await (
        await fetch('/api/v1/inventory/suppliers', {
          method: 'POST',
          headers,
          body: JSON.stringify({ name: 'Huawei FusionSolar Distributor' }),
        })
      ).json();
      const cat = await (
        await fetch('/api/v1/inventory/catalog', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            sku: `SUN2000-100K-${Math.floor(10 + Math.random() * 89)}`,
            category: 'inverter',
            manufacturerName: 'Huawei',
            modelName: 'SUN2000-100KTL-M2',
            unitOfMeasure: 'pcs',
            unitCostMinor: 240000000,
            unitSellPriceMinor: 280000000,
            currency,
            warrantyMonths: 60,
            isSerialized: true,
          }),
        })
      ).json();
      const po = await (
        await fetch('/api/v1/inventory/purchase-orders', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            supplierId: sup.id,
            warehouseId: wh.id,
            currency,
            items: [{ equipmentCatalogId: cat.id, quantityOrdered: 1, unitCostMinor: 240000000 }],
          }),
        })
      ).json();
      await fetch(`/api/v1/inventory/purchase-orders/${po.id}/issue`, {
        method: 'POST',
        headers,
      });
      const serialNum = `HW100K-${Math.floor(100000 + Math.random() * 899999)}`;
      await fetch(`/api/v1/inventory/purchase-orders/${po.id}/receive`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          idempotencyKey: `om-rcv-${Date.now()}`,
          equipmentCatalogId: cat.id,
          quantityReceived: 1,
          serialNumbers: [serialNum],
        }),
      });
      await fetch('/api/v1/inventory/issues', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          idempotencyKey: `om-iss-${Date.now()}`,
          projectId: project.id,
          warehouseId: wh.id,
          equipmentCatalogId: cat.id,
          quantity: 1,
          serialNumbers: [serialNum],
        }),
      });

      const job: InstallationJobRecordLike = await (
        await fetch('/api/v1/installations', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            projectId: project.id,
            scheduledStartDate: new Date().toISOString().slice(0, 10),
            taskTitles: ['Mount 100kW inverter rack'],
          }),
        })
      ).json();
      for (const task of job.tasks) {
        await fetch(`/api/v1/installations/${job.id}/tasks/${task.id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ baseRowVersion: task.rowVersion, status: 'completed' }),
        });
      }
      const ra = await (
        await fetch('/api/v1/safety/risk-assessments', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            installationJobId: job.id,
            workingAtHeightRequired: true,
            ppeComplianceVerified: true,
            electricalIsolationVerified: true,
          }),
        })
      ).json();
      await fetch(`/api/v1/safety/risk-assessments/${ra.id}/approve`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ notes: 'Approved' }),
      });
      const insp = await (
        await fetch('/api/v1/safety/inspections', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            installationJobId: job.id,
            items: DEFAULT_PV_CHECKLIST_ITEMS.electrical_isolation.map((i) => ({
              checkCode: i.code,
              description: i.label,
              result: 'pass',
            })),
            testReadings: [
              { parameterName: 'Earth Loop Resistance', measuredValue: 1.1, unit: 'Ohm', withinTolerance: true },
            ],
          }),
        })
      ).json();
      await fetch(`/api/v1/safety/inspections/${insp.id}/approve`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ notes: 'Passed' }),
      });
      await fetch(`/api/v1/installations/${job.id}/complete`, { method: 'POST', headers });

      const comm = await (
        await fetch('/api/v1/commissioning', {
          method: 'POST',
          headers,
          body: JSON.stringify({ projectId: project.id, installationJobId: job.id }),
        })
      ).json();
      await fetch(`/api/v1/commissioning/${comm.id}/tests`, {
        method: 'POST',
        headers,
        body: JSON.stringify(DEFAULT_COMMISSIONING_TESTS[0]),
      });
      const approved = await (
        await fetch(`/api/v1/commissioning/${comm.id}/approve`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ notes: 'Commissioned for O&M tracking', telemetryProvider: 'Huawei FusionSolar' }),
        })
      ).json();

      const asset: AssetRegisterRecord = approved.generatedAssets[0];

      // Create preventive cleaning schedule & an initial service ticket
      await fetch('/api/v1/maintenance/schedules', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          projectId: project.id,
          scheduleType: 'cleaning',
          intervalDays: 45,
          nextDueDate: new Date().toISOString().slice(0, 10),
        }),
      });
      await fetch('/api/v1/maintenance/tickets', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          projectId: project.id,
          assetId: asset?.id ?? null,
          ticketType: 'corrective',
          priority: 'high',
          summary: 'Inspect String 2 MC4 Junction & Thermal Scan',
          description: 'Initial thermal inspection requested post-commissioning.',
        }),
      });

      if (asset) {
        setQrInput(asset.qrCodeToken);
        setClaimAssetId(asset.id);
        setTicketAssetId(asset.id);
      }
      setSchedProjectId(project.id);
      setTicketProjectId(project.id);
      setStatusMsg(
        `Commissioned 100kW site with QR Asset ${asset?.qrCodeToken ?? ''}, preventive cleaning schedule, and active service ticket.`,
      );
      await loadWorkspace(active);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Bootstrap failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleQrLookup(e: FormEvent) {
    e.preventDefault();
    if (!qrInput.trim()) return;
    setBusy(true);
    setErrMsg(null);
    try {
      const active = await ensureActiveSession();
      const res = await fetch(`/api/v1/assets/qr/${encodeURIComponent(qrInput.trim())}`, {
        headers: { Authorization: `Bearer ${active.accessToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'QR lookup failed');
      setQrBundle(data);
      setStatusMsg(`Resolved QR token ${data.asset.qrCodeToken} (${data.asset.modelName}).`);
    } catch (err) {
      setQrBundle(null);
      setErrMsg(err instanceof Error ? err.message : 'QR lookup failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateSchedule(e: FormEvent) {
    e.preventDefault();
    if (!schedProjectId) return;
    setBusy(true);
    setErrMsg(null);
    try {
      const active = await ensureActiveSession();
      const res = await fetch('/api/v1/maintenance/schedules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${active.accessToken}`,
        },
        body: JSON.stringify({
          projectId: schedProjectId,
          scheduleType: schedType,
          intervalDays: Number(schedIntervalDays),
          nextDueDate: schedNextDueDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Failed to create schedule');
      setStatusMsg(`Created ${schedType} preventive schedule every ${schedIntervalDays} days.`);
      await loadWorkspace(active);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Create schedule failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleTriggerSchedule(scheduleId: string) {
    setBusy(true);
    setErrMsg(null);
    try {
      const active = await ensureActiveSession();
      const res = await fetch(`/api/v1/maintenance/schedules/${scheduleId}/trigger`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${active.accessToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Trigger failed');
      setSelectedTicketId(data.ticket.id);
      setStatusMsg(
        `Generated ticket ${data.ticket.ticketNumber}; next due date advanced to ${data.schedule.nextDueDate}.`,
      );
      await loadWorkspace(active);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Schedule trigger failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateTicket(e: FormEvent) {
    e.preventDefault();
    if (!ticketProjectId) return;
    setBusy(true);
    setErrMsg(null);
    try {
      const active = await ensureActiveSession();
      const res = await fetch('/api/v1/maintenance/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${active.accessToken}`,
        },
        body: JSON.stringify({
          projectId: ticketProjectId,
          assetId: ticketAssetId || null,
          ticketType,
          priority: ticketPriority,
          summary: ticketSummary,
          description: ticketDesc,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Ticket creation failed');
      setSelectedTicketId(data.id);
      setStatusMsg(`Opened service ticket ${data.ticketNumber}.`);
      await loadWorkspace(active);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Create ticket failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleLogVisit(e: FormEvent) {
    e.preventDefault();
    if (!activeTicket) return;
    setBusy(true);
    setErrMsg(null);
    try {
      const active = await ensureActiveSession();
      const res = await fetch(`/api/v1/maintenance/tickets/${activeTicket.id}/visits`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${active.accessToken}`,
        },
        body: JSON.stringify({ findings: visitFindings, actionsTaken: visitActions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Visit log failed');
      setStatusMsg(`Logged service visit on ${activeTicket.ticketNumber}.`);
      await loadWorkspace(active);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Log visit failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleTransitionTicket(status: ServiceTicketStatus) {
    if (!activeTicket) return;
    setBusy(true);
    setErrMsg(null);
    try {
      const active = await ensureActiveSession();
      const res = await fetch(`/api/v1/maintenance/tickets/${activeTicket.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${active.accessToken}`,
        },
        body: JSON.stringify({ baseRowVersion: activeTicket.rowVersion, status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Status update failed');
      setStatusMsg(`Ticket ${data.ticketNumber} moved to ${data.status}.`);
      await loadWorkspace(active);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Status transition failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateWarrantyClaim(e: FormEvent) {
    e.preventDefault();
    if (!claimAssetId) return;
    setBusy(true);
    setErrMsg(null);
    try {
      const active = await ensureActiveSession();
      const res = await fetch('/api/v1/maintenance/warranty-claims', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${active.accessToken}`,
        },
        body: JSON.stringify({
          assetId: claimAssetId,
          serviceTicketId: activeTicket?.id ?? null,
          faultDescription: claimFault,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Claim draft failed');
      setStatusMsg(`Created draft warranty claim ${data.claimNumber}.`);
      await loadWorkspace(active);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Create warranty claim failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitWarrantyClaim(claimId: string) {
    setBusy(true);
    setErrMsg(null);
    try {
      const active = await ensureActiveSession();
      const res = await fetch(`/api/v1/maintenance/warranty-claims/${claimId}/submit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${active.accessToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Warranty claim submission failed');
      setStatusMsg(`Submitted claim ${data.claimNumber} to OEM warranty desk.`);
      await loadWorkspace(active);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Submit claim failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleDecideWarrantyClaim(
    claimId: string,
    decision: 'approved' | 'replaced' | 'rejected',
  ) {
    setBusy(true);
    setErrMsg(null);
    try {
      const active = await ensureActiveSession();
      const res = await fetch(`/api/v1/maintenance/warranty-claims/${claimId}/decision`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${active.accessToken}`,
        },
        body: JSON.stringify({
          decision,
          resolutionNotes:
            decision === 'replaced'
              ? `OEM authorized swap unit ${replacementSerial}`
              : `OEM review decision: ${decision}`,
          replacementSerialNumber: decision === 'replaced' ? replacementSerial : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Warranty decision failed');
      setStatusMsg(
        decision === 'replaced'
          ? `Warranty claim replaced — Asset serial updated to ${data.updatedAsset.serialNumber}.`
          : `Warranty claim updated to ${data.claim.status}.`,
      );
      await loadWorkspace(active);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Decision failed');
    } finally {
      setBusy(false);
    }
  }

  const openTicketCount = tickets.filter((t) => t.status !== 'closed' && t.status !== 'resolved').length;
  const activeWarranties = assets.filter((a) => isAssetWarrantyActive(a.warrantyExpiresOn)).length;

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Preventive Maintenance, Service Tickets & Warranty Claims
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            QR asset lookup, automated preventive schedules, technician field visits, and OEM warranty replacement tracking.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={busy}
            onClick={handleBootstrapCommissionedAssets}
            className="px-4 py-2 rounded-md bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            {busy ? 'Working...' : 'Bootstrap O&M Demo Site'}
          </button>
          {session && (
            <button
              type="button"
              disabled={loading || busy}
              onClick={() => void loadWorkspace(session)}
              className="px-3.5 py-2 rounded-md border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Refresh
            </button>
          )}
        </div>
      </div>

      {statusMsg && (
        <div className="p-3.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-800 dark:text-emerald-200">
          {statusMsg}
        </div>
      )}

      {errMsg && (
        <div className="p-3.5 rounded-md bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-sm text-rose-800 dark:text-rose-200">
          {errMsg}
        </div>
      )}

      {/* 4 KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Active Warranted Assets
          </div>
          <div className="mt-2 font-mono tabular-nums text-xl font-bold text-slate-900 dark:text-slate-50">
            {activeWarranties} / {assets.length}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Preventive Schedules
          </div>
          <div className="mt-2 font-mono tabular-nums text-xl font-bold text-slate-900 dark:text-slate-50">
            {schedules.filter((s) => s.isActive).length}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Open / Active Tickets
          </div>
          <div className="mt-2 font-mono tabular-nums text-xl font-bold text-slate-900 dark:text-slate-50">
            {openTicketCount} / {tickets.length}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Warranty Claims
          </div>
          <div className="mt-2 font-mono tabular-nums text-xl font-bold text-slate-900 dark:text-slate-50">
            {warrantyClaims.length}
          </div>
        </div>
      </div>

      {/* QR Asset Scanner / Token Lookup */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
            QR Asset Register Lookup
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Scan or paste a <span className="font-mono">VNEX-QR-*</span> sticker token to verify warranty & service history.
          </span>
        </div>
        <form onSubmit={handleQrLookup} className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={qrInput}
            onChange={(e) => setQrInput(e.target.value)}
            placeholder="e.g. VNEX-QR-CERT-0001-HW100K-123456"
            className="flex-1 px-3 py-2 text-xs font-mono rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
          />
          <button
            type="submit"
            disabled={busy || !qrInput.trim()}
            className="px-4 py-2 rounded-md bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold hover:opacity-90 disabled:opacity-40"
          >
            Lookup QR Asset
          </button>
        </form>

        {qrBundle && (
          <div className="p-4 rounded-md bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            <div>
              <div className="text-slate-500">Asset & Serial</div>
              <div className="font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                {qrBundle.asset.modelName}
              </div>
              <div className="font-mono text-slate-600 dark:text-slate-300">
                SN: {qrBundle.asset.serialNumber}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Warranty Coverage</div>
              <div className="mt-0.5 font-mono font-semibold">
                {qrBundle.warrantyActive ? (
                  <span className="text-emerald-700 dark:text-emerald-400">
                    ACTIVE until {qrBundle.asset.warrantyExpiresOn}
                  </span>
                ) : (
                  <span className="text-rose-700 dark:text-rose-400">
                    EXPIRED ({qrBundle.asset.warrantyExpiresOn ?? 'n/a'})
                  </span>
                )}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Linked Telemetry</div>
              <div className="mt-0.5 text-slate-800 dark:text-slate-200">
                {qrBundle.asset.telemetryProvider ?? 'None'} ({qrBundle.asset.externalDeviceId ?? '-'})
              </div>
            </div>
            <div>
              <div className="text-slate-500">Asset History</div>
              <div className="mt-0.5 font-mono tabular-nums text-slate-800 dark:text-slate-200">
                Tickets: {qrBundle.tickets.length} · Claims: {qrBundle.warrantyClaims.length}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Split: Schedules + Tickets vs Ticket Detail + Warranty Claims */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-6">
          {/* Preventive Maintenance Schedules */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
              Preventive Schedules ({schedules.length})
            </h3>
            <form onSubmit={handleCreateSchedule} className="space-y-2">
              <select
                value={schedProjectId}
                onChange={(e) => setSchedProjectId(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="">Select project...</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.projectCode} — {p.title}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={schedType}
                  onChange={(e) => setSchedType(e.target.value as MaintenanceScheduleType)}
                  className="px-2 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value="cleaning">Cleaning</option>
                  <option value="preventive">Preventive</option>
                  <option value="inverter_check">Inverter Check</option>
                </select>
                <input
                  type="number"
                  min={1}
                  value={schedIntervalDays}
                  onChange={(e) => setSchedIntervalDays(Number(e.target.value))}
                  className="px-2 py-1.5 text-xs font-mono rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  title="Interval in days"
                />
                <input
                  type="date"
                  value={schedNextDueDate}
                  onChange={(e) => setSchedNextDueDate(e.target.value)}
                  className="px-2 py-1.5 text-xs font-mono rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <button
                type="submit"
                disabled={busy || !schedProjectId}
                className="w-full px-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
              >
                Add Maintenance Schedule
              </button>
            </form>

            {schedules.length > 0 && (
              <ul className="space-y-2">
                {schedules.map((s) => (
                  <li
                    key={s.id}
                    className="p-3 rounded-md border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-800 dark:text-slate-100 uppercase">
                        {s.scheduleType.replace('_', ' ')}
                      </div>
                      <div className="font-mono tabular-nums text-slate-500">
                        Every {s.intervalDays}d · Next due {s.nextDueDate}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleTriggerSchedule(s.id)}
                      className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white font-medium shrink-0"
                    >
                      Trigger Ticket
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Service Tickets List */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
              Service Tickets Queue ({tickets.length})
            </h3>
            {tickets.length === 0 ? (
              <p className="text-xs text-slate-500">No service tickets recorded yet.</p>
            ) : (
              <ul className="space-y-2">
                {tickets.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedTicketId(t.id)}
                      className={`w-full text-left p-3 rounded-md border transition-colors ${
                        t.id === activeTicket?.id
                          ? 'bg-amber-50/60 dark:bg-amber-950/30 border-amber-400 dark:border-amber-700'
                          : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {t.ticketNumber} · {t.priority.toUpperCase()}
                        </span>
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${TICKET_STATUS_CLASS[t.status]}`}>
                          {t.status}
                        </span>
                      </div>
                      <div className="text-xs text-slate-700 dark:text-slate-300 mt-1 truncate">
                        {t.summary}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="lg:col-span-7 space-y-6">
          {/* Open New Service Ticket */}
          <form
            onSubmit={handleCreateTicket}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3"
          >
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
              Open Service Ticket
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select
                value={ticketProjectId}
                onChange={(e) => setTicketProjectId(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="">Select project...</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.projectCode} — {p.title}
                  </option>
                ))}
              </select>
              <select
                value={ticketAssetId}
                onChange={(e) => setTicketAssetId(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="">Optional linked QR asset...</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.qrCodeToken} ({a.serialNumber})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <select
                value={ticketType}
                onChange={(e) => setTicketType(e.target.value as ServiceTicketType)}
                className="px-3 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="corrective">Corrective</option>
                <option value="preventive">Preventive</option>
                <option value="cleaning">Cleaning</option>
                <option value="warranty">Warranty</option>
              </select>
              <select
                value={ticketPriority}
                onChange={(e) => setTicketPriority(e.target.value as ServiceTicketPriority)}
                className="px-3 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
              <input
                type="text"
                value={ticketSummary}
                onChange={(e) => setTicketSummary(e.target.value)}
                placeholder="Ticket summary"
                className="px-3 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                required
              />
            </div>
            <textarea
              rows={2}
              value={ticketDesc}
              onChange={(e) => setTicketDesc(e.target.value)}
              placeholder="Diagnostic symptoms or customer report"
              className="w-full px-3 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              required
            />
            <button
              type="submit"
              disabled={busy || !ticketProjectId}
              className="px-4 py-2 rounded-md bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold hover:opacity-90 disabled:opacity-40"
            >
              Create Service Ticket
            </button>
          </form>

          {/* Active Ticket Service Visits & Lifecycle */}
          {activeTicket && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-mono text-sm font-bold text-slate-900 dark:text-slate-50">
                    {activeTicket.ticketNumber} — {activeTicket.summary}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Type: {activeTicket.ticketType} · Priority: {activeTicket.priority} · Version{' '}
                    <span className="font-mono">v{activeTicket.rowVersion}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(['in_progress', 'resolved', 'closed'] as ServiceTicketStatus[]).map((st) => (
                    <button
                      key={st}
                      type="button"
                      disabled={busy || activeTicket.status === 'closed' || activeTicket.status === st}
                      onClick={() => void handleTransitionTicket(st)}
                      className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
                    >
                      Mark {st}
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={handleLogVisit} className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Log Field Service Visit ({activeTicket.visits.length})
                </div>
                <input
                  type="text"
                  value={visitFindings}
                  onChange={(e) => setVisitFindings(e.target.value)}
                  placeholder="Field findings"
                  className="w-full px-3 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  required
                />
                <input
                  type="text"
                  value={visitActions}
                  onChange={(e) => setVisitActions(e.target.value)}
                  placeholder="Corrective actions taken"
                  className="w-full px-3 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  required
                />
                <button
                  type="submit"
                  disabled={busy || activeTicket.status === 'closed'}
                  className="px-3.5 py-1.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold disabled:opacity-40"
                >
                  Record Service Visit
                </button>
              </form>

              {activeTicket.visits.length > 0 && (
                <ul className="space-y-2 text-xs">
                  {activeTicket.visits.map((v) => (
                    <li
                      key={v.id}
                      className="p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40"
                    >
                      <div className="font-mono text-[11px] text-slate-500">{v.visitedAt}</div>
                      <div className="text-slate-800 dark:text-slate-200 mt-0.5">
                        <strong>Findings:</strong> {v.findings}
                      </div>
                      <div className="text-slate-700 dark:text-slate-300">
                        <strong>Actions:</strong> {v.actionsTaken}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Warranty Claims Panel */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
              OEM Warranty Claims ({warrantyClaims.length})
            </h3>
            <form onSubmit={handleCreateWarrantyClaim} className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <select
                  value={claimAssetId}
                  onChange={(e) => setClaimAssetId(e.target.value)}
                  className="px-3 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value="">Select registered QR asset...</option>
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.modelName} — SN {a.serialNumber} (Exp {a.warrantyExpiresOn ?? 'n/a'})
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={replacementSerial}
                  onChange={(e) => setReplacementSerial(e.target.value)}
                  placeholder="Replacement serial (used when Replaced)"
                  className="px-3 py-1.5 text-xs font-mono rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={claimFault}
                  onChange={(e) => setClaimFault(e.target.value)}
                  placeholder="Hardware fault description & inverter error code"
                  className="flex-1 px-3 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  required
                />
                <button
                  type="submit"
                  disabled={busy || !claimAssetId}
                  className="px-4 py-1.5 rounded-md bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold disabled:opacity-40"
                >
                  Draft Warranty Claim
                </button>
              </div>
            </form>

            {warrantyClaims.length > 0 && (
              <ul className="space-y-2 text-xs">
                {warrantyClaims.map((c) => (
                  <li
                    key={c.id}
                    className="p-3 rounded-md border border-slate-200 dark:border-slate-800 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {c.claimNumber}
                      </span>
                      <span className={`px-2 py-0.5 rounded font-medium ${WARRANTY_STATUS_CLASS[c.status]}`}>
                        {c.status}
                      </span>
                    </div>
                    <div className="text-slate-700 dark:text-slate-300">{c.faultDescription}</div>
                    {c.replacementSerialNumber && (
                      <div className="font-mono text-emerald-700 dark:text-emerald-400">
                        Replacement SN: {c.replacementSerialNumber}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {c.status === 'draft' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleSubmitWarrantyClaim(c.id)}
                          className="px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-700 text-white font-medium"
                        >
                          Submit Claim
                        </button>
                      )}
                      {(c.status === 'submitted' || c.status === 'approved') && (
                        <>
                          {c.status === 'submitted' && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleDecideWarrantyClaim(c.id, 'approved')}
                              className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
                            >
                              Approve OEM RMA
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleDecideWarrantyClaim(c.id, 'replaced')}
                            className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                          >
                            Mark Replaced (Swap SN)
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleDecideWarrantyClaim(c.id, 'rejected')}
                            className="px-2.5 py-1 rounded border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-medium"
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface InstallationJobRecordLike {
  id: string;
  tasks: Array<{ id: string; rowVersion: number }>;
}
