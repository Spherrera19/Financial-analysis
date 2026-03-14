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
