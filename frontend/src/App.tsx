import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { DashboardPayload, PeriodKey, TabKey } from './types';
import type { Theme } from './lib/theme';
import { applyTheme, loadTheme } from './lib/theme';
import { Sidebar, TopBar } from './components/layout';
import {
  OverviewTab,
  CashFlowTab,
  SpendingTab,
  DebtTab,
  TransactionsTab,
  SettingsTab,
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
  // ── Data state ──
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePeriod, setActivePeriod] = useState<PeriodKey>('last');
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  // ── Theme state ──
  const [activeTheme, setActiveTheme] = useState<Theme>(loadTheme);

  // Apply theme whenever activeTheme changes (including mount)
  useEffect(() => { applyTheme(activeTheme); }, [activeTheme]);

  const handleThemeChange = (t: Theme) => setActiveTheme(t);

  // ── Data fetching ──
  useEffect(() => {
    fetch('./data.json')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: DashboardPayload) => { setData(d); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, []);

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
      case 'overview':     return <OverviewTab     data={data} activePeriod={activePeriod} />;
      case 'cashflow':     return <CashFlowTab     data={data} activePeriod={activePeriod} />;
      case 'spending':     return <SpendingTab     data={data} activePeriod={activePeriod} />;
      case 'debt':         return <DebtTab         data={data} />;
      case 'transactions': return <TransactionsTab data={data} activePeriod={activePeriod} />;
      case 'settings':     return null; // handled below the data guard
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
        {/* Settings tab — outside data guard, always available */}
        {activeTab === 'settings' ? (
          <div style={{ padding: '1.5rem' }}>
            <SettingsTab activeTheme={activeTheme} onThemeChange={handleThemeChange} />
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
    </div>
  );
}
