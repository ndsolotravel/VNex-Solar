import Link from 'next/link';
import { VNEX_NAVIGATION } from '../../../../packages/domain/src/navigation';

export default function WebAdminHomePage() {
  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <aside className="w-64 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col justify-between">
        <div>
          <div className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            VNex Solar
          </div>
          <nav className="mt-6 space-y-1" aria-label="Primary modules">
            {VNEX_NAVIGATION.map((item) => (
              <Link
                key={item.id}
                href={`#${item.id}`}
                className="block px-3 py-2 rounded-md text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap truncate"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
          Next.js App Router · Phase 1 Foundation
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <header className="h-14 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-8 flex items-center justify-between">
          <div className="text-sm text-slate-600 dark:text-slate-300">
            Workspace / Operations Overview
          </div>
          <Link
            href="#admin"
            className="px-4 py-2 text-xs font-medium rounded-md bg-amber-600 text-white hover:bg-amber-700 whitespace-nowrap shrink-0"
          >
            Tenant Settings
          </Link>
        </header>

        <div className="max-w-6xl mx-auto p-8 space-y-8">
          <section>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
              VNex Solar Web Admin Foundation
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
              Shell, design system, TanStack Query client, and role-scoped navigation taxonomy aligned with the NestJS backend and Android Room offline app.
            </p>
          </section>

          <section className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 overflow-hidden">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4">Module</th>
                  <th className="py-3 px-4">Group</th>
                  <th className="py-3 px-4">Offline Android</th>
                  <th className="py-3 px-4 text-right">Target Phase</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {VNEX_NAVIGATION.map((item) => (
                  <tr key={item.id} id={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-medium">{item.label}</td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{item.group}</td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                      {item.offlineSupported ? 'Supported via Room' : 'Online / Server-Authoritative'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-500 dark:text-slate-400">
                      {item.targetPhase}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </main>
    </div>
  );
}
