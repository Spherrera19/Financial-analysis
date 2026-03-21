import { useState, useRef, useEffect } from 'react';
import { Copy, Download, CalendarDays, ChevronDown, Check, Building2 } from 'lucide-react';
import type { PeriodKey } from '../../types';
import { useLedger } from '../../context/LedgerContext';

interface TopBarProps {
  activePeriod: PeriodKey;
  onPeriodChange: (p: PeriodKey) => void;
  asOfDate: string;
  onCopyAISummary: () => void;
  onDownloadAISummary: () => void;
}

const PERIOD_LABELS: { key: PeriodKey; label: string }[] = [
  { key: 'current', label: 'Current Month' },
  { key: 'last',    label: 'Last Month' },
  { key: 'past2',   label: 'Past 2 Months' },
  { key: 'quarter', label: 'Last Quarter' },
  { key: 'year',    label: 'Last Year' },
];

export function TopBar({
  activePeriod,
  onPeriodChange,
  asOfDate,
  onCopyAISummary,
  onDownloadAISummary,
}: TopBarProps) {
  const [open, setOpen] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const ledgerDropdownRef = useRef<HTMLDivElement>(null);
  const { ledgers, selectedLedgerId, setSelectedLedgerId } = useLedger();

  useEffect(() => {
    function handleInteraction(e: MouseEvent | KeyboardEvent) {
      if (e.type === 'keydown' && (e as KeyboardEvent).key === 'Escape') {
        setOpen(false);
        return;
      }
      if (
        e.type === 'mousedown' &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleInteraction);
      document.addEventListener('keydown', handleInteraction);
    }
    return () => {
      document.removeEventListener('mousedown', handleInteraction);
      document.removeEventListener('keydown', handleInteraction);
    };
  }, [open]);

  useEffect(() => {
    function handleOutside(e: MouseEvent | KeyboardEvent) {
      if (e.type === 'keydown' && (e as KeyboardEvent).key === 'Escape') { setLedgerOpen(false); return; }
      if (e.type === 'mousedown' && ledgerDropdownRef.current && !ledgerDropdownRef.current.contains(e.target as Node)) {
        setLedgerOpen(false);
      }
    }
    if (ledgerOpen) {
      document.addEventListener('mousedown', handleOutside);
      document.addEventListener('keydown', handleOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleOutside);
    };
  }, [ledgerOpen]);

  const activeLabel = PERIOD_LABELS.find(p => p.key === activePeriod)?.label ?? '';
  const activeLedgerName = ledgers.find(l => l.id === selectedLedgerId)?.name ?? 'Workspace';

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 90,
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border-subtle)',
        padding: '0.75rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        flexWrap: 'wrap',
      }}
    >
      {/* Period dropdown */}
      <div ref={dropdownRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            minHeight: 44,
            padding: '0 12px',
            borderRadius: 8,
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 500,
            outline: 'none',
            transition: 'border-color 0.15s ease',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent-blue)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-subtle)';
          }}
        >
          <CalendarDays size={15} strokeWidth={2} />
          {activeLabel}
          <ChevronDown
            size={14}
            strokeWidth={2}
            style={{
              transform: open ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.15s ease',
            }}
          />
        </button>

        {open && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
              minWidth: 160,
              zIndex: 40,
              overflow: 'hidden',
            }}
          >
            {PERIOD_LABELS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => { onPeriodChange(key); setOpen(false); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  minHeight: 44,
                  padding: '0 14px',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: key === activePeriod ? 'var(--accent-blue)' : 'var(--text-secondary)',
                  fontWeight: key === activePeriod ? 600 : 400,
                  fontSize: '0.875rem',
                  textAlign: 'left',
                  transition: 'background 0.1s ease',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    'color-mix(in srgb, var(--text-muted) 10%, transparent)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }}
              >
                {label}
                {key === activePeriod && (
                  <Check size={14} strokeWidth={2.5} />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Ledger / workspace switcher */}
      {ledgers.length > 0 && (
        <div ref={ledgerDropdownRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setLedgerOpen(o => !o)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              minHeight: 44,
              padding: '0 12px',
              borderRadius: 8,
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 500,
              outline: 'none',
              transition: 'border-color 0.15s ease',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent-blue)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-subtle)'; }}
          >
            <Building2 size={15} strokeWidth={2} />
            {activeLedgerName}
            <ChevronDown
              size={14}
              strokeWidth={2}
              style={{ transform: ledgerOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}
            />
          </button>

          {ledgerOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: 0,
                background: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 8,
                boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                minWidth: 180,
                zIndex: 40,
                overflow: 'hidden',
              }}
            >
              {ledgers.map(ledger => (
                <button
                  key={ledger.id}
                  onClick={() => { setSelectedLedgerId(ledger.id); setLedgerOpen(false); }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    minHeight: 44,
                    padding: '0 14px',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: ledger.id === selectedLedgerId ? 'var(--accent-blue)' : 'var(--text-secondary)',
                    fontWeight: ledger.id === selectedLedgerId ? 600 : 400,
                    fontSize: '0.875rem',
                    textAlign: 'left',
                    transition: 'background 0.1s ease',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'color-mix(in srgb, var(--text-muted) 10%, transparent)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                >
                  <span>
                    {ledger.name}
                    <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', opacity: 0.5 }}>
                      {ledger.type}
                    </span>
                  </span>
                  {ledger.id === selectedLedgerId && <Check size={14} strokeWidth={2.5} />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Export buttons + as-of date */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0, marginLeft: 'auto' }}>
        <span
          style={{
            fontSize: '0.6875rem',
            color: 'var(--text-muted)',
            letterSpacing: '0.03em',
            marginRight: '0.25rem',
          }}
        >
          as of {asOfDate}
        </span>

        <button
          onClick={onCopyAISummary}
          title="Copy AI Summary"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
            padding: '0.3125rem 0.75rem',
            borderRadius: '0.5rem',
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-surface)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: '0.8125rem',
            fontWeight: 500,
            whiteSpace: 'nowrap',
            outline: 'none',
            transition: 'color 0.15s ease',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
          }}
        >
          <Copy size={13} strokeWidth={2} />
          Copy AI Summary
        </button>

        <button
          onClick={onDownloadAISummary}
          title="Download .md"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
            padding: '0.3125rem 0.75rem',
            borderRadius: '0.5rem',
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-surface)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: '0.8125rem',
            fontWeight: 500,
            whiteSpace: 'nowrap',
            outline: 'none',
            transition: 'color 0.15s ease',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
          }}
        >
          <Download size={13} strokeWidth={2} />
          Download .md
        </button>
      </div>
    </div>
  );
}
