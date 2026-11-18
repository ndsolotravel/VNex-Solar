import {
  LayoutDashboard,
  Users,
  Camera,
  Cpu,
  Package,
  FileText,
  Receipt,
  Wrench,
  ShieldCheck,
  CheckCircle2,
  CalendarClock,
  RefreshCw,
  Building2,
  X,
} from 'lucide-react';
import {
  VNEX_NAVIGATION,
  hasPermission,
  type NavItem,
  type NavSectionId,
  type UserRole,
} from '../../packages/domain/src/index.ts';

const ICONS: Record<NavSectionId, typeof LayoutDashboard> = {
  overview: LayoutDashboard,
  customers: Users,
  surveys: Camera,
  engineering: Cpu,
  inventory: Package,
  quotations: FileText,
  finance: Receipt,
  installation: Wrench,
  safety: ShieldCheck,
  commissioning: CheckCircle2,
  maintenance: CalendarClock,
  sync: RefreshCw,
  admin: Building2,
};

interface SidebarProps {
  activeSection: NavSectionId;
  activeRole: UserRole;
  mobileOpen: boolean;
  onSelectSection: (id: NavSectionId) => void;
  onCloseMobile: () => void;
}

const GROUPS: ReadonlyArray<NavItem['group']> = [
  'Operations',
  'Engineering & Supply',
  'Field & Safety',
  'Governance',
];

export function Sidebar({
  activeSection,
  activeRole,
  mobileOpen,
  onSelectSection,
  onCloseMobile,
}: SidebarProps) {
  const visibleItems = VNEX_NAVIGATION.filter(
    (item) => !item.requiredPermission || hasPermission(activeRole, item.requiredPermission),
  );

  const navContent = (
    <div className="h-full flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
      <div className="h-14 px-5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 shrink-0">
        <span className="font-display text-base font-bold tracking-tight text-slate-900 dark:text-slate-50 whitespace-nowrap">
          VNex Solar
        </span>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="lg:hidden p-2 rounded-md text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-amber-600"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6" aria-label="Workspace modules">
        {GROUPS.map((group) => {
          const items = visibleItems.filter((item) => item.group === group);
          if (items.length === 0) return null;
          return (
            <div key={group}>
              <div className="px-3 mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                {group}
              </div>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const Icon = ICONS[item.id];
                  const isActive = item.id === activeSection;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectSection(item.id);
                          onCloseMobile();
                        }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors text-left focus-visible:outline-2 focus-visible:outline-amber-600 ${
                          isActive
                            ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 font-medium'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-50'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
        Phase 1 Foundation · Multi-Platform Monorepo
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block w-64 shrink-0 h-screen sticky top-0">
        {navContent}
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/50"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative z-50 w-72 max-w-[85vw] h-full">
            {navContent}
          </aside>
        </div>
      )}
    </>
  );
}
