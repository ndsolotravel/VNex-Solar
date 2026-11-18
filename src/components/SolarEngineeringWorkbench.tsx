import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  SOLAR_ENGINEERING_FORMULA_VERSION,
  calculateSolarDesignEngineering,
  formatCurrency,
  type BatterySpec,
  type DesignApprovalRecord,
  type DesignRevisionRecord,
  type InverterSpec,
  type ProjectRecord,
  type SolarDesignCalculationInput,
  type SolarDesignRecord,
  type SolarModuleSpec,
  type SupportedCurrency,
} from '../../packages/domain/src/index.ts';
import type { WebAuthSession } from '../lib/auth-session.ts';

interface Props {
  currency: SupportedCurrency;
  session: WebAuthSession | null;
  onSessionEstablished: (session: WebAuthSession) => void;
}

interface DesignEntry {
  design: SolarDesignRecord;
  latestRevision: DesignRevisionRecord;
  approvals: DesignApprovalRecord[];
}

export function SolarEngineeringWorkbench({
  currency,
  session,
  onSessionEstablished,
}: Props) {
  const [modules, setModules] = useState<SolarModuleSpec[]>([]);
  const [inverters, setInverters] = useState<InverterSpec[]>([]);
  const [batteries, setBatteries] = useState<BatterySpec[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [designs, setDesigns] = useState<DesignEntry[]>([]);
  const [selectedDesign, setSelectedDesign] = useState<{
    design: SolarDesignRecord;
    revisions: DesignRevisionRecord[];
    approvals: DesignApprovalRecord[];
  } | null>(null);

  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedModuleId, setSelectedModuleId] = useState('');
  const [selectedInverterId, setSelectedInverterId] = useState('');
  const [selectedBatteryId, setSelectedBatteryId] = useState('');
  const [designTitle, setDesignTitle] = useState('11.6 kWp Hybrid Engineering Package');
  const [designNotes, setDesignNotes] = useState(
    'Two MPPT strings on South RCC slab with 6mm² solar DC and 10mm² AC trunking.',
  );

  // Engineering parameters
  const [dailyEnergyKwh, setDailyEnergyKwh] = useState(42);
  const [usableRoofAreaM2, setUsableRoofAreaM2] = useState(110);
  const [ambientMinTempC, setAmbientMinTempC] = useState(4);
  const [ambientMaxTempC, setAmbientMaxTempC] = useState(46);
  const [peakSunHoursPerDay, setPeakSunHoursPerDay] = useState(5.2);
  const [tiltDegrees, setTiltDegrees] = useState(24);
  const [azimuthDegrees, setAzimuthDegrees] = useState(180);
  const [shadingLossPct, setShadingLossPct] = useState(3);
  const [modulesInSeries, setModulesInSeries] = useState(10);
  const [parallelStringsPerMppt, setParallelStringsPerMppt] = useState(1);
  const [activeMpptCount, setActiveMpptCount] = useState(2);
  const [dcCableLenM, setDcCableLenM] = useState(26);
  const [dcCableMm2, setDcCableMm2] = useState(6);
  const [acCableLenM, setAcCableLenM] = useState(18);
  const [acCableMm2, setAcCableMm2] = useState(10);
  const [capexAmount, setCapexAmount] = useState(2450000);
  const [gridTariff, setGridTariff] = useState(62);
  const [exportTariff, setExportTariff] = useState(22);
  const [annualOmCost, setAnnualOmCost] = useState(35000);

  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const activeModule = useMemo<SolarModuleSpec>(
    () =>
      modules.find((m) => m.id === selectedModuleId) ??
      modules[0] ?? {
        id: 'preview-mod',
        modelName: 'Hi-MO 6 Explorer 580M',
        manufacturer: 'LONGi Solar',
        pmaxW: 580,
        vocV: 52.21,
        vmpV: 44.06,
        iscA: 14.2,
        impA: 13.17,
        tempCoeffVocPctPerC: -0.26,
        tempCoeffPmaxPctPerC: -0.29,
        maxSystemVoltageV: 1500,
        areaM2: 2.58,
        weightKg: 27.5,
      },
    [modules, selectedModuleId],
  );

  const activeInverter = useMemo<InverterSpec>(
    () =>
      inverters.find((i) => i.id === selectedInverterId) ??
      inverters[0] ?? {
        id: 'preview-inv',
        modelName: 'Nitrox Hybrid 12K-3P IP65',
        manufacturer: 'Inverex / Deye',
        inverterType: 'hybrid',
        ratedAcPowerW: 12000,
        maxDcInputW: 15600,
        maxDcVoltageV: 800,
        mpptMinV: 200,
        mpptMaxV: 650,
        mpptCount: 2,
        maxInputCurrentPerMpptA: 26,
        efficiencyPct: 97.6,
        phases: 'three',
      },
    [inverters, selectedInverterId],
  );

  const activeBattery = useMemo<BatterySpec | null>(
    () =>
      activeInverter.inverterType === 'on_grid'
        ? null
        : batteries.find((b) => b.id === selectedBatteryId) ??
          batteries[0] ?? {
            id: 'preview-bat',
            modelName: 'US5000 48V 100Ah LFP',
            manufacturer: 'Pylontech',
            chemistry: 'LFP',
            nominalVoltageV: 48,
            capacityAh: 100,
            energyWh: 4800,
            maxDodPct: 90,
            roundTripEfficiencyPct: 95,
          },
    [activeInverter.inverterType, batteries, selectedBatteryId],
  );

  const currentInput = useMemo<SolarDesignCalculationInput>(
    () => ({
      currency,
      overrideDailyEnergyKwh: dailyEnergyKwh,
      usableRoofAreaM2,
      shadingLossPct,
      ambientMinTempC,
      ambientMaxTempC,
      peakSunHoursPerDay,
      tiltDegrees,
      azimuthDegrees,
      module: activeModule,
      inverter: activeInverter,
      battery: activeBattery,
      modulesInSeries,
      parallelStringsPerMppt,
      activeMpptCount,
      inverterCount: 1,
      dcCableOneWayLengthM: dcCableLenM,
      dcCableCrossSectionMm2: dcCableMm2,
      acCableOneWayLengthM: acCableLenM,
      acCableCrossSectionMm2: acCableMm2,
      systemCapexAmount: capexAmount,
      gridTariffPerKwh: gridTariff,
      exportTariffPerKwh: exportTariff,
      annualOmCost,
    }),
    [
      currency,
      dailyEnergyKwh,
      usableRoofAreaM2,
      shadingLossPct,
      ambientMinTempC,
      ambientMaxTempC,
      peakSunHoursPerDay,
      tiltDegrees,
      azimuthDegrees,
      activeModule,
      activeInverter,
      activeBattery,
      modulesInSeries,
      parallelStringsPerMppt,
      activeMpptCount,
      dcCableLenM,
      dcCableMm2,
      acCableLenM,
      acCableMm2,
      capexAmount,
      gridTariff,
      exportTariff,
      annualOmCost,
    ],
  );

  const previewCalc = useMemo(
    () => calculateSolarDesignEngineering(currentInput),
    [currentInput],
  );

  async function ensureActiveSession(): Promise<WebAuthSession> {
    if (session) return session;
    const slug = `vnex-eng-${Math.floor(1000 + Math.random() * 9000)}`;
    const res = await fetch('/api/v1/auth/register-organization', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        legalName: 'VNex Solar Engineering Studio',
        displayName: 'VNex Solar Engineering Studio',
        slug,
        businessAddress: 'MM Alam Road, Lahore',
        countryCode: 'PK',
        defaultCurrency: currency,
        ownerFullName: 'Engr. Kamran Shah',
        ownerEmail: `${slug}@vnexsolar.pk`,
        password: 'Engineer!2026',
        deviceId: 'web-eng-workbench',
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message ?? 'Session setup failed');
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

  async function refreshEngineeringState(active: WebAuthSession, focusDesignId?: string) {
    const headers = { Authorization: `Bearer ${active.accessToken}` };
    const [catRes, projRes, desRes] = await Promise.all([
      fetch('/api/v1/engineering/catalog', { headers }),
      fetch('/api/v1/projects', { headers }),
      fetch('/api/v1/engineering/designs', { headers }),
    ]);

    if (catRes.ok) {
      const cat = await catRes.json();
      setModules(cat.modules ?? []);
      setInverters(cat.inverters ?? []);
      setBatteries(cat.batteries ?? []);
      if (cat.modules?.[0] && !selectedModuleId) setSelectedModuleId(cat.modules[0].id);
      if (cat.inverters?.[0] && !selectedInverterId) setSelectedInverterId(cat.inverters[0].id);
      if (cat.batteries?.[0] && !selectedBatteryId) setSelectedBatteryId(cat.batteries[0].id);
    }
    if (projRes.ok) {
      const pData = await projRes.json();
      const list: ProjectRecord[] = pData.projects ?? [];
      setProjects(list);
      if (list[0] && !selectedProjectId) setSelectedProjectId(list[0].id);
    }
    if (desRes.ok) {
      const dData = await desRes.json();
      setDesigns(dData.designs ?? []);
      const targetId = focusDesignId ?? selectedDesign?.design.id;
      if (targetId) {
        const detailRes = await fetch(`/api/v1/engineering/designs/${targetId}`, { headers });
        if (detailRes.ok) {
          setSelectedDesign(await detailRes.json());
        }
      }
    }
  }

  useEffect(() => {
    if (session) {
      void refreshEngineeringState(session);
    }
  }, [session]);

  async function handleSaveNewDesign(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrMsg(null);
    setStatusMsg(null);
    try {
      const active = await ensureActiveSession();
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${active.accessToken}`,
      };

      let projectId = selectedProjectId;
      if (!projectId) {
        const custRes = await fetch('/api/v1/customers', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            customerType: 'residential',
            fullName: 'Gulberg Heritage Residence',
          }),
        });
        const cust = await custRes.json();
        const siteRes = await fetch(`/api/v1/customers/${cust.id}/sites`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            siteName: 'Main Rooftop Terrace',
            addressLine: 'Block K, Gulberg III',
            city: 'Lahore',
            utilityProvider: 'LESCO',
          }),
        });
        const site = await siteRes.json();
        const projRes = await fetch('/api/v1/projects', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            customerId: cust.id,
            siteId: site.id,
            title: designTitle,
            systemType: activeInverter.inverterType,
            targetCapacityKwp: previewCalc.actualDcKwp,
            currency,
          }),
        });
        const proj = await projRes.json();
        projectId = proj.id;
        setSelectedProjectId(projectId);
      }

      const res = await fetch('/api/v1/engineering/designs', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          projectId,
          title: designTitle,
          notes: designNotes,
          calculationInput: currentInput,
        }),
      });
      const created = await res.json();
      if (!res.ok) throw new Error(created?.error?.message ?? 'Failed to create solar design');
      setSelectedDesign(created);
      setStatusMsg(
        `Saved ${created.design.designCode} (Revision v1 · ${created.revisions[0].calculations.actualDcKwp} kWp).`,
      );
      await refreshEngineeringState(active, created.design.id);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Design creation failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitRevision() {
    if (!selectedDesign || !session) return;
    setBusy(true);
    setErrMsg(null);
    try {
      const res = await fetch(
        `/api/v1/engineering/designs/${selectedDesign.design.id}/revisions/${selectedDesign.design.currentRevisionNumber}/submit`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.accessToken}` },
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Submission blocked');
      setStatusMsg(`Submitted Revision v${data.revision.revisionNumber} for engineering approval.`);
      await refreshEngineeringState(session, selectedDesign.design.id);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleApproveRevision() {
    if (!selectedDesign || !session) return;
    setBusy(true);
    setErrMsg(null);
    try {
      const res = await fetch(`/api/v1/engineering/designs/${selectedDesign.design.id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({
          reviewNotes: 'Cold Voc, MPPT window, DC/AC voltage drop, and earthing verified.',
          revisionNumber: selectedDesign.design.currentRevisionNumber,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Approval rejected');
      setStatusMsg(
        `Approved & locked Revision v${data.revision.revisionNumber}. Linked project advanced to design_approved.`,
      );
      await refreshEngineeringState(session, selectedDesign.design.id);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Approval failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateRevision2() {
    if (!selectedDesign || !session) return;
    setBusy(true);
    setErrMsg(null);
    try {
      const res = await fetch(
        `/api/v1/engineering/designs/${selectedDesign.design.id}/revisions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.accessToken}`,
          },
          body: JSON.stringify({
            notes: `Revision v${selectedDesign.revisions.length + 1}: updated stringing/cable sizing`,
            calculationInput: currentInput,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Revision creation failed');
      setStatusMsg(
        `Created Revision v${data.revision.revisionNumber} while preserving approved history immutably.`,
      );
      await refreshEngineeringState(session, selectedDesign.design.id);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'New revision failed');
    } finally {
      setBusy(false);
    }
  }

  const displayedCalc =
    selectedDesign?.revisions[selectedDesign.revisions.length - 1]?.calculations ?? previewCalc;

  return (
    <div className="space-y-8">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-5 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Phase 6 · Deterministic SI Solar Engineering · Formula {SOLAR_ENGINEERING_FORMULA_VERSION}
          </p>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 mt-1">
            Solar Engineering & String Sizing Workbench
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
            Run all 20 deterministic PV calculations, cold-temperature Voc & MPPT window checks, cable voltage drops, 25-year NPV/LCOE analysis, and immutable engineering approvals.
          </p>
        </div>
        {!session && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void ensureActiveSession().then((s) => refreshEngineeringState(s))}
            className="px-3.5 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium shrink-0"
          >
            Load Tenant Catalog
          </button>
        )}
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

      {!previewCalc.safetyChecksPassed && (
        <div className="p-4 rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-xs text-red-900 dark:text-red-200 space-y-1">
          <div className="font-semibold">Electrical Safety Blocker (Approval Prevented)</div>
          {previewCalc.hardSafetyErrors.map((err) => (
            <div key={err}>{err}</div>
          ))}
        </div>
      )}

      {previewCalc.engineeringWarnings.length > 0 && (
        <div className="p-4 rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-900 dark:text-amber-200 space-y-1">
          <div className="font-semibold">Engineering Advisory Checks</div>
          {previewCalc.engineeringWarnings.map((warn) => (
            <div key={warn}>{warn}</div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <form
          onSubmit={handleSaveNewDesign}
          className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 p-5 space-y-4 text-xs"
        >
          <h2 className="font-display text-base font-semibold">Equipment & Topology</h2>

          <label className="block space-y-1">
            <span className="font-medium text-slate-700 dark:text-slate-300">Design Title</span>
            <input
              required
              value={designTitle}
              onChange={(e) => setDesignTitle(e.target.value)}
              className="w-full h-9 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </label>

          {projects.length > 0 && (
            <label className="block space-y-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">Project</span>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full h-9 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.projectCode} · {p.title}
                  </option>
                ))}
              </select>
            </label>
          )}

          {modules.length > 0 && (
            <label className="block space-y-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">PV Module</span>
              <select
                value={activeModule.id}
                onChange={(e) => setSelectedModuleId(e.target.value)}
                className="w-full h-9 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {modules.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.manufacturer} {m.modelName} ({m.pmaxW}W)
                  </option>
                ))}
              </select>
            </label>
          )}

          {inverters.length > 0 && (
            <label className="block space-y-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">Inverter</span>
              <select
                value={activeInverter.id}
                onChange={(e) => setSelectedInverterId(e.target.value)}
                className="w-full h-9 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {inverters.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.modelName} ({inv.ratedAcPowerW / 1000}kW · max {inv.maxDcVoltageV}V)
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="grid grid-cols-3 gap-2">
            <label className="space-y-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">Series / Str</span>
              <input
                type="number"
                min={1}
                value={modulesInSeries}
                onChange={(e) => setModulesInSeries(Math.max(1, Number(e.target.value)))}
                className="w-full h-9 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono tabular-nums"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">Par / MPPT</span>
              <input
                type="number"
                min={1}
                value={parallelStringsPerMppt}
                onChange={(e) => setParallelStringsPerMppt(Math.max(1, Number(e.target.value)))}
                className="w-full h-9 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono tabular-nums"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">MPPTs</span>
              <input
                type="number"
                min={1}
                value={activeMpptCount}
                onChange={(e) => setActiveMpptCount(Math.max(1, Number(e.target.value)))}
                className="w-full h-9 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono tabular-nums"
              />
            </label>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <label className="space-y-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">Min °C</span>
              <input
                type="number"
                value={ambientMinTempC}
                onChange={(e) => setAmbientMinTempC(Number(e.target.value))}
                className="w-full h-9 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono tabular-nums"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">Max °C</span>
              <input
                type="number"
                value={ambientMaxTempC}
                onChange={(e) => setAmbientMaxTempC(Number(e.target.value))}
                className="w-full h-9 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono tabular-nums"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">PSH (h/d)</span>
              <input
                type="number"
                step="0.1"
                min={1}
                value={peakSunHoursPerDay}
                onChange={(e) => setPeakSunHoursPerDay(Number(e.target.value))}
                className="w-full h-9 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono tabular-nums"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">DC Length / mm²</span>
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="number"
                  min={1}
                  value={dcCableLenM}
                  onChange={(e) => setDcCableLenM(Number(e.target.value))}
                  className="h-9 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono tabular-nums"
                />
                <input
                  type="number"
                  step="0.5"
                  min={2.5}
                  value={dcCableMm2}
                  onChange={(e) => setDcCableMm2(Number(e.target.value))}
                  className="h-9 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono tabular-nums"
                />
              </div>
            </label>
            <label className="space-y-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">AC Length / mm²</span>
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="number"
                  min={1}
                  value={acCableLenM}
                  onChange={(e) => setAcCableLenM(Number(e.target.value))}
                  className="h-9 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono tabular-nums"
                />
                <input
                  type="number"
                  step="0.5"
                  min={2.5}
                  value={acCableMm2}
                  onChange={(e) => setAcCableMm2(Number(e.target.value))}
                  className="h-9 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono tabular-nums"
                />
              </div>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">
                Daily Load (kWh)
              </span>
              <input
                type="number"
                min={1}
                value={dailyEnergyKwh}
                onChange={(e) => setDailyEnergyKwh(Number(e.target.value))}
                className="w-full h-9 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono tabular-nums"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">
                Usable Roof (m²)
              </span>
              <input
                type="number"
                min={5}
                value={usableRoofAreaM2}
                onChange={(e) => setUsableRoofAreaM2(Number(e.target.value))}
                className="w-full h-9 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono tabular-nums"
              />
            </label>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <label className="space-y-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">CAPEX</span>
              <input
                type="number"
                value={capexAmount}
                onChange={(e) => setCapexAmount(Number(e.target.value))}
                className="w-full h-9 px-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono tabular-nums"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">Import/kWh</span>
              <input
                type="number"
                value={gridTariff}
                onChange={(e) => setGridTariff(Number(e.target.value))}
                className="w-full h-9 px-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono tabular-nums"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">Export/kWh</span>
              <input
                type="number"
                value={exportTariff}
                onChange={(e) => setExportTariff(Number(e.target.value))}
                className="w-full h-9 px-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono tabular-nums"
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full px-4 py-2 rounded-md bg-amber-600 hover:bg-amber-700 text-white font-medium"
          >
            Save Solar Design (Revision 1)
          </button>
        </form>

        <section className="lg:col-span-2 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-sm font-semibold">
                Deterministic Engineering Output Matrix (20 Calculators)
              </h2>
              <p className="text-xs text-slate-500">
                Safe string range for selected inverter: {previewCalc.minModulesInSeries}–
                {previewCalc.maxModulesInSeries} panels in series
              </p>
            </div>
            <span className="font-mono text-xs text-slate-500">
              {selectedDesign
                ? `${selectedDesign.design.designCode} · Rev v${selectedDesign.design.currentRevisionNumber} (${selectedDesign.design.status})`
                : previewCalc.formulaVersion}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800 border-b border-slate-200 dark:border-slate-800 text-xs">
            <div className="p-4">
              <div className="text-slate-500">Array DC / AC Ratio</div>
              <div className="mt-1 font-mono tabular-nums text-base font-semibold">
                {displayedCalc.actualDcKwp} kWp · {displayedCalc.dcAcRatio}
              </div>
              <div className="text-slate-500 font-mono">
                {displayedCalc.totalPanelCount} panels · {displayedCalc.totalRatedAcKw} kW AC
              </div>
            </div>
            <div className="p-4">
              <div className="text-slate-500">Cold Voc / Hot Vmp</div>
              <div
                className={`mt-1 font-mono tabular-nums text-base font-semibold ${
                  displayedCalc.vocOvervoltageFault ? 'text-red-600 dark:text-red-400' : ''
                }`}
              >
                {displayedCalc.stringColdVocV}V / {displayedCalc.stringHotVmpV}V
              </div>
              <div className="text-slate-500 font-mono">
                Limit {displayedCalc.vocLimitV}V · MPPT{' '}
                {displayedCalc.mpptWindowValid ? 'OK' : 'Out'}
              </div>
            </div>
            <div className="p-4">
              <div className="text-slate-500">Annual Yield & Offset</div>
              <div className="mt-1 font-mono tabular-nums text-base font-semibold">
                {displayedCalc.expectedAnnualYieldKwh.toLocaleString()} kWh
              </div>
              <div className="text-slate-500 font-mono">
                {displayedCalc.annualSolarOffsetPct}% demand offset
              </div>
            </div>
            <div className="p-4">
              <div className="text-slate-500">Payback & 25-Yr NPV</div>
              <div className="mt-1 font-mono tabular-nums text-base font-semibold">
                {displayedCalc.simplePaybackYears ?? '—'} yrs
              </div>
              <div className="text-slate-500 font-mono truncate">
                NPV {formatCurrency(displayedCalc.netPresentValue, currency)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-800 text-xs">
            <div className="p-5 space-y-2.5">
              <div className="font-medium text-slate-700 dark:text-slate-300">
                Electrical, Cable & Protection Sizing
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">MPPT Operating / Isc Current</span>
                <span className="font-mono tabular-nums">
                  {displayedCalc.mpptOperatingCurrentA} A / {displayedCalc.mpptShortCircuitCurrentA} A
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">DC Cable Drop (limit 2.0%)</span>
                <span className="font-mono tabular-nums">
                  {displayedCalc.dcVoltageDropPct}% ({displayedCalc.dcVoltageDropV} V) ·{' '}
                  {displayedCalc.dcCablePass ? 'PASS' : 'FAIL'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">AC Cable Drop (limit 2.5%)</span>
                <span className="font-mono tabular-nums">
                  {displayedCalc.acVoltageDropPct}% ({displayedCalc.acCurrentPerInverterA} A) ·{' '}
                  {displayedCalc.acCablePass ? 'PASS' : 'FAIL'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Protection Switchgear</span>
                <span className="font-mono tabular-nums">
                  DC {displayedCalc.recommendedStringFuseA}A · AC {displayedCalc.recommendedAcBreakerA}A ·{' '}
                  {displayedCalc.recommendedDcSpdVoltageV}V SPD
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Earthing & Target Pit</span>
                <span className="font-mono tabular-nums">
                  {displayedCalc.recommendedEarthingMm2} mm² Cu · {'<'}=
                  {displayedCalc.targetEarthResistanceOhms} Ω
                </span>
              </div>
            </div>

            <div className="p-5 space-y-2.5">
              <div className="font-medium text-slate-700 dark:text-slate-300">
                Storage, Structural, Carbon & LCOE
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Recommended LFP Battery Bank</span>
                <span className="font-mono tabular-nums">
                  {displayedCalc.recommendedBatteryUnits} units ({displayedCalc.installedNominalBatteryKwh} kWh nom)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Roof Utilization (Site Fit)</span>
                <span className="font-mono tabular-nums">
                  {displayedCalc.requiredRoofAreaM2} m² ({displayedCalc.roofAreaUtilizationPct}%) ·{' '}
                  {displayedCalc.roofFitPass ? 'FITS' : 'OVER'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Dead Weight & Wind Uplift</span>
                <span className="font-mono tabular-nums">
                  {displayedCalc.totalArrayMassKg} kg ({displayedCalc.distributedRoofLoadKgM2} kg/m²) ·{' '}
                  {displayedCalc.estimatedWindUpliftKn} kN
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">25-Yr Yield & CO₂ Avoided</span>
                <span className="font-mono tabular-nums">
                  {Math.round(displayedCalc.lifetime25YrYieldKwh).toLocaleString()} kWh ·{' '}
                  {displayedCalc.lifetimeCo2AvoidedTonnes} tCO₂
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">LCOE & 25-Yr ROI</span>
                <span className="font-mono tabular-nums">
                  {displayedCalc.lcoePerKwh} {currency}/kWh · {displayedCalc.roi25YrPct}% ROI
                </span>
              </div>
            </div>
          </div>

          {selectedDesign && (
            <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-600 dark:text-slate-400">
                Revisions: {selectedDesign.revisions.length} · Approvals:{' '}
                {selectedDesign.approvals.length}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {selectedDesign.design.status === 'draft' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleSubmitRevision}
                    className="px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium"
                  >
                    Submit Revision v{selectedDesign.design.currentRevisionNumber}
                  </button>
                )}
                {selectedDesign.design.status !== 'approved' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleApproveRevision}
                    className="px-3 py-1.5 rounded bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium"
                  >
                    Approve & Lock Revision
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleCreateRevision2}
                  className="px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium"
                >
                  Create New Revision
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {designs.length > 0 && (
        <section className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold">Saved Solar Designs</h2>
            <span className="font-mono tabular-nums text-xs text-slate-500">
              {designs.length} packages
            </span>
          </div>
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-slate-500">
                <th className="py-2.5 px-4">Code & Title</th>
                <th className="py-2.5 px-4">Revision</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4 text-right">kWp / Cold Voc</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {designs.map(({ design, latestRevision }) => (
                <tr
                  key={design.id}
                  onClick={() =>
                    session && void refreshEngineeringState(session, design.id)
                  }
                  className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40"
                >
                  <td className="py-2.5 px-4">
                    <span className="font-mono text-slate-500 mr-2">{design.designCode}</span>
                    <span className="font-medium">{design.title}</span>
                  </td>
                  <td className="py-2.5 px-4 font-mono">v{design.currentRevisionNumber}</td>
                  <td className="py-2.5 px-4 capitalize">{design.status}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                    {latestRevision.calculations.actualDcKwp} kWp ·{' '}
                    {latestRevision.calculations.stringColdVocV}V
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
