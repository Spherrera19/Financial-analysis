import React from 'react';
import { Copy, Download } from 'lucide-react';
import type { PeriodKey } from '../../types';

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
  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 90,
        background: 'color-mix(in srgb, var(--bg-base) 95%, transparent)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        borderBottom: '1px solid var(--border-subtle)',
        padding: '0.75rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        flexWrap: 'wrap',
      }}
    >
      {/* Period filter buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap', flex: 1 }}>
        {PERIOD_LABELS.map(({ key, label }) => {
          const isActive = activePeriod === key;
          return (
            <button
              key={key}
              onClick={() => onPeriodChange(key)}
              style={{
                padding: '0.3125rem 0.875rem',
                borderRadius: '9999px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.8125rem',
                fontWeight: isActive ? 600 : 400,
                background: isActive ? 'var(--accent-blue)' : 'var(--bg-surface)',
                color: isActive ? '#ffffff' : 'var(--text-secondary)',
                transition: 'background 0.15s ease, color 0.15s ease',
                outline: 'none',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
                }
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Export buttons + as-of date */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
        {/* As-of date */}
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

        {/* Copy AI Summary */}
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

        {/* Download .md */}
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
