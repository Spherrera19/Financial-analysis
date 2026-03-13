import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  TrendingUp,
  Wallet,
  CreditCard,
  Receipt,
} from 'lucide-react';
import type { TabKey } from '../../types';

interface SidebarProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  asOfDate?: string;
}

const NAV_ITEMS = [
  { id: 'overview' as TabKey,     label: 'Overview',      icon: LayoutDashboard },
  { id: 'cashflow' as TabKey,     label: 'Cash Flow',     icon: TrendingUp },
  { id: 'spending' as TabKey,     label: 'Spending',      icon: Wallet },
  { id: 'debt' as TabKey,         label: 'Debt',          icon: CreditCard },
  { id: 'transactions' as TabKey, label: 'Transactions',  icon: Receipt },
];

export function Sidebar({ activeTab, onTabChange, asOfDate }: SidebarProps) {
  return (
    <>
      {/* ── Desktop sidebar (md+) ── */}
      <aside
        style={{
          background: 'var(--bg-base)',
          borderRight: '1px solid var(--border-subtle)',
          color: 'var(--text-primary)',
          width: 240,
          position: 'fixed',
          top: 0,
          left: 0,
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 40,
          padding: '1.5rem 0',
        }}
        className="hidden md:flex"
      >
        {/* Header / branding */}
        <div style={{ padding: '0 1.25rem', marginBottom: '2rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: 'var(--accent-blue)',
              fontWeight: 700,
              fontSize: '1.25rem',
            }}
          >
            <Wallet size={22} strokeWidth={2.2} />
            <span style={{ color: 'var(--text-primary)' }}>Finance</span>
          </div>
          {asOfDate && (
            <div
              style={{
                fontSize: '0.6875rem',
                color: 'var(--text-muted)',
                marginTop: '0.3rem',
                letterSpacing: '0.03em',
              }}
            >
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
                onClick={() => onTabChange(id)}
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
                  if (!isActive) {
                    (e.currentTarget as HTMLButtonElement).style.background =
                      'color-mix(in srgb, var(--text-muted) 10%, transparent)';
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  }
                }}
              >
                {/* Active left accent bar via layoutId */}
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
                      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
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
        <div
          style={{
            padding: '0 1.25rem',
            borderTop: '1px solid var(--border-subtle)',
            paddingTop: '1rem',
          }}
        >
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Personal Dashboard
          </div>
        </div>
      </aside>

      {/* ── Mobile bottom tab bar (<md) ── */}
      <nav
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
          paddingBottom: 'env(safe-area-inset-bottom, 0)',
        }}
        className="flex md:hidden"
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
                minWidth: 56,
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
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
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
