import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  DEFAULT_PV_CHECKLIST_ITEMS,
  type CorrectiveActionStatus,
  type InstallationJobRecord,
  type InspectionItemResult,
  type InspectionRecordDetail,
  type RiskAssessmentRecord,
  type SafetyChecklistRecord,
  type SafetyChecklistType,
  type SafetyGateEvaluation,
  type SafetyIncidentRecord,
  type SafetyIncidentSeverity,
  type SupportedCurrency,
} from '../../packages/domain/src/index.ts';
import type { WebAuthSession } from '../lib/auth-session.ts';

interface Props {
  currency: SupportedCurrency;
  session: WebAuthSession | null;
  onSessionEstablished: (session: WebAuthSession) => void;
}

interface JobSafetyBundle {
  installationJobId: string;
  jobCode: string;
  jobStatus: InstallationJobRecord['status'];
  safetyCleared: boolean;
  evaluation: SafetyGateEvaluation;
  riskAssessments: RiskAssessmentRecord[];
  checklists: SafetyChecklistRecord[];
  incidents: SafetyIncidentRecord[];
  inspections: InspectionRecordDetail[];
}

export function SafetyInspectionWorkspace({ currency, session, onSessionEstablished }: Props) {
  const [jobs, setJobs] = useState<InstallationJobRecord[]>([]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [bundle, setBundle] = useState<JobSafetyBundle | null>(null);

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // Risk assessment form
  const [workingAtHeightRequired, setWorkingAtHeightRequired] = useState(true);
  const [ppeVerified, setPpeVerified] = useState(true);
  const [electricalIsolationVerified, setElectricalIsolationVerified] = useState(true);
  const [hazardNotes, setHazardNotes] = useState(
    'Roof edge guardrails inspected; DC string isolators & battery breaker locked OFF with LOTO.',
  );

  // Safety checklist quick log
  const [checklistType, setChecklistType] = useState<SafetyChecklistType>('ppe');

  // Incident form
  const [incidentSeverity, setIncidentSeverity] = useState<SafetyIncidentSeverity>('near_miss');
  const [incidentDesc, setIncidentDesc] = useState('');
  const [incidentAction, setIncidentAction] = useState('');

  // Inspection & readings form
  const [earthOhms, setEarthOhms] = useState(1.6);
  const [insulationMOhm, setInsulationMOhm] = useState(480);
  const [rcdMs, setRcdMs] = useState(22);
  const [spdCheckResult, setSpdCheckResult] = useState<InspectionItemResult>('pass');
  const [earthingCheckResult, setEarthingCheckResult] = useState<InspectionItemResult>('pass');
  const [initialActionDesc, setInitialActionDesc] = useState('');

  // New corrective action form
  const [actionDesc, setActionDesc] = useState('');

  async function ensureActiveSession(): Promise<WebAuthSession> {
    if (session) return session;
    const slug = `vnex-safe-${Math.floor(1000 + Math.random() * 9000)}`;
    const res = await fetch('/api/v1/auth/register-organization', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        legalName: 'VNex Solar Safety & QA Pvt Ltd',
        displayName: 'VNex Solar Safety & QA',
        slug,
        businessAddress: 'Model Town, Lahore',
        countryCode: 'PK',
        defaultCurrency: currency,
        ownerFullName: 'Sadia Qureshi',
        ownerEmail: `${slug}@vnexsolar.pk`,
        password: 'SafetyOps!2026',
        deviceId: 'web-safety-console',
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

  async function loadSafetyState(active: WebAuthSession, targetJobId?: string) {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${active.accessToken}` };
      const jobsRes = await fetch('/api/v1/installations', { headers });
      if (!jobsRes.ok) {
        const b = await jobsRes.json().catch(() => ({}));
        throw new Error(b?.error?.message ?? `Role (${active.role}) cannot inspect installation jobs.`);
      }
      const jobsData = await jobsRes.json();
      const nextJobs: InstallationJobRecord[] = jobsData.installations ?? [];
      setJobs(nextJobs);

      const jobToLoad =
        targetJobId ??
        (selectedJobId && nextJobs.some((j) => j.id === selectedJobId)
          ? selectedJobId
          : nextJobs[0]?.id ?? '');

      setSelectedJobId(jobToLoad);

      if (jobToLoad) {
        const safeRes = await fetch(`/api/v1/safety/jobs/${jobToLoad}`, { headers });
        if (!safeRes.ok) {
          const b = await safeRes.json().catch(() => ({}));
          throw new Error(b?.error?.message ?? 'Unable to load safety compliance bundle');
        }
        setBundle(await safeRes.json());
      } else {
        setBundle(null);
      }
      setErrMsg(null);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Unable to load safety data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (session) {
      void loadSafetyState(session);
    }
  }, [session?.accessToken, session?.organizationId]);

  async function handleBootstrapDemoJob() {
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
            customerType: 'commercial',
            fullName: 'Crescent Logistics Hub',
          }),
        })
      ).json();
      const site = await (
        await fetch(`/api/v1/customers/${cust.id}/sites`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            siteName: 'North Bay Rooftop',
            addressLine: 'Sundar Industrial Area',
            city: 'Lahore',
            countryCode: 'PK',
            connectionPhase: 'three',
          }),
        })
      ).json();
      const project = await (
        await fetch('/api/v1/projects', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            customerId: cust.id,
            siteId: site.id,
            title: '25 kW Industrial Solar Inspection Demo',
            systemType: 'hybrid',
            targetCapacityKwp: 25,
            currency,
          }),
        })
      ).json();
      const job = await (
        await fetch('/api/v1/installations', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            projectId: project.id,
            scheduledStartDate: new Date().toISOString().slice(0, 10),
          }),
        })
      ).json();
      await loadSafetyState(active, job.id);
      setStatusMsg(`Initialized installation ${job.jobCode} for safety & inspection review.`);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Failed to create demo job');
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitRiskAssessment(e: FormEvent) {
    e.preventDefault();
    if (!selectedJobId) return;
    setBusy(true);
    setErrMsg(null);
    setStatusMsg(null);
    try {
      const active = await ensureActiveSession();
      const res = await fetch('/api/v1/safety/risk-assessments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${active.accessToken}`,
        },
        body: JSON.stringify({
          installationJobId: selectedJobId,
          workingAtHeightRequired,
          electricalIsolationVerified: electricalIsolationVerified,
          ppeComplianceVerified: ppeVerified,
          hazardNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Risk assessment submission failed');
      await loadSafetyState(active, selectedJobId);
      setStatusMsg('Risk assessment submitted and awaiting Safety Officer sign-off.');
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Risk assessment error');
    } finally {
      setBusy(false);
    }
  }

  async function handleReviewRisk(riskId: string, action: 'approve' | 'reject') {
    setBusy(true);
    setErrMsg(null);
    setStatusMsg(null);
    try {
      const active = await ensureActiveSession();
      const res = await fetch(`/api/v1/safety/risk-assessments/${riskId}/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${active.accessToken}`,
        },
        body: JSON.stringify({
          notes:
            action === 'approve'
              ? 'PPE, LOTO, and working-at-height controls verified'
              : 'Unsafe isolation or PPE gap detected',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Risk assessment decision rejected');
      await loadSafetyState(active, selectedJobId);
      setStatusMsg(`Risk assessment ${data.status}.`);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Risk review error');
    } finally {
      setBusy(false);
    }
  }

  async function handleLogChecklist() {
    if (!selectedJobId) return;
    setBusy(true);
    setErrMsg(null);
    setStatusMsg(null);
    try {
      const active = await ensureActiveSession();
      const res = await fetch('/api/v1/safety/checklists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${active.accessToken}`,
        },
        body: JSON.stringify({
          installationJobId: selectedJobId,
          checklistType,
          items: DEFAULT_PV_CHECKLIST_ITEMS[checklistType],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Checklist logging failed');
      await loadSafetyState(active, selectedJobId);
      setStatusMsg(`Recorded ${checklistType.replace('_', ' ')} safety checklist.`);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Checklist error');
    } finally {
      setBusy(false);
    }
  }

  async function handleReportIncident(e: FormEvent) {
    e.preventDefault();
    if (!selectedJobId || incidentDesc.trim().length < 3) return;
    setBusy(true);
    setErrMsg(null);
    setStatusMsg(null);
    try {
      const active = await ensureActiveSession();
      const res = await fetch('/api/v1/safety/incidents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${active.accessToken}`,
        },
        body: JSON.stringify({
          installationJobId: selectedJobId,
          severity: incidentSeverity,
          description: incidentDesc.trim(),
          immediateActionTaken: incidentAction.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Incident reporting failed');
      setIncidentDesc('');
      setIncidentAction('');
      await loadSafetyState(active, selectedJobId);
      setStatusMsg(
        data.severity === 'major' || data.severity === 'critical'
          ? 'Critical/major incident logged — installation job immediately placed into safety_blocked.'
          : 'Safety incident logged.',
      );
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Incident error');
    } finally {
      setBusy(false);
    }
  }

  async function handleResolveIncident(incidentId: string) {
    setBusy(true);
    setErrMsg(null);
    setStatusMsg(null);
    try {
      const active = await ensureActiveSession();
      const res = await fetch(`/api/v1/safety/incidents/${incidentId}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${active.accessToken}`,
        },
        body: JSON.stringify({ actionNotes: 'Hazard mitigated & verified by Safety Officer' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Unable to resolve incident');
      await loadSafetyState(active, selectedJobId);
      setStatusMsg(`Incident ${data.id.slice(0, 8)} resolved.`);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Resolve error');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateInspection(e: FormEvent) {
    e.preventDefault();
    if (!selectedJobId) return;
    setBusy(true);
    setErrMsg(null);
    setStatusMsg(null);
    try {
      const active = await ensureActiveSession();
      const res = await fetch('/api/v1/safety/inspections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${active.accessToken}`,
        },
        body: JSON.stringify({
          installationJobId: selectedJobId,
          items: [
            {
              checkCode: 'IEC-SPD-01',
              description: 'Type 2 DC/AC Surge Protection Devices & isolator signage',
              result: spdCheckResult,
            },
            {
              checkCode: 'IEC-GND-02',
              description: 'Equipotential roof rail bonding & dedicated earthing pit',
              result: earthingCheckResult,
            },
          ],
          testReadings: [
            {
              parameterName: 'Earth Electrode Resistance',
              measuredValue: Number(earthOhms),
              unit: 'ohm',
              withinTolerance: Number(earthOhms) <= 5.0,
            },
            {
              parameterName: 'DC Insulation Resistance',
              measuredValue: Number(insulationMOhm),
              unit: 'MOhm',
              withinTolerance: Number(insulationMOhm) >= 1.0,
            },
            {
              parameterName: 'AC RCD Trip Time',
              measuredValue: Number(rcdMs),
              unit: 'ms',
              withinTolerance: Number(rcdMs) <= 40.0,
            },
          ],
          initialCorrectiveAction: initialActionDesc.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Inspection creation failed');
      setInitialActionDesc('');
      await loadSafetyState(active, selectedJobId);
      setStatusMsg('IEC 62446-1 inspection recorded.');
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Inspection error');
    } finally {
      setBusy(false);
    }
  }

  async function handleReviewInspection(inspectionId: string, action: 'approve' | 'reject') {
    setBusy(true);
    setErrMsg(null);
    setStatusMsg(null);
    try {
      const active = await ensureActiveSession();
      const res = await fetch(`/api/v1/safety/inspections/${inspectionId}/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${active.accessToken}`,
        },
        body: JSON.stringify({
          notes:
            action === 'approve'
              ? 'All IEC 62446-1 checks & test readings passed; cleared for commissioning'
              : 'Inspection failed safety tolerance checks; hard block applied',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Inspection review rejected');
      await loadSafetyState(active, selectedJobId);
      setStatusMsg(`Inspection marked as ${data.status}.`);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Inspection sign-off blocked');
    } finally {
      setBusy(false);
    }
  }

  async function handleAddCorrectiveAction(inspectionId: string) {
    if (actionDesc.trim().length < 3) return;
    setBusy(true);
    setErrMsg(null);
    try {
      const active = await ensureActiveSession();
      const res = await fetch(`/api/v1/safety/inspections/${inspectionId}/corrective-actions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${active.accessToken}`,
        },
        body: JSON.stringify({ description: actionDesc.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Failed to add corrective action');
      setActionDesc('');
      await loadSafetyState(active, selectedJobId);
      setStatusMsg('Corrective action logged (safety gate blocked until verified).');
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Corrective action error');
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateActionStatus(
    inspectionId: string,
    actionId: string,
    nextStatus: CorrectiveActionStatus,
  ) {
    setBusy(true);
    setErrMsg(null);
    try {
      const active = await ensureActiveSession();
      const res = await fetch(
        `/api/v1/safety/inspections/${inspectionId}/corrective-actions/${actionId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${active.accessToken}`,
          },
          body: JSON.stringify({ status: nextStatus }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Failed to update corrective action');
      await loadSafetyState(active, selectedJobId);
      setStatusMsg(`Corrective action marked ${data.status}.`);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Corrective action update failed');
    } finally {
      setBusy(false);
    }
  }

  const latestInspection = useMemo(
    () => bundle?.inspections[0] ?? null,
    [bundle],
  );

  return (
    <div className="space-y-6">
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-6">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Safety Compliance & IEC 62446-1 Inspection
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Enforce PPE and electrical isolation risk assessments, incident hard-blocks, test readings, and Safety Officer clearance prior to commissioning.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <select
            value={selectedJobId}
            onChange={(e) => {
              const id = e.target.value;
              setSelectedJobId(id);
              if (session && id) void loadSafetyState(session, id);
            }}
            className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
          >
            {jobs.length === 0 ? (
              <option value="">No installation jobs</option>
            ) : (
              jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.jobCode} ({j.status})
                </option>
              ))
            )}
          </select>
          <button
            type="button"
            onClick={() => void handleBootstrapDemoJob()}
            disabled={busy || loading}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition-colors whitespace-nowrap shrink-0"
          >
            New Inspection Job
          </button>
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

      {!bundle ? (
        <section className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-8 text-center space-y-3">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            No Installation Job Selected for Safety Inspection
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
            Click "New Inspection Job" to initialize a tenant session and create a scheduled solar installation job ready for PPE risk assessment and IEC 62446-1 inspection.
          </p>
        </section>
      ) : (
        <>
          {/* Hard Safety Gate Status Strip */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">Commissioning Safety Gate</div>
              <div
                className={`text-lg font-semibold mt-1 ${
                  bundle.evaluation.cleared
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : bundle.evaluation.blocked
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                {bundle.evaluation.cleared
                  ? 'Cleared'
                  : bundle.evaluation.blocked
                    ? 'Hard Blocked'
                    : 'Pending Sign-Off'}
              </div>
            </div>
            <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">Installation Status</div>
              <div className="text-lg font-semibold font-mono tabular-nums mt-1 text-slate-900 dark:text-slate-100">
                {bundle.jobStatus}
              </div>
            </div>
            <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">Risk Assessments</div>
              <div className="text-lg font-semibold font-mono tabular-nums mt-1 text-slate-900 dark:text-slate-100">
                {bundle.riskAssessments.length}
              </div>
            </div>
            <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">Open Incidents</div>
              <div className="text-lg font-semibold font-mono tabular-nums mt-1 text-rose-600 dark:text-rose-400">
                {bundle.incidents.filter((i) => !i.resolved).length}
              </div>
            </div>
          </section>

          {bundle.evaluation.reasons.length > 0 && (
            <section className="border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 rounded-xl p-4 text-xs text-amber-900 dark:text-amber-200 space-y-1">
              <div className="font-semibold">Gate Conditions Remaining</div>
              <ul className="list-disc pl-5 space-y-0.5">
                {bundle.evaluation.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </section>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* Risk Assessments & Checklists */}
            <section className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-6 space-y-5">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Risk Assessment & PPE / LOTO Checklists
              </h3>
              <form onSubmit={handleSubmitRiskAssessment} className="space-y-3">
                <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={ppeVerified}
                    onChange={(e) => setPpeVerified(e.target.checked)}
                  />
                  PPE Compliance Verified (Class 0 gloves, EN 397 helmet, dielectric boots)
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={electricalIsolationVerified}
                    onChange={(e) => setElectricalIsolationVerified(e.target.checked)}
                  />
                  Electrical Isolation Verified (DC/AC LOTO & zero-voltage check)
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={workingAtHeightRequired}
                    onChange={(e) => setWorkingAtHeightRequired(e.target.checked)}
                  />
                  Working at Height Harness & Roof Lifeline Active
                </label>
                <textarea
                  rows={2}
                  value={hazardNotes}
                  onChange={(e) => setHazardNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    disabled={busy}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-amber-600 text-white hover:bg-slate-800 dark:hover:bg-amber-700"
                  >
                    Submit Risk Assessment
                  </button>
                  <select
                    value={checklistType}
                    onChange={(e) => setChecklistType(e.target.value as SafetyChecklistType)}
                    className="px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    <option value="ppe">PPE Checklist</option>
                    <option value="working_at_height">Working at Height</option>
                    <option value="electrical_isolation">Electrical Isolation</option>
                    <option value="loto_lockout">LOTO Lockout</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => void handleLogChecklist()}
                    disabled={busy}
                    className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    Record Checklist ({bundle.checklists.length})
                  </button>
                </div>
              </form>

              {bundle.riskAssessments.length > 0 && (
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {bundle.riskAssessments.map((ra) => (
                    <div key={ra.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="text-xs">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          Status: {ra.status} · PPE {ra.ppeComplianceVerified ? 'Yes' : 'No'} · Isolation{' '}
                          {ra.electricalIsolationVerified ? 'Yes' : 'No'}
                        </div>
                        <div className="text-slate-500 mt-0.5">{ra.hazardNotes}</div>
                      </div>
                      {ra.status === 'submitted' && (
                        <div className="flex gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => void handleReviewRisk(ra.id, 'approve')}
                            disabled={busy}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleReviewRisk(ra.id, 'reject')}
                            disabled={busy}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Incidents Log */}
            <section className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-6 space-y-5">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Safety Incidents & Hard Stop Alerts ({bundle.incidents.length})
              </h3>
              <form onSubmit={handleReportIncident} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={incidentSeverity}
                    onChange={(e) => setIncidentSeverity(e.target.value as SafetyIncidentSeverity)}
                    className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    <option value="near_miss">Near Miss</option>
                    <option value="minor">Minor Incident</option>
                    <option value="major">Major (Hard Blocks Job)</option>
                    <option value="critical">Critical (Hard Blocks Job)</option>
                  </select>
                  <input
                    type="text"
                    value={incidentAction}
                    onChange={(e) => setIncidentAction(e.target.value)}
                    placeholder="Immediate containment action"
                    className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <textarea
                  rows={2}
                  value={incidentDesc}
                  onChange={(e) => setIncidentDesc(e.target.value)}
                  placeholder="Describe hazard, near-miss, or isolation fault..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <button
                  type="submit"
                  disabled={busy || incidentDesc.trim().length < 3}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-40"
                >
                  Log Safety Incident
                </button>
              </form>

              {bundle.incidents.length > 0 && (
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {bundle.incidents.map((inc) => (
                    <div key={inc.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="text-xs">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {inc.severity.toUpperCase()} · {inc.resolved ? 'Resolved' : 'Open'} ·{' '}
                          <span className="font-mono">{inc.occurredAt.slice(0, 10)}</span>
                        </div>
                        <div className="text-slate-600 dark:text-slate-400 mt-0.5">{inc.description}</div>
                      </div>
                      {!inc.resolved && (
                        <button
                          type="button"
                          onClick={() => void handleResolveIncident(inc.id)}
                          disabled={busy}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 shrink-0"
                        >
                          Resolve
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* IEC 62446-1 Inspection & Test Readings */}
          <section className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-6 space-y-5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              IEC 62446-1 Electrical Inspection & Corrective Actions
            </h3>
            <form onSubmit={handleCreateInspection} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Earth Resistance (Ohm &le; 5)</label>
                <input
                  type="number"
                  step="0.1"
                  value={earthOhms}
                  onChange={(e) => setEarthOhms(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs font-mono tabular-nums rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Insulation (MOhm &ge; 1)</label>
                <input
                  type="number"
                  step="1"
                  value={insulationMOhm}
                  onChange={(e) => setInsulationMOhm(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs font-mono tabular-nums rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">RCD Trip Time (ms &le; 40)</label>
                <input
                  type="number"
                  step="1"
                  value={rcdMs}
                  onChange={(e) => setRcdMs(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs font-mono tabular-nums rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">SPD &amp; Earthing Checks</label>
                <div className="flex gap-2">
                  <select
                    value={spdCheckResult}
                    onChange={(e) => setSpdCheckResult(e.target.value as InspectionItemResult)}
                    className="w-1/2 px-2 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    <option value="pass">SPD Pass</option>
                    <option value="fail">SPD Fail</option>
                  </select>
                  <select
                    value={earthingCheckResult}
                    onChange={(e) => setEarthingCheckResult(e.target.value as InspectionItemResult)}
                    className="w-1/2 px-2 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    <option value="pass">GND Pass</option>
                    <option value="fail">GND Fail</option>
                  </select>
                </div>
              </div>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-amber-600 text-white hover:bg-slate-800 dark:hover:bg-amber-700"
              >
                Record Inspection
              </button>
            </form>

            {latestInspection && (
              <div className="border-t border-slate-200 dark:border-slate-800 pt-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    Inspection Status: <strong className="text-slate-900 dark:text-slate-100">{latestInspection.status}</strong> · v
                    <span className="font-mono tabular-nums">{latestInspection.rowVersion}</span>
                  </div>
                  {latestInspection.status !== 'passed' && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void handleReviewInspection(latestInspection.id, 'approve')}
                        disabled={busy}
                        className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        Approve &amp; Clear Safety Gate
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleReviewInspection(latestInspection.id, 'reject')}
                        disabled={busy}
                        className="px-4 py-2 text-xs font-medium rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50"
                      >
                        Fail Inspection
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  {latestInspection.testReadings.map((r) => (
                    <div
                      key={r.id}
                      className="border border-slate-200 dark:border-slate-800 rounded-lg p-3 flex items-center justify-between"
                    >
                      <span className="text-slate-600 dark:text-slate-400">{r.parameterName}</span>
                      <span
                        className={`font-mono tabular-nums font-semibold ${
                          r.withinTolerance ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {r.measuredValue} {r.unit}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Corrective actions */}
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={actionDesc}
                      onChange={(e) => setActionDesc(e.target.value)}
                      placeholder="Add remedial corrective action..."
                      className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                    <button
                      type="button"
                      onClick={() => void handleAddCorrectiveAction(latestInspection.id)}
                      disabled={busy || actionDesc.trim().length < 3}
                      className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 disabled:opacity-40"
                    >
                      Add Action
                    </button>
                  </div>
                  {latestInspection.correctiveActions.map((act) => (
                    <div
                      key={act.id}
                      className="flex items-center justify-between gap-3 py-2 border-b border-slate-200 dark:border-slate-800 text-xs"
                    >
                      <div>
                        <span className="font-medium text-slate-900 dark:text-slate-100">
                          {act.description}
                        </span>{' '}
                        <span className="text-slate-500">({act.status})</span>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {act.status === 'open' && (
                          <button
                            type="button"
                            onClick={() =>
                              void handleUpdateActionStatus(latestInspection.id, act.id, 'resolved')
                            }
                            className="px-2.5 py-1 text-xs rounded border border-slate-300 dark:border-slate-700"
                          >
                            Mark Resolved
                          </button>
                        )}
                        {act.status !== 'verified' && (
                          <button
                            type="button"
                            onClick={() =>
                              void handleUpdateActionStatus(latestInspection.id, act.id, 'verified')
                            }
                            className="px-2.5 py-1 text-xs font-semibold rounded bg-emerald-600 text-white"
                          >
                            Verify &amp; Clear
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
