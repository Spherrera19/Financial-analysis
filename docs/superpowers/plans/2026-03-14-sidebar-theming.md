# Collapsible Sidebar + Multi-Theme System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsible overlay sidebar drawer on desktop, keep mobile bottom tabs, add a Settings tab with a 5-theme switcher persisted via localStorage + `data-theme` on `<html>`.

**Architecture:** The sidebar is a GPU-composited `position: fixed` overlay — it slides over the main content (`x: -240 → 0`) without touching `marginLeft`, eliminating Chart.js stutter. A hamburger button uses `translateX` (not `left`) to animate alongside the sidebar. Themes are driven entirely by CSS `[data-theme]` attribute selectors, keeping all color logic in CSS.

**Tech Stack:** React 19, TypeScript, Framer Motion, Tailwind v4, lucide-react, CSS custom properties

**Spec:** `docs/superpowers/specs/2026-03-12-sidebar-theming-design.md`

---

## Chunk 1: Foundation — types, theme lib, CSS

### Task 1: Add `settings` to `TabKey` + create `theme.ts`

**Files:**
- Modify: `frontend/src/types.ts` (line 84)
- Create: `frontend/src/lib/theme.ts`

- [ ] **Step 1: Update `TabKey` in `src/types.ts`**

  Change line 84 from:
  ```typescript
  export type TabKey = 'overview' | 'cashflow' | 'spending' | 'debt' | 'transactions';
  ```
  To:
  ```typescript
  export type TabKey = 'overview' | 'cashflow' | 'spending' | 'debt' | 'transactions' | 'settings';
  ```

- [ ] **Step 2: Create `frontend/src/lib/theme.ts`**

  ```typescript
  export type Theme = 'system' | 'light' | 'dark' | 'pastel' | 'high-contrast';

  export function applyTheme(theme: Theme): void {
    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
    localStorage.setItem('theme', theme);
  }

  export function loadTheme(): Theme {
    return (localStorage.getItem('theme') as Theme) ?? 'system';
  }
  ```

- [ ] **Step 3: TypeScript check**

  ```bash
  cd frontend && npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/types.ts frontend/src/lib/theme.ts
  git commit -m "feat: add settings TabKey and theme.ts utility"
  ```

---

### Task 2: Add theme CSS variables to `index.css`

**Files:**
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Remove `.md-sidebar-offset` rule**

  Find and delete this block from `index.css`:
  ```css
  @media (min-width: 768px) {
    .md-sidebar-offset { margin-left: 240px; }
  }
  ```
  The sidebar is now an overlay — no margin offset needed.

- [ ] **Step 2: Append four `[data-theme]` blocks at the end of `index.css`**

  These must appear **after** the existing `@media (prefers-color-scheme: dark)` block so source-order cascade wins.

  ```css
  /* ============================================================
     Theme overrides — placed after @media dark so source order wins
     ============================================================ */

  [data-theme="light"] {
    --bg-base:         #f0f4f8;
    --bg-surface:      rgba(255,255,255,0.8);
    --bg-surface-2:    rgba(248,250,252,0.9);
    --bg-glass:        rgba(255,255,255,0.65);
    --bg-glass-border: rgba(255,255,255,0.9);
    --text-primary:    #0f172a;
    --text-secondary:  #475569;
    --text-muted:      #94a3b8;
    --accent-blue:     #2563eb;
    --accent-green:    #16a34a;
    --accent-red:      #dc2626;
    --accent-purple:   #9333ea;
    --accent-yellow:   #d97706;
    --border-subtle:   rgba(148,163,184,0.2);
    --border-focus:    #2563eb;
    --shadow-glass:    0 8px 32px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
    --shadow-hover:    0 16px 48px rgba(0,0,0,0.12), 0 2px 4px rgba(0,0,0,0.06);
    --blur-glass:      12px;
  }

  [data-theme="dark"] {
    --bg-base:         #0f172a;
    --bg-surface:      rgba(30,41,59,0.9);
    --bg-surface-2:    rgba(15,23,42,0.8);
    --bg-glass:        rgba(30,41,59,0.6);
    --bg-glass-border: rgba(71,85,105,0.4);
    --text-primary:    #f1f5f9;
    --text-secondary:  #94a3b8;
    --text-muted:      #64748b;
    --accent-blue:     #60a5fa;
    --accent-green:    #4ade80;
    --accent-red:      #f87171;
    --accent-purple:   #c084fc;
    --accent-yellow:   #fbbf24;
    --border-subtle:   rgba(71,85,105,0.3);
    --border-focus:    #60a5fa;
    --shadow-glass:    0 8px 32px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3);
    --shadow-hover:    0 16px 48px rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.4);
    --blur-glass:      16px;
  }

  [data-theme="pastel"] {
    --bg-base:         #faf7f5;
    --bg-surface:      rgba(255,252,250,0.85);
    --bg-surface-2:    rgba(250,247,244,0.9);
    --bg-glass:        rgba(255,248,244,0.7);
    --bg-glass-border: rgba(220,200,190,0.5);
    --text-primary:    #2d1f1a;
    --text-secondary:  #7c6b65;
    --text-muted:      #b8a9a4;
    --accent-blue:     #7c9dd4;
    --accent-green:    #7ab89a;
    --accent-red:      #d4826b;
    --accent-purple:   #a98cc4;
    --accent-yellow:   #c9a96e;
    --border-subtle:   rgba(180,160,150,0.2);
    --border-focus:    #7c9dd4;
    --shadow-glass:    0 8px 32px rgba(120,80,60,0.08), 0 1px 2px rgba(120,80,60,0.04);
    --shadow-hover:    0 16px 48px rgba(120,80,60,0.12), 0 2px 4px rgba(120,80,60,0.06);
    --blur-glass:      12px;
  }

  [data-theme="high-contrast"] {
    --bg-base:         #000000;
    --bg-surface:      #0a0a0a;
    --bg-surface-2:    #111111;
    --bg-glass:        #0a0a0a;
    --bg-glass-border: #ffffff;
    --text-primary:    #ffffff;
    --text-secondary:  #e0e0e0;
    --text-muted:      #bbbbbb;
    --accent-blue:     #4fc3f7;
    --accent-green:    #69f0ae;
    --accent-red:      #ff5252;
    --accent-purple:   #ea80fc;
    --accent-yellow:   #ffd740;
    --border-subtle:   rgba(255,255,255,0.4);
    --border-focus:    #ffffff;
    --shadow-glass:    0 0 0 1px #ffffff;
    --shadow-hover:    0 0 0 2px #ffffff;
    --blur-glass:      0px;
  }
  ```

- [ ] **Step 3: TypeScript check** (CSS change only — just verify no build errors)

  ```bash
  cd frontend && npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/index.css
  git commit -m "feat: add 5-theme CSS variable system, remove md-sidebar-offset"
  ```

---

## Chunk 2: Sidebar overlay drawer + Settings nav item

### Task 3: Rewrite `Sidebar.tsx` as overlay drawer with Settings item

**Files:**
- Modify: `frontend/src/components/layout/Sidebar.tsx`

**Key design decisions (performance-critical):**
- Sidebar is `position: fixed`, animates `x: -240 → 0` (GPU translateX, not left/width)
- Main content is **never touched** — sidebar overlays it
- Semi-transparent backdrop on desktop when sidebar open (click to close)
- Mobile bottom bar: add `env(safe-area-inset-bottom)` padding (already partially present — verify it's correct)
- `isOpen` prop drives the animation

- [ ] **Step 1: Replace `Sidebar.tsx` with the updated implementation**

  Full file content:

  ```typescript
  import { motion, AnimatePresence } from 'framer-motion';
  import {
    LayoutDashboard,
    TrendingUp,
    Wallet,
    CreditCard,
    Receipt,
    Settings,
  } from 'lucide-react';
  import type { TabKey } from '../../types';

  interface SidebarProps {
    activeTab: TabKey;
    onTabChange: (tab: TabKey) => void;
    asOfDate?: string;
    isOpen: boolean;
    onClose: () => void;
  }

  const NAV_ITEMS: { id: TabKey; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }> }[] = [
    { id: 'overview',      label: 'Overview',      icon: LayoutDashboard },
    { id: 'cashflow',      label: 'Cash Flow',      icon: TrendingUp },
    { id: 'spending',      label: 'Spending',       icon: Wallet },
    { id: 'debt',          label: 'Debt',           icon: CreditCard },
    { id: 'transactions',  label: 'Transactions',   icon: Receipt },
    { id: 'settings',      label: 'Settings',       icon: Settings },
  ];

  const SPRING = { type: 'spring', stiffness: 300, damping: 30 } as const;

  export function Sidebar({ activeTab, onTabChange, asOfDate, isOpen, onClose }: SidebarProps) {
    const handleNavClick = (id: TabKey) => {
      onTabChange(id);
      onClose();
    };

    return (
      <>
        {/* ── Desktop overlay backdrop ── */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              key="sidebar-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={onClose}
              className="hidden md:block"
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.3)',
                zIndex: 39,
              }}
            />
          )}
        </AnimatePresence>

        {/* ── Desktop sidebar drawer (md+) ── */}
        <motion.aside
          animate={{ x: isOpen ? 0 : -240 }}
          transition={SPRING}
          className="hidden md:flex"
          style={{
            background: 'var(--bg-base)',
            borderRight: '1px solid var(--border-subtle)',
            width: 240,
            position: 'fixed',
            top: 0,
            left: 0,
            height: '100vh',
            flexDirection: 'column',
            zIndex: 40,
            padding: '1.5rem 0',
            willChange: 'transform',
          }}
        >
          {/* Header */}
          <div style={{ padding: '0 1.25rem', marginBottom: '2rem' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: 'var(--accent-blue)',
              fontWeight: 700,
              fontSize: '1.25rem',
            }}>
              <Wallet size={22} strokeWidth={2.2} />
              <span style={{ color: 'var(--text-primary)' }}>Finance</span>
            </div>
            {asOfDate && (
              <div style={{
                fontSize: '0.6875rem',
                color: 'var(--text-muted)',
                marginTop: '0.3rem',
                letterSpacing: '0.03em',
              }}>
                as of {asOfDate}
              </div>
            )}
          </div>

          {/* Nav items */}
          <nav style={{ flex: 1, padding: '0 0.75rem' }}>
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  onClick={() => handleNavClick(id)}
                  style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    width: '100%',
                    padding: '0.625rem 0.875rem',
                    borderRadius: '0.625rem',
                    border: 'none',
                    cursor: 'pointer',
                    marginBottom: '0.25rem',
                    fontSize: '0.9375rem',
                    fontWeight: isActive ? 600 : 400,
                    background: isActive
                      ? 'color-mix(in srgb, var(--accent-blue) 15%, transparent)'
                      : 'transparent',
                    color: isActive ? 'var(--accent-blue)' : 'var(--text-secondary)',
                    transition: 'background 0.15s ease, color 0.15s ease',
                    textAlign: 'left',
                    outline: 'none',
                  }}
                  onMouseEnter={e => {
                    if (!isActive) (e.currentTarget as HTMLButtonElement).style.background =
                      'color-mix(in srgb, var(--text-muted) 10%, transparent)';
                  }}
                  onMouseLeave={e => {
                    if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  }}
                >
                  <AnimatePresence>
                    {isActive && (
                      <motion.span
                        layoutId="activeNav"
                        style={{
                          position: 'absolute',
                          left: 0,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          width: 3,
                          height: '60%',
                          borderRadius: '0 3px 3px 0',
                          background: 'var(--accent-blue)',
                        }}
                        transition={SPRING}
                      />
                    )}
                  </AnimatePresence>
                  <Icon size={18} strokeWidth={isActive ? 2.2 : 1.8} />
                  <span>{label}</span>
                </button>
              );
            })}
          </nav>

          {/* Footer */}
          <div style={{
            padding: '0 1.25rem',
            borderTop: '1px solid var(--border-subtle)',
            paddingTop: '1rem',
          }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Personal Dashboard
            </div>
          </div>
        </motion.aside>

        {/* ── Mobile bottom tab bar (<md) ── */}
        <nav
          className="flex md:hidden"
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'space-around',
            alignItems: 'center',
            height: 64,
            background: 'var(--bg-glass)',
            borderTop: '1px solid var(--bg-glass-border)',
            backdropFilter: 'blur(var(--blur-glass))',
            WebkitBackdropFilter: 'blur(var(--blur-glass))',
            zIndex: 40,
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
        >
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => onTabChange(id)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.2rem',
                  padding: '0.375rem 0.5rem',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: isActive ? 'var(--accent-blue)' : 'var(--text-muted)',
                  transition: 'color 0.15s ease',
                  fontSize: '0.625rem',
                  fontWeight: isActive ? 600 : 400,
                  outline: 'none',
                  position: 'relative',
                  minWidth: 44,
                }}
              >
                {isActive && (
                  <motion.span
                    layoutId="activeNavMobile"
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: 28,
                      height: 2,
                      borderRadius: '0 0 3px 3px',
                      background: 'var(--accent-blue)',
                    }}
                    transition={SPRING}
                  />
                )}
                <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>
      </>
    );
  }
  ```

- [ ] **Step 2: TypeScript check**

  ```bash
  cd frontend && npx tsc --noEmit
  ```
  Expected: no errors (the `isOpen` and `onClose` props will cause errors in `App.tsx` until Task 4 — that's OK, fix forward).

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/components/layout/Sidebar.tsx
  git commit -m "feat: sidebar as overlay drawer with isOpen/onClose props, Settings nav item, safe-area bottom bar"
  ```

---

## Chunk 3: App.tsx — sidebar state, hamburger, theme init, SettingsTab routing

### Task 4: Rewrite `App.tsx`

**Files:**
- Modify: `frontend/src/App.tsx`

**Key changes:**
- Add `sidebarOpen` state (persisted in localStorage)
- Add hamburger `motion.button` using `x` (translateX) — **not** `left` — for GPU acceleration
- Remove `md-sidebar-offset` class from `<main>`
- Theme state + `useEffect` that calls `applyTheme(activeTheme)` on change
- `SettingsTab` rendered outside the `{data && ...}` guard
- Pass `isOpen` and `onClose` to `Sidebar`

- [ ] **Step 1: Replace `App.tsx` with the updated implementation**

  ```typescript
  import { useState, useEffect } from 'react';
  import { AnimatePresence, motion } from 'framer-motion';
  import { Menu } from 'lucide-react';
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

    // ── Sidebar state ──
    const [sidebarOpen, setSidebarOpen] = useState<boolean>(() =>
      localStorage.getItem('sidebar-open') !== 'false'
    );

    const toggleSidebar = () => {
      setSidebarOpen(prev => {
        const next = !prev;
        localStorage.setItem('sidebar-open', String(next));
        return next;
      });
    };

    const closeSidebar = () => {
      setSidebarOpen(false);
      localStorage.setItem('sidebar-open', 'false');
    };

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

        {/* Sidebar — overlay drawer, does not push content */}
        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          asOfDate={data?.meta.as_of_date}
          isOpen={sidebarOpen}
          onClose={closeSidebar}
        />

        {/* Hamburger button — desktop only, GPU-accelerated translateX */}
        <motion.button
          animate={{ x: sidebarOpen ? 240 : 0 }}
          transition={SPRING}
          onClick={toggleSidebar}
          className="hidden md:flex"
          style={{
            position: 'fixed',
            top: '1rem',
            left: '1rem',
            zIndex: 50,
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            borderRadius: '0.5rem',
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-surface)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            outline: 'none',
          }}
          aria-label={sidebarOpen ? 'Close navigation' : 'Open navigation'}
        >
          <Menu size={18} />
        </motion.button>

        {/* Main content — never shifts, sidebar overlays */}
        <main
          className="main-content"
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
  ```

- [ ] **Step 2: TypeScript check**

  ```bash
  cd frontend && npx tsc --noEmit
  ```
  Expected: one error — `SettingsTab` is not yet created. All other errors should be gone.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/App.tsx
  git commit -m "feat: sidebar overlay state, GPU hamburger, theme init, SettingsTab routing"
  ```

---

## Chunk 4: SettingsTab component + wiring + build

### Task 5: Create `SettingsTab.tsx`

**Files:**
- Create: `frontend/src/pages/SettingsTab.tsx`
- Modify: `frontend/src/pages/index.ts`

- [ ] **Step 1: Create `frontend/src/pages/SettingsTab.tsx`**

  ```typescript
  import type { Theme } from '../lib/theme';

  interface SettingsTabProps {
    activeTheme: Theme;
    onThemeChange: (t: Theme) => void;
  }

  // Hardcoded swatch colors — independent of CSS vars so they always render correctly
  const THEMES: {
    id: Theme;
    label: string;
    description: string;
    swatches: [string, string, string, string]; // [bg, blue, green, red]
  }[] = [
    {
      id: 'system',
      label: 'System',
      description: 'Follows your OS preference',
      swatches: ['#0f172a', '#60a5fa', '#4ade80', '#f87171'],
    },
    {
      id: 'light',
      label: 'Light',
      description: 'Clean light interface',
      swatches: ['#f0f4f8', '#2563eb', '#16a34a', '#dc2626'],
    },
    {
      id: 'dark',
      label: 'Dark',
      description: 'Easy on the eyes',
      swatches: ['#0f172a', '#60a5fa', '#4ade80', '#f87171'],
    },
    {
      id: 'pastel',
      label: 'Pastel',
      description: 'Soft, warm tones',
      swatches: ['#faf7f5', '#7c9dd4', '#7ab89a', '#d4826b'],
    },
    {
      id: 'high-contrast',
      label: 'High Contrast',
      description: 'Maximum readability',
      swatches: ['#000000', '#4fc3f7', '#69f0ae', '#ff5252'],
    },
  ];

  export function SettingsTab({ activeTheme, onThemeChange }: SettingsTabProps) {
    return (
      <div style={{ maxWidth: 640 }}>
        <h1 style={{
          fontSize: '1.5rem',
          fontWeight: 700,
          color: 'var(--text-primary)',
          marginBottom: '0.5rem',
        }}>
          Settings
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '2rem' }}>
          Customize your dashboard appearance.
        </p>

        <h2 style={{
          fontSize: '0.75rem',
          fontWeight: 600,
          color: 'var(--text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: '0.75rem',
        }}>
          Theme
        </h2>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: '0.75rem',
        }}>
          {THEMES.map(({ id, label, description, swatches }) => {
            const isActive = activeTheme === id;
            return (
              <button
                key={id}
                onClick={() => onThemeChange(id)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.625rem',
                  padding: '1rem',
                  borderRadius: '0.75rem',
                  border: isActive
                    ? '2px solid var(--accent-blue)'
                    : '1px solid var(--border-subtle)',
                  background: isActive
                    ? 'color-mix(in srgb, var(--accent-blue) 8%, var(--bg-surface))'
                    : 'var(--bg-surface)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  outline: 'none',
                  transition: 'border-color 0.15s ease, background 0.15s ease',
                  position: 'relative',
                }}
              >
                {/* Active checkmark */}
                {isActive && (
                  <div style={{
                    position: 'absolute',
                    top: '0.5rem',
                    right: '0.5rem',
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: 'var(--accent-blue)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.625rem',
                    color: '#fff',
                  }}>
                    ✓
                  </div>
                )}

                {/* Color swatches */}
                <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                  {swatches.map((color, i) => (
                    <div
                      key={i}
                      style={{
                        width: i === 0 ? 24 : 14,
                        height: i === 0 ? 24 : 14,
                        borderRadius: '50%',
                        background: color,
                        border: color === '#ffffff' || color === '#f0f4f8' || color === '#faf7f5'
                          ? '1px solid rgba(0,0,0,0.1)'
                          : 'none',
                        flexShrink: 0,
                      }}
                    />
                  ))}
                </div>

                {/* Label */}
                <div>
                  <div style={{
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    marginBottom: '0.2rem',
                  }}>
                    {label}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 2: Update `frontend/src/pages/index.ts`**

  Add the export line:
  ```typescript
  export { SettingsTab } from './SettingsTab';
  ```
  Full file after edit:
  ```typescript
  export { OverviewTab }      from './OverviewTab';
  export { CashFlowTab }      from './CashFlowTab';
  export { SpendingTab }      from './SpendingTab';
  export { DebtTab }          from './DebtTab';
  export { TransactionsTab }  from './TransactionsTab';
  export { SettingsTab }      from './SettingsTab';
  ```

- [ ] **Step 3: TypeScript check — must be clean now**

  ```bash
  cd frontend && npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/pages/SettingsTab.tsx frontend/src/pages/index.ts
  git commit -m "feat: SettingsTab with 5-theme switcher and swatch preview"
  ```

---

### Task 6: Build verification + CLAUDE.md update

**Files:**
- Run: `npm run build`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Full build**

  ```bash
  cd frontend && npm run build
  ```
  Expected: build succeeds, `dist/index.html` produced, no TypeScript or bundle errors.
  The only expected warning: chunk size > 500kB (this is acceptable for Chart.js + framer-motion).

- [ ] **Step 2: Append to `CLAUDE.md`**

  Append these two sections to `CLAUDE.md` (do not replace existing content):

  ```markdown
  ## Theming Architecture

  Themes are controlled via a `data-theme` attribute on `<html>` (set by `src/lib/theme.ts`).

  - **System** (default): no `data-theme` attribute; `@media (prefers-color-scheme: dark)` applies automatically
  - **Light / Dark / Pastel / High Contrast**: `data-theme="light|dark|pastel|high-contrast"` overrides the system preference
  - CSS variable blocks for each theme are defined in `src/index.css`, placed **after** the `@media` dark block so source-order cascade wins
  - Preference is persisted to `localStorage` under the key `theme`
  - The `Theme` type and `applyTheme` / `loadTheme` helpers live in `src/lib/theme.ts`
  - `App.tsx` reads the stored preference on mount via `useState<Theme>(loadTheme)` and applies it via `useEffect([activeTheme])`

  **Do not** use `.dark` class or `ThemeContext` — the `data-theme` attribute on `<html>` is the sole mechanism.

  ## Responsive Navigation Rules

  | Screen | Navigation |
  |---|---|
  | Desktop (`md+`, ≥768px) | Overlay sidebar drawer (240px), toggled via hamburger |
  | Mobile (`<md`, <768px) | Bottom tab bar only; sidebar never shown |

  - `sidebarOpen` state lives in `App.tsx`, persisted to `localStorage` under key `sidebar-open`
  - Sidebar uses `motion.aside` with `animate={{ x: isOpen ? 0 : -240 }}` — GPU-composited transform, never touches `marginLeft`
  - Main content has **no left margin** — sidebar overlays it
  - Hamburger uses `motion.button` with `animate={{ x: sidebarOpen ? 240 : 0 }}` (translateX, not `left`)
  - Hamburger is `hidden md:flex` (desktop only); sidebar is `hidden md:flex` (desktop only)
  - Bottom tab bar is `flex md:hidden` (mobile only) with `paddingBottom: env(safe-area-inset-bottom)`
  - **Settings tab** renders outside the `{data && ...}` guard — it is data-independent
  - Clicking any nav item or the backdrop closes the sidebar (`onClose`)
  ```

- [ ] **Step 3: Commit everything**

  ```bash
  git add CLAUDE.md
  git commit -m "docs: document data-theme architecture and responsive nav rules in CLAUDE.md"
  ```

---

## Verification Checklist

After all tasks complete:

- [ ] Desktop: hamburger at top-left, sidebar slides in over content, charts don't stutter
- [ ] Desktop: hamburger translateX moves 240px right when sidebar opens
- [ ] Desktop: clicking backdrop or nav item closes sidebar
- [ ] Desktop: sidebar state persists across page reloads
- [ ] Mobile: hamburger hidden, bottom tabs visible, `safe-area-inset-bottom` respected
- [ ] Settings tab: visible in both desktop sidebar and mobile bottom bar
- [ ] Settings tab: loads before `data.json` (not blocked by loading state)
- [ ] Theme switcher: clicking each card updates colors immediately
- [ ] Theme preference: survives page reload
- [ ] System theme: removing `data-theme` respects OS dark/light
- [ ] High Contrast: no blur (`--blur-glass: 0px`)
- [ ] `npx tsc --noEmit`: zero errors
- [ ] `npm run build`: succeeds
