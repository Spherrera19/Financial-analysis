import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard,
  TrendingUp,
  Wallet,
  CreditCard,
  Receipt,
  Settings,
  BarChart2,
  Landmark,
  ShieldCheck,
} from 'lucide-react';
import type { TabKey } from '../../types';

interface SidebarProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  asOfDate?: string;
}

const NAV_ITEMS: {
  id: TabKey;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; style?: React.CSSProperties }>;
  section: string;
}[] = [
  { id: 'overview',      label: 'Overview',      icon: LayoutDashboard, section: 'Daily Ops' },
  { id: 'cashflow',      label: 'Cash Flow',      icon: TrendingUp,      section: 'Daily Ops' },
  { id: 'spending',      label: 'Spending',       icon: Wallet,          section: 'Daily Ops' },
  { id: 'budget',        label: 'Budget',         icon: Landmark,        section: 'Daily Ops' },
  { id: 'transactions',  label: 'Transactions',   icon: Receipt,         section: 'Daily Ops' },
  { id: 'debt',          label: 'Debt',           icon: CreditCard,      section: 'Wealth Building' },
  { id: 'equity',        label: 'Equity',         icon: BarChart2,       section: 'Wealth Building' },
  { id: 'tax',           label: 'Tax & Retirement', icon: ShieldCheck,    section: 'Wealth Building' },
  { id: 'settings',      label: 'Settings',       icon: Settings,        section: 'System' },
];

const SPRING = { type: 'spring', stiffness: 300, damping: 30 } as const;

export function Sidebar({ activeTab, onTabChange, asOfDate }: SidebarProps) {
  return (
    <>
      {/* ── Desktop nav rail (md+) ─────────────────────────────────────────── */}
      {/*
          Width: 72px collapsed → 240px on hover (CSS transition).
          Floats over content via z-index + drop shadow; never pushes main content.
          Main content has a static margin-left: 72px (see App.tsx).
          Uses Tailwind `group` so child elements can react to rail hover.
      */}
      <aside
        id="tour-nav-rail"
        className="hidden md:flex group w-[72px] hover:w-60 hover:shadow-[4px_0_20px_rgba(0,0,0,0.12)] transition-[width,box-shadow] duration-200 ease-in-out"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          height: '100vh',
          flexDirection: 'column',
          zIndex: 100,
          overflow: 'hidden',
          background: 'var(--bg-card)',
          borderRight: '1px solid var(--border-subtle)',
          willChange: 'width',
        }}
      >
        {/* Header — icon always visible, text fades in on hover */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '1.5rem 0 1.5rem',
          // paddingLeft centers the 22px Wallet icon in the 56px inner width (72 - 2×8px nav padding)
          paddingLeft: 17,
          marginBottom: '0.5rem',
          color: 'var(--accent-blue)',
        }}>
          <Wallet size={22} strokeWidth={2.2} style={{ flexShrink: 0 }} />
          <div
            className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-75"
            style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}
          >
            <div style={{ fontWeight: 700, fontSize: '1.25rem', color: 'var(--text-primary)' }}>
              Finance
            </div>
            {asOfDate && (
              <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '0.2rem', letterSpacing: '0.03em' }}>
                as of {asOfDate}
              </div>
            )}
          </div>
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, padding: '0 8px' }}>
          {(['Daily Ops', 'Wealth Building', 'System'] as const).map(section => {
            const sectionItems = NAV_ITEMS.filter(item => item.section === section)
            return (
              <div key={section}>
                {/* Section label — invisible when collapsed, fades in on rail hover */}
                <div
                  className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-75"
                  style={{
                    padding: '1rem 1.25rem 0.25rem',
                    fontSize: '0.6875rem',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase' as const,
                    letterSpacing: '0.08em',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {section}
                </div>

                {/* Nav items in this section */}
                {sectionItems.map(({ id, label, icon: Icon }) => {
                  const isActive = activeTab === id;
                  return (
                    <button
                      key={id}
                      id={`tour-nav-${id}`}
                      onClick={() => onTabChange(id)}
                      style={{
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        width: '100%',
                        padding: '0.625rem 0.875rem',
                        // paddingLeft centers the 18px icon in the 56px inner width (72 - 2×8px nav padding)
                        paddingLeft: 19,
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
                        outline: 'none',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textAlign: 'left',
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
                      <Icon size={18} strokeWidth={isActive ? 2.2 : 1.8} style={{ flexShrink: 0 }} />
                      {/* Label fades in on rail hover via Tailwind group-hover */}
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-75">
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>
            )
          })}
        </nav>

        {/* Footer */}
        <div
          className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-75"
          style={{
            padding: '1rem 1.25rem',
            borderTop: '1px solid var(--border-subtle)',
            whiteSpace: 'nowrap',
          }}
        >
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Personal Dashboard
          </div>
        </div>
      </aside>

      {/* ── Mobile bottom tab bar (<md) — unchanged ───────────────────────── */}
      <nav
        className="flex md:hidden justify-around items-center"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: 64,
          background: 'var(--bg-card)',
          borderTop: '1px solid var(--border-subtle)',
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
                minHeight: 44,
              }}
            >
              <AnimatePresence>
                {isActive && (
                  <motion.span
                    key="activeNavMobile"
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
              </AnimatePresence>
              <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
