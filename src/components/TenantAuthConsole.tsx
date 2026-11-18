import { useEffect, useState, type FormEvent } from 'react';
import {
  ROLE_DEFINITIONS,
  UserRole,
  type SupportedCurrency,
} from '../../packages/domain/src/index.ts';

import type { WebAuthSession } from '../lib/auth-session.ts';

type AuthSessionState = WebAuthSession;

interface MemberItem {
  membershipId: string;
  email: string;
  fullName: string;
  role: UserRole;
  roleLabel: string;
  status: string;
}

interface AuditItem {
  id: string;
  action: string;
  entityType: string;
  requestId: string | null;
  createdAt: string;
}

export function TenantAuthConsole({
  currency,
  session: controlledSession,
  onSessionChange,
}: {
  currency: SupportedCurrency;
  session?: WebAuthSession | null;
  onSessionChange?: (next: WebAuthSession | null) => void;
}) {
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [internalSession, setInternalSession] = useState<AuthSessionState | null>(null);
  const session = controlledSession !== undefined ? controlledSession : internalSession;
  function updateSession(next: AuthSessionState | null) {
    setInternalSession(next);
    onSessionChange?.(next);
  }
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditItem[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Registration / Login form state
  const [legalName, setLegalName] = useState('Indus Valley Solar Pvt Ltd');
  const [slug, setSlug] = useState(`indus-solar-${Math.floor(100 + Math.random() * 900)}`);
  const [businessAddress, setBusinessAddress] = useState('Gulberg III, Lahore, Pakistan');
  const [ownerFullName, setOwnerFullName] = useState('Tariq Mahmood');
  const [email, setEmail] = useState(`tariq.${Math.floor(100 + Math.random() * 900)}@indussolar.pk`);
  const [password, setPassword] = useState('SolarSecure!2026');

  // Invite member form state
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>(UserRole.SOLAR_ENGINEER);
  const [invitePass, setInvitePass] = useState('FieldPass!2026');
  const [posture, setPosture] = useState<{
    passwordHashing: string;
    accessTokenAlgorithm: string;
    refreshTokenRotation: boolean;
    bruteForceLockoutEnabled: boolean;
    securityHeadersHardened: boolean;
    minorUnitCurrencyOnly: boolean;
    openApiPathsCount: number;
    totalTables: number;
    rlsProtectedTables: number;
    immutabilityTriggers: number;
  } | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/v1/meta/security-posture')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active && data) setPosture(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  async function loadOrgData(accessToken: string) {
    const headers = { Authorization: `Bearer ${accessToken}` };
    const [membersRes, auditRes] = await Promise.all([
      fetch('/api/v1/organizations/members', { headers }),
      fetch('/api/v1/organizations/audit-events', { headers }),
    ]);

    if (membersRes.ok) {
      const mData = await membersRes.json();
      setMembers(mData.members ?? []);
    }
    if (auditRes.ok) {
      const aData = await auditRes.json();
      setAuditEvents(aData.events ?? []);
    }
  }

  async function handleAuthSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const endpoint =
        mode === 'register' ? '/api/v1/auth/register-organization' : '/api/v1/auth/login';
      const body =
        mode === 'register'
          ? {
              legalName,
              displayName: legalName,
              slug,
              businessAddress,
              countryCode: 'PK',
              defaultCurrency: currency,
              ownerFullName,
              ownerEmail: email,
              password,
              deviceId: 'web-admin-console',
            }
          : {
              email,
              password,
              deviceId: 'web-admin-console',
            };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message ?? 'Authentication request failed');
      }

      const nextSession: AuthSessionState = {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        sessionId: data.sessionId,
        organizationName: data.organization.displayName,
        organizationId: data.organization.id,
        userEmail: data.user.email,
        role: data.role,
      };
      updateSession(nextSession);
      setStatusMessage(
        mode === 'register'
          ? `Registered ${nextSession.organizationName} with Argon2id and active JWT session.`
          : `Signed in to ${nextSession.organizationName}.`,
      );
      await loadOrgData(nextSession.accessToken);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleRotateRefreshToken() {
    if (!session) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Refresh failed');
      const updated = {
        ...session,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        sessionId: data.sessionId,
      };
      updateSession(updated);
      setStatusMessage(`Rotated refresh token cleanly. New session ${data.sessionId.slice(0, 8)}.`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Refresh failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    if (!session) return;
    await fetch('/api/v1/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    updateSession(null);
    setMembers([]);
    setAuditEvents([]);
    setStatusMessage('Session revoked cleanly.');
  }

  async function handleInviteMember(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/v1/organizations/members', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({
          fullName: inviteName,
          email: inviteEmail,
          role: inviteRole,
          temporaryPassword: invitePass,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Failed to add member');
      setInviteName('');
      setInviteEmail('');
      setStatusMessage(`Provisioned ${data.user.email} as ${ROLE_DEFINITIONS[inviteRole].label}.`);
      await loadOrgData(session.accessToken);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to provision member');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-5 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Phase 3 · Authentication, RBAC & Multi-Tenancy
          </p>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 mt-1">
            Tenant Governance & Session Console
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
            Live integration against `/api/v1/auth/*` and `/api/v1/organizations/*` using Argon2id password hashing, rotating refresh tokens, and organization-scoped audit logs.
          </p>
        </div>

        {session && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={busy}
              onClick={handleRotateRefreshToken}
              className="px-3 py-2 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap"
            >
              Rotate Refresh Token
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="px-3 py-2 text-xs font-medium rounded-md bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90 whitespace-nowrap"
            >
              Sign Out
            </button>
          </div>
        )}
      </div>

      {statusMessage && (
        <div className="p-3.5 rounded-md border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 text-xs text-emerald-800 dark:text-emerald-300">
          {statusMessage}
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-xs text-red-800 dark:text-red-300">
          {errorMessage}
        </div>
      )}

      {posture && (
        <section className="grid grid-cols-2 md:grid-cols-4 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-800">
          <div className="p-4">
            <div className="text-xs text-slate-500 dark:text-slate-400">PostgreSQL RLS & Schema</div>
            <div className="mt-1 font-mono tabular-nums text-base font-semibold text-slate-900 dark:text-slate-50">
              {posture.totalTables} tables · {posture.rlsProtectedTables} RLS
            </div>
            <div className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-400">
              {posture.immutabilityTriggers} immutability triggers
            </div>
          </div>
          <div className="p-4">
            <div className="text-xs text-slate-500 dark:text-slate-400">Auth & Lockout Guard</div>
            <div className="mt-1 font-mono text-base font-semibold text-slate-900 dark:text-slate-50">
              {posture.passwordHashing} · {posture.accessTokenAlgorithm}
            </div>
            <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {posture.bruteForceLockoutEnabled ? '5-attempt lockout active' : 'Standard'}
            </div>
          </div>
          <div className="p-4">
            <div className="text-xs text-slate-500 dark:text-slate-400">HTTP Hardening & CSP</div>
            <div className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-50">
              {posture.securityHeadersHardened ? 'Strict Headers On' : 'Baseline'}
            </div>
            <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              nosniff · no-store · CSP none
            </div>
          </div>
          <div className="p-4">
            <div className="text-xs text-slate-500 dark:text-slate-400">OpenAPI Contract Parity</div>
            <div className="mt-1 font-mono tabular-nums text-base font-semibold text-slate-900 dark:text-slate-50">
              {posture.openApiPathsCount} paths
            </div>
            <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {posture.minorUnitCurrencyOnly ? 'Integer minor-unit ledger' : 'Mixed'}
            </div>
          </div>
        </section>
      )}

      {!session ? (
        <section className="max-w-xl border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 p-6 space-y-5">
          <div className="inline-flex p-1 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setMode('register')}
              className={`px-3 py-1.5 text-xs font-medium rounded ${
                mode === 'register'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Register Organization
            </button>
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`px-3 py-1.5 text-xs font-medium rounded ${
                mode === 'login'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Sign In
            </button>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {mode === 'register' && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="block space-y-1 text-xs">
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      Company Legal Name
                    </span>
                    <input
                      required
                      value={legalName}
                      onChange={(e) => setLegalName(e.target.value)}
                      className="w-full h-9 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                    />
                  </label>
                  <label className="block space-y-1 text-xs">
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      Tenant Slug
                    </span>
                    <input
                      required
                      value={slug}
                      onChange={(e) => setSlug(e.target.value)}
                      className="w-full h-9 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono"
                    />
                  </label>
                </div>

                <label className="block space-y-1 text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    Business Address
                  </span>
                  <input
                    required
                    value={businessAddress}
                    onChange={(e) => setBusinessAddress(e.target.value)}
                    className="w-full h-9 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  />
                </label>

                <label className="block space-y-1 text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    Owner Full Name
                  </span>
                  <input
                    required
                    value={ownerFullName}
                    onChange={(e) => setOwnerFullName(e.target.value)}
                    className="w-full h-9 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  />
                </label>
              </>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block space-y-1 text-xs">
                <span className="font-medium text-slate-700 dark:text-slate-300">Work Email</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </label>
              <label className="block space-y-1 text-xs">
                <span className="font-medium text-slate-700 dark:text-slate-300">Password</span>
                <input
                  type="password"
                  required
                  minLength={10}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium transition-colors"
            >
              {busy
                ? 'Processing...'
                : mode === 'register'
                  ? 'Register Company & Create Owner'
                  : 'Authenticate'}
            </button>
          </form>
        </section>
      ) : (
        <div className="space-y-8">
          <section className="grid grid-cols-1 md:grid-cols-3 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-800">
            <div className="p-5">
              <div className="text-xs text-slate-500 dark:text-slate-400">Authenticated Tenant</div>
              <div className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-50">
                {session.organizationName}
              </div>
              <div className="mt-1 font-mono text-xs text-slate-500 truncate">
                {session.organizationId}
              </div>
            </div>
            <div className="p-5">
              <div className="text-xs text-slate-500 dark:text-slate-400">Account & Role</div>
              <div className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-50">
                {ROLE_DEFINITIONS[session.role].label}
              </div>
              <div className="mt-1 text-xs text-slate-500 truncate">{session.userEmail}</div>
            </div>
            <div className="p-5">
              <div className="text-xs text-slate-500 dark:text-slate-400">Active Session ID</div>
              <div className="mt-1 font-mono tabular-nums text-base font-semibold text-slate-900 dark:text-slate-50 truncate">
                {session.sessionId}
              </div>
              <div className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
                Argon2id + Rotating Refresh Active
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <section className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 p-5 space-y-4">
              <h2 className="font-display text-base font-semibold">Provision Staff Account</h2>
              <form onSubmit={handleInviteMember} className="space-y-3">
                <label className="block space-y-1 text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Full Name</span>
                  <input
                    required
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    placeholder="Ayesha Khan"
                    className="w-full h-9 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  />
                </label>
                <label className="block space-y-1 text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Email</span>
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="ayesha@indussolar.pk"
                    className="w-full h-9 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  />
                </label>
                <label className="block space-y-1 text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Role</span>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as UserRole)}
                    className="w-full h-9 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  >
                    {Object.values(ROLE_DEFINITIONS).map((r) => (
                      <option key={r.role} value={r.role}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1 text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    Initial Password
                  </span>
                  <input
                    type="password"
                    required
                    minLength={10}
                    value={invitePass}
                    onChange={(e) => setInvitePass(e.target.value)}
                    className="w-full h-9 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  />
                </label>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full px-4 py-2 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium"
                >
                  Add Staff Member
                </button>
              </form>
            </section>

            <section className="lg:col-span-2 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <h2 className="font-display text-base font-semibold">Organization Members</h2>
                <span className="font-mono tabular-nums text-xs text-slate-500">
                  {members.length} active
                </span>
              </div>
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-xs text-slate-500">
                    <th className="py-2.5 px-4">Name</th>
                    <th className="py-2.5 px-4">Email</th>
                    <th className="py-2.5 px-4">Role</th>
                    <th className="py-2.5 px-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {members.map((m) => (
                    <tr key={m.membershipId}>
                      <td className="py-2.5 px-4 font-medium">{m.fullName}</td>
                      <td className="py-2.5 px-4 text-xs text-slate-600 dark:text-slate-400">
                        {m.email}
                      </td>
                      <td className="py-2.5 px-4 text-xs">{m.roleLabel}</td>
                      <td className="py-2.5 px-4 text-right text-xs text-emerald-700 dark:text-emerald-400">
                        {m.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>

          <section className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="font-display text-base font-semibold">Immutable Audit Trail</h2>
              <span className="font-mono tabular-nums text-xs text-slate-500">
                {auditEvents.length} events
              </span>
            </div>
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-slate-500">
                  <th className="py-2.5 px-4">Action</th>
                  <th className="py-2.5 px-4">Entity</th>
                  <th className="py-2.5 px-4">Request ID</th>
                  <th className="py-2.5 px-4 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {auditEvents.map((ev) => (
                  <tr key={ev.id}>
                    <td className="py-2.5 px-4 font-mono font-medium text-slate-900 dark:text-slate-100">
                      {ev.action}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400">
                      {ev.entityType}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-500">{ev.requestId ?? '—'}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-500">
                      {ev.createdAt}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </div>
  );
}
