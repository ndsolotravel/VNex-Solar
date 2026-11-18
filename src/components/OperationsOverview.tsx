import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import {
  ROLE_DEFINITIONS,
  VNEX_NAVIGATION,
  hasPermission,
  type NavSectionId,
  type SupportedCurrency,
  type UserRole,
} from '../../packages/domain/src/index.ts';

interface OperationsOverviewProps {
  activeRole: UserRole;
  currency: SupportedCurrency;
  onNavigate: (id: NavSectionId) => void;
}

type SyncFilter = 'all' | 'offline' | 'server';

export function OperationsOverview({
  activeRole,
  currency,
  onNavigate,
}: OperationsOverviewProps) {
  const [query, setQuery] = useState('');
  const [syncFilter, setSyncFilter] = useState<SyncFilter>('all');

  const roleInfo = ROLE_DEFINITIONS[activeRole];

  const filteredModules = useMemo(() => {
    return VNEX_NAVIGATION.filter((item) => {
      if (syncFilter === 'offline' && !item.offlineSupported) return false;
      if (syncFilter === 'server' && item.offlineSupported) return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        item.label.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.group.toLowerCase().includes(q)
      );
    });
  }, [query, syncFilter]);

  const offlineCount = VNEX_NAVIGATION.filter((n) => n.offlineSupported).length;
  const accessibleCount = VNEX_NAVIGATION.filter(
    (n) => !n.requiredPermission || hasPermission(activeRole, n.requiredPermission),
  ).length;

  return (
    <div className="space-y-8">
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Phase 1 · Android, Web Admin & Backend Foundation
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 text-balance">
            VNex Solar Architecture Workspace
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
            Active role preview: <span className="font-medium text-slate-900 dark:text-slate-200">{roleInfo.label}</span> — {roleInfo.scopeSummary}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('sync')}
          className="px-4 py-2 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium transition-colors whitespace-nowrap shrink-0 self-start md:self-auto focus-visible:outline-2 focus-visible:outline-amber-600"
        >
          Inspect Sync Contract
        </button>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800">
        <div className="p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">Business Modules</div>
          <div className="mt-1.5 font-mono tabular-nums text-2xl font-semibold text-slate-900 dark:text-slate-50">
            {VNEX_NAVIGATION.length}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {accessibleCount} visible to {roleInfo.label}
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">Offline-Capable Workflows</div>
          <div className="mt-1.5 font-mono tabular-nums text-2xl font-semibold text-slate-900 dark:text-slate-50">
            {offlineCount}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Room SQLite + WorkManager queue
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">Active Currency Context</div>
          <div className="mt-1.5 font-mono tabular-nums text-2xl font-semibold text-slate-900 dark:text-slate-50">
            {currency}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Exact decimal arithmetic enforced
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">Platform Targets</div>
          <div className="mt-1.5 font-mono tabular-nums text-2xl font-semibold text-slate-900 dark:text-slate-50">
            3
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Android · Next.js · NestJS + Postgres
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter modules or capabilities..."
              aria-label="Filter modules"
              className="w-full h-9 pl-9 pr-3 text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-amber-600"
            />
          </div>

          <div className="inline-flex items-center p-1 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 self-start">
            {(
              [
                { id: 'all', label: 'All Modules' },
                { id: 'offline', label: 'Offline Android' },
                { id: 'server', label: 'Server-Authoritative' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSyncFilter(tab.id)}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  syncFilter === tab.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 overflow-x-auto">
          {filteredModules.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                No modules match "{query}"
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Adjust your search query or switch the offline/server filter.
              </p>
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setSyncFilter('all');
                }}
                className="px-4 py-2 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4">Module</th>
                  <th className="py-3 px-4">Domain Group</th>
                  <th className="py-3 px-4">Sync Authority</th>
                  <th className="py-3 px-4">Role Access</th>
                  <th className="py-3 px-4 text-right">Target Phase</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredModules.map((item) => {
                  const permitted =
                    !item.requiredPermission || hasPermission(activeRole, item.requiredPermission);
                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => onNavigate(item.id)}
                          className="font-medium text-slate-900 dark:text-slate-100 hover:text-amber-700 dark:hover:text-amber-400 text-left"
                        >
                          {item.label}
                        </button>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-md">
                          {item.description}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {item.group}
                      </td>
                      <td className="py-3 px-4 text-xs whitespace-nowrap">
                        <span
                          className={
                            item.offlineSupported
                              ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                              : 'text-slate-600 dark:text-slate-400'
                          }
                        >
                          {item.offlineSupported ? 'Offline-First (Room)' : 'Server-Authoritative'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs whitespace-nowrap">
                        <span
                          className={
                            permitted
                              ? 'text-slate-700 dark:text-slate-200'
                              : 'text-red-600 dark:text-red-400'
                          }
                        >
                          {permitted ? 'Permitted' : 'Restricted'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {item.targetPhase}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
