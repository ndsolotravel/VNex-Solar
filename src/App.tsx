import { useEffect, useState } from 'react';
import {
  UserRole,
  VNEX_NAVIGATION,
  type NavSectionId,
  type SupportedCurrency,
} from '../packages/domain/src/index.ts';
import { CommissioningWorkspace } from './components/CommissioningWorkspace.tsx';
import { CustomersProjectsWorkspace } from './components/CustomersProjectsWorkspace.tsx';
import { InstallationWorkspace } from './components/InstallationWorkspace.tsx';
import { InventoryWorkspace } from './components/InventoryWorkspace.tsx';
import { MaintenanceWarrantyWorkspace } from './components/MaintenanceWarrantyWorkspace.tsx';
import { ModuleBlueprintView } from './components/ModuleBlueprintView.tsx';
import { OperationsOverview } from './components/OperationsOverview.tsx';
import { QuotationsBillingWorkspace } from './components/QuotationsBillingWorkspace.tsx';
import { SafetyInspectionWorkspace } from './components/SafetyInspectionWorkspace.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { SiteSurveysWorkspace } from './components/SiteSurveysWorkspace.tsx';
import { SolarEngineeringWorkbench } from './components/SolarEngineeringWorkbench.tsx';
import { SyncEngineConsole } from './components/SyncEngineConsole.tsx';
import { TenantAuthConsole } from './components/TenantAuthConsole.tsx';
import { TopHeader } from './components/TopHeader.tsx';
import type { WebAuthSession } from './lib/auth-session.ts';

export default function App() {
  const [activeSection, setActiveSection] = useState<NavSectionId>('overview');
  const [activeRole, setActiveRole] = useState<UserRole>(UserRole.ORG_OWNER);
  const [currency, setCurrency] = useState<SupportedCurrency>('PKR');
  const [isDark, setIsDark] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authSession, setAuthSession] = useState<WebAuthSession | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [isDark]);

  const currentItem =
    VNEX_NAVIGATION.find((item) => item.id === activeSection) ?? VNEX_NAVIGATION[0];

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      <Sidebar
        activeSection={activeSection}
        activeRole={activeRole}
        mobileOpen={mobileOpen}
        onSelectSection={setActiveSection}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <TopHeader
          sectionTitle={currentItem.label}
          activeRole={activeRole}
          currency={currency}
          isDark={isDark}
          onOpenMobileMenu={() => setMobileOpen(true)}
          onChangeRole={setActiveRole}
          onChangeCurrency={setCurrency}
          onToggleTheme={() => setIsDark((prev) => !prev)}
        />

        <main className="flex-1 px-4 sm:px-8 py-8 max-w-6xl w-full mx-auto">
          {activeSection === 'overview' ? (
            <OperationsOverview
              activeRole={activeRole}
              currency={currency}
              onNavigate={setActiveSection}
            />
          ) : activeSection === 'customers' ? (
            <CustomersProjectsWorkspace
              currency={currency}
              session={authSession}
              onSessionEstablished={setAuthSession}
              onNavigateSection={setActiveSection}
            />
          ) : activeSection === 'surveys' ? (
            <SiteSurveysWorkspace
              currency={currency}
              session={authSession}
              onSessionEstablished={setAuthSession}
            />
          ) : activeSection === 'engineering' ? (
            <SolarEngineeringWorkbench
              currency={currency}
              session={authSession}
              onSessionEstablished={setAuthSession}
            />
          ) : activeSection === 'inventory' ? (
            <InventoryWorkspace
              currency={currency}
              session={authSession}
              onSessionEstablished={setAuthSession}
            />
          ) : activeSection === 'quotations' || activeSection === 'finance' ? (
            <QuotationsBillingWorkspace
              section={activeSection}
              currency={currency}
              session={authSession}
              onSessionEstablished={setAuthSession}
              onNavigateSection={setActiveSection}
            />
          ) : activeSection === 'installation' ? (
            <InstallationWorkspace
              currency={currency}
              session={authSession}
              onSessionEstablished={setAuthSession}
            />
          ) : activeSection === 'safety' ? (
            <SafetyInspectionWorkspace
              currency={currency}
              session={authSession}
              onSessionEstablished={setAuthSession}
            />
          ) : activeSection === 'commissioning' ? (
            <CommissioningWorkspace
              currency={currency}
              session={authSession}
              onSessionEstablished={setAuthSession}
            />
          ) : activeSection === 'maintenance' ? (
            <MaintenanceWarrantyWorkspace
              currency={currency}
              session={authSession}
              onSessionEstablished={setAuthSession}
            />
          ) : activeSection === 'sync' ? (
            <SyncEngineConsole
              sharedSession={authSession}
              onSessionEstablished={setAuthSession}
            />
          ) : activeSection === 'admin' ? (
            <TenantAuthConsole
              currency={currency}
              session={authSession}
              onSessionChange={setAuthSession}
            />
          ) : (
            <ModuleBlueprintView
              module={currentItem}
              activeRole={activeRole}
              currency={currency}
              onBackToOverview={() => setActiveSection('overview')}
            />
          )}
        </main>
      </div>
    </div>
  );
}
