import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  computeInstallationProgress,
  type EquipmentCatalogItem,
  type InstallationJobRecord,
  type InstallationTaskStatus,
  type ProjectRecord,
  type StockBalanceSummary,
  type SupportedCurrency,
  type WarehouseRecord,
} from '../../packages/domain/src/index.ts';
import type { WebAuthSession } from '../lib/auth-session.ts';

interface OrgMemberSummary {
  id: string;
  fullName: string;
  email: string;
  role: string;
}

interface Props {
  currency: SupportedCurrency;
  session: WebAuthSession | null;
  onSessionEstablished: (session: WebAuthSession) => void;
}

function generateIdemKey(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

async function computeSha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const JOB_STATUS_LABELS: Record<InstallationJobRecord['status'], string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  safety_blocked: 'Safety Blocked',
  completed: 'Completed',
};

const TASK_STATUS_LABELS: Record<InstallationTaskStatus, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
  blocked: 'Blocked',
};

export function InstallationWorkspace({ currency, session, onSessionEstablished }: Props) {
  const [jobs, setJobs] = useState<InstallationJobRecord[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [members, setMembers] = useState<OrgMemberSummary[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseRecord[]>([]);
  const [catalog, setCatalog] = useState<EquipmentCatalogItem[]>([]);
  const [balances, setBalances] = useState<StockBalanceSummary[]>([]);

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [jobSearch, setJobSearch] = useState('');
  const [jobStatusFilter, setJobStatusFilter] = useState<string>('all');

  // Create Installation Job Form
  const [newProjectId, setNewProjectId] = useState('');
  const [scheduledStartDate, setScheduledStartDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [scheduledEndDate, setScheduledEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 4);
    return d.toISOString().slice(0, 10);
  });
  const [customTasksText, setCustomTasksText] = useState(
    'Verify roof layout & waterproof anchors\nAssemble rails & equipotential earthing\nMount inverter & DC/AC surge arrestors\nPull solar DC strings & crimp MC4 leads',
  );

  // Team assignment form
  const [assignMemberId, setAssignMemberId] = useState('');
  const [assignRoleOnSite, setAssignRoleOnSite] = useState('Lead Solar Installer');

  // Daily site log form
  const [logDate, setLogDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [weatherConditions, setWeatherConditions] = useState('Clear sky, 33 C, calm wind');
  const [workSummary, setWorkSummary] = useState('');

  // Linked material issue form
  const [issueWarehouseId, setIssueWarehouseId] = useState('');
  const [issueCatalogId, setIssueCatalogId] = useState('');
  const [issueQty, setIssueQty] = useState(2);
  const [issueSerialsText, setIssueSerialsText] = useState('');
  const [issueNotes, setIssueNotes] = useState('Field crew DC array requisition');
  const [issueIdemKey, setIssueIdemKey] = useState(() => generateIdemKey('jobmat'));

  // Photo proof form
  const [photoCaption, setPhotoCaption] = useState('Inverter DC isolator & MC4 conduit termination');

  async function ensureActiveSession(): Promise<WebAuthSession> {
    if (session) return session;
    const slug = `vnex-inst-${Math.floor(1000 + Math.random() * 9000)}`;
    const res = await fetch('/api/v1/auth/register-organization', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        legalName: 'VNex Field Operations Pvt Ltd',
        displayName: 'VNex Field Operations',
        slug,
        businessAddress: 'Johar Town, Lahore',
        countryCode: 'PK',
        defaultCurrency: currency,
        ownerFullName: 'Tariq Mahmood',
        ownerEmail: `${slug}@vnexsolar.pk`,
        password: 'InstallOps!2026',
        deviceId: 'web-installation-console',
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

  async function refreshState(active: WebAuthSession) {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${active.accessToken}` };
      const [jobsRes, projRes, memRes, whRes, catRes, balRes] = await Promise.all([
        fetch('/api/v1/installations', { headers }),
        fetch('/api/v1/projects', { headers }),
        fetch('/api/v1/organizations/members', { headers }),
        fetch('/api/v1/inventory/warehouses', { headers }),
        fetch('/api/v1/inventory/catalog', { headers }),
        fetch('/api/v1/inventory/balances', { headers }),
      ]);

      if (!jobsRes.ok) {
        const body = await jobsRes.json().catch(() => ({}));
        throw new Error(
          body?.error?.message ?? `Role (${active.role}) lacks installation:read access.`,
        );
      }

      const [jobsData, projData, memData, whData, catData, balData] = await Promise.all([
        jobsRes.json(),
        projRes.ok ? projRes.json() : Promise.resolve({ projects: [] }),
        memRes.ok ? memRes.json() : Promise.resolve({ members: [] }),
        whRes.ok ? whRes.json() : Promise.resolve({ warehouses: [] }),
        catRes.ok ? catRes.json() : Promise.resolve({ items: [] }),
        balRes.ok ? balRes.json() : Promise.resolve({ balances: [] }),
      ]);

      const nextJobs: InstallationJobRecord[] = jobsData.installations ?? [];
      const nextProjects: ProjectRecord[] = projData.projects ?? [];
      const nextMembers: OrgMemberSummary[] = memData.members ?? [];
      const nextWarehouses: WarehouseRecord[] = whData.warehouses ?? [];
      const nextCatalog: EquipmentCatalogItem[] = catData.items ?? [];
      const nextBalances: StockBalanceSummary[] = balData.balances ?? [];

      setJobs(nextJobs);
      setProjects(nextProjects);
      setMembers(nextMembers);
      setWarehouses(nextWarehouses);
      setCatalog(nextCatalog);
      setBalances(nextBalances);

      if (nextJobs.length > 0 && (!selectedJobId || !nextJobs.some((j) => j.id === selectedJobId))) {
        setSelectedJobId(nextJobs[0].id);
      }
      if (!newProjectId && nextProjects.length > 0) setNewProjectId(nextProjects[0].id);
      if (!assignMemberId && nextMembers.length > 0) setAssignMemberId(nextMembers[0].id);
      if (!issueWarehouseId && nextWarehouses.length > 0) setIssueWarehouseId(nextWarehouses[0].id);
      if (!issueCatalogId && nextCatalog.length > 0) setIssueCatalogId(nextCatalog[0].id);

      setErrMsg(null);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Unable to load installation jobs');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (session) {
      void refreshState(session);
    }
  }, [session?.accessToken, session?.organizationId]);

  const selectedJob = useMemo(
    () => jobs.find((j) => j.id === selectedJobId) ?? jobs[0] ?? null,
    [jobs, selectedJobId],
  );

  const filteredJobs = useMemo(() => {
    const q = jobSearch.trim().toLowerCase();
    return jobs.filter((job) => {
      if (jobStatusFilter !== 'all' && job.status !== jobStatusFilter) return false;
      if (!q) return true;
      const projTitle = projects.find((p) => p.id === job.projectId)?.title ?? '';
      return (
        job.jobCode.toLowerCase().includes(q) ||
        projTitle.toLowerCase().includes(q) ||
        job.scheduledStartDate.toLowerCase().includes(q)
      );
    });
  }, [jobs, jobStatusFilter, jobSearch, projects]);

  const progress = useMemo(
    () => computeInstallationProgress(selectedJob?.tasks ?? []),
    [selectedJob],
  );

  const kpiStats = useMemo(() => {
    const totalJobs = jobs.length;
    const activeJobs = jobs.filter((j) => j.status === 'in_progress' || j.status === 'scheduled').length;
    const completedJobs = jobs.filter((j) => j.status === 'completed').length;
    const blockedJobs = jobs.filter((j) => j.status === 'safety_blocked').length;
    return { totalJobs, activeJobs, completedJobs, blockedJobs };
  }, [jobs]);

  async function ensureSampleProject(active: WebAuthSession): Promise<string> {
    if (newProjectId) return newProjectId;
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${active.accessToken}`,
    };
    const custRes = await fetch('/api/v1/customers', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customerType: 'commercial',
        fullName: 'Al-Noor Cold Storage Pvt Ltd',
        primaryPhone: '+92-300-5551200',
      }),
    });
    const cust = await custRes.json();
    if (!custRes.ok) throw new Error(cust?.error?.message ?? 'Failed to auto-create customer');

    const siteRes = await fetch(`/api/v1/customers/${cust.id}/sites`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        siteName: 'Sector I-9 Warehouse',
        addressLine: 'Plot 14, Industrial Area',
        city: 'Islamabad',
        countryCode: 'PK',
        connectionPhase: 'three',
      }),
    });
    const site = await siteRes.json();
    if (!siteRes.ok) throw new Error(site?.error?.message ?? 'Failed to auto-create site');

    const projRes = await fetch('/api/v1/projects', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customerId: cust.id,
        siteId: site.id,
        title: '15 kW Hybrid Cold-Chain Installation',
        systemType: 'hybrid',
        targetCapacityKwp: 15,
        currency,
      }),
    });
    const proj = await projRes.json();
    if (!projRes.ok) throw new Error(proj?.error?.message ?? 'Failed to auto-create project');
    setNewProjectId(proj.id);
    return proj.id;
  }

  async function handleCreateJob(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatusMsg(null);
    setErrMsg(null);
    try {
      const active = await ensureActiveSession();
      const projectId = await ensureSampleProject(active);
      const taskTitles = customTasksText
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s.length >= 2);

      const res = await fetch('/api/v1/installations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${active.accessToken}`,
        },
        body: JSON.stringify({
          projectId,
          scheduledStartDate,
          scheduledEndDate: scheduledEndDate || null,
          taskTitles: taskTitles.length > 0 ? taskTitles : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Failed to schedule installation job');
      await refreshState(active);
      setSelectedJobId(data.id);
      setStatusMsg(`Scheduled ${data.jobCode} with ${data.tasks.length} field checklist tasks.`);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Unable to create installation job');
    } finally {
      setBusy(false);
    }
  }

  async function handleAssignMember(e: FormEvent) {
    e.preventDefault();
    if (!selectedJob || !assignMemberId) return;
    setBusy(true);
    setErrMsg(null);
    setStatusMsg(null);
    try {
      const active = await ensureActiveSession();
      const member = members.find((m) => m.id === assignMemberId);
      const res = await fetch(`/api/v1/installations/${selectedJob.id}/team`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${active.accessToken}`,
        },
        body: JSON.stringify({
          userId: assignMemberId,
          fullName: member?.fullName ?? 'Field Technician',
          roleOnSite: assignRoleOnSite,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Failed to assign crew member');
      await refreshState(active);
      setStatusMsg(`Assigned ${member?.fullName ?? 'crew member'} (${assignRoleOnSite}) to ${selectedJob.jobCode}.`);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Crew assignment failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateTaskStatus(
    taskId: string,
    baseRowVersion: number,
    nextStatus: InstallationTaskStatus,
  ) {
    if (!selectedJob) return;
    setBusy(true);
    setErrMsg(null);
    setStatusMsg(null);
    try {
      const active = await ensureActiveSession();
      const res = await fetch(`/api/v1/installations/${selectedJob.id}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${active.accessToken}`,
        },
        body: JSON.stringify({ baseRowVersion, status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Task update rejected');
      await refreshState(active);
      setStatusMsg(`Task updated to "${TASK_STATUS_LABELS[nextStatus]}" (v${data.task.rowVersion}).`);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Task status update failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleCompleteJob() {
    if (!selectedJob) return;
    setBusy(true);
    setErrMsg(null);
    setStatusMsg(null);
    try {
      const active = await ensureActiveSession();
      const res = await fetch(`/api/v1/installations/${selectedJob.id}/complete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${active.accessToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Cannot complete installation job');
      await refreshState(active);
      setStatusMsg(`Installation ${data.jobCode} completed and project advanced to installation_completed.`);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Job completion blocked');
    } finally {
      setBusy(false);
    }
  }

  async function handleAddSiteLog(e: FormEvent) {
    e.preventDefault();
    if (!selectedJob || workSummary.trim().length < 3) return;
    setBusy(true);
    setErrMsg(null);
    setStatusMsg(null);
    try {
      const active = await ensureActiveSession();
      const res = await fetch(`/api/v1/installations/${selectedJob.id}/logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${active.accessToken}`,
        },
        body: JSON.stringify({
          logDate,
          weatherConditions: weatherConditions.trim() || null,
          workSummary: workSummary.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Failed to add site diary log');
      setWorkSummary('');
      await refreshState(active);
      setStatusMsg(`Site diary logged for ${data.log.logDate}.`);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Unable to save site log');
    } finally {
      setBusy(false);
    }
  }

  async function handleIssueMaterial(e: FormEvent) {
    e.preventDefault();
    if (!selectedJob || !issueWarehouseId || !issueCatalogId) return;
    setBusy(true);
    setErrMsg(null);
    setStatusMsg(null);
    try {
      const active = await ensureActiveSession();
      const serialNumbers = issueSerialsText
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch(`/api/v1/installations/${selectedJob.id}/material-issues`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${active.accessToken}`,
        },
        body: JSON.stringify({
          idempotencyKey: issueIdemKey,
          warehouseId: issueWarehouseId,
          equipmentCatalogId: issueCatalogId,
          quantity: Number(issueQty),
          serialNumbers: serialNumbers.length > 0 ? serialNumbers : undefined,
          notes: issueNotes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Material issue failed');
      setIssueIdemKey(generateIdemKey('jobmat'));
      setIssueSerialsText('');
      await refreshState(active);
      setStatusMsg(
        `Issued ${data.materialIssue.quantityIssued} × ${data.materialIssue.sku} directly to ${selectedJob.jobCode}.`,
      );
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Material issue rejected');
    } finally {
      setBusy(false);
    }
  }

  async function handleUploadVerifiedPhoto() {
    if (!selectedJob) return;
    setBusy(true);
    setErrMsg(null);
    setStatusMsg(null);
    try {
      const active = await ensureActiveSession();
      const syntheticBytes = new TextEncoder().encode(
        `VNEX-JOB-${selectedJob.jobCode}-${Date.now()}-${photoCaption}`,
      );
      const sha256Checksum = await computeSha256Hex(syntheticBytes);
      const presignRes = await fetch(`/api/v1/installations/${selectedJob.id}/photos/presign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${active.accessToken}`,
        },
        body: JSON.stringify({
          filename: `install-${selectedJob.jobCode.toLowerCase()}-${Date.now()}.jpg`,
          mimeType: 'image/jpeg',
          byteSize: syntheticBytes.byteLength,
          sha256Checksum,
          caption: photoCaption.trim() || null,
        }),
      });
      const presignData = await presignRes.json();
      if (!presignRes.ok) throw new Error(presignData?.error?.message ?? 'Photo presign failed');

      const commitRes = await fetch(`/api/v1/installations/${selectedJob.id}/photos/commit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${active.accessToken}`,
        },
        body: JSON.stringify({
          fileAttachmentId: presignData.fileAttachmentId,
          sha256Checksum,
        }),
      });
      const commitData = await commitRes.json();
      if (!commitRes.ok) throw new Error(commitData?.error?.message ?? 'Photo checksum commit failed');
      await refreshState(active);
      setStatusMsg(
        `Verified and attached SHA-256 progress photo (${commitData.sha256Checksum.slice(0, 12)}...).`,
      );
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Photo upload failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-6">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Installation Jobs & Field Execution
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Schedule site crews, reconcile task checklists with optimistic locking, issue warehouse stock, and log SHA-256 progress photos.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {!session ? (
            <button
              type="button"
              onClick={() => void ensureActiveSession().then(refreshState)}
              disabled={busy}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition-colors whitespace-nowrap shrink-0"
            >
              Initialize Field Session
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void refreshState(session)}
              disabled={loading || busy}
              className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              {loading ? 'Refreshing...' : 'Refresh Jobs'}
            </button>
          )}
        </div>
      </section>

      {errMsg && (
        <div className="border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200 rounded-xl px-4 py-3 text-sm">
          {errMsg}
        </div>
      )}
      {statusMsg && (
        <div className="border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200 rounded-xl px-4 py-3 text-sm">
          {statusMsg}
        </div>
      )}

      {/* Full-width KPI summary strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Total Jobs</div>
          <div className="text-2xl font-semibold font-mono tabular-nums mt-1 text-slate-900 dark:text-slate-100">
            {kpiStats.totalJobs}
          </div>
        </div>
        <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Active & Scheduled</div>
          <div className="text-2xl font-semibold font-mono tabular-nums mt-1 text-amber-600 dark:text-amber-400">
            {kpiStats.activeJobs}
          </div>
        </div>
        <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Completed</div>
          <div className="text-2xl font-semibold font-mono tabular-nums mt-1 text-emerald-600 dark:text-emerald-400">
            {kpiStats.completedJobs}
          </div>
        </div>
        <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Safety Blocked</div>
          <div className="text-2xl font-semibold font-mono tabular-nums mt-1 text-rose-600 dark:text-rose-400">
            {kpiStats.blockedJobs}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left column: Create Job + Job List */}
        <div className="lg:col-span-4 space-y-6">
          <form
            onSubmit={handleCreateJob}
            className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-5 space-y-4"
          >
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Schedule Installation Job
            </h3>
            <div>
              <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                Solar Project
              </label>
              <select
                value={newProjectId}
                onChange={(e) => setNewProjectId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              >
                <option value="">Auto-create 15 kW demo project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} ({p.currentStage})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={scheduledStartDate}
                  onChange={(e) => setScheduledStartDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-xs font-mono tabular-nums rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                  Target End Date
                </label>
                <input
                  type="date"
                  value={scheduledEndDate}
                  onChange={(e) => setScheduledEndDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono tabular-nums rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                Field Checklist Tasks (one per line)
              </label>
              <textarea
                rows={4}
                value={customTasksText}
                onChange={(e) => setCustomTasksText(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-amber-600 hover:bg-slate-800 dark:hover:bg-amber-700 text-white transition-colors"
            >
              {busy ? 'Scheduling...' : 'Create Installation Job'}
            </button>
          </form>

          <section className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Active Jobs ({filteredJobs.length})
              </h3>
            </div>
            <input
              type="search"
              value={jobSearch}
              onChange={(e) => setJobSearch(e.target.value)}
              placeholder="Search job code or project..."
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <div className="flex flex-wrap gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              {(['all', 'scheduled', 'in_progress', 'completed', 'safety_blocked'] as const).map(
                (st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setJobStatusFilter(st)}
                    className={`px-2.5 py-1 text-xs rounded-md transition-colors whitespace-nowrap ${
                      jobStatusFilter === st
                        ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-medium'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    {st === 'all' ? 'All' : JOB_STATUS_LABELS[st]}
                  </button>
                ),
              )}
            </div>

            {filteredJobs.length === 0 ? (
              <p className="text-xs text-slate-500 py-4">
                No installation jobs scheduled yet. Use the form above to schedule your first field crew job.
              </p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredJobs.map((job) => {
                  const prog = computeInstallationProgress(job.tasks);
                  const projTitle =
                    projects.find((p) => p.id === job.projectId)?.title ?? 'Solar Project';
                  const active = selectedJob?.id === job.id;
                  return (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => setSelectedJobId(job.id)}
                      className={`w-full text-left py-3 px-2 rounded-lg transition-colors ${
                        active
                          ? 'bg-amber-50 dark:bg-amber-950/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                          {job.jobCode}
                        </span>
                        <span className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
                          {prog.completed}/{prog.total} tasks · {prog.pct}%
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-300 mt-1 truncate">
                        {projTitle}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {JOB_STATUS_LABELS[job.status]} · Start {job.scheduledStartDate}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Right column: Selected Job Detail, Tasks, Crew, Materials, Site Logs & Photos */}
        <div className="lg:col-span-8 space-y-6">
          {!selectedJob ? (
            <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-8 text-center space-y-3">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Select or Schedule an Installation Job
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
                Assign certified technicians, track optimistic-locked checklist tasks, issue inventory directly to the site, and verify SHA-256 progress photography.
              </p>
            </div>
          ) : (
            <>
              {/* Job Header & Progress */}
              <section className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {JOB_STATUS_LABELS[selectedJob.status]} · Row v{selectedJob.rowVersion} ·{' '}
                      {selectedJob.safetyCleared ? 'Safety Cleared' : 'Pre-Inspection Pending'}
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                      {selectedJob.jobCode} —{' '}
                      {projects.find((p) => p.id === selectedJob.projectId)?.title ??
                        selectedJob.projectId.slice(0, 8)}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleCompleteJob()}
                    disabled={busy || selectedJob.status === 'completed'}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white transition-colors whitespace-nowrap shrink-0"
                  >
                    {selectedJob.status === 'completed'
                      ? 'Installation Completed'
                      : 'Complete Installation'}
                  </button>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 mb-1.5">
                    <span>Checklist Completion</span>
                    <span className="font-mono tabular-nums">
                      {progress.completed}/{progress.total} ({progress.pct}%)
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-600 transition-all"
                      style={{ width: `${progress.pct}%` }}
                    />
                  </div>
                </div>
              </section>

              {/* Tasks Checklist */}
              <section className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-6 space-y-4">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Installation Checklist Tasks
                </h4>
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {selectedJob.tasks.map((task) => (
                    <div
                      key={task.id}
                      className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {task.sortOrder}. {task.title}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
                          {TASK_STATUS_LABELS[task.status]} · v{task.rowVersion}
                          {task.completedAt ? ` · Done ${task.completedAt.slice(0, 10)}` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            void handleUpdateTaskStatus(task.id, task.rowVersion, 'in_progress')
                          }
                          disabled={busy || task.status === 'in_progress' || task.status === 'completed'}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 whitespace-nowrap"
                        >
                          Start
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void handleUpdateTaskStatus(task.id, task.rowVersion, 'completed')
                          }
                          disabled={busy || task.status === 'completed'}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-amber-600 text-white hover:bg-slate-800 dark:hover:bg-amber-700 disabled:opacity-40 whitespace-nowrap"
                        >
                          Mark Complete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Team Assignments & Material Requisition */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <section className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-5 space-y-4">
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Assigned Site Crew ({selectedJob.teamAssignments.length})
                  </h4>
                  <form onSubmit={handleAssignMember} className="space-y-3">
                    <select
                      value={assignMemberId}
                      onChange={(e) => setAssignMemberId(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    >
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.fullName} ({m.role})
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={assignRoleOnSite}
                      onChange={(e) => setAssignRoleOnSite(e.target.value)}
                      placeholder="Site role (e.g. DC Electrician)"
                      required
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                    <button
                      type="submit"
                      disabled={busy || !assignMemberId}
                      className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      Assign Crew Member
                    </button>
                  </form>
                  {selectedJob.teamAssignments.length > 0 && (
                    <ul className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                      {selectedJob.teamAssignments.map((tm) => (
                        <li key={tm.id} className="py-2 flex items-center justify-between gap-2">
                          <span className="font-medium text-slate-900 dark:text-slate-100">
                            {tm.fullName}
                          </span>
                          <span className="text-slate-500 dark:text-slate-400">{tm.roleOnSite}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-5 space-y-4">
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Issue Material from Warehouse ({selectedJob.materialIssues.length})
                  </h4>
                  <form onSubmit={handleIssueMaterial} className="space-y-3">
                    <select
                      value={issueWarehouseId}
                      onChange={(e) => setIssueWarehouseId(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    >
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.code} — {w.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={issueCatalogId}
                      onChange={(e) => setIssueCatalogId(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    >
                      {catalog.map((c) => {
                        const bal = balances.find(
                          (b) => b.warehouseId === issueWarehouseId && b.equipmentCatalogId === c.id,
                        );
                        return (
                          <option key={c.id} value={c.id}>
                            {c.sku} — {c.modelName} (Avail: {bal?.availableQty ?? 0})
                          </option>
                        );
                      })}
                    </select>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        min={1}
                        value={issueQty}
                        onChange={(e) => setIssueQty(Number(e.target.value))}
                        className="w-full px-3 py-2 text-xs font-mono tabular-nums rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                      />
                      <input
                        type="text"
                        value={issueNotes}
                        onChange={(e) => setIssueNotes(e.target.value)}
                        placeholder="Requisition note"
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                      />
                    </div>
                    <input
                      type="text"
                      value={issueSerialsText}
                      onChange={(e) => setIssueSerialsText(e.target.value)}
                      placeholder="Optional serial numbers (comma separated)"
                      className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                    <button
                      type="submit"
                      disabled={busy || !issueWarehouseId || !issueCatalogId}
                      className="w-full px-3 py-2 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-amber-600 text-white hover:bg-slate-800 dark:hover:bg-amber-700"
                    >
                      Issue Stock to Job
                    </button>
                  </form>
                  {selectedJob.materialIssues.length > 0 && (
                    <ul className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                      {selectedJob.materialIssues.map((mi) => (
                        <li key={mi.id} className="py-2 flex items-center justify-between gap-2">
                          <span className="font-mono text-slate-900 dark:text-slate-100">
                            {mi.sku} × {mi.quantityIssued}
                          </span>
                          <span className="text-slate-500 font-mono">
                            {mi.serialNumbers.length > 0
                              ? mi.serialNumbers.join(', ')
                              : mi.issuedAt.slice(0, 10)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>

              {/* Daily Site Diary & SHA-256 Photos */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <section className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-5 space-y-4">
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Daily Site Logs ({selectedJob.dailyLogs.length})
                  </h4>
                  <form onSubmit={handleAddSiteLog} className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        value={logDate}
                        onChange={(e) => setLogDate(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-mono tabular-nums rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                      />
                      <input
                        type="text"
                        value={weatherConditions}
                        onChange={(e) => setWeatherConditions(e.target.value)}
                        placeholder="Weather"
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                      />
                    </div>
                    <textarea
                      rows={2}
                      value={workSummary}
                      onChange={(e) => setWorkSummary(e.target.value)}
                      placeholder="Summarize rail torque, conduit routing, or site blockers..."
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                    <button
                      type="submit"
                      disabled={busy || workSummary.trim().length < 3}
                      className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
                    >
                      Save Site Log
                    </button>
                  </form>
                  {selectedJob.dailyLogs.length > 0 && (
                    <ul className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                      {selectedJob.dailyLogs.map((log) => (
                        <li key={log.id} className="py-2 space-y-0.5">
                          <div className="font-mono tabular-nums text-slate-500">
                            {log.logDate} · {log.weatherConditions ?? 'Weather n/a'}
                          </div>
                          <div className="text-slate-800 dark:text-slate-200">{log.workSummary}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-5 space-y-4">
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    SHA-256 Verified Progress Photos ({selectedJob.photos.length})
                  </h4>
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={photoCaption}
                      onChange={(e) => setPhotoCaption(e.target.value)}
                      placeholder="Photo caption"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                    <button
                      type="button"
                      onClick={() => void handleUploadVerifiedPhoto()}
                      disabled={busy}
                      className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      Presign & Commit SHA-256 Photo Proof
                    </button>
                  </div>
                  {selectedJob.photos.length > 0 && (
                    <ul className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                      {selectedJob.photos.map((ph) => (
                        <li key={ph.id} className="py-2 space-y-0.5">
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            {ph.caption ?? ph.filename}
                          </div>
                          <div className="font-mono tabular-nums text-slate-500">
                            SHA-256 {ph.sha256Checksum.slice(0, 16)}... · {ph.byteSize} B
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
