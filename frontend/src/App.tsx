import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import type { DashboardPayload, PeriodKey, DrawerFilter } from './types';
import type { Theme } from './lib/theme';
import { applyTheme, loadTheme } from './lib/theme';
import { useLedger } from './context/LedgerContext';
import { Sidebar, TopBar, GuidedTour } from './components/layout';
import { TransactionDrawer } from './components/modals';
import { useTour } from './hooks/useTour';
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
// Module-level — not re-created on every render
const INDEPENDENT_PATHS = ['/settings', '/equity', '/budget', '/tax'];

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

  // ── Router hooks ──
  const location  = useLocation();
  const navigate  = useNavigate();

  // ── Data state ──
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePeriod, setActivePeriod] = useState<PeriodKey>('last');

  // ── Guided tour ──
  const { activeTour, finishTour, startTour, stepIndex, setStepIndex } = useTour();

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

  // ── Route classification ──
  const isDataTab = !INDEPENDENT_PATHS.includes(location.pathname);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>

      {/* Nav rail — CSS hover-driven, floats over content on expand */}
      <Sidebar asOfDate={data?.meta.as_of_date} />

      {/* Main content — static 72px left margin on desktop matches collapsed rail width */}
      <main
        className="main-content md:ml-[72px] flex-1 flex flex-col"
        style={{ minHeight: '100vh' }}
      >
        {/* Loading / error screens — only for data-dependent tabs */}
        {isDataTab && loading && <LoadingScreen />}
        {isDataTab && error   && <ErrorScreen message={error} />}

        {/* TopBar: sticky header with period filter + AI export — data-dependent tabs only */}
        {isDataTab && data && (
          <TopBar
            activePeriod={activePeriod}
            onPeriodChange={setActivePeriod}
            asOfDate={data.meta.as_of_date}
            onCopyAISummary={handleCopyAISummary}
            onDownloadAISummary={handleDownloadAISummary}
            onRestartTour={() => startTour('basic')}
          />
        )}

        <div style={{ padding: '1.5rem' }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={SPRING}
            >
              <Routes>
                {/* ── Data-independent routes — render without dashboard payload ── */}
                <Route path="/settings" element={
                  <SettingsTab
                    activeTheme={activeTheme}
                    onThemeChange={handleThemeChange}
                    onRefresh={refreshData}
                    onStartBasicTour={() => { navigate('/'); startTour('basic'); }}
                    onStartAdvancedTour={() => { navigate('/'); startTour('advanced'); }}
                  />
                } />
                <Route path="/equity"   element={<EquityTab />} />
                <Route path="/budget"   element={<BudgetTab onDrillDown={openDrawer} />} />
                <Route path="/tax"      element={<TaxRetirementTab />} />

                {/* ── Data-dependent routes — unconditional <Route> elements; each element
                    renders null while data is loading (loading screen is shown above routes).
                    React Router v7 does NOT support <React.Fragment> as a direct child of
                    <Routes>; use unconditional Route + conditional element instead. ── */}
                <Route index element={
                  data ? <OverviewTab data={data} activePeriod={activePeriod} onDrillDown={openDrawer} /> : null
                } />
                <Route path="/cashflow" element={
                  data ? <CashFlowTab data={data} activePeriod={activePeriod} /> : null
                } />
                <Route path="/spending" element={
                  data ? <SpendingTab data={data} activePeriod={activePeriod} onDrillDown={openDrawer} /> : null
                } />
                <Route path="/debt" element={
                  data ? <DebtTab data={data} /> : null
                } />
                <Route path="/transactions" element={
                  data ? <TransactionsTab data={data} activePeriod={activePeriod} /> : null
                } />
              </Routes>
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Drill-down drawer — rendered at root so any chart on any tab can trigger it */}
      <AnimatePresence>
        {drawerFilter && (
          <TransactionDrawer filter={drawerFilter} onClose={closeDrawer} />
        )}
      </AnimatePresence>

      {/* Guided tour — setActiveTab is a temporary no-op; replaced in Task 2 */}
      <GuidedTour
        activeTour={activeTour}
        onFinish={finishTour}
        setActiveTab={() => {}}  // TODO: removed in Task 2
        stepIndex={stepIndex}
        setStepIndex={setStepIndex}
      />
    </div>
  );
}
