# Phase 7 — Access Management UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich `GET /api/ledgers` to embed member data, add a "Workspace & Access Management" section to SettingsTab, and build a `ShareLedgerModal` so users can grant access to household members.

**Architecture:** Backend adds `LedgerMember` / `LedgerWithMembers` Pydantic models and performs a two-step join (LedgerAccess → UserProfile) inside `list_ledgers`. Frontend updates the `Ledger` TypeScript interface, adds a new `WorkspaceAccessSection` sub-component to `SettingsTab.tsx`, and a new `ShareLedgerModal.tsx` (Framer Motion + Tailwind v4 only — no inline styles).

**Tech Stack:** FastAPI + SQLModel (backend), React 19 + TanStack Query v5 + Framer Motion + Tailwind v4 CSS vars (frontend), pytest + TestClient (tests).

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `backend/models.py` | Add `LedgerMember` (Pydantic) and `LedgerWithMembers` response models |
| Modify | `backend/routers/ledgers.py` | Enrich `GET /api/ledgers` with members join; update response shape |
| Modify | `tests/test_ledgers_api.py` | Update shape test + add members coverage |
| Modify | `frontend/src/types.ts` | Update `Ledger` interface; add `LedgerSharePayload` type |
| Modify | `frontend/src/pages/SettingsTab.tsx` | Add `WorkspaceAccessSection` sub-component + wire into layout |
| Create | `frontend/src/components/modals/ShareLedgerModal.tsx` | Framer Motion modal, Tailwind v4 only, useMutation to share endpoint |

---

## Task 1 — Backend models: LedgerMember + LedgerWithMembers

**Files:**
- Modify: `backend/models.py` (around line 264 — the Ledger API schemas block)

### Context
`LedgerMember` is a plain Pydantic `BaseModel` (not a SQLModel table) that represents one row of the embedded members list. `LedgerWithMembers` is the full API response shape for each item in `GET /api/ledgers`.

- [ ] **Step 1: Add the two models to `backend/models.py`**

Locate the comment `# Pydantic schemas for the Ledger API` (currently around line 264).
Insert **after** the existing `LedgerShare` class:

```python
class LedgerMember(BaseModel):
    user_id: int
    name:    str
    role:    str   # 'admin' | 'viewer'


class LedgerWithMembers(BaseModel):
    id:      int
    name:    str
    type:    str
    members: list[LedgerMember]
```

- [ ] **Step 2: Verify the file parses cleanly**

```bash
cd "C:\Users\steve\OneDrive\Desktop\IDocs\Pv\Finance\March"
call venv\Scripts\activate && python -c "from backend.models import LedgerWithMembers, LedgerMember; print('OK')"
```
Expected output: `OK`

---

## Task 2 — Backend route: enrich GET /api/ledgers

**Files:**
- Modify: `backend/routers/ledgers.py` (the `list_ledgers` function, lines 15–27)

### Context
Currently `list_ledgers` makes two queries (access rows → ledger rows) and returns `{"id", "name", "type"}`. We need a third query to pull all `LedgerAccess` rows for those ledger IDs, join to `UserProfile.name`, then group by ledger before serializing.

- [ ] **Step 1: Update imports at the top of `backend/routers/ledgers.py`**

Add `LedgerWithMembers` and `LedgerMember` to the models import line:

```python
from backend.models import Ledger, LedgerAccess, LedgerCreate, LedgerShare, LedgerWithMembers, LedgerMember, UserProfile
```

- [ ] **Step 2: Replace the `list_ledgers` function body**

```python
@router.get("/api/ledgers")
def list_ledgers(user_id: int, session: Session = Depends(get_db)) -> JSONResponse:
    """Return every ledger the given user has access to, with embedded member list."""
    # 1. Which ledgers can this user see?
    access_rows = session.exec(
        select(LedgerAccess).where(LedgerAccess.user_id == user_id)
    ).all()
    ledger_ids = [row.ledger_id for row in access_rows]
    if not ledger_ids:
        return JSONResponse(content=[])

    # 2. Fetch the ledger rows.
    ledgers = session.exec(
        select(Ledger).where(Ledger.id.in_(ledger_ids)).order_by(Ledger.id)  # type: ignore[union-attr]
    ).all()

    # 3. Fetch ALL access rows for these ledgers (not just the requesting user).
    all_access = session.exec(
        select(LedgerAccess).where(LedgerAccess.ledger_id.in_(ledger_ids))  # type: ignore[union-attr]
    ).all()

    # 4. Resolve user names in one batch query.
    member_user_ids = list({row.user_id for row in all_access})
    profiles = session.exec(
        select(UserProfile).where(UserProfile.id.in_(member_user_ids))  # type: ignore[union-attr]
    ).all()
    name_map: dict[int, str] = {p.id: p.name for p in profiles if p.id is not None}

    # 5. Group access rows by ledger_id.
    from collections import defaultdict
    members_by_ledger: dict[int, list[LedgerMember]] = defaultdict(list)
    for row in all_access:
        members_by_ledger[row.ledger_id].append(
            LedgerMember(user_id=row.user_id, name=name_map.get(row.user_id, "Unknown"), role=row.role)
        )

    # 6. Build the enriched response.
    result = [
        LedgerWithMembers(
            id=l.id,           # type: ignore[arg-type]
            name=l.name,
            type=l.type,
            members=members_by_ledger.get(l.id, []),
        ).model_dump()
        for l in ledgers
    ]
    return JSONResponse(content=result)
```

- [ ] **Step 3: Verify the module loads cleanly**

```bash
call venv\Scripts\activate && python -c "from backend.routers.ledgers import router; print('OK')"
```
Expected output: `OK`

---

## Task 3 — Tests: update shape test + add members coverage

**Files:**
- Modify: `tests/test_ledgers_api.py`

### Context
`test_get_ledgers_response_shape` currently asserts `set(ledger.keys()) == {"id", "name", "type"}`. This will **fail** once members are added — update it first (TDD: write the new assertion, watch it pass after the route change). Also add two new tests verifying member content.

- [ ] **Step 1: Update `test_get_ledgers_response_shape`**

Find the existing function and replace it:

```python
def test_get_ledgers_response_shape(client):
    """Each ledger entry exposes id, name, type, and members list."""
    r = client.get("/api/ledgers?user_id=1")
    assert r.status_code == 200
    ledger = r.json()[0]
    assert {"id", "name", "type", "members"} <= set(ledger.keys())
    assert isinstance(ledger["members"], list)
```

- [ ] **Step 2: Add a test verifying Household has both members embedded**

```python
def test_get_ledgers_household_members_embedded(client):
    """Household ledger (id=1) should embed both Steven (admin) and Wife (admin)."""
    r = client.get("/api/ledgers?user_id=1")
    assert r.status_code == 200
    household = next(l for l in r.json() if l["name"] == "Household")
    member_names = {m["name"] for m in household["members"]}
    member_roles = {m["role"] for m in household["members"]}
    assert member_names == {"Steven", "Wife"}
    assert member_roles == {"admin"}


def test_get_ledgers_private_ledger_has_one_member(client):
    """Steven Private should list only Steven as a member."""
    r = client.get("/api/ledgers?user_id=1")
    assert r.status_code == 200
    private = next(l for l in r.json() if l["name"] == "Steven Private")
    assert len(private["members"]) == 1
    assert private["members"][0]["name"] == "Steven"
    assert private["members"][0]["role"] == "admin"


def test_get_ledgers_member_fields(client):
    """Each member object must have user_id, name, and role keys."""
    r = client.get("/api/ledgers?user_id=1")
    member = r.json()[0]["members"][0]
    assert set(member.keys()) == {"user_id", "name", "role"}
```

- [ ] **Step 3: Run the full ledger test suite and confirm all pass**

```bash
call venv\Scripts\activate && pytest tests/test_ledgers_api.py -v
```
Expected: all tests **PASS** (including the updated shape test).

- [ ] **Step 4: Commit the backend changes**

```bash
git add backend/models.py backend/routers/ledgers.py tests/test_ledgers_api.py
git commit -m "feat: enrich GET /api/ledgers with embedded members list"
```

---

## Task 4 — Frontend types

**Files:**
- Modify: `frontend/src/types.ts`

### Context
The `Ledger` interface at line 1 currently has `{ id, name, type }`. We extend it with `members`. We also add a `LedgerSharePayload` type used by the modal mutation.

- [ ] **Step 1: Update the `Ledger` interface**

Find:
```typescript
export interface Ledger {
  id: number;
  name: string;
  type: 'joint' | 'personal' | 'business';
}
```

Replace with:
```typescript
export interface LedgerMember {
  user_id: number;
  name:    string;
  role:    string;  // 'admin' | 'viewer'
}

export interface Ledger {
  id:      number;
  name:    string;
  type:    'joint' | 'personal' | 'business';
  members: LedgerMember[];
}

export interface LedgerSharePayload {
  user_id: number;
  role:    'admin' | 'viewer';
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "C:\Users\steve\OneDrive\Desktop\IDocs\Pv\Finance\March"
npm run build 2>&1 | tail -10
```
Expected: build succeeds (0 type errors for this change — `Ledger` is not yet consumed with a `members` property anywhere).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types.ts
git commit -m "feat: add LedgerMember, LedgerSharePayload types; extend Ledger with members"
```

---

## Task 5 — ShareLedgerModal component

**Files:**
- Create: `frontend/src/components/modals/ShareLedgerModal.tsx`

### Context
A Framer Motion dialog (same overlay + panel pattern as `RetirementModal.tsx`). **All styling via Tailwind v4 utility classes** — no `style={{...}}` objects anywhere. Uses CSS variable arbitrary values like `bg-[var(--bg-surface)]`, `text-[var(--text-primary)]`, `border-[var(--border-subtle)]`.

Props:
```ts
interface ShareLedgerModalProps {
  ledgerId:   number;
  ledgerName: string;
  profiles:   UserProfile[];
  onClose:    () => void;
}
```

The modal renders a two-field form (User select + Role select). On submit it fires `POST /api/ledgers/{id}/share` and on success calls `queryClient.invalidateQueries({ queryKey: ['ledgers'] })` then `onClose()`.

- [ ] **Step 1: Create `frontend/src/components/modals/ShareLedgerModal.tsx`**

```tsx
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UserProfile, LedgerSharePayload } from '../../types';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

interface ShareLedgerModalProps {
  ledgerId:   number;
  ledgerName: string;
  profiles:   UserProfile[];
  onClose:    () => void;
}

export function ShareLedgerModal({ ledgerId, ledgerName, profiles, onClose }: ShareLedgerModalProps) {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string>(String(profiles[0]?.id ?? ''));
  const [role,   setRole]   = useState<'admin' | 'viewer'>('viewer');
  const [error,  setError]  = useState<string | null>(null);

  const shareMutation = useMutation({
    mutationFn: (payload: LedgerSharePayload) =>
      fetch(`${API}/api/ledgers/${ledgerId}/share`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      }).then(r => {
        if (!r.ok) return r.json().then(e => Promise.reject(new Error(e.detail ?? `HTTP ${r.status}`)));
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ledgers'] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!userId) return;
    shareMutation.mutate({ user_id: Number(userId), role });
  };

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/50"
      />

      {/* Panel */}
      <motion.div
        key="panel"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
      >
        <div
          className="pointer-events-auto w-full max-w-sm rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-xl"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                Manage Access
              </h2>
              <p className="mt-0.5 text-sm text-[var(--text-muted)]">{ledgerName}</p>
            </div>
            <button
              onClick={onClose}
              className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-secondary)] transition-colors"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* User select */}
            <div>
              <label className="mb-1.5 block text-[0.8125rem] font-semibold text-[var(--text-secondary)]">
                Household Member
              </label>
              <select
                value={userId}
                onChange={e => setUserId(e.target.value)}
                className="w-full rounded-[0.4375rem] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2 text-[0.9375rem] text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)]"
              >
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Role select */}
            <div>
              <label className="mb-1.5 block text-[0.8125rem] font-semibold text-[var(--text-secondary)]">
                Role
              </label>
              <select
                value={role}
                onChange={e => setRole(e.target.value as 'admin' | 'viewer')}
                className="w-full rounded-[0.4375rem] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2 text-[0.9375rem] text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)]"
              >
                <option value="viewer">Viewer — can see this workspace</option>
                <option value="admin">Admin — can manage this workspace</option>
              </select>
            </div>

            {/* Error */}
            {error && (
              <p className="text-sm text-[var(--accent-red)]">{error}</p>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-[var(--border-subtle)] px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-surface-2)] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={shareMutation.isPending || !userId}
                className="rounded-md bg-[var(--accent-blue)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 hover:opacity-90 transition-opacity"
              >
                {shareMutation.isPending ? 'Granting…' : 'Grant Access'}
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build 2>&1 | tail -15
```
Expected: 0 type errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/modals/ShareLedgerModal.tsx
git commit -m "feat: add ShareLedgerModal (Framer Motion + Tailwind v4)"
```

---

## Task 6 — WorkspaceAccessSection + wire into SettingsTab

**Files:**
- Modify: `frontend/src/pages/SettingsTab.tsx`

### Context
Add a new `WorkspaceAccessSection` sub-component directly above the `// Theme section` block (i.e., below `HouseholdMembersSection` in render order). It:

1. Calls `useQuery(['ledgers'], () => fetch('/api/ledgers?user_id=1').then(r => r.json()))`.
2. Renders each ledger as a card with name, type badge, member avatar row, and a "Manage Access" button.
3. Clicking "Manage Access" sets `sharingLedger` state and renders `<ShareLedgerModal>`.
4. `profiles` are passed in from a parent `useQuery(['profiles'])` call — but `WorkspaceAccessSection` fetches them independently via `useQuery` so it's self-contained (same as `HouseholdMembersSection`).

The section uses the same inline style pattern as the rest of SettingsTab (CSS var inline styles) to stay consistent with the surrounding code.

- [ ] **Step 1: Add the import for `ShareLedgerModal` at the top of `SettingsTab.tsx`**

After the existing imports, add:
```tsx
import { ShareLedgerModal } from '../components/modals/ShareLedgerModal';
import type { Ledger } from '../types';
```

- [ ] **Step 2: Add the `WorkspaceAccessSection` sub-component**

Insert the following block immediately before the `// ---------------------------------------------------------------------------` comment that precedes `// Theme section` (around line 378):

```tsx
// ---------------------------------------------------------------------------
// Workspace & Access Management section
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<string, string> = {
  joint:    'Joint',
  personal: 'Personal',
  business: 'Business',
};

const TYPE_COLORS: Record<string, string> = {
  joint:    'var(--accent-blue)',
  personal: 'var(--accent-green)',
  business: 'var(--accent-purple)',
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(w => w.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');
}

const AVATAR_COLORS = [
  'var(--accent-blue)',
  'var(--accent-green)',
  'var(--accent-purple)',
  'var(--accent-yellow)',
];

function WorkspaceAccessSection() {
  const queryClient = useQueryClient();
  const [sharingLedger, setSharingLedger] = useState<Ledger | null>(null);

  const { data: profiles = [] } = useQuery<UserProfile[]>({
    queryKey: ['profiles'],
    queryFn: () => fetch(`${API}/api/profiles`).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }),
  });

  const { data: ledgers = [], isLoading } = useQuery<Ledger[]>({
    queryKey: ['ledgers'],
    queryFn: () => fetch(`${API}/api/ledgers?user_id=1`).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }),
  });

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
            {/* Card header: name + type badge */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.875rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {ledger.name}
                </span>
                <span style={{
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  padding: '0.125rem 0.5rem',
                  borderRadius: '0.25rem',
                  background: `color-mix(in srgb, ${TYPE_COLORS[ledger.type] ?? 'var(--accent-blue)'} 12%, transparent)`,
                  color: TYPE_COLORS[ledger.type] ?? 'var(--accent-blue)',
                }}>
                  {TYPE_LABELS[ledger.type] ?? ledger.type}
                </span>
              </div>

              {/* Manage Access button */}
              <button
                onClick={() => setSharingLedger(ledger)}
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
            </div>

            {/* Members row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              {ledger.members.length === 0 ? (
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>No members yet.</span>
              ) : (
                ledger.members.map((member, i) => (
                  <div
                    key={member.user_id}
                    title={`${member.name} — ${member.role}`}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}
                  >
                    {/* Avatar circle */}
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                      background: AVATAR_COLORS[i % AVATAR_COLORS.length],
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.75rem', fontWeight: 700, color: '#fff',
                    }}>
                      {getInitials(member.name)}
                    </div>
                    {/* Name + role */}
                    <div>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                        {member.name}
                      </span>
                      <span style={{
                        marginLeft: '0.375rem',
                        fontSize: '0.6875rem',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.03em',
                        color: member.role === 'admin' ? 'var(--accent-blue)' : 'var(--text-muted)',
                      }}>
                        {member.role}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Share modal */}
      {sharingLedger && (
        <ShareLedgerModal
          ledgerId={sharingLedger.id}
          ledgerName={sharingLedger.name}
          profiles={profiles}
          onClose={() => setSharingLedger(null)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 3: Wire `WorkspaceAccessSection` into the `SettingsTab` render**

In the `SettingsTab` JSX (around line 1033, after `<HouseholdMembersSection />`), add the new section **between** the Household Members section and its trailing divider:

Find:
```tsx
      <HouseholdMembersSection />

      <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '2rem 0' }} />

      {/* ── Data Import ── */}
```

Replace with:
```tsx
      <HouseholdMembersSection />

      <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '2rem 0' }} />

      {/* ── Workspace & Access Management ── */}
      <h2 style={sectionHeader}>Workspace &amp; Access Management</h2>
      <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
        Control which household members can access each financial workspace. Use 'Manage Access' to grant or update roles.
      </p>
      <WorkspaceAccessSection />

      <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '2rem 0' }} />

      {/* ── Data Import ── */}
```

- [ ] **Step 4: Build and verify**

```bash
npm run build 2>&1 | tail -20
```
Expected: clean build, 0 type errors.

- [ ] **Step 5: Run all backend tests one final time**

```bash
call venv\Scripts\activate && pytest tests/ -v --tb=short 2>&1 | tail -30
```
Expected: all tests pass.

- [ ] **Step 6: Commit everything**

```bash
git add frontend/src/pages/SettingsTab.tsx frontend/src/types.ts
git commit -m "feat: Phase 7 final — Workspace Access Management UI with ShareLedgerModal"
```

---

## Acceptance Checklist

- [ ] `GET /api/ledgers?user_id=1` returns `members: [{ user_id, name, role }]` for each ledger
- [ ] All `tests/test_ledgers_api.py` tests pass (including updated shape test + 3 new members tests)
- [ ] `frontend/src/types.ts` exports `LedgerMember`, updated `Ledger`, and `LedgerSharePayload`
- [ ] Settings tab "Workspace & Access Management" section renders ledger cards with member avatars
- [ ] Clicking "Manage Access" opens `ShareLedgerModal` pre-populated with household profiles
- [ ] Submitting the modal fires `POST /api/ledgers/{id}/share`, invalidates `['ledgers']` query, closes modal
- [ ] `ShareLedgerModal` uses **zero** inline `style={{...}}` objects — all Tailwind v4 classes
- [ ] `npm run build` succeeds cleanly
