import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  computeSurveyLoadSummary,
  type HazardSeverity,
  type LoadProfileItemInput,
  type ProjectRecord,
  type RoofSectionInput,
  type SiteHazardInput,
  type SiteSurveyRecord,
  type SupportedCurrency,
} from '../../packages/domain/src/index.ts';
import type { WebAuthSession } from '../lib/auth-session.ts';

interface Props {
  currency: SupportedCurrency;
  session: WebAuthSession | null;
  onSessionEstablished: (session: WebAuthSession) => void;
}

async function computeFileSha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function SiteSurveysWorkspace({
  currency,
  session,
  onSessionEstablished,
}: Props) {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [surveys, setSurveys] = useState<SiteSurveyRecord[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [activeSurvey, setActiveSurvey] = useState<SiteSurveyRecord | null>(null);

  const [roofSections, setRoofSections] = useState<RoofSectionInput[]>([
    {
      id: 'roof-1',
      sectionName: 'Main RCC Rooftop',
      roofType: 'rcc_flat',
      usableAreaM2: 140,
      tiltDegrees: 24,
      azimuthDegrees: 180,
      shadingFactorPct: 4,
    },
  ]);
  const [loadProfiles, setLoadProfiles] = useState<LoadProfileItemInput[]>([
    {
      id: 'load-1',
      applianceName: 'Inverter Split AC (1.5 Ton)',
      quantity: 3,
      ratedPowerW: 1650,
      dailyHours: 8,
      isCriticalBackupLoad: false,
      surgeFactor: 1.5,
    },
    {
      id: 'load-2',
      applianceName: 'Chiller Compressor & Control Panel',
      quantity: 1,
      ratedPowerW: 2400,
      dailyHours: 14,
      isCriticalBackupLoad: true,
      surgeFactor: 2.2,
    },
  ]);
  const [siteHazards, setSiteHazards] = useState<SiteHazardInput[]>([
    {
      id: 'haz-1',
      hazardType: 'fragile_parapet',
      severity: 'medium',
      description: 'Low 450mm parapet along north roof perimeter edge',
      mitigationPlan: 'Deploy temporary lifeline & harness anchor before rail mounting',
    },
  ]);

  const [ambientMinTempC, setAmbientMinTempC] = useState(4);
  const [ambientMaxTempC, setAmbientMaxTempC] = useState(47);
  const [earthingAvailable, setEarthingAvailable] = useState(true);
  const [notes, setNotes] = useState('Three-phase net-metering meter located inside north utility room.');
  const [photoCaption, setPhotoCaption] = useState('Main RCC slab & existing LT panel');
  const [verifiedGrantUrl, setVerifiedGrantUrl] = useState<string | null>(null);

  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const liveSummary = useMemo(
    () => computeSurveyLoadSummary(roofSections, loadProfiles),
    [roofSections, loadProfiles],
  );

  async function ensureActiveSession(): Promise<WebAuthSession> {
    if (session) return session;
    const slug = `vnex-survey-${Math.floor(1000 + Math.random() * 9000)}`;
    const res = await fetch('/api/v1/auth/register-organization', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        legalName: 'VNex Solar Survey Field Ops',
        displayName: 'VNex Solar Survey Field Ops',
        slug,
        businessAddress: 'DHA Phase 6, Lahore',
        countryCode: 'PK',
        defaultCurrency: currency,
        ownerFullName: 'Sana Mir',
        ownerEmail: `${slug}@vnexsolar.pk`,
        password: 'SurveyOps!2026',
        deviceId: 'web-survey-console',
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message ?? 'Session initialization failed');
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

  async function loadSurveysAndProjects(active: WebAuthSession) {
    const headers = { Authorization: `Bearer ${active.accessToken}` };
    const [projRes, survRes] = await Promise.all([
      fetch('/api/v1/projects', { headers }),
      fetch('/api/v1/surveys', { headers }),
    ]);

    if (projRes.ok) {
      const pData = await projRes.json();
      const list: ProjectRecord[] = pData.projects ?? [];
      setProjects(list);
      if (list.length > 0 && !selectedProjectId) {
        setSelectedProjectId(list[0].id);
      }
    }
    if (survRes.ok) {
      const sData = await survRes.json();
      const sList: SiteSurveyRecord[] = sData.surveys ?? [];
      setSurveys(sList);
      if (activeSurvey) {
        const refreshed = sList.find((s) => s.id === activeSurvey.id);
        if (refreshed) setActiveSurvey(refreshed);
      }
    }
  }

  useEffect(() => {
    if (session) {
      void loadSurveysAndProjects(session);
    }
  }, [session]);

  async function bootstrapQuickProjectAndSurvey() {
    setBusy(true);
    setErrMsg(null);
    try {
      const active = await ensureActiveSession();
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${active.accessToken}`,
      };

      let targetProjectId = selectedProjectId;
      if (!targetProjectId) {
        const custRes = await fetch('/api/v1/customers', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            customerType: 'commercial',
            fullName: 'Crescent Textiles Solar Annex',
            primaryPhone: '+92-321-4400911',
          }),
        });
        const cust = await custRes.json();
        if (!custRes.ok) throw new Error(cust?.error?.message ?? 'Customer setup failed');

        const siteRes = await fetch(`/api/v1/customers/${cust.id}/sites`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            siteName: 'Weaving Shed Block C',
            addressLine: 'Canal Road Industrial Zone',
            city: 'Faisalabad',
            countryCode: 'PK',
            utilityProvider: 'FESCO',
            connectionPhase: 'three',
          }),
        });
        const site = await siteRes.json();
        if (!siteRes.ok) throw new Error(site?.error?.message ?? 'Site setup failed');

        const projRes = await fetch('/api/v1/projects', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            customerId: cust.id,
            siteId: site.id,
            title: '30 kWp Industrial Rooftop Array',
            systemType: 'hybrid',
            targetCapacityKwp: 30,
            currency,
          }),
        });
        const proj = await projRes.json();
        if (!projRes.ok) throw new Error(proj?.error?.message ?? 'Project setup failed');
        targetProjectId = proj.id;
        setSelectedProjectId(proj.id);
      }

      const surveyRes = await fetch('/api/v1/surveys', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          projectId: targetProjectId,
          ambientMinTempC,
          ambientMaxTempC,
          earthingAvailable,
          notes,
          roofSections,
          loadProfiles,
          siteHazards,
        }),
      });
      const created = await surveyRes.json();
      if (!surveyRes.ok) throw new Error(created?.error?.message ?? 'Failed to create draft survey');
      setActiveSurvey(created);
      setStatusMsg(`Created draft site survey ${created.id.slice(0, 8)} (v${created.rowVersion}).`);
      await loadSurveysAndProjects(active);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Survey creation failed');
    } finally {
      setBusy(false);
    }
  }

  async function saveSurveyDraftUpdate(e: FormEvent) {
    e.preventDefault();
    if (!activeSurvey || !session) return;
    setBusy(true);
    setErrMsg(null);
    try {
      const res = await fetch(`/api/v1/surveys/${activeSurvey.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({
          baseRowVersion: activeSurvey.rowVersion,
          ambientMinTempC,
          ambientMaxTempC,
          earthingAvailable,
          notes,
          roofSections,
          loadProfiles,
          siteHazards,
        }),
      });
      const updated = await res.json();
      if (!res.ok) throw new Error(updated?.error?.message ?? 'Survey update failed');
      setActiveSurvey(updated);
      setStatusMsg(`Saved survey revision v${updated.rowVersion} cleanly.`);
      await loadSurveysAndProjects(session);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Survey update failed');
    } finally {
      setBusy(false);
    }
  }

  async function submitActiveSurvey() {
    if (!activeSurvey || !session) return;
    setBusy(true);
    setErrMsg(null);
    try {
      const res = await fetch(`/api/v1/surveys/${activeSurvey.id}/submit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Survey submission failed');
      setActiveSurvey(data);
      setStatusMsg('Survey submitted — linked project stage advanced to survey_completed.');
      await loadSurveysAndProjects(session);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setBusy(false);
    }
  }

  async function handlePhotoUpload(file: File | null) {
    if (!file || !activeSurvey || !session) return;
    setBusy(true);
    setErrMsg(null);
    try {
      const sha256Checksum = await computeFileSha256Hex(file);
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.accessToken}`,
      };
      const presignRes = await fetch(`/api/v1/surveys/${activeSurvey.id}/photos/presign`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type || 'image/jpeg',
          byteSize: Math.max(1, file.size),
          sha256Checksum,
          caption: photoCaption || null,
        }),
      });
      const presign = await presignRes.json();
      if (!presignRes.ok) throw new Error(presign?.error?.message ?? 'Photo presign failed');

      const commitRes = await fetch(`/api/v1/surveys/${activeSurvey.id}/photos/commit`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          fileAttachmentId: presign.fileAttachmentId,
          sha256Checksum,
        }),
      });
      const committed = await commitRes.json();
      if (!commitRes.ok) throw new Error(committed?.error?.message ?? 'Photo commit failed');

      setStatusMsg(`Verified & attached ${committed.filename} (SHA-256 ${sha256Checksum.slice(0, 12)}...).`);
      await loadSurveysAndProjects(session);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Photo upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function fetchAuthorizedDownloadGrant(fileAttachmentId: string) {
    if (!session) return;
    const res = await fetch(`/api/v1/files/${fileAttachmentId}/download`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    const data = await res.json();
    if (res.ok) {
      setVerifiedGrantUrl(`${data.storageBucket}/${data.storageKey} (TTL ${data.expiresInSeconds}s)`);
    }
  }

  return (
    <div className="space-y-8">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-5 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Phase 5 · Site Assessment, Roof Geometry & SHA-256 Evidence
          </p>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 mt-1">
            Site Surveys & Load Profiling
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
            Capture roof sections, appliance load profiles, site safety hazards, and SHA-256 verified survey photographs synced with Android CameraX.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="h-9 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
          >
            <option value="">Auto-provision customer & project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.projectCode} · {p.title} ({p.currentStage})
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy}
            onClick={bootstrapQuickProjectAndSurvey}
            className="px-3.5 py-2 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium whitespace-nowrap"
          >
            Create Draft Survey
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

      <section className="grid grid-cols-2 lg:grid-cols-4 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
        <div className="p-4">
          <div className="text-xs text-slate-500">Connected Load</div>
          <div className="mt-1 font-mono tabular-nums text-lg font-semibold">
            {liveSummary.totalConnectedPowerW.toLocaleString()} W
          </div>
          <div className="text-xs text-slate-500 font-mono tabular-nums">
            Peak surge {liveSummary.peakSurgePowerW.toLocaleString()} W
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500">Daily Energy Demand</div>
          <div className="mt-1 font-mono tabular-nums text-lg font-semibold">
            {liveSummary.dailyEnergyKwh} kWh/day
          </div>
          <div className="text-xs text-slate-500 font-mono tabular-nums">
            Critical backup {liveSummary.criticalBackupEnergyKwh} kWh
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500">Effective Roof Area</div>
          <div className="mt-1 font-mono tabular-nums text-lg font-semibold">
            {liveSummary.effectiveUnshadedRoofAreaM2} m²
          </div>
          <div className="text-xs text-slate-500 font-mono tabular-nums">
            Gross {liveSummary.totalUsableRoofAreaM2} m²
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500">Active Survey State</div>
          <div className="mt-1 font-mono text-lg font-semibold">
            {activeSurvey ? `${activeSurvey.surveyStatus} · v${activeSurvey.rowVersion}` : 'Preview'}
          </div>
          <div className="text-xs text-slate-500">
            {activeSurvey ? `${activeSurvey.photos.length} verified photos` : 'Create draft to persist'}
          </div>
        </div>
      </section>

      <form onSubmit={saveSurveyDraftUpdate} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold">Roof Sections</h2>
              <button
                type="button"
                onClick={() =>
                  setRoofSections((prev) => [
                    ...prev,
                    {
                      id: `roof-${prev.length + 1}`,
                      sectionName: `Annex Terrace ${prev.length + 1}`,
                      roofType: 'tin_trapezoidal',
                      usableAreaM2: 48,
                      tiltDegrees: 15,
                      azimuthDegrees: 175,
                      shadingFactorPct: 6,
                    },
                  ])
                }
                className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-xs font-medium"
              >
                + Add Roof Section
              </button>
            </div>
            <div className="space-y-3">
              {roofSections.map((roof, idx) => (
                <div
                  key={roof.id}
                  className="p-3 rounded-md border border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs"
                >
                  <input
                    value={roof.sectionName}
                    onChange={(e) => {
                      const next = [...roofSections];
                      next[idx] = { ...roof, sectionName: e.target.value };
                      setRoofSections(next);
                    }}
                    className="col-span-2 h-8 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <label className="flex items-center gap-1 font-mono tabular-nums">
                    <span className="text-slate-500">m²</span>
                    <input
                      type="number"
                      min={0}
                      value={roof.usableAreaM2}
                      onChange={(e) => {
                        const next = [...roofSections];
                        next[idx] = { ...roof, usableAreaM2: Number(e.target.value) };
                        setRoofSections(next);
                      }}
                      className="w-full h-8 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </label>
                  <label className="flex items-center gap-1 font-mono tabular-nums">
                    <span className="text-slate-500">Shade%</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={roof.shadingFactorPct}
                      onChange={(e) => {
                        const next = [...roofSections];
                        next[idx] = { ...roof, shadingFactorPct: Number(e.target.value) };
                        setRoofSections(next);
                      }}
                      className="w-full h-8 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </label>
                </div>
              ))}
            </div>
          </section>

          <section className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold">Appliance Load Profile</h2>
              <button
                type="button"
                onClick={() =>
                  setLoadProfiles((prev) => [
                    ...prev,
                    {
                      id: `load-${prev.length + 1}`,
                      applianceName: 'LED Lighting & IT Rack',
                      quantity: 4,
                      ratedPowerW: 150,
                      dailyHours: 10,
                      isCriticalBackupLoad: true,
                      surgeFactor: 1.1,
                    },
                  ])
                }
                className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-xs font-medium"
              >
                + Add Load Item
              </button>
            </div>
            <div className="space-y-3">
              {loadProfiles.map((item, idx) => (
                <div
                  key={item.id}
                  className="p-3 rounded-md border border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs items-center"
                >
                  <input
                    value={item.applianceName}
                    onChange={(e) => {
                      const next = [...loadProfiles];
                      next[idx] = { ...item, applianceName: e.target.value };
                      setLoadProfiles(next);
                    }}
                    className="col-span-2 h-8 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <input
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(e) => {
                      const next = [...loadProfiles];
                      next[idx] = { ...item, quantity: Number(e.target.value) };
                      setLoadProfiles(next);
                    }}
                    aria-label="Quantity"
                    className="h-8 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono tabular-nums"
                  />
                  <input
                    type="number"
                    min={0}
                    value={item.ratedPowerW}
                    onChange={(e) => {
                      const next = [...loadProfiles];
                      next[idx] = { ...item, ratedPowerW: Number(e.target.value) };
                      setLoadProfiles(next);
                    }}
                    aria-label="Rated Watts"
                    className="h-8 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono tabular-nums"
                  />
                  <input
                    type="number"
                    min={0}
                    max={24}
                    step="0.5"
                    value={item.dailyHours}
                    onChange={(e) => {
                      const next = [...loadProfiles];
                      next[idx] = { ...item, dailyHours: Number(e.target.value) };
                      setLoadProfiles(next);
                    }}
                    aria-label="Daily Hours"
                    className="h-8 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono tabular-nums"
                  />
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <label className="space-y-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">
                Ambient Min Temp (°C)
              </span>
              <input
                type="number"
                value={ambientMinTempC}
                onChange={(e) => setAmbientMinTempC(Number(e.target.value))}
                className="w-full h-9 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono tabular-nums"
              />
            </label>
            <label className="space-y-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">
                Ambient Max Temp (°C)
              </span>
              <input
                type="number"
                value={ambientMaxTempC}
                onChange={(e) => setAmbientMaxTempC(Number(e.target.value))}
                className="w-full h-9 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono tabular-nums"
              />
            </label>
            <label className="flex items-center gap-2 pt-5">
              <input
                type="checkbox"
                checked={earthingAvailable}
                onChange={(e) => setEarthingAvailable(e.target.checked)}
              />
              <span>Existing DC/AC Earthing Pit Verified</span>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <label className="space-y-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">
                Primary Site Hazard Assessment
              </span>
              <div className="flex gap-2">
                <select
                  value={siteHazards[0]?.severity ?? 'medium'}
                  onChange={(e) => {
                    const updated = [...siteHazards];
                    if (updated[0]) {
                      updated[0] = {
                        ...updated[0],
                        severity: e.target.value as HazardSeverity,
                      };
                      setSiteHazards(updated);
                    }
                  }}
                  className="h-9 px-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
                <input
                  value={siteHazards[0]?.description ?? ''}
                  onChange={(e) => {
                    const updated = [...siteHazards];
                    if (updated[0]) {
                      updated[0] = { ...updated[0], description: e.target.value };
                      setSiteHazards(updated);
                    }
                  }}
                  className="flex-1 h-9 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            </label>

            <label className="space-y-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">
                Surveyor Field Notes
              </span>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={busy || !activeSurvey}
              className="px-4 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium disabled:opacity-50"
            >
              Save Optimistic Update
            </button>
            <button
              type="button"
              disabled={busy || !activeSurvey || activeSurvey.surveyStatus === 'submitted'}
              onClick={submitActiveSurvey}
              className="px-4 py-2 rounded-md bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium disabled:opacity-50"
            >
              Submit Survey & Advance Project Stage
            </button>
          </div>
        </section>
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 p-5 space-y-4">
          <h2 className="font-display text-base font-semibold">
            Presigned Photo Upload (SHA-256 Verified)
          </h2>
          <div className="space-y-3 text-xs">
            <input
              value={photoCaption}
              onChange={(e) => setPhotoCaption(e.target.value)}
              placeholder="Photo caption (e.g. Main distribution board)"
              className="w-full h-9 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <input
              type="file"
              accept="image/*"
              disabled={busy || !activeSurvey}
              onChange={(e) => void handlePhotoUpload(e.target.files?.[0] ?? null)}
              className="block w-full text-xs text-slate-600 dark:text-slate-400"
            />
            {activeSurvey && activeSurvey.photos.length > 0 && (
              <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-md">
                {activeSurvey.photos.map((photo) => (
                  <div key={photo.id} className="p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{photo.filename}</div>
                      <div className="font-mono text-slate-500 truncate">
                        sha256:{photo.sha256Checksum.slice(0, 16)}... · {photo.byteSize} B
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void fetchAuthorizedDownloadGrant(photo.fileAttachmentId)}
                      className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 shrink-0"
                    >
                      Verify Signed Grant
                    </button>
                  </div>
                ))}
              </div>
            )}
            {verifiedGrantUrl && (
              <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-950 font-mono text-slate-600 dark:text-slate-300 break-all">
                Authorized grant: {verifiedGrantUrl}
              </div>
            )}
          </div>
        </section>

        <section className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold">Saved Site Surveys</h2>
            <span className="font-mono tabular-nums text-xs text-slate-500">
              {surveys.length} total
            </span>
          </div>
          {surveys.length === 0 ? (
            <div className="p-6 text-xs text-slate-500">
              No persisted site surveys in this tenant yet.
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-slate-500">
                  <th className="py-2.5 px-4">Survey</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Sections</th>
                  <th className="py-2.5 px-4 text-right">Photos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {surveys.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => setActiveSurvey(s)}
                    className={`cursor-pointer ${
                      activeSurvey?.id === s.id
                        ? 'bg-amber-50/60 dark:bg-amber-950/20'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="py-2.5 px-4 font-mono">{s.id.slice(0, 8)} · v{s.rowVersion}</td>
                    <td className="py-2.5 px-4 capitalize">{s.surveyStatus}</td>
                    <td className="py-2.5 px-4 font-mono tabular-nums">{s.roofSections.length}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                      {s.photos.length}
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
