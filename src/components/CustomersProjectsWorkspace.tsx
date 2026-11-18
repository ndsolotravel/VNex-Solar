import { useEffect, useState, type FormEvent } from 'react';
import type {
  CustomerRecord,
  CustomerType,
  NavSectionId,
  ProjectRecord,
  SiteRecord,
  SupportedCurrency,
  SystemType,
} from '../../packages/domain/src/index.ts';
import type { WebAuthSession } from '../lib/auth-session.ts';

interface Props {
  currency: SupportedCurrency;
  session: WebAuthSession | null;
  onSessionEstablished: (session: WebAuthSession) => void;
  onNavigateSection: (section: NavSectionId) => void;
}

export function CustomersProjectsWorkspace({
  currency,
  session,
  onSessionEstablished,
  onNavigateSection,
}: Props) {
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [sites, setSites] = useState<SiteRecord[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Customer form
  const [customerType, setCustomerType] = useState<CustomerType>('commercial');
  const [fullName, setFullName] = useState('Al-Noor Cold Chain Logistics');
  const [primaryPhone, setPrimaryPhone] = useState('+92-300-5550192');
  const [customerEmail, setCustomerEmail] = useState('ops@alnoorlogistics.pk');

  // Edit selected customer inline
  const [editName, setEditName] = useState('');

  // Site form
  const [siteName, setSiteName] = useState('Sundar Industrial Plant 2');
  const [addressLine, setAddressLine] = useState('Plot 42-B, Sundar Industrial Estate');
  const [city, setCity] = useState('Lahore');
  const [utilityProvider, setUtilityProvider] = useState('LESCO');
  const [connectionPhase, setConnectionPhase] = useState<'single' | 'three'>('three');

  // Project form
  const [projectTitle, setProjectTitle] = useState('45 kWp Hybrid Cold-Storage Rooftop');
  const [projectSiteId, setProjectSiteId] = useState('');
  const [systemType, setSystemType] = useState<SystemType>('hybrid');
  const [targetKwp, setTargetKwp] = useState('45');

  async function ensureActiveSession(): Promise<WebAuthSession> {
    if (session) return session;
    const slug = `vnex-ops-${Math.floor(1000 + Math.random() * 9000)}`;
    const res = await fetch('/api/v1/auth/register-organization', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        legalName: 'VNex Solar Field Operations Pvt Ltd',
        displayName: 'VNex Solar Field Operations',
        slug,
        businessAddress: 'Main Boulevard, Gulberg III, Lahore',
        countryCode: 'PK',
        defaultCurrency: currency,
        ownerFullName: 'Bilal Siddiqui',
        ownerEmail: `${slug}@vnexsolar.pk`,
        password: 'Operations!2026',
        deviceId: 'web-admin-crm',
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

  async function loadWorkspace(activeSession: WebAuthSession, q = searchQuery) {
    const headers = { Authorization: `Bearer ${activeSession.accessToken}` };
    const [custRes, projRes] = await Promise.all([
      fetch(`/api/v1/customers${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`, {
        headers,
      }),
      fetch('/api/v1/projects', { headers }),
    ]);

    if (custRes.ok) {
      const cData = await custRes.json();
      const list: CustomerRecord[] = cData.customers ?? [];
      setCustomers(list);
      if (list.length > 0 && (!selectedCustomerId || !list.some((c) => c.id === selectedCustomerId))) {
        setSelectedCustomerId(list[0].id);
        setEditName(list[0].fullName);
      }
    }
    if (projRes.ok) {
      const pData = await projRes.json();
      setProjects(pData.projects ?? []);
    }
  }

  async function loadSites(activeSession: WebAuthSession, customerId: string) {
    if (!customerId) {
      setSites([]);
      return;
    }
    const res = await fetch(`/api/v1/customers/${customerId}/sites`, {
      headers: { Authorization: `Bearer ${activeSession.accessToken}` },
    });
    if (res.ok) {
      const sData = await res.json();
      const siteList: SiteRecord[] = sData.sites ?? [];
      setSites(siteList);
      if (siteList.length > 0) {
        setProjectSiteId(siteList[0].id);
      } else {
        setProjectSiteId('');
      }
    }
  }

  useEffect(() => {
    if (session) {
      void loadWorkspace(session);
    }
  }, [session]);

  useEffect(() => {
    if (session && selectedCustomerId) {
      const currentCustomer = customers.find((c) => c.id === selectedCustomerId);
      if (currentCustomer) setEditName(currentCustomer.fullName);
      void loadSites(session, selectedCustomerId);
    }
  }, [session, selectedCustomerId]);

  async function handleCreateCustomer(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrMsg(null);
    setStatusMsg(null);
    try {
      const active = await ensureActiveSession();
      const res = await fetch('/api/v1/customers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${active.accessToken}`,
        },
        body: JSON.stringify({
          customerType,
          fullName,
          primaryPhone: primaryPhone || null,
          email: customerEmail || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Failed to create customer');
      setSelectedCustomerId(data.id);
      setEditName(data.fullName);
      setStatusMsg(`Created customer ${data.customerCode} · ${data.fullName} (v${data.rowVersion}).`);
      await loadWorkspace(active);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Customer creation failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateCustomerName() {
    if (!selectedCustomerId || !editName.trim()) return;
    const current = customers.find((c) => c.id === selectedCustomerId);
    if (!current) return;
    setBusy(true);
    setErrMsg(null);
    try {
      const active = await ensureActiveSession();
      const res = await fetch(`/api/v1/customers/${selectedCustomerId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${active.accessToken}`,
        },
        body: JSON.stringify({
          baseRowVersion: current.rowVersion,
          fullName: editName.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Customer update failed');
      setStatusMsg(`Updated ${data.customerCode} cleanly to rowVersion v${data.rowVersion}.`);
      await loadWorkspace(active);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Customer update failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateSite(e: FormEvent) {
    e.preventDefault();
    if (!selectedCustomerId) return;
    setBusy(true);
    setErrMsg(null);
    try {
      const active = await ensureActiveSession();
      const res = await fetch(`/api/v1/customers/${selectedCustomerId}/sites`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${active.accessToken}`,
        },
        body: JSON.stringify({
          siteName,
          addressLine,
          city,
          countryCode: 'PK',
          utilityProvider: utilityProvider || null,
          connectionPhase,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Failed to add installation site');
      setProjectSiteId(data.id);
      setStatusMsg(`Registered site "${data.siteName}" in ${data.city}.`);
      await loadSites(active, selectedCustomerId);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Site creation failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateProject(e: FormEvent) {
    e.preventDefault();
    if (!selectedCustomerId || !projectSiteId) return;
    setBusy(true);
    setErrMsg(null);
    try {
      const active = await ensureActiveSession();
      const res = await fetch('/api/v1/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${active.accessToken}`,
        },
        body: JSON.stringify({
          customerId: selectedCustomerId,
          siteId: projectSiteId,
          title: projectTitle,
          systemType,
          targetCapacityKwp: Number(targetKwp) || null,
          currency,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Failed to create solar project');
      setStatusMsg(`Created project ${data.projectCode} · stage ${data.currentStage}.`);
      await loadWorkspace(active);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Project creation failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-5 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Phase 5 · Customers, Sites & Project Pipeline
          </p>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 mt-1">
            Customers & Solar Projects
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
            Manage tenant-isolated customer accounts, metered installation sites, and solar project stages backed by optimistic row-version checks.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!session && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void ensureActiveSession().then((s) => loadWorkspace(s))}
              className="px-3.5 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium whitespace-nowrap"
            >
              Initialize Workspace Session
            </button>
          )}
          <button
            type="button"
            onClick={() => onNavigateSection('surveys')}
            className="px-3.5 py-2 rounded-md bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium whitespace-nowrap"
          >
            Open Site Surveys
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="p-3.5 rounded-md border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 text-xs text-emerald-800 dark:text-emerald-300">
          {statusMsg}
        </div>
      )}

      {errMsg && (
        <div className="p-3.5 rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-xs text-red-800 dark:text-red-300">
          {errMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 p-5 space-y-4">
          <h2 className="font-display text-base font-semibold">1. Create Customer</h2>
          <form onSubmit={handleCreateCustomer} className="space-y-3">
            <label className="block space-y-1 text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300">Segment</span>
              <select
                value={customerType}
                onChange={(e) => setCustomerType(e.target.value as CustomerType)}
                className="w-full h-9 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              >
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
                <option value="industrial">Industrial</option>
                <option value="agricultural">Agricultural</option>
              </select>
            </label>
            <label className="block space-y-1 text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300">
                Customer / Company Name
              </span>
              <input
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1 text-xs">
                <span className="font-medium text-slate-700 dark:text-slate-300">Phone</span>
                <input
                  value={primaryPhone}
                  onChange={(e) => setPrimaryPhone(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </label>
              <label className="block space-y-1 text-xs">
                <span className="font-medium text-slate-700 dark:text-slate-300">Email</span>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full px-4 py-2 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium"
            >
              Register Customer
            </button>
          </form>
        </section>

        <section className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 p-5 space-y-4">
          <h2 className="font-display text-base font-semibold">2. Add Metered Site</h2>
          <form onSubmit={handleCreateSite} className="space-y-3">
            <label className="block space-y-1 text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300">Customer</span>
              <select
                required
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="w-full h-9 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              >
                <option value="">Select customer...</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.customerCode} · {c.fullName}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1 text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300">Site Name</span>
              <input
                required
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </label>
            <label className="block space-y-1 text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300">Street Address</span>
              <input
                required
                value={addressLine}
                onChange={(e) => setAddressLine(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </label>
            <div className="grid grid-cols-3 gap-2">
              <label className="block space-y-1 text-xs">
                <span className="font-medium text-slate-700 dark:text-slate-300">City</span>
                <input
                  required
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </label>
              <label className="block space-y-1 text-xs">
                <span className="font-medium text-slate-700 dark:text-slate-300">DISCO</span>
                <input
                  value={utilityProvider}
                  onChange={(e) => setUtilityProvider(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </label>
              <label className="block space-y-1 text-xs">
                <span className="font-medium text-slate-700 dark:text-slate-300">Phase</span>
                <select
                  value={connectionPhase}
                  onChange={(e) => setConnectionPhase(e.target.value as 'single' | 'three')}
                  className="w-full h-9 px-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                >
                  <option value="three">3-Phase</option>
                  <option value="single">1-Phase</option>
                </select>
              </label>
            </div>
            <button
              type="submit"
              disabled={busy || !selectedCustomerId}
              className="w-full px-4 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium disabled:opacity-50"
            >
              Add Installation Site
            </button>
          </form>
        </section>

        <section className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 p-5 space-y-4">
          <h2 className="font-display text-base font-semibold">3. Launch Project</h2>
          <form onSubmit={handleCreateProject} className="space-y-3">
            <label className="block space-y-1 text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300">Site</span>
              <select
                required
                value={projectSiteId}
                onChange={(e) => setProjectSiteId(e.target.value)}
                className="w-full h-9 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              >
                <option value="">Select site...</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.siteName} · {s.city}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1 text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300">Project Title</span>
              <input
                required
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1 text-xs">
                <span className="font-medium text-slate-700 dark:text-slate-300">Architecture</span>
                <select
                  value={systemType}
                  onChange={(e) => setSystemType(e.target.value as SystemType)}
                  className="w-full h-9 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                >
                  <option value="on_grid">On-Grid</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="off_grid">Off-Grid</option>
                </select>
              </label>
              <label className="block space-y-1 text-xs">
                <span className="font-medium text-slate-700 dark:text-slate-300">Target kWp</span>
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  value={targetKwp}
                  onChange={(e) => setTargetKwp(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono tabular-nums"
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={busy || !projectSiteId}
              className="w-full px-4 py-2 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium disabled:opacity-50"
            >
              Create Solar Project
            </button>
          </form>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-sm font-semibold">Tenant Customers</h2>
            <div className="flex items-center gap-2">
              <input
                value={searchQuery}
                onChange={(e) => {
                  const next = e.target.value;
                  setSearchQuery(next);
                  if (session) void loadWorkspace(session, next);
                }}
                placeholder="Search code or name..."
                className="h-8 px-2.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
              />
            </div>
          </div>

          {customers.length === 0 ? (
            <div className="p-6 text-xs text-slate-500">
              No customers yet. Register a customer above to begin project onboarding.
            </div>
          ) : (
            <>
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-slate-500">
                    <th className="py-2.5 px-4">Code</th>
                    <th className="py-2.5 px-4">Name</th>
                    <th className="py-2.5 px-4">Segment</th>
                    <th className="py-2.5 px-4 text-right">Version</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {customers.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedCustomerId(c.id)}
                      className={`cursor-pointer ${
                        selectedCustomerId === c.id
                          ? 'bg-amber-50/60 dark:bg-amber-950/20'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-2.5 px-4 font-mono">{c.customerCode}</td>
                      <td className="py-2.5 px-4 font-medium">{c.fullName}</td>
                      <td className="py-2.5 px-4 capitalize text-slate-600 dark:text-slate-400">
                        {c.customerType}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                        v{c.rowVersion}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {selectedCustomerId && (
                <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 flex flex-wrap items-center gap-2">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    aria-label="Update selected customer name"
                    className="flex-1 min-w-[180px] h-8 px-2.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleUpdateCustomerName}
                    className="px-3 h-8 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Save Versioned Edit
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        <section className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold">Solar Projects</h2>
            <span className="font-mono tabular-nums text-xs text-slate-500">
              {projects.length} active
            </span>
          </div>
          {projects.length === 0 ? (
            <div className="p-6 text-xs text-slate-500">
              Add a customer and metered site, then launch a solar project to track stages and site surveys.
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-slate-500">
                  <th className="py-2.5 px-4">Project</th>
                  <th className="py-2.5 px-4">Type</th>
                  <th className="py-2.5 px-4">Stage</th>
                  <th className="py-2.5 px-4 text-right">kWp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {projects.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2.5 px-4">
                      <div className="font-mono text-slate-500">{p.projectCode}</div>
                      <div className="font-medium text-slate-900 dark:text-slate-100">{p.title}</div>
                    </td>
                    <td className="py-2.5 px-4 font-mono">{p.systemType}</td>
                    <td className="py-2.5 px-4 font-mono text-emerald-700 dark:text-emerald-400">
                      {p.currentStage}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                      {p.targetCapacityKwp ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
