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
// Institution parser
// ---------------------------------------------------------------------------

function getInstitutionName(rawName: string): string {
  const l = rawName.toLowerCase();
  if (l.includes('amex') || l.includes('american express') || l.includes('optima')) return 'American Express';
  if (l.includes('chase'))                                                            return 'Chase';
  if (l.includes('capital one') || l.includes('quicksilver'))                        return 'Capital One';
  if (l.includes('citi') || l.includes('double cash'))                               return 'Citi';
  if (l.includes('discover'))                                                         return 'Discover';
  return 'Other';
}

const DEFAULT_INSTITUTIONS = ['American Express', 'Capital One', 'Chase', 'Citi', 'Discover'];

/** Group terms by institution, respecting per-account overrides. Other sorts last. */
function groupByInstitution(
  terms: DebtTermEntry[],
  overrides: Record<string, string>,
): [string, DebtTermEntry[]][] {
  const map = new Map<string, DebtTermEntry[]>();
  for (const term of terms) {
    const key = overrides[term.account_name] ?? getInstitutionName(term.account_name);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(term);
  }
  return [...map.entries()].sort(([a], [b]) => {
    if (a === 'Other') return 1;
    if (b === 'Other') return -1;
    return a.localeCompare(b);
  });
}

const LS_OVERRIDES  = 'debt_institution_overrides';
const LS_CUSTOM     = 'debt_custom_institutions';

function loadLS<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback; }
  catch { return fallback; }
}

// ---------------------------------------------------------------------------
// Debt Configuration sub-component
// ---------------------------------------------------------------------------

function DebtConfigSection({ onRefresh }: { onRefresh: () => void }) {
  // ── API data ──────────────────────────────────────────────────────────────
  const [terms, setTerms]           = useState<DebtTermEntry[]>([]);
  const [loading, setLoading]       = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [saveState, setSaveState]   = useState<SaveState>('idle');
  const [saveError, setSaveError]   = useState<string | null>(null);

  // ── Institution state (localStorage) ─────────────────────────────────────
  const [overrides, setOverrides]         = useState<Record<string, string>>(
    () => loadLS<Record<string, string>>(LS_OVERRIDES, {}),
  );
  const [customInsts, setCustomInsts]     = useState<string[]>(
    () => loadLS<string[]>(LS_CUSTOM, []),
  );
  const [addingInst, setAddingInst]       = useState(false);
  const [newInstName, setNewInstName]     = useState('');

  // ── Drag-and-drop state ───────────────────────────────────────────────────
  const [draggedName, setDraggedName]   = useState<string | null>(null);
  const [dragOverInst, setDragOverInst] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/api/debt/settings`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<DebtTermEntry[]>; })
      .then(data => { setTerms(data); setLoading(false); })
      .catch((e: Error) => { setFetchError(e.message); setLoading(false); });
  }, []);

  // Persist institution preferences to localStorage
  useEffect(() => { localStorage.setItem(LS_OVERRIDES, JSON.stringify(overrides)); }, [overrides]);
  useEffect(() => { localStorage.setItem(LS_CUSTOM,    JSON.stringify(customInsts)); }, [customInsts]);

  // ── Field update handlers ─────────────────────────────────────────────────
  const updateNumber = (index: number, field: 'apr' | 'min_payment', raw: string) => {
    const value = parseFloat(raw);
    if (isNaN(value) && raw !== '' && raw !== '.') return;
    setTerms(prev => prev.map((t, i) =>
      i === index ? { ...t, [field]: isNaN(value) ? 0 : value, is_custom: true } : t
    ));
    setSaveState('idle'); setSaveError(null);
  };

  const updateNickname = (index: number, value: string) => {
    setTerms(prev => prev.map((t, i) =>
      i === index ? { ...t, display_name: value || null, is_custom: true } : t
    ));
    setSaveState('idle'); setSaveError(null);
  };

  const assignInstitution = (account_name: string, inst: string) => {
    setOverrides(prev => ({ ...prev, [account_name]: inst }));
  };

  // ── Drag-and-drop handlers ────────────────────────────────────────────────
  const onDragStart = (e: React.DragEvent, account_name: string) => {
    setDraggedName(account_name);
    e.dataTransfer.effectAllowed = 'move';
    // Use a ghost image via transparent element so the cursor looks clean
    const ghost = document.createElement('div');
    ghost.style.cssText = 'position:fixed;top:-100px;opacity:0;';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => document.body.removeChild(ghost), 0);
  };

  const onDragOverInst = (e: React.DragEvent, inst: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverInst(inst);
  };

  const onDropInst = (e: React.DragEvent, inst: string) => {
    e.preventDefault();
    if (draggedName) assignInstitution(draggedName, inst);
    setDraggedName(null);
    setDragOverInst(null);
  };

  const onDragEnd = () => { setDraggedName(null); setDragOverInst(null); };

  // ── Add custom institution ────────────────────────────────────────────────
  const allInstitutions = [...DEFAULT_INSTITUTIONS, ...customInsts, 'Other'];

  const commitNewInst = () => {
    const name = newInstName.trim();
    if (name && !allInstitutions.includes(name)) {
      setCustomInsts(prev => [...prev, name]);
    }
    setNewInstName(''); setAddingInst(false);
  };

  // ── Save to backend ───────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaveState('saving'); setSaveError(null);
    try {
      const res = await fetch(`${API}/api/debt/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          terms: terms.map(t => ({
            account_name: t.account_name,
            display_name: t.display_name || null,
            apr:          t.apr / 100,
            min_payment:  t.min_payment,
          })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail ?? `HTTP ${res.status}`);
      }
      setSaveState('saved');
      onRefresh();
    } catch (e) { setSaveState('error'); setSaveError((e as Error).message); }
  };

  // ── Shared styles ─────────────────────────────────────────────────────────
  const colLabel: React.CSSProperties = {
    fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)',
    textTransform: 'uppercase', letterSpacing: '0.05em',
  };
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.375rem 0.5rem', borderRadius: '0.375rem',
    border: '1px solid var(--border-subtle)', background: 'var(--bg-base)',
    color: 'var(--text-primary)', fontSize: '0.875rem', outline: 'none',
    boxSizing: 'border-box',
  };
  const COLS = '1fr 170px 88px 108px';

  // ── Early returns ─────────────────────────────────────────────────────────
  if (loading)    return <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Loading debt accounts…</p>;
  if (fetchError) return <p style={{ fontSize: '0.875rem', color: 'var(--accent-red)' }}>Could not load accounts: {fetchError}</p>;
  if (!terms.length) return <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>No debt accounts found. Run refresh.bat first.</p>;

  const groups = groupByInstitution(terms, overrides);

  return (
    <div>
      {/* ── Toolbar: Add Institution ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
        {addingInst ? (
          <>
            <input
              autoFocus
              placeholder="Institution name…"
              value={newInstName}
              onChange={e => setNewInstName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commitNewInst(); if (e.key === 'Escape') { setAddingInst(false); setNewInstName(''); } }}
              style={{ ...inputStyle, width: 200 }}
            />
            <button onClick={commitNewInst} style={{ ...inputStyle, width: 'auto', padding: '0.375rem 0.875rem', background: 'var(--accent-blue)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
              Add
            </button>
            <button onClick={() => { setAddingInst(false); setNewInstName(''); }} style={{ ...inputStyle, width: 'auto', padding: '0.375rem 0.75rem', cursor: 'pointer' }}>
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={() => setAddingInst(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.75rem', borderRadius: '0.375rem', border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', fontSize: '0.8rem', cursor: 'pointer' }}
          >
            <span style={{ fontSize: '1rem', lineHeight: 1 }}>+</span> Add Institution
          </button>
        )}
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Drag a row onto a group header, or use the Institution dropdown, to reassign.
        </span>
      </div>

      {/* ── Table ── */}
      <div style={{ border: '1px solid var(--border-subtle)', borderRadius: '0.75rem', overflow: 'hidden', marginBottom: '1rem' }}>

        {/* Column headers */}
        <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '0.5rem 1rem', background: 'var(--bg-muted)', borderBottom: '1px solid var(--border-subtle)', gap: '0.75rem', alignItems: 'center' }}>
          {(['Nickname', 'Institution', 'APR (%)', 'Min. Pmt ($)'] as const).map(h => (
            <span key={h} style={colLabel}>{h}</span>
          ))}
        </div>

        {groups.map(([institution, group]) => {
          const isDropTarget = dragOverInst === institution;
          return (
            <div key={institution}>
              {/* Group sub-header — drop target */}
              <div
                onDragOver={e => onDragOverInst(e, institution)}
                onDragLeave={() => setDragOverInst(null)}
                onDrop={e => onDropInst(e, institution)}
                style={{
                  padding: '0.375rem 1rem',
                  background: isDropTarget
                    ? 'color-mix(in srgb, var(--accent-blue) 14%, var(--bg-muted))'
                    : 'var(--bg-muted)',
                  borderTop:    '1px solid var(--border-subtle)',
                  borderBottom: '1px solid var(--border-subtle)',
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  transition: 'background 0.1s ease',
                  outline: isDropTarget ? '2px dashed var(--accent-blue)' : 'none',
                  outlineOffset: '-2px',
                }}
              >
                <span style={{ fontSize: '0.675rem', fontWeight: 700, color: isDropTarget ? 'var(--accent-blue)' : 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  {institution}
                </span>
                {isDropTarget && (
                  <span style={{ fontSize: '0.675rem', color: 'var(--accent-blue)', fontWeight: 600 }}>
                    Drop to move here
                  </span>
                )}
              </div>

              {/* Account rows */}
              {group.map((term, groupIdx) => {
                const flatIdx   = terms.indexOf(term);
                const isDragged = draggedName === term.account_name;
                const effInst   = overrides[term.account_name] ?? getInstitutionName(term.account_name);
                return (
                  <div
                    key={term.account_name}
                    draggable
                    onDragStart={e => onDragStart(e, term.account_name)}
                    onDragEnd={onDragEnd}
                    style={{
                      display: 'grid', gridTemplateColumns: COLS,
                      alignItems: 'center', padding: '0.625rem 1rem',
                      borderBottom: groupIdx < group.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                      background: 'var(--bg-surface)',
                      gap: '0.75rem',
                      opacity: isDragged ? 0.4 : 1,
                      cursor: 'grab',
                      transition: 'opacity 0.15s ease',
                    }}
                  >
                    {/* Nickname + original name sub-text */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <input
                          type="text"
                          placeholder="Add nickname…"
                          value={term.display_name ?? ''}
                          onChange={e => updateNickname(flatIdx, e.target.value)}
                          onMouseDown={e => e.stopPropagation()} // prevent drag from input
                          style={{ ...inputStyle, flex: 1, cursor: 'text' }}
                        />
                        {term.is_custom && (
                          <span style={{ fontSize: '0.6rem', fontWeight: 600, color: 'var(--accent-blue)', background: 'color-mix(in srgb, var(--accent-blue) 12%, transparent)', padding: '0.1rem 0.35rem', borderRadius: '999px', flexShrink: 0, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                            saved
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={term.account_name}>
                        {term.account_name}
                      </div>
                    </div>

                    {/* Institution dropdown */}
                    <select
                      value={effInst}
                      onChange={e => assignInstitution(term.account_name, e.target.value)}
                      onMouseDown={e => e.stopPropagation()}
                      style={{ ...inputStyle, cursor: 'pointer', appearance: 'auto' }}
                    >
                      {allInstitutions.map(inst => (
                        <option key={inst} value={inst}>{inst}</option>
                      ))}
                    </select>

                    {/* APR */}
                    <input
                      type="number" min="0" max="100" step="0.01"
                      value={term.apr.toFixed(2)}
                      onChange={e => updateNumber(flatIdx, 'apr', e.target.value)}
                      onMouseDown={e => e.stopPropagation()}
                      style={inputStyle}
                    />

                    {/* Min payment */}
                    <input
                      type="number" min="0" step="1"
                      value={term.min_payment.toFixed(2)}
                      onChange={e => updateNumber(flatIdx, 'min_payment', e.target.value)}
                      onMouseDown={e => e.stopPropagation()}
                      style={inputStyle}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* ── Footer ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button
          onClick={handleSave}
          disabled={saveState === 'saving'}
          style={{ padding: '0.5rem 1.25rem', borderRadius: '0.5rem', border: 'none', background: saveState === 'saving' ? 'var(--border-subtle)' : 'var(--accent-blue)', color: saveState === 'saving' ? 'var(--text-muted)' : '#fff', fontSize: '0.875rem', fontWeight: 600, cursor: saveState === 'saving' ? 'not-allowed' : 'pointer', transition: 'background 0.15s ease' }}
        >
          {saveState === 'saving' ? 'Saving…' : 'Save Settings'}
        </button>
        {saveState === 'saved' && <span style={{ fontSize: '0.875rem', color: 'var(--accent-green)' }}>✓ Saved — dashboard refreshed</span>}
        {saveState === 'error'  && <span style={{ fontSize: '0.875rem', color: 'var(--accent-red)'   }}>Error: {saveError}</span>}
      </div>

      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>
        APR and minimum payments are saved to the local database. Institution assignments and custom groups are saved locally in your browser.
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
