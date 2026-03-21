import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Theme } from '../lib/theme';
import type { UserProfile, UserProfileCreate, Ledger } from '../types';
import { ShareLedgerModal } from '../components/modals/ShareLedgerModal';
import { useUser } from '../context/UserContext';

interface SettingsTabProps {
  activeTheme: Theme;
  onThemeChange: (t: Theme) => void;
  onRefresh: () => void;
}

type OnError = (msg: string) => void;

// ---------------------------------------------------------------------------
// Data Import section
// ---------------------------------------------------------------------------

type UploadState = 'idle' | 'uploading' | 'success' | 'error';

const VALID_PREFIXES = ['Transactions', 'Balances', 'Equity', 'RSU'];

function DataImportSection({ onRefresh, onError }: { onRefresh: () => void; onError: OnError }) {
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [grantsImported, setGrantsImported] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    // Validate all filenames before uploading
    const fileArray = Array.from(files);
    const invalid = fileArray.filter(
      f => !VALID_PREFIXES.some(p => f.name.startsWith(p)) || !f.name.endsWith('.csv'),
    );
    if (invalid.length > 0) {
      setUploadState('error');
      setErrorMessage(
        `Invalid file(s): ${invalid.map(f => f.name).join(', ')}. ` +
        `Accepted: Transactions_*.csv, Balances_*.csv (Monarch), or Equity_*.csv / RSU_*.csv (brokerage).`,
      );
      return;
    }

    setUploadState('uploading');
    setErrorMessage(null);
    setGrantsImported(null);

    const formData = new FormData();
    for (const file of fileArray) {
      formData.append('files', file, file.name);
    }

    try {
      const res = await fetch(`${API}/api/upload/csv`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { detail?: string };
        throw new Error(err.detail ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as { uploaded: string[]; count: number; grants_imported?: number };
      setUploadedFiles(data.uploaded);
      setGrantsImported(data.grants_imported ?? null);
      setUploadState('success');
      onRefresh();
    } catch (e) {
      const msg = (e as Error).message;
      setUploadState('error');
      setErrorMessage(msg);
      onError(msg);
    }
  }, [onRefresh, onError]);

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); };
  const onDragLeave = () => setIsDragOver(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const isActive = uploadState === 'uploading';

  return (
    <div>
      {/* Drop zone */}
      <div
        onClick={() => !isActive && fileInputRef.current?.click()}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        style={{
          border: `2px dashed ${isDragOver ? 'var(--accent-blue)' : 'var(--border-subtle)'}`,
          borderRadius: '0.75rem',
          padding: '2rem 1.5rem',
          textAlign: 'center',
          cursor: isActive ? 'not-allowed' : 'pointer',
          background: isDragOver
            ? 'color-mix(in srgb, var(--accent-blue) 6%, var(--bg-surface))'
            : 'var(--bg-surface)',
          transition: 'border-color 0.15s ease, background 0.15s ease',
          userSelect: 'none',
          marginBottom: '0.75rem',
        }}
      >
        {/* Icon */}
        <div style={{ marginBottom: '0.75rem' }}>
          {uploadState === 'uploading' ? (
            /* Spinner */
            <div style={{
              width: 36, height: 36, margin: '0 auto',
              border: '3px solid var(--border-subtle)',
              borderTopColor: 'var(--accent-blue)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
          ) : uploadState === 'success' ? (
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--accent-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto', display: 'block' }}>
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          ) : (
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={isDragOver ? 'var(--accent-blue)' : 'var(--text-muted)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto', display: 'block', transition: 'stroke 0.15s ease' }}>
              <polyline points="16 16 12 12 8 16" />
              <line x1="12" y1="12" x2="12" y2="21" />
              <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
            </svg>
          )}
        </div>

        {/* Label */}
        <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 0.25rem' }}>
          {uploadState === 'uploading'
            ? 'Processing Data…'
            : uploadState === 'success'
            ? 'Import Complete'
            : isDragOver
            ? 'Drop files to import'
            : 'Drop CSV files here or click to browse'}
        </p>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
          {uploadState === 'success'
            ? grantsImported !== null
              ? `Imported: ${uploadedFiles.join(', ')} — ${grantsImported} grant${grantsImported !== 1 ? 's' : ''} added (existing manual entries preserved)`
              : `Imported: ${uploadedFiles.join(', ')}`
            : uploadState === 'idle' && !isDragOver
            ? <>
                Monarch: <strong style={{ color: 'var(--text-secondary)' }}>Transactions_*.csv</strong>, <strong style={{ color: 'var(--text-secondary)' }}>Balances_*.csv</strong>
                {' · '}
                Brokerage: <strong style={{ color: 'var(--text-secondary)' }}>Equity_*.csv</strong>, <strong style={{ color: 'var(--text-secondary)' }}>RSU_*.csv</strong>
              </>
            : null}
        </p>
      </div>

      {/* Keyframe for spinner */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        multiple
        style={{ display: 'none' }}
        onChange={e => { handleFiles(e.target.files); e.target.value = ''; }}
      />

      {/* Error message */}
      {uploadState === 'error' && errorMessage && (
        <p style={{ fontSize: '0.8rem', color: 'var(--accent-red)', margin: '0.5rem 0 0' }}>
          {errorMessage}
        </p>
      )}

      {/* Reset link after success */}
      {uploadState === 'success' && (
        <button
          onClick={() => { setUploadState('idle'); setUploadedFiles([]); setGrantsImported(null); }}
          style={{ background: 'none', border: 'none', padding: 0, fontSize: '0.75rem', color: 'var(--accent-blue)', cursor: 'pointer', marginTop: '0.5rem' }}
        >
          Import more files
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Household Members section
// ---------------------------------------------------------------------------

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

function HouseholdMembersSection() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId]   = useState<number | null>(null);
  const [editName, setEditName]     = useState('');
  const [saveError, setSaveError]   = useState<string | null>(null);

  const { data: profiles = [], isLoading } = useQuery<UserProfile[]>({
    queryKey: ['profiles'],
    queryFn: () => fetch(`${API}/api/profiles`).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }),
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      fetch(`${API}/api/profiles/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }).then(r => {
        if (!r.ok) return r.json().then(e => Promise.reject(new Error(e.detail ?? `HTTP ${r.status}`)));
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      setEditingId(null);
      setSaveError(null);
    },
    onError: (e: Error) => setSaveError(e.message),
  });

  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName]         = useState('');
  const [addError, setAddError]       = useState<string | null>(null);

  const addMutation = useMutation({
    mutationFn: (body: UserProfileCreate) =>
      fetch(`${API}/api/profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(r => {
        if (!r.ok) return r.json().then((e: { detail?: string }) => Promise.reject(new Error(e.detail ?? `HTTP ${r.status}`)));
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      queryClient.invalidateQueries({ queryKey: ['ledgers'] });
      setShowAddForm(false);
      setNewName('');
      setAddError(null);
    },
    onError: (e: Error) => setAddError(e.message),
  });

  const openEdit = (profile: UserProfile) => {
    setEditingId(profile.id);
    setEditName(profile.name);
    setSaveError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setSaveError(null);
  };

  if (isLoading) {
    return <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Loading members…</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {profiles.map(profile => (
        <div
          key={profile.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            padding: '1rem 1.25rem',
            borderRadius: '0.75rem',
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-surface)',
          }}
        >
          {/* Avatar initial */}
          <div style={{
            width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
            background: 'var(--accent-blue)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1rem', fontWeight: 700, color: '#fff',
          }}>
            {profile.name.charAt(0).toUpperCase()}
          </div>

          {/* Name / edit field */}
          <div style={{ flex: 1 }}>
            {editingId === profile.id ? (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  autoFocus
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') renameMutation.mutate({ id: profile.id, name: editName });
                    if (e.key === 'Escape') cancelEdit();
                  }}
                  style={{
                    padding: '0.375rem 0.625rem',
                    borderRadius: '0.375rem',
                    border: '1px solid var(--accent-blue)',
                    background: 'var(--bg-base)',
                    color: 'var(--text-primary)',
                    fontSize: '0.9375rem',
                    outline: 'none',
                    width: 160,
                  }}
                />
                <button
                  onClick={() => renameMutation.mutate({ id: profile.id, name: editName })}
                  disabled={renameMutation.isPending || !editName.trim()}
                  style={{
                    padding: '0.375rem 0.875rem',
                    borderRadius: '0.375rem',
                    border: 'none',
                    background: 'var(--accent-blue)',
                    color: '#fff',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    cursor: renameMutation.isPending ? 'not-allowed' : 'pointer',
                    opacity: renameMutation.isPending ? 0.7 : 1,
                  }}
                >
                  {renameMutation.isPending ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={cancelEdit}
                  style={{
                    padding: '0.375rem 0.75rem',
                    borderRadius: '0.375rem',
                    border: '1px solid var(--border-subtle)',
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    fontSize: '0.8125rem',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                {saveError && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--accent-red)' }}>{saveError}</span>
                )}
              </div>
            ) : (
              <div>
                <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {profile.name}
                </span>
                {profile.is_primary && (
                  <span style={{
                    marginLeft: '0.5rem',
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    padding: '0.125rem 0.5rem',
                    borderRadius: '0.25rem',
                    background: 'color-mix(in srgb, var(--accent-blue) 15%, transparent)',
                    color: 'var(--accent-blue)',
                  }}>
                    Primary
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Edit button */}
          {editingId !== profile.id && (
            <button
              onClick={() => openEdit(profile)}
              style={{
                padding: '0.375rem 0.875rem',
                borderRadius: '0.375rem',
                border: '1px solid var(--border-subtle)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                fontSize: '0.8125rem',
                fontWeight: 600,
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              Edit
            </button>
          )}
        </div>
      ))}

      {/* Add Member */}
      {!showAddForm ? (
        <button
          onClick={() => setShowAddForm(true)}
          style={{
            marginTop: '0.5rem',
            padding: '0.5rem 1rem',
            borderRadius: '0.5rem',
            border: '1px dashed var(--border-subtle)',
            background: 'transparent',
            color: 'var(--text-secondary)',
            fontSize: '0.8125rem',
            fontWeight: 600,
            cursor: 'pointer',
            width: '100%',
          }}
        >
          + Add Member
        </button>
      ) : (
        <div style={{
          display: 'flex', gap: '0.5rem', alignItems: 'center',
          marginTop: '0.5rem', flexWrap: 'wrap',
        }}>
          <input
            autoFocus
            placeholder="New member name…"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && newName.trim()) addMutation.mutate({ name: newName.trim() });
              if (e.key === 'Escape') { setShowAddForm(false); setNewName(''); }
            }}
            style={{
              flex: 1, padding: '0.375rem 0.625rem', borderRadius: '0.375rem',
              border: '1px solid var(--accent-blue)',
              background: 'var(--bg-base)', color: 'var(--text-primary)',
              fontSize: '0.9375rem', outline: 'none', minWidth: 160,
            }}
          />
          <button
            onClick={() => { if (newName.trim()) addMutation.mutate({ name: newName.trim() }); }}
            disabled={addMutation.isPending || !newName.trim()}
            style={{
              padding: '0.375rem 0.875rem', borderRadius: '0.375rem', border: 'none',
              background: 'var(--accent-blue)', color: '#fff',
              fontSize: '0.8125rem', fontWeight: 600,
              cursor: addMutation.isPending ? 'not-allowed' : 'pointer',
              opacity: addMutation.isPending ? 0.7 : 1,
            }}
          >
            {addMutation.isPending ? 'Adding…' : 'Add'}
          </button>
          <button
            onClick={() => { setShowAddForm(false); setNewName(''); setAddError(null); }}
            style={{
              padding: '0.375rem 0.75rem', borderRadius: '0.375rem',
              border: '1px solid var(--border-subtle)', background: 'transparent',
              color: 'var(--text-secondary)', fontSize: '0.8125rem', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          {addError && (
            <span style={{ width: '100%', fontSize: '0.75rem', color: 'var(--accent-red)' }}>
              {addError}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workspace Access section
// ---------------------------------------------------------------------------

function WorkspaceAccessSection() {
  const { activeUserId } = useUser();
  const [selectedLedger, setSelectedLedger] = useState<{ id: number; name: string } | null>(null);
  const [isModalOpen, setIsModalOpen]       = useState(false);

  const { data: ledgers = [], isLoading } = useQuery<Ledger[]>({
    queryKey: ['ledgers', activeUserId],
    queryFn: () => fetch(`${API}/api/ledgers?user_id=${activeUserId}`).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }),
  });

  const typeBadgeStyle = (type: Ledger['type']): React.CSSProperties => {
    const map: Record<string, [string, string]> = {
      joint:    ['var(--accent-blue)',  'color-mix(in srgb, var(--accent-blue)  12%, transparent)'],
      personal: ['var(--accent-green)', 'color-mix(in srgb, var(--accent-green) 12%, transparent)'],
      business: ['#a855f7',             'color-mix(in srgb, #a855f7 12%, transparent)'],
    };
    const [color, bg] = map[type] ?? ['var(--text-muted)', 'transparent'];
    return {
      fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.04em',
      textTransform: 'uppercase', padding: '0.125rem 0.5rem',
      borderRadius: '0.25rem', background: bg, color,
    };
  };

  const roleBadgeStyle = (role: string): React.CSSProperties => {
    const isAdmin = role === 'admin';
    return {
      fontSize: '0.6875rem', fontWeight: 600,
      padding: '0.125rem 0.4rem', borderRadius: '0.25rem',
      background: isAdmin
        ? 'color-mix(in srgb, #f59e0b 15%, transparent)'
        : 'color-mix(in srgb, var(--text-muted) 15%, transparent)',
      color: isAdmin ? '#f59e0b' : 'var(--text-muted)',
    };
  };

  if (isLoading) {
    return <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Loading workspaces…</p>;
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {ledgers.map(ledger => (
          <div
            key={ledger.id}
            style={{
              padding: '1rem 1.25rem',
              borderRadius: '0.75rem',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-surface)',
            }}
          >
            {/* Card header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {ledger.name}
                </span>
                <span style={typeBadgeStyle(ledger.type)}>{ledger.type}</span>
              </div>
              {ledger.members.some(m => m.user_id === activeUserId && m.role === 'admin') && (
                <button
                  onClick={() => { setSelectedLedger({ id: ledger.id, name: ledger.name }); setIsModalOpen(true); }}
                  style={{
                    padding: '0.375rem 0.875rem',
                    borderRadius: '0.375rem',
                    border: '1px solid var(--border-subtle)',
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  Manage Access
                </button>
              )}
            </div>

            {/* Members list */}
            {ledger.members.length === 0 ? (
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: 0 }}>No members yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {ledger.members.map(member => (
                  <div
                    key={member.user_id}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                      background: 'var(--accent-blue)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.75rem', fontWeight: 700, color: '#fff',
                    }}>
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)', flex: 1 }}>
                      {member.name}
                    </span>
                    <span style={roleBadgeStyle(member.role)}>
                      {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <ShareLedgerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        ledgerId={selectedLedger?.id ?? 0}
        ledgerName={selectedLedger?.name ?? ''}
      />
    </>
  );
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

function DebtConfigSection({ onRefresh, onError }: { onRefresh: () => void; onError: OnError }) {
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
    const controller = new AbortController();
    fetch(`${API}/api/debt/settings`, { signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<DebtTermEntry[]>; })
      .then(data => { setTerms(data); setLoading(false); })
      .catch((e: Error) => {
        if (e.name !== 'AbortError') {
          setFetchError(e.message);
          setLoading(false);
          onError(e.message);
        }
      });
    return () => controller.abort();
  }, []);

  // Persist institution preferences to localStorage
  useEffect(() => { localStorage.setItem(LS_OVERRIDES, JSON.stringify(overrides)); }, [overrides]);
  useEffect(() => { localStorage.setItem(LS_CUSTOM,    JSON.stringify(customInsts)); }, [customInsts]);

  // ── Number input draft state (keyed by "account_name-field") ─────────────
  // Allows the user to type freely (e.g., clear a field) without snapping to 0.
  // The draft is committed to `terms` only on blur.
  const [inputDraft, setInputDraft] = useState<Record<string, string>>({});

  const getDraftValue = (accountName: string, field: 'apr' | 'min_payment', termValue: number): string => {
    const key = `${accountName}-${field}`;
    return inputDraft[key] ?? termValue.toFixed(2);
  };

  // ── Field update handlers ─────────────────────────────────────────────────
  const onNumberChange = (accountName: string, field: 'apr' | 'min_payment', raw: string) => {
    setInputDraft(prev => ({ ...prev, [`${accountName}-${field}`]: raw }));
    setSaveState('idle'); setSaveError(null);
  };

  const onNumberBlur = (index: number, accountName: string, field: 'apr' | 'min_payment') => {
    const key = `${accountName}-${field}`;
    const raw = inputDraft[key];
    if (raw === undefined) return;
    const value = parseFloat(raw);
    setTerms(prev => prev.map((t, i) =>
      i === index ? { ...t, [field]: isNaN(value) ? 0 : value, is_custom: true } : t
    ));
    setInputDraft(prev => { const next = { ...prev }; delete next[key]; return next; });
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
    } catch (e) {
      const msg = (e as Error).message;
      setSaveState('error');
      setSaveError(msg);
      onError(msg);
    }
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
                      value={getDraftValue(term.account_name, 'apr', term.apr)}
                      onChange={e => onNumberChange(term.account_name, 'apr', e.target.value)}
                      onBlur={() => onNumberBlur(flatIdx, term.account_name, 'apr')}
                      onMouseDown={e => e.stopPropagation()}
                      style={inputStyle}
                    />

                    {/* Min payment */}
                    <input
                      type="number" min="0" step="1"
                      value={getDraftValue(term.account_name, 'min_payment', term.min_payment)}
                      onChange={e => onNumberChange(term.account_name, 'min_payment', e.target.value)}
                      onBlur={() => onNumberBlur(flatIdx, term.account_name, 'min_payment')}
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
// System Logs sub-menu
// ---------------------------------------------------------------------------

interface LogsResponse { lines: string[]; total: number; }

function levelStyle(line: string): React.CSSProperties {
  if (line.includes('  ERROR   ') || line.includes('  ERROR  '))   return { color: '#ef4444' };
  if (line.includes('  WARNING ') || line.includes('  WARNING'))   return { color: '#f59e0b' };
  if (line.includes('  DEBUG   ') || line.includes('  DEBUG  '))   return { color: 'var(--text-muted)', opacity: 0.55 };
  return { color: 'var(--text-secondary)' };
}

function SystemLogsSection() {
  const [open,     setOpen]     = useState(false);
  const [logs,     setLogs]     = useState<LogsResponse | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [lineCount, setLineCount] = useState(200);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async (n: number) => {
    setFetching(true);
    setFetchErr(null);
    try {
      const r = await fetch(`${API}/api/logs?lines=${n}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json() as LogsResponse;
      setLogs(data);
    } catch (e) {
      setFetchErr((e as Error).message);
    } finally {
      setFetching(false);
    }
  }, []);

  // Fetch on first open, or when lineCount changes while open
  useEffect(() => {
    if (open) fetchLogs(lineCount);
  }, [open, lineCount, fetchLogs]);

  // Scroll to bottom when new log lines arrive
  useEffect(() => {
    if (logs) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const inputStyle: React.CSSProperties = {
    padding: '0.25rem 0.5rem', borderRadius: '0.375rem',
    border: '1px solid var(--border-subtle)', background: 'var(--bg-base)',
    color: 'var(--text-primary)', fontSize: '0.8125rem', outline: 'none',
  };

  // Memoize colored lines so they only recompute when log data changes
  const coloredLines = useMemo(
    () => logs?.lines ?? [],
    [logs],
  );

  return (
    <div>
      {/* ── Sub-menu header (clickable accordion) ── */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', padding: '0.75rem 1rem',
          background: open
            ? 'color-mix(in srgb, var(--accent-blue) 6%, var(--bg-surface))'
            : 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: open ? '0.625rem 0.625rem 0 0' : '0.625rem',
          cursor: 'pointer', textAlign: 'left',
          transition: 'background 0.15s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <span style={{ fontSize: '1rem' }}>📋</span>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            System Logs
          </span>
          {logs && (
            <span style={{
              fontSize: '0.6875rem', fontWeight: 600, color: 'var(--accent-blue)',
              background: 'color-mix(in srgb, var(--accent-blue) 12%, transparent)',
              padding: '0.1rem 0.4rem', borderRadius: '999px',
            }}>
              {logs.total.toLocaleString()} total lines
            </span>
          )}
        </div>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease', flexShrink: 0 }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* ── Expanded panel ── */}
      {open && (
        <div style={{
          border: '1px solid var(--border-subtle)', borderTop: 'none',
          borderRadius: '0 0 0.625rem 0.625rem',
          background: 'var(--bg-surface)',
          overflow: 'hidden',
        }}>
          {/* Toolbar */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            padding: '0.625rem 1rem',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--bg-muted)',
            flexWrap: 'wrap',
          }}>
            <label style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              Show last
              <select
                value={lineCount}
                onChange={e => setLineCount(Number(e.target.value))}
                style={{ ...inputStyle, marginLeft: 4 }}
              >
                {[100, 200, 500, 1000].map(n => (
                  <option key={n} value={n}>{n} lines</option>
                ))}
              </select>
            </label>
            <button
              onClick={() => fetchLogs(lineCount)}
              disabled={fetching}
              style={{
                padding: '0.3rem 0.75rem', borderRadius: '0.375rem',
                border: '1px solid var(--border-subtle)',
                background: fetching ? 'var(--bg-muted)' : 'var(--bg-base)',
                color: fetching ? 'var(--text-muted)' : 'var(--text-secondary)',
                fontSize: '0.8125rem', cursor: fetching ? 'default' : 'pointer',
              }}
            >
              {fetching ? 'Refreshing…' : '↻ Refresh'}
            </button>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
              INFO · <span style={{ color: '#f59e0b' }}>WARNING</span> · <span style={{ color: '#ef4444' }}>ERROR</span>
            </span>
          </div>

          {/* Log viewer */}
          {fetchErr ? (
            <p style={{ fontSize: '0.8125rem', color: '#ef4444', padding: '1rem', margin: 0 }}>
              {fetchErr}
            </p>
          ) : coloredLines.length === 0 && !fetching ? (
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', padding: '1rem', margin: 0 }}>
              No log entries yet. The log file is created on the first API request.
            </p>
          ) : (
            <div style={{
              maxHeight: 360, overflowY: 'auto', overflowX: 'auto',
              padding: '0.75rem 1rem',
              fontFamily: 'ui-monospace, monospace', fontSize: '0.75rem', lineHeight: 1.55,
            }}>
              {coloredLines.map((line, i) => (
                <div key={i} style={levelStyle(line)}>{line || '\u00A0'}</div>
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SettingsTab
// ---------------------------------------------------------------------------

export function SettingsTab({ activeTheme, onThemeChange, onRefresh }: SettingsTabProps) {
  const [globalErrors, setGlobalErrors] = useState<string[]>([]);

  const addError = useCallback((msg: string) => {
    console.error('[SettingsTab]', msg);
    setGlobalErrors(prev => [...prev, msg]);
  }, []);

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
      <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
        Customize your dashboard appearance and configure debt forecasting parameters.
      </p>

      {/* ── Global error banner ── */}
      {globalErrors.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: '0.75rem', padding: '0.75rem 1rem', marginBottom: '1.5rem',
          background: 'color-mix(in srgb, #ef4444 10%, transparent)',
          border: '1px solid color-mix(in srgb, #ef4444 30%, transparent)',
          borderRadius: '0.5rem',
        }}>
          <div style={{ fontSize: '0.8125rem', color: '#ef4444', lineHeight: 1.5 }}>
            {globalErrors.map((msg, i) => <div key={i}>{msg}</div>)}
          </div>
          <button
            onClick={() => setGlobalErrors([])}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '1rem', lineHeight: 1, flexShrink: 0, padding: '0 0.25rem' }}
            aria-label="Dismiss errors"
          >✕</button>
        </div>
      )}

      {/* ── Household Members ── */}
      <h2 style={sectionHeader}>Household Members</h2>
      <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
        Rename household members. These profiles link to retirement accounts and income sources.
      </p>
      <HouseholdMembersSection />

      <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '2rem 0' }} />

      {/* ── Workspace Access ── */}
      <h2 style={sectionHeader}>Workspace Access</h2>
      <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
        Manage which household members have access to each financial workspace. Admins can
        edit data; Viewers can only read.
      </p>
      <WorkspaceAccessSection />

      <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '2rem 0' }} />

      {/* ── Data Import ── */}
      <h2 style={sectionHeader}>Data Import</h2>
      <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
        Drop CSV exports here to refresh the dashboard. Monarch exports
        (Transactions_*, Balances_*) replace existing files of the same type
        automatically. Brokerage equity exports (Equity_*, RSU_*) refresh vesting
        data on a per-ticker basis — only brokerage-imported rows for that ticker
        are replaced, so manually entered grants are never overwritten.
      </p>
      <DataImportSection onRefresh={onRefresh} onError={addError} />

      <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '2rem 0' }} />

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
      <DebtConfigSection onRefresh={onRefresh} onError={addError} />

      <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '2rem 0' }} />

      {/* ── System Logs ── */}
      <h2 style={sectionHeader}>System Logs</h2>
      <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
        View the latest backend request and error logs. Useful for diagnosing API issues.
      </p>
      <SystemLogsSection />

      <div style={{ height: '2rem' }} />
    </div>
  );
}
