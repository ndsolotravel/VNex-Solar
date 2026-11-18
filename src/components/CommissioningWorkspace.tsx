import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  DEFAULT_COMMISSIONING_TESTS,
  DEFAULT_PV_CHECKLIST_ITEMS,
  evaluateCommissioningReadiness,
  type AssetRegisterRecord,
  type CommissioningRecordDetail,
  type InstallationJobRecord,
  type ProjectRecord,
  type SupportedCurrency,
} from '../../packages/domain/src/index.ts';
import type { WebAuthSession } from '../lib/auth-session.ts';

interface Props {
  currency: SupportedCurrency;
  session: WebAuthSession | null;
  onSessionEstablished: (session: WebAuthSession) => void;
}

const STATUS_BADGE_CLASS: Record<CommissioningRecordDetail['status'], string> = {
  pending_safety:
    'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
  ready_for_review:
    'bg-sky-50 dark:bg-sky-950/50 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-800',
  approved:
    'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800',
  rejected:
    'bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800',
};

export function CommissioningWorkspace({ currency, session, onSessionEstablished }: Props) {
  const [records, setRecords] = useState<CommissioningRecordDetail[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [jobs, setJobs] = useState<InstallationJobRecord[]>([]);
  const [assets, setAssets] = useState<AssetRegisterRecord[]>([]);
  const [selectedId, setSelectedId] = useState('');

  // Create package form
  const [newProjectId, setNewProjectId] = useState('');
  const [newJobId, setNewJobId] = useState('');

  // Custom test form
  const [testName, setTestName] = useState('Open Circuit String Voltage (Voc)');
  const [measuredValue, setMeasuredValue] = useState('645 V DC');
  const [testPassed, setTestPassed] = useState(true);

  // Engineer decision form
  const [approvalNotes, setApprovalNotes] = useState(
    'Verified Voc, anti-islanding trip (<2.0s), CT zero-export polarity, and LFP BMS loop.',
  );
  const [telemetryProvider, setTelemetryProvider] = useState('Solarman / Modbus TCP');

  // Handover signoff
  const [signoffName, setSignoffName] = useState('Tariq Mahmood (Facility Owner)');
  const [printableHtml, setPrintableHtml] = useState<string | null>(null);
  const [printableCode, setPrintableCode] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  async function ensureActiveSession(): Promise<WebAuthSession> {
    if (session) return session;
    const slug = `vnex-comm-${Math.floor(1000 + Math.random() * 9000)}`;
    const res = await fetch('/api/v1/auth/register-organization', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        legalName: 'VNex Solar Commissioning Engineering Ltd',
        displayName: 'VNex Solar Commissioning',
        slug,
        businessAddress: 'Gulberg III, Lahore',
        countryCode: 'PK',
        defaultCurrency: currency,
        ownerFullName: 'Engr. Kamran Siddiqui',
        ownerEmail: `${slug}@vnexsolar.pk`,
        password: 'CommOps!2026',
        deviceId: 'web-commissioning-console',
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

  async function loadWorkspace(active: WebAuthSession, targetRecordId?: string) {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${active.accessToken}` };
      const [commRes, assetRes, jobsRes, projRes] = await Promise.all([
        fetch('/api/v1/commissioning', { headers }),
        fetch('/api/v1/assets', { headers }),
        fetch('/api/v1/installations', { headers }),
        fetch('/api/v1/projects', { headers }),
      ]);

      if (!commRes.ok) {
        const b = await commRes.json().catch(() => ({}));
        throw new Error(b?.error?.message ?? `Role (${active.role}) cannot access commissioning records`);
      }

      const commData = await commRes.json();
      const nextRecords: CommissioningRecordDetail[] = commData.records ?? [];
      setRecords(nextRecords);

      if (assetRes.ok) {
        const assetData = await assetRes.json();
        setAssets(assetData.assets ?? []);
      }

      if (jobsRes.ok) {
        const jobsData = await jobsRes.json();
        const nextJobs: InstallationJobRecord[] = jobsData.installations ?? [];
        setJobs(nextJobs);
        if (!newJobId && nextJobs[0]) setNewJobId(nextJobs[0].id);
      }

      if (projRes.ok) {
        const projData = await projRes.json();
        const nextProj: ProjectRecord[] = projData.projects ?? [];
        setProjects(nextProj);
        if (!newProjectId && nextProj[0]) setNewProjectId(nextProj[0].id);
      }

      const focusId =
        targetRecordId ??
        (selectedId && nextRecords.some((r) => r.id === selectedId)
          ? selectedId
          : nextRecords[0]?.id ?? '');
      setSelectedId(focusId);
      setErrMsg(null);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Unable to load commissioning workspace');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (session) {
      void loadWorkspace(session);
    }
  }, [session?.accessToken, session?.organizationId]);

  const activeRecord = useMemo(
    () => records.find((r) => r.id === selectedId) ?? null,
    [records, selectedId],
  );

  const linkedJob = useMemo(
    () => (activeRecord ? jobs.find((j) => j.id === activeRecord.installationJobId) ?? null : null),
    [activeRecord, jobs],
  );

  const readiness = useMemo(() => {
    if (!activeRecord) return null;
    const jobCompleted = linkedJob ? linkedJob.status === 'completed' : true;
    return evaluateCommissioningReadiness(
      activeRecord.safetyClearedSnapshot,
      jobCompleted,
      activeRecord.tests,
    );
  }, [activeRecord, linkedJob]);

  async function handleBootstrapReadySite() {
    setBusy(true);
    setErrMsg(null);
    setStatusMsg(null);
    try {
      const active = await ensureActiveSession();
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${active.accessToken}`,
      };

      const custRes = await fetch('/api/v1/customers', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customerType: 'commercial',
          fullName: 'Tariq Mahmood',
          companyName: 'Crescent Cold Storage Pvt Ltd',
          phone: '+92-300-8844221',
          email: `crescent-${Date.now()}@vnexsolar.pk`,
          billingAddress: 'Sundar Industrial Estate, Lahore',
          city: 'Lahore',
          countryCode: 'PK',
        }),
      });
      const custData = await custRes.json();
      if (!custRes.ok) throw new Error(custData?.error?.message ?? 'Failed to create customer');

      const siteRes = await fetch(`/api/v1/customers/${custData.id}/sites`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          siteName: 'Cold Store Roof Array',
          addressLine: 'Plot 19-B, Sundar Industrial Estate',
          city: 'Lahore',
          countryCode: 'PK',
          connectionPhase: 'three',
        }),
      });
      const siteData = await siteRes.json();
      if (!siteRes.ok) throw new Error(siteData?.error?.message ?? 'Failed to create site');

      const projRes = await fetch('/api/v1/projects', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customerId: custData.id,
          siteId: siteData.id,
          title: '50kW Hybrid Industrial Array',
          systemType: 'hybrid',
          targetCapacityKwp: 50,
          currency,
        }),
      });
      const project: ProjectRecord = await projRes.json();
      if (!projRes.ok) throw new Error('Failed to create project');

      // Seed warehouse & supplier if needed, receive serialized inverter stock, and issue to project
      const whRes = await fetch('/api/v1/inventory/warehouses', { headers });
      const whData = await whRes.json();
      let warehouseId: string | undefined = whData.warehouses?.[0]?.id;
      if (!warehouseId) {
        const wCreate = await fetch('/api/v1/inventory/warehouses', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            code: `WH-${Math.floor(100 + Math.random() * 899)}`,
            name: 'Lahore Central Warehouse',
            address: 'Sundar Industrial Estate, Lahore',
            isDefault: true,
          }),
        });
        if (wCreate.ok) warehouseId = (await wCreate.json()).id;
      }

      const supRes = await fetch('/api/v1/inventory/suppliers', { headers });
      const supData = await supRes.json();
      let supplierId: string | undefined = supData.suppliers?.[0]?.id;
      if (!supplierId) {
        const sCreate = await fetch('/api/v1/inventory/suppliers', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            name: 'GoodWe MENA Distribution',
            contactName: 'Faisal Raza',
          }),
        });
        if (sCreate.ok) supplierId = (await sCreate.json()).id;
      }

      const catRes = await fetch('/api/v1/inventory/catalog', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sku: `INV-50K-${Math.floor(100 + Math.random() * 899)}`,
          category: 'inverter',
          manufacturerName: 'GoodWe',
          modelName: 'ET-50kW Hybrid Three-Phase',
          unitOfMeasure: 'pcs',
          unitCostMinor: 145000000,
          unitSellPriceMinor: 175000000,
          currency,
          warrantyMonths: 60,
          isSerialized: true,
        }),
      });
      const catItem = await catRes.json();
      if (catRes.ok && warehouseId && supplierId) {
        const poRes = await fetch('/api/v1/inventory/purchase-orders', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            supplierId,
            warehouseId,
            currency,
            items: [{ equipmentCatalogId: catItem.id, quantityOrdered: 1, unitCostMinor: 145000000 }],
          }),
        });
        const po = await poRes.json();
        if (poRes.ok) {
          await fetch(`/api/v1/inventory/purchase-orders/${po.id}/issue`, {
            method: 'POST',
            headers,
          });
          const serialNum = `GW50K-${Math.floor(100000 + Math.random() * 899999)}`;
          await fetch(`/api/v1/inventory/purchase-orders/${po.id}/receive`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              idempotencyKey: `rcv-${Date.now()}`,
              equipmentCatalogId: catItem.id,
              quantityReceived: 1,
              serialNumbers: [serialNum],
            }),
          });
          await fetch('/api/v1/inventory/issues', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              idempotencyKey: `iss-${Date.now()}`,
              warehouseId,
              equipmentCatalogId: catItem.id,
              projectId: project.id,
              quantity: 1,
              serialNumbers: [serialNum],
            }),
          });
        }
      }

      // Create & complete installation job
      const jobRes = await fetch('/api/v1/installations', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          projectId: project.id,
          scheduledStartDate: new Date().toISOString().slice(0, 10),
          taskTitles: [
            'Mount inverter skid & AC/DC combiner',
            'Terminate PV strings & earth bonding grid',
          ],
        }),
      });
      const job: InstallationJobRecord = await jobRes.json();
      if (!jobRes.ok) throw new Error('Failed to create installation job');

      for (const task of job.tasks) {
        await fetch(`/api/v1/installations/${job.id}/tasks/${task.id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            baseRowVersion: task.rowVersion,
            status: 'completed',
          }),
        });
      }

      // Pass Risk Assessment & IEC 62446-1 inspection so hard safety gate clears
      const raRes = await fetch('/api/v1/safety/risk-assessments', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          installationJobId: job.id,
          workingAtHeightRequired: true,
          ppeComplianceVerified: true,
          electricalIsolationVerified: true,
          hazardNotes: 'Harnesses, insulated gloves, and DC isolator LOTO verified.',
        }),
      });
      const ra = await raRes.json();
      await fetch(`/api/v1/safety/risk-assessments/${ra.id}/approve`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ notes: 'Safety gate risk assessment passed.' }),
      });

      const inspRes = await fetch('/api/v1/safety/inspections', {
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
            { parameterName: 'Earth Loop Resistance', measuredValue: 1.2, unit: 'Ohm', withinTolerance: true },
            { parameterName: 'DC Insulation Resistance', measuredValue: 520, unit: 'MOhm', withinTolerance: true },
          ],
        }),
      });
      const insp = await inspRes.json();
      await fetch(`/api/v1/safety/inspections/${insp.id}/approve`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ notes: 'IEC 62446-1 compliant.' }),
      });

      await fetch(`/api/v1/installations/${job.id}/complete`, { method: 'POST', headers });

      const commRes = await fetch('/api/v1/commissioning', {
        method: 'POST',
        headers,
        body: JSON.stringify({ projectId: project.id, installationJobId: job.id }),
      });
      const comm: CommissioningRecordDetail = await commRes.json();
      if (!commRes.ok) throw new Error('Failed to open commissioning package');

      setStatusMsg(
        `Commissioning package ${comm.certificateCode} opened for ${project.title} with safety gate cleared & serialized inverter linked.`,
      );
      setPrintableHtml(null);
      await loadWorkspace(active, comm.id);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Demo bootstrap failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreatePackage(e: FormEvent) {
    e.preventDefault();
    if (!newProjectId || !newJobId) return;
    setBusy(true);
    setErrMsg(null);
    try {
      const active = await ensureActiveSession();
      const res = await fetch('/api/v1/commissioning', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${active.accessToken}`,
        },
        body: JSON.stringify({ projectId: newProjectId, installationJobId: newJobId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Unable to open commissioning package');
      setStatusMsg(`Opened commissioning package ${data.certificateCode}.`);
      setPrintableHtml(null);
      await loadWorkspace(active, data.id);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Create package failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleAddStandardTests() {
    if (!activeRecord) return;
    setBusy(true);
    setErrMsg(null);
    try {
      const active = await ensureActiveSession();
      for (const item of DEFAULT_COMMISSIONING_TESTS) {
        const res = await fetch(`/api/v1/commissioning/${activeRecord.id}/tests`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${active.accessToken}`,
          },
          body: JSON.stringify(item),
        });
        if (!res.ok) {
          const b = await res.json().catch(() => ({}));
          throw new Error(b?.error?.message ?? 'Unable to log standard commissioning test');
        }
      }
      setStatusMsg(`Recorded ${DEFAULT_COMMISSIONING_TESTS.length} IEC commissioning suite tests.`);
      await loadWorkspace(active, activeRecord.id);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Test suite logging failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleAddSingleTest(e: FormEvent) {
    e.preventDefault();
    if (!activeRecord) return;
    setBusy(true);
    setErrMsg(null);
    try {
      const active = await ensureActiveSession();
      const res = await fetch(`/api/v1/commissioning/${activeRecord.id}/tests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${active.accessToken}`,
        },
        body: JSON.stringify({ testName, measuredValue, passed: testPassed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Unable to add commissioning test');
      setStatusMsg(`Recorded test: ${testName}.`);
      await loadWorkspace(active, activeRecord.id);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Add test failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleDecision(decision: 'approved' | 'rejected') {
    if (!activeRecord) return;
    setBusy(true);
    setErrMsg(null);
    try {
      const active = await ensureActiveSession();
      const res = await fetch(
        `/api/v1/commissioning/${activeRecord.id}/${decision === 'approved' ? 'approve' : 'reject'}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${active.accessToken}`,
          },
          body: JSON.stringify({ notes: approvalNotes, telemetryProvider }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? `Commissioning ${decision} blocked`);
      setStatusMsg(
        decision === 'approved'
          ? `Certificate ${data.certificateCode} approved immutably — ${data.generatedAssets?.length ?? 0} QR asset(s) registered.`
          : `Certificate ${data.certificateCode} rejected for remediation.`,
      );
      await loadWorkspace(active, data.id);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Decision failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleAcknowledgeHandover(e: FormEvent) {
    e.preventDefault();
    if (!activeRecord || !activeRecord.handoverDocuments[0]) return;
    setBusy(true);
    setErrMsg(null);
    try {
      const active = await ensureActiveSession();
      const handoverId = activeRecord.handoverDocuments[0].id;
      const res = await fetch(
        `/api/v1/commissioning/${activeRecord.id}/handovers/${handoverId}/acknowledge`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${active.accessToken}`,
          },
          body: JSON.stringify({ signoffName }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Handover acknowledgement failed');
      setStatusMsg(`Customer handover signed off by ${signoffName}; project moved to handed_over.`);
      await loadWorkspace(active, data.id);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Handover signoff failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleLoadPrintable() {
    if (!activeRecord) return;
    setBusy(true);
    setErrMsg(null);
    try {
      const active = await ensureActiveSession();
      const res = await fetch(`/api/v1/commissioning/${activeRecord.id}/printable`, {
        headers: { Authorization: `Bearer ${active.accessToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Unable to render certificate');
      setPrintableCode(data.certificateCode);
      setPrintableHtml(data.html);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Printable preview failed');
    } finally {
      setBusy(false);
    }
  }

  const approvedCount = records.filter((r) => r.status === 'approved').length;

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Commissioning Certificates & Handover Register
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Enforces hard safety gate clearance, immutable Solar Engineer sign-off, SHA-256 handover packs, and QR asset registration.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={busy}
            onClick={handleBootstrapReadySite}
            className="px-4 py-2 rounded-md bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            {busy ? 'Working...' : 'Bootstrap Ready Site'}
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

      {/* 4 Top KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Active Safety Gate Snapshot
          </div>
          <div className="mt-2 font-mono tabular-nums text-xl font-bold text-slate-900 dark:text-slate-50">
            {activeRecord ? (activeRecord.safetyClearedSnapshot ? 'CLEARED' : 'BLOCKED') : 'N/A'}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Commissioning Packages
          </div>
          <div className="mt-2 font-mono tabular-nums text-xl font-bold text-slate-900 dark:text-slate-50">
            {approvedCount} / {records.length} Approved
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Verification Tests Logged
          </div>
          <div className="mt-2 font-mono tabular-nums text-xl font-bold text-slate-900 dark:text-slate-50">
            {activeRecord
              ? `${activeRecord.tests.filter((t) => t.passed).length} / ${activeRecord.tests.length} Pass`
              : '0 / 0'}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            QR Assets Registered
          </div>
          <div className="mt-2 font-mono tabular-nums text-xl font-bold text-slate-900 dark:text-slate-50">
            {assets.length}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Package Selector & Create Form */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50 mb-3">
              Commissioning Queue ({records.length})
            </h3>
            {records.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No commissioning packages opened yet. Use “Bootstrap Ready Site” or link an installation job below.
              </p>
            ) : (
              <ul className="space-y-2">
                {records.map((rec) => {
                  const selected = rec.id === activeRecord?.id;
                  return (
                    <li key={rec.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(rec.id);
                          setPrintableHtml(null);
                        }}
                        className={`w-full text-left p-3 rounded-md border transition-colors ${
                          selected
                            ? 'bg-amber-50/60 dark:bg-amber-950/30 border-amber-400 dark:border-amber-700'
                            : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                            {rec.certificateCode}
                          </span>
                          <span
                            className={`text-[11px] font-medium px-2 py-0.5 rounded ${STATUS_BADGE_CLASS[rec.status]}`}
                          >
                            {rec.status}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                          Tests: {rec.tests.length} · Assets: {rec.generatedAssets.length}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <form
            onSubmit={handleCreatePackage}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3"
          >
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
              Open New Package
            </h3>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Project
              </label>
              <select
                value={newProjectId}
                onChange={(e) => setNewProjectId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="">Select project...</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.projectCode} — {p.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Installation Job
              </label>
              <select
                value={newJobId}
                onChange={(e) => setNewJobId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="">Select installation job...</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.jobCode} ({j.status})
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={busy || !newProjectId || !newJobId}
              className="w-full px-3 py-2 rounded-md bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold hover:opacity-90 disabled:opacity-40"
            >
              Open Commissioning Record
            </button>
          </form>
        </div>

        {/* Right Column: Active Record Tests, Approval Gate, Handover & Printable */}
        <div className="lg:col-span-8 space-y-6">
          {!activeRecord ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              Select or bootstrap a commissioning record to log electrical verification tests, execute Solar Engineer approval, and capture customer handover sign-off.
            </div>
          ) : (
            <>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-mono text-base font-bold text-slate-900 dark:text-slate-50">
                      {activeRecord.certificateCode}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Safety Gate:{' '}
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {activeRecord.safetyClearedSnapshot ? 'CLEARED' : 'BLOCKED'}
                      </span>{' '}
                      · Job Status:{' '}
                      <span className="font-mono">{linkedJob?.status ?? 'linked'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded ${STATUS_BADGE_CLASS[activeRecord.status]}`}
                    >
                      {activeRecord.status.toUpperCase()}
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleLoadPrintable}
                      className="px-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      Preview Certificate HTML
                    </button>
                  </div>
                </div>

                {readiness && !readiness.ready && activeRecord.status !== 'approved' && (
                  <div className="p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                    <div className="font-semibold">Approval Pre-Checks Pending:</div>
                    <ul className="list-disc pl-4 space-y-0.5">
                      {readiness.blockers.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Commissioning Tests */}
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                      IEC Commissioning Test Suite
                    </h4>
                    {activeRecord.status !== 'approved' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={handleAddStandardTests}
                        className="px-3 py-1.5 rounded-md bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium hover:opacity-90 disabled:opacity-40"
                      >
                        Record 4 Standard IEC Tests
                      </button>
                    )}
                  </div>

                  {activeRecord.status !== 'approved' && (
                    <form onSubmit={handleAddSingleTest} className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                      <input
                        type="text"
                        value={testName}
                        onChange={(e) => setTestName(e.target.value)}
                        placeholder="Test name"
                        className="sm:col-span-5 px-3 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                        required
                      />
                      <input
                        type="text"
                        value={measuredValue}
                        onChange={(e) => setMeasuredValue(e.target.value)}
                        placeholder="Measured reading"
                        className="sm:col-span-4 px-3 py-1.5 text-xs font-mono rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                        required
                      />
                      <select
                        value={testPassed ? 'pass' : 'fail'}
                        onChange={(e) => setTestPassed(e.target.value === 'pass')}
                        className="sm:col-span-1 px-2 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                      >
                        <option value="pass">Pass</option>
                        <option value="fail">Fail</option>
                      </select>
                      <button
                        type="submit"
                        disabled={busy}
                        className="sm:col-span-2 px-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        Add Test
                      </button>
                    </form>
                  )}

                  <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-md">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300">
                        <tr>
                          <th className="px-3 py-2 font-medium">Verification Test</th>
                          <th className="px-3 py-2 font-medium">Measured Value</th>
                          <th className="px-3 py-2 font-medium">Outcome</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {activeRecord.tests.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="px-3 py-3 text-slate-500">
                              No commissioning tests logged yet.
                            </td>
                          </tr>
                        ) : (
                          activeRecord.tests.map((t) => (
                            <tr key={t.id}>
                              <td className="px-3 py-2 text-slate-800 dark:text-slate-200">{t.testName}</td>
                              <td className="px-3 py-2 font-mono tabular-nums text-slate-700 dark:text-slate-300">
                                {t.measuredValue}
                              </td>
                              <td className="px-3 py-2 font-mono font-semibold">
                                <span className={t.passed ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}>
                                  {t.passed ? 'PASS' : 'FAIL'}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Engineer Sign-Off Gate */}
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                    Solar Engineer Sign-Off & Certificate Issuance
                  </h4>
                  {activeRecord.status === 'approved' ? (
                    <div className="p-3 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200">
                      Commissioned immutably on{' '}
                      <span className="font-mono">{activeRecord.commissionedAt}</span> · SHA-256 Digest:{' '}
                      <span className="font-mono break-all">
                        {activeRecord.handoverDocuments[0]?.sha256Digest}
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={telemetryProvider}
                          onChange={(e) => setTelemetryProvider(e.target.value)}
                          placeholder="Telemetry Provider (e.g. Solarman / Modbus TCP)"
                          className="px-3 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
                        <input
                          type="text"
                          value={approvalNotes}
                          onChange={(e) => setApprovalNotes(e.target.value)}
                          placeholder="Commissioning review notes"
                          className="px-3 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleDecision('approved')}
                          className="px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-semibold"
                        >
                          Approve Certificate & Register QR Assets
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleDecision('rejected')}
                          className="px-4 py-2 rounded-md border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-medium hover:bg-rose-50 dark:hover:bg-rose-950/40"
                        >
                          Reject Commissioning
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Customer Handover Acknowledgement */}
                {activeRecord.handoverDocuments.length > 0 && (
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                      Customer Handover Sign-Off
                    </h4>
                    {activeRecord.handoverDocuments[0].customerAcknowledgedAt ? (
                      <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-200">
                        Signed off by{' '}
                        <strong>{activeRecord.handoverDocuments[0].customerSignoffName}</strong> at{' '}
                        <span className="font-mono">
                          {activeRecord.handoverDocuments[0].customerAcknowledgedAt}
                        </span>
                      </div>
                    ) : (
                      <form onSubmit={handleAcknowledgeHandover} className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          value={signoffName}
                          onChange={(e) => setSignoffName(e.target.value)}
                          placeholder="Customer / Authorized Signatory Name"
                          className="flex-1 px-3 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          required
                        />
                        <button
                          type="submit"
                          disabled={busy}
                          className="px-4 py-1.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold"
                        >
                          Acknowledge Handover
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </div>

              {printableHtml && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                      Printable Certificate Preview ({printableCode})
                    </h4>
                    <button
                      type="button"
                      onClick={() => setPrintableHtml(null)}
                      className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    >
                      Close Preview
                    </button>
                  </div>
                  <iframe
                    title={`Printable Certificate ${printableCode ?? ''}`}
                    srcDoc={printableHtml}
                    sandbox=""
                    className="w-full h-96 rounded border border-slate-200 dark:border-slate-700 bg-white"
                  />
                </div>
              )}
            </>
          )}

          {/* QR Asset Register Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
              Tenant QR Asset Register ({assets.length})
            </h3>
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-md">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="px-3 py-2 font-medium">QR Code Token</th>
                    <th className="px-3 py-2 font-medium">SKU / Equipment</th>
                    <th className="px-3 py-2 font-medium">Serial Number</th>
                    <th className="px-3 py-2 font-medium">Warranty Expires</th>
                    <th className="px-3 py-2 font-medium">Telemetry Link</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {assets.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-3 text-slate-500">
                        Approve a commissioning certificate to auto-register QR serialized assets and warranty expiration dates.
                      </td>
                    </tr>
                  ) : (
                    assets.map((asset) => (
                      <tr key={asset.id}>
                        <td className="px-3 py-2 font-mono font-semibold text-amber-700 dark:text-amber-400">
                          {asset.qrCodeToken}
                        </td>
                        <td className="px-3 py-2 text-slate-800 dark:text-slate-200">
                          {asset.sku} — {asset.modelName}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-700 dark:text-slate-300">
                          {asset.serialNumber}
                        </td>
                        <td className="px-3 py-2 font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {asset.warrantyExpiresOn ?? 'n/a'}
                        </td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                          {asset.telemetryProvider ?? 'n/a'} ({asset.externalDeviceId ?? '-'})
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
