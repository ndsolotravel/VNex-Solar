import { Menu, Moon, Sun } from 'lucide-react';
import {
  ROLE_DEFINITIONS,
  SUPPORTED_CURRENCIES,
  UserRole,
  type SupportedCurrency,
} from '../../packages/domain/src/index.ts';

interface TopHeaderProps {
  sectionTitle: string;
  activeRole: UserRole;
  currency: SupportedCurrency;
  isDark: boolean;
  onOpenMobileMenu: () => void;
  onChangeRole: (role: UserRole) => void;
  onChangeCurrency: (currency: SupportedCurrency) => void;
  onToggleTheme: () => void;
}

export function TopHeader({
  sectionTitle,
  activeRole,
  currency,
  isDark,
  onOpenMobileMenu,
  onChangeRole,
  onChangeCurrency,
  onToggleTheme,
}: TopHeaderProps) {
  return (
    <header className="h-14 sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 sm:px-6 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Open navigation menu"
          className="lg:hidden p-2 -ml-2 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-amber-600"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 text-sm min-w-0">
          <span className="text-slate-500 dark:text-slate-400 hidden sm:inline whitespace-nowrap">
            Workspace
          </span>
          <span className="text-slate-400 dark:text-slate-600 hidden sm:inline" aria-hidden="true">
            /
          </span>
          <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
            {sectionTitle}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        <label className="sr-only" htmlFor="role-preview-select">
          Preview Role
        </label>
        <select
          id="role-preview-select"
          value={activeRole}
          onChange={(e) => onChangeRole(e.target.value as UserRole)}
          className="h-9 px-2.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus-visible:outline-2 focus-visible:outline-amber-600"
        >
          {Object.values(ROLE_DEFINITIONS).map((def) => (
            <option key={def.role} value={def.role}>
              {def.label}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="currency-select">
          Workspace Currency
        </label>
        <select
          id="currency-select"
          value={currency}
          onChange={(e) => onChangeCurrency(e.target.value as SupportedCurrency)}
          className="h-9 px-2.5 text-xs font-mono tabular-nums rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus-visible:outline-2 focus-visible:outline-amber-600"
        >
          {SUPPORTED_CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-600"
        >
          {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{isDark ? 'Light' : 'Dark'}</span>
        </button>
      </div>
    </header>
  );
}
