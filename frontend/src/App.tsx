import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { DashboardPayload, PeriodKey, TabKey, DrawerFilter } from './types';
import type { Theme } from './lib/theme';
import { applyTheme, loadTheme } from './lib/theme';
import { useLedger } from './context/LedgerContext';
import { Sidebar, TopBar } from './components/layout';
import { TransactionDrawer } from './components/modals';
import {
  OverviewTab,
  CashFlowTab,
  SpendingTab,
  DebtTab,
  TransactionsTab,
  SettingsTab,
  EquityTab,
  BudgetTab,
  TaxRetirementTab,
} from './pages';

const SPRING = { type: 'spring', stiffness: 300, damping: 30 } as const;

// ── Loading screen ──────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '60vh', gap: '1rem',
      color: 'var(--text-muted)',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        border: '3px solid var(--border-subtle)',
        borderTopColor: 'var(--accent-blue)',
        animation: 'spin 0.75s linear infinite',
      }} />
      <span style={{ fontSize: '0.9375rem' }}>Loading financial data…</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Error screen ─────────────────────────────────────────────────────────────
function ErrorScreen({ message }: { message: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '60vh', gap: '0.75rem',
      color: 'var(--text-muted)', padding: '2rem', textAlign: 'center',
    }}>
      <span style={{ fontSize: '2rem' }}>⚠️</span>
      <p style={{ fontSize: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>
        Failed to load data
      </p>
      <p style={{ fontSize: '0.875rem', color: 'var(--accent-red)', fontFamily: 'monospace' }}>
        {message}
      </p>
    </div>
  );
}

// ── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  // ── Ledger (workspace) context ──
  const { selectedLedgerId } = useLedger();

  // ── Data state ──
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePeriod, setActivePeriod] = useState<PeriodKey>('last');
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  // ── Drill-down drawer — declared unconditionally so BudgetTab (pre-guard) gets it safely ──
  const [drawerFilter, setDrawerFilter] = useState<DrawerFilter | null>(null)
  const openDrawer  = useCallback(
    (f: Omit<DrawerFilter, 'period'>) => setDrawerFilter({ ...f, period: activePeriod }),
    [activePeriod],
  )
  const closeDrawer = useCallback(() => setDrawerFilter(null), [])

  // ── Theme state ──
  const [activeTheme, setActiveTheme] = useState<Theme>(loadTheme);

  // Apply theme whenever activeTheme changes (including mount)
  useEffect(() => { applyTheme(activeTheme); }, [activeTheme]);

  const handleThemeChange = (t: Theme) => setActiveTheme(t);

  // ── Data fetching ──
  const refreshData = useCallback(() => {
    setLoading(true);
    setError(null);
    const base = `${import.meta.env.VITE_API_URL ?? 'http://localhost:8000'}/api/dashboard`;
    const url = selectedLedgerId != null ? `${base}?ledger_id=${selectedLedgerId}` : base;
    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: DashboardPayload) => { setData(d); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, [selectedLedgerId]);

  useEffect(() => { refreshData(); }, [refreshData]);

  // ── AI summary helpers ──
  const getSummaryText = () => data?.summaries[activePeriod] ?? '';

  const handleCopyAISummary = () => {
    navigator.clipboard.writeText(getSummaryText()).catch(() => {});
  };

  const handleDownloadAISummary = () => {
    const blob = new Blob([getSummaryText()], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finance-summary-${activePeriod}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Tab renderer ──
  const renderTab = () => {
    if (!data) return null;
    switch (activeTab) {
      case 'overview':     return <OverviewTab     data={data} activePeriod={activePeriod} onDrillDown={openDrawer} />;
      case 'cashflow':     return <CashFlowTab     data={data} activePeriod={activePeriod} />;
      case 'spending':     return <SpendingTab     data={data} activePeriod={activePeriod} onDrillDown={openDrawer} />;
      case 'debt':         return <DebtTab         data={data} />;
      case 'transactions': return <TransactionsTab data={data} activePeriod={activePeriod} />;
      case 'equity':       return null; // handled in pre-guard chain
      case 'budget':       return null; // handled in pre-guard chain
      case 'tax':          return null; // handled in pre-guard chain
      case 'settings':     return null; // handled in pre-guard chain
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>

      {/* Nav rail — CSS hover-driven, floats over content on expand */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        asOfDate={data?.meta.as_of_date}
      />

      {/* Main content — static 72px left margin on desktop matches collapsed rail width */}
      <main
        className="main-content md:ml-[72px] flex-1 flex flex-col"
        style={{ minHeight: '100vh' }}
      >
        {/* Data-independent tabs — outside data guard, always available */}
        {activeTab === 'settings' ? (
          <div style={{ padding: '1.5rem' }}>
            <SettingsTab
              activeTheme={activeTheme}
              onThemeChange={handleThemeChange}
              onRefresh={refreshData}
            />
          </div>
        ) : activeTab === 'equity' ? (
          <div style={{ padding: '1.5rem' }}>
            <EquityTab />
          </div>
        ) : activeTab === 'budget' ? (
          <div style={{ padding: '1.5rem' }}>
            <BudgetTab onDrillDown={openDrawer} />
          </div>
        ) : activeTab === 'tax' ? (
          <div style={{ padding: '1.5rem' }}>
            <TaxRetirementTab />
          </div>
        ) : (
          <>
            {loading && <LoadingScreen />}
            {error && <ErrorScreen message={error} />}
            {data && (
              <>
                <TopBar
                  activePeriod={activePeriod}
                  onPeriodChange={setActivePeriod}
                  asOfDate={data.meta.as_of_date}
                  onCopyAISummary={handleCopyAISummary}
                  onDownloadAISummary={handleDownloadAISummary}
                />
                <div style={{ padding: '1.5rem' }}>
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={activeTab}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={SPRING}
                    >
                      {renderTab()}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </>
            )}
          </>
        )}
      </main>

      {/* Drill-down drawer — rendered at root so any chart on any tab can trigger it */}
      <AnimatePresence>
        {drawerFilter && (
          <TransactionDrawer filter={drawerFilter} onClose={closeDrawer} />
        )}
      </AnimatePresence>
    </div>
  );
}
