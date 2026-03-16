import { useState, useEffect } from 'react';
import type { Theme } from '../lib/theme';

interface SettingsTabProps {
  activeTheme: Theme;
  onThemeChange: (t: Theme) => void;
  onRefresh: () => void;
}

// ---------------------------------------------------------------------------
// Theme section
// ---------------------------------------------------------------------------

const THEMES: {
  id: Theme;
  label: string;
  description: string;
  swatches: [string, string, string, string];
}[] = [
  { id: 'system',        label: 'System',        description: 'Follows your OS preference', swatches: ['#0f172a', '#60a5fa', '#4ade80', '#f87171'] },
  { id: 'light',         label: 'Light',          description: 'Clean light interface',       swatches: ['#f0f4f8', '#2563eb', '#16a34a', '#dc2626'] },
  { id: 'dark',          label: 'Dark',           description: 'Easy on the eyes',            swatches: ['#0f172a', '#60a5fa', '#4ade80', '#f87171'] },
  { id: 'pastel',        label: 'Pastel',         description: 'Soft, warm tones',            swatches: ['#faf7f5', '#7c9dd4', '#7ab89a', '#d4826b'] },
  { id: 'high-contrast', label: 'High Contrast',  description: 'Maximum readability',         swatches: ['#000000', '#4fc3f7', '#69f0ae', '#ff5252'] },
];

// ---------------------------------------------------------------------------
// Debt configuration types
// ---------------------------------------------------------------------------

interface DebtTermEntry {
  account_name: string;        // full original name — never truncated, used as PK
  display_name: string | null; // user nickname; null = show full name
  apr: number;                 // stored as decimal (0.24); displayed as % (24)
  min_payment: number;
  is_custom: boolean;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const API = 'http://localhost:8000';

// ---------------------------------------------------------------------------
// Debt Configuration sub-component
// ---------------------------------------------------------------------------

function DebtConfigSection({ onRefresh }: { onRefresh: () => void }) {
  const [terms, setTerms]         = useState<DebtTermEntry[]>([]);
  const [loading, setLoading]     = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  // Fetch current terms from the API on mount
  useEffect(() => {
    fetch(`${API}/api/debt/settings`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<DebtTermEntry[]>;
      })
      .then(data => { setTerms(data); setLoading(false); })
      .catch((e: Error) => { setFetchError(e.message); setLoading(false); });
  }, []);

  const updateNumber = (
    index: number,
    field: 'apr' | 'min_payment',
    raw: string,
  ) => {
    const value = parseFloat(raw);
    if (isNaN(value) && raw !== '' && raw !== '.') return;
    setTerms(prev => prev.map((t, i) =>
      i === index ? { ...t, [field]: isNaN(value) ? 0 : value, is_custom: true } : t
    ));
    setSaveState('idle');
    setSaveError(null);
  };

  const updateNickname = (index: number, value: string) => {
    setTerms(prev => prev.map((t, i) =>
      i === index ? { ...t, display_name: value || null, is_custom: true } : t
    ));
    setSaveState('idle');
    setSaveError(null);
  };

  const handleSave = async () => {
    setSaveState('saving');
    setSaveError(null);
    try {
      const body = {
        terms: terms.map(t => ({
          account_name: t.account_name,
          display_name: t.display_name || null,
          apr:          t.apr / 100,        // convert % → decimal for backend
          min_payment:  t.min_payment,
        })),
      };
      const res = await fetch(`${API}/api/debt/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail ?? `HTTP ${res.status}`);
      }
      setSaveState('saved');
      onRefresh();             // re-fetch dashboard so Debt Tab reflects new APRs
    } catch (e) {
      setSaveState('error');
      setSaveError((e as Error).message);
    }
  };

  const sectionLabel: React.CSSProperties = {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '0.5rem',
  };

  if (loading) return (
    <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
      Loading debt accounts…
    </p>
  );

  if (fetchError) return (
    <p style={{ fontSize: '0.875rem', color: 'var(--accent-red)' }}>
      Could not load accounts: {fetchError}
    </p>
  );

  if (terms.length === 0) return (
    <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
      No debt accounts found. Run refresh.bat to ingest data first.
    </p>
  );

  return (
    <div>
      {/* Table */}
      <div style={{
        border: '1px solid var(--border-subtle)',
        borderRadius: '0.75rem',
        overflow: 'hidden',
        marginBottom: '1rem',
      }}>
        {/* Header row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 160px 110px 130px',
          padding: '0.625rem 1rem',
          background: 'var(--bg-muted)',
          borderBottom: '1px solid var(--border-subtle)',
          gap: '0.75rem',
        }}>
          {(['Nickname', 'Original Bank Name', 'APR (%)', 'Min. Pmt ($)'] as const).map(h => (
            <span key={h} style={sectionLabel}>{h}</span>
          ))}
        </div>

        {/* Data rows */}
        {terms.map((term, i) => (
          <div
            key={term.account_name}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 160px 110px 130px',
              alignItems: 'center',
              padding: '0.625rem 1rem',
              borderBottom: i < terms.length - 1 ? '1px solid var(--border-subtle)' : 'none',
              background: 'var(--bg-surface)',
              gap: '0.75rem',
            }}
          >
            {/* Nickname input + custom badge */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <input
                  type="text"
                  placeholder="Add nickname…"
                  value={term.display_name ?? ''}
                  onChange={e => updateNickname(i, e.target.value)}
                  style={{
                    flex: 1,
                    padding: '0.375rem 0.5rem',
                    borderRadius: '0.375rem',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-base)',
                    color: 'var(--text-primary)',
                    fontSize: '0.875rem',
                    outline: 'none',
                    minWidth: 0,
                  }}
                />
                {term.is_custom && (
                  <span style={{
                    fontSize: '0.6rem',
                    fontWeight: 600,
                    color: 'var(--accent-blue)',
                    background: 'color-mix(in srgb, var(--accent-blue) 12%, transparent)',
                    padding: '0.1rem 0.35rem',
                    borderRadius: '999px',
                    flexShrink: 0,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}>saved</span>
                )}
              </div>
            </div>

            {/* Original bank name (read-only sub-text) */}
            <div style={{
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              paddingTop: '0.125rem',
            }}
              title={term.account_name}
            >
              {term.account_name}
            </div>

            {/* APR input */}
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={(term.apr).toFixed(2)}
              onChange={e => updateNumber(i, 'apr', e.target.value)}
              style={{
                width: '100%',
                padding: '0.375rem 0.5rem',
                borderRadius: '0.375rem',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-base)',
                color: 'var(--text-primary)',
                fontSize: '0.875rem',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />

            {/* Min payment input */}
            <input
              type="number"
              min="0"
              step="1"
              value={term.min_payment.toFixed(2)}
              onChange={e => updateNumber(i, 'min_payment', e.target.value)}
              style={{
                width: '100%',
                padding: '0.375rem 0.5rem',
                borderRadius: '0.375rem',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-base)',
                color: 'var(--text-primary)',
                fontSize: '0.875rem',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        ))}
      </div>

      {/* Footer: save button + feedback */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button
          onClick={handleSave}
          disabled={saveState === 'saving'}
          style={{
            padding: '0.5rem 1.25rem',
            borderRadius: '0.5rem',
            border: 'none',
            background: saveState === 'saving' ? 'var(--border-subtle)' : 'var(--accent-blue)',
            color: saveState === 'saving' ? 'var(--text-muted)' : '#fff',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: saveState === 'saving' ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s ease',
          }}
        >
          {saveState === 'saving' ? 'Saving…' : 'Save Settings'}
        </button>

        {saveState === 'saved' && (
          <span style={{ fontSize: '0.875rem', color: 'var(--accent-green)' }}>
            ✓ Saved — dashboard refreshed
          </span>
        )}
        {saveState === 'error' && (
          <span style={{ fontSize: '0.875rem', color: 'var(--accent-red)' }}>
            Error: {saveError}
          </span>
        )}
      </div>

      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>
        APR and minimum payments are saved to the local database and immediately
        applied to the Debt Snowball forecaster.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SettingsTab
// ---------------------------------------------------------------------------

export function SettingsTab({ activeTheme, onThemeChange, onRefresh }: SettingsTabProps) {
  const sectionHeader: React.CSSProperties = {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '0.75rem',
  };

  return (
    <div style={{ maxWidth: 700 }}>
      <h1 style={{
        fontSize: '1.5rem',
        fontWeight: 700,
        color: 'var(--text-primary)',
        marginBottom: '0.5rem',
      }}>
        Settings
      </h1>
      <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '2rem' }}>
        Customize your dashboard appearance and configure debt forecasting parameters.
      </p>

      {/* ── Theme ── */}
      <h2 style={sectionHeader}>Theme</h2>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: '0.75rem',
        marginBottom: '2.5rem',
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
                border: isActive ? '2px solid var(--accent-blue)' : '1px solid var(--border-subtle)',
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
              {isActive && (
                <div style={{
                  position: 'absolute', top: '0.5rem', right: '0.5rem',
                  width: 18, height: 18, borderRadius: '50%',
                  background: 'var(--accent-blue)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.625rem', color: '#fff',
                }}>✓</div>
              )}
              <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                {swatches.map((color, i) => (
                  <div key={i} style={{
                    width: i === 0 ? 24 : 14, height: i === 0 ? 24 : 14,
                    borderRadius: '50%', background: color, flexShrink: 0,
                    border: ['#ffffff','#f0f4f8','#faf7f5'].includes(color)
                      ? '1px solid rgba(0,0,0,0.1)' : 'none',
                  }} />
                ))}
              </div>
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
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

      {/* ── Debt Configuration ── */}
      <h2 style={sectionHeader}>Debt Configuration</h2>
      <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
        Set a nickname, APR, and minimum payment for each debt account. The original
        bank name is shown below each nickname for reference. Values marked{' '}
        <strong style={{ color: 'var(--accent-blue)' }}>saved</strong> are persisted
        to the local database and applied immediately to the Debt Snowball forecaster.
        Paid-off accounts are included so you can pre-configure cards you plan to use again.
      </p>
      <DebtConfigSection onRefresh={onRefresh} />
    </div>
  );
}
