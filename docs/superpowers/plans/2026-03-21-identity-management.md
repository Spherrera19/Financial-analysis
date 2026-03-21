# Identity Management & Access UI Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every hardcoded `user_id=1` reference with a real `UserContext`, add `POST /api/profiles` (auto-creates a Personal ledger), wire a User Switcher into TopBar, add "Add Member" to Settings, and fix ShareLedgerModal error handling.

**Architecture:** A new `UserContext` (localStorage-persisted) sits above `LedgerContext` in the provider tree so LedgerContext can call `useUser()` for its fetch. The React Query key for ledgers becomes `['ledgers', activeUserId]` so swapping users auto-refetches. ShareLedgerModal becomes self-sufficient by fetching profiles internally.

**Tech Stack:** FastAPI + SQLModel (backend), React 19 + TypeScript + @tanstack/react-query v5 + Framer Motion (frontend), pytest + FastAPI TestClient (tests).

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `backend/models.py` | Add `UserProfileCreate` Pydantic schema |
| Modify | `backend/routers/profiles.py` | Add `POST /api/profiles` — creates user + Personal ledger + admin access |
| Modify | `tests/test_profiles_api.py` | Tests for the new POST endpoint |
| **Create** | `frontend/src/context/UserContext.tsx` | Active-user state + localStorage persistence |
| Modify | `frontend/src/main.tsx` | Wrap in `<UserProvider>` above `<LedgerProvider>` |
| Modify | `frontend/src/types.ts` | Add `UserProfileCreate` interface |
| Modify | `frontend/src/context/LedgerContext.tsx` | Consume `useUser()`, use `['ledgers', activeUserId]` query key |
| Modify | `frontend/src/components/layout/TopBar.tsx` | Add User Switcher dropdown (User icon, list all profiles) |
| Modify | `frontend/src/components/modals/ShareLedgerModal.tsx` | Remove `profiles` prop; fetch internally; add error state |
| Modify | `frontend/src/pages/SettingsTab.tsx` | Add Member form; use activeUserId in ledger fetch; hide Manage Access for non-admins; remove profiles prop passthrough |

---

### Task 1: Backend — `UserProfileCreate` model + `POST /api/profiles`

**Files:**
- Modify: `backend/models.py` (after `UserProfileUpdate` ~line 218)
- Modify: `backend/routers/profiles.py`

- [ ] **Step 1: Add `UserProfileCreate` to `backend/models.py`**

  Insert immediately after `UserProfileUpdate`:

  ```python
  class UserProfileCreate(BaseModel):
      """Payload for creating a new household member."""
      name: str
  ```

- [ ] **Step 2: Write the failing tests in `tests/test_profiles_api.py`**

  Append to the file (the existing `client` fixture applies):

  ```python
  # ── POST /api/profiles ────────────────────────────────────────────────────────

  def test_post_profile_creates_user(client):
      """POST /api/profiles creates a new UserProfile and returns it."""
      r = client.post("/api/profiles", json={"name": "Alex"})
      assert r.status_code == 201
      body = r.json()
      assert body["name"] == "Alex"
      assert body["id"] is not None
      assert body["is_primary"] is False


  def test_post_profile_appears_in_list(client):
      """New profile is returned by GET /api/profiles."""
      client.post("/api/profiles", json={"name": "Alex"})
      names = {p["name"] for p in client.get("/api/profiles").json()}
      assert "Alex" in names


  def test_post_profile_creates_personal_ledger(client):
      """Creating a profile auto-creates a Personal ledger with admin access."""
      r = client.post("/api/profiles", json={"name": "Alex"})
      user_id = r.json()["id"]

      ledgers_r = client.get(f"/api/ledgers?user_id={user_id}")
      assert ledgers_r.status_code == 200
      ledgers = ledgers_r.json()
      assert len(ledgers) == 1
      assert ledgers[0]["type"] == "personal"
      assert ledgers[0]["name"] == "Alex's Personal"


  def test_post_profile_new_user_has_admin_access(client):
      """New user has admin role in their auto-created ledger."""
      r = client.post("/api/profiles", json={"name": "Alex"})
      user_id = r.json()["id"]

      ledgers = client.get(f"/api/ledgers?user_id={user_id}").json()
      member = next(m for m in ledgers[0]["members"] if m["user_id"] == user_id)
      assert member["role"] == "admin"


  def test_post_profile_missing_name_returns_422(client):
      """POST /api/profiles without a name returns 422 Unprocessable Entity."""
      r = client.post("/api/profiles", json={})
      assert r.status_code == 422
  ```

- [ ] **Step 3: Run tests to confirm they fail**

  ```bash
  cd C:\Users\steve\OneDrive\Desktop\IDocs\Pv\Finance\March
  call venv\Scripts\activate
  pytest tests/test_profiles_api.py -v -k "post_profile" 2>&1
  ```

  Expected: 5 × FAILED (`405 Method Not Allowed` or `404`).

- [ ] **Step 4: Implement `POST /api/profiles` in `backend/routers/profiles.py`**

  Add the import `from backend.models import Ledger, LedgerAccess, UserProfileCreate` to the existing imports line, then append:

  ```python
  @router.post("/api/profiles", status_code=201)
  def create_profile(
      body: UserProfileCreate,
      session: Session = Depends(get_db),
  ) -> JSONResponse:
      """
      Create a new household member.
      Auto-provisions a personal ledger with admin access.
      """
      profile = UserProfile(name=body.name, is_primary=False)
      session.add(profile)
      session.flush()  # populate profile.id

      ledger = Ledger(name=f"{body.name}'s Personal", type="personal")
      session.add(ledger)
      session.flush()  # populate ledger.id

      access = LedgerAccess(user_id=profile.id, ledger_id=ledger.id, role="admin")
      session.add(access)
      session.commit()
      session.refresh(profile)

      return JSONResponse(status_code=201, content=profile.model_dump())
  ```

- [ ] **Step 5: Run tests — expect all 5 to pass**

  ```bash
  pytest tests/test_profiles_api.py -v -k "post_profile" 2>&1
  ```

  Expected: 5 × PASSED.

- [ ] **Step 6: Run full test suite to check for regressions**

  ```bash
  pytest --tb=short 2>&1
  ```

  Expected: all previously-passing tests still pass.

- [ ] **Step 7: Commit**

  ```bash
  git add backend/models.py backend/routers/profiles.py tests/test_profiles_api.py
  git commit -m "feat: POST /api/profiles — create member with Personal ledger + admin access"
  ```

---

### Task 2: Frontend — `UserContext` + types + `main.tsx` wiring

**Files:**
- Create: `frontend/src/context/UserContext.tsx`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/types.ts`

- [ ] **Step 1: Add `UserProfileCreate` to `frontend/src/types.ts`**

  Append after the `UserProfile` interface (around line 193):

  ```typescript
  export interface UserProfileCreate {
    name: string;
  }
  ```

- [ ] **Step 2: Create `frontend/src/context/UserContext.tsx`**

  ```typescript
  import { createContext, useContext, useState, type ReactNode } from 'react';

  const STORAGE_KEY = 'activeUserId';

  interface UserContextValue {
    activeUserId: number;
    setActiveUserId: (id: number) => void;
  }

  const UserContext = createContext<UserContextValue | null>(null);

  export function UserProvider({ children }: { children: ReactNode }) {
    const [activeUserId, setActiveUserIdState] = useState<number>(() => {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? Number(stored) : 1;
    });

    const setActiveUserId = (id: number) => {
      localStorage.setItem(STORAGE_KEY, String(id));
      setActiveUserIdState(id);
    };

    return (
      <UserContext.Provider value={{ activeUserId, setActiveUserId }}>
        {children}
      </UserContext.Provider>
    );
  }

  export function useUser(): UserContextValue {
    const ctx = useContext(UserContext);
    if (!ctx) throw new Error('useUser must be used inside <UserProvider>');
    return ctx;
  }
  ```

- [ ] **Step 3: Update `frontend/src/main.tsx`** — wrap with `UserProvider` *outside* `LedgerProvider` so LedgerProvider can call `useUser()`:

  ```typescript
  import { StrictMode } from 'react'
  import { createRoot } from 'react-dom/client'
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
  import './index.css'
  import App from './App.tsx'
  import { ErrorBoundary } from './components/layout'
  import { LedgerProvider } from './context/LedgerContext'
  import { UserProvider } from './context/UserContext'

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
      },
    },
  })

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <UserProvider>
            <LedgerProvider>
              <App />
            </LedgerProvider>
          </UserProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </StrictMode>,
  )
  ```

- [ ] **Step 4: Type-check**

  ```bash
  cd C:\Users\steve\OneDrive\Desktop\IDocs\Pv\Finance\March\frontend
  npx tsc --noEmit 2>&1
  ```

  Expected: no errors.

- [ ] **Step 5: Commit**

  ```bash
  cd C:\Users\steve\OneDrive\Desktop\IDocs\Pv\Finance\March
  git add frontend/src/context/UserContext.tsx frontend/src/main.tsx frontend/src/types.ts
  git commit -m "feat: UserContext with localStorage persistence for activeUserId"
  ```

---

### Task 3: Wire `UserContext` into `LedgerContext`

**Files:**
- Modify: `frontend/src/context/LedgerContext.tsx`

- [ ] **Step 1: Update `LedgerContext.tsx`** — consume `useUser()` and key the query by `activeUserId`

  Replace the entire file:

  ```typescript
  import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
  import { useQuery } from '@tanstack/react-query';
  import type { Ledger } from '../types';
  import { useUser } from './UserContext';

  const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

  interface LedgerContextValue {
    ledgers: Ledger[];
    selectedLedgerId: number | null;
    setSelectedLedgerId: (id: number) => void;
  }

  const LedgerContext = createContext<LedgerContextValue | null>(null);

  export function LedgerProvider({ children }: { children: ReactNode }) {
    const { activeUserId } = useUser();
    const [selectedLedgerId, setSelectedLedgerId] = useState<number | null>(null);

    const { data: ledgers = [] } = useQuery<Ledger[]>({
      queryKey: ['ledgers', activeUserId],
      queryFn: () =>
        fetch(`${API}/api/ledgers?user_id=${activeUserId}`)
          .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
      staleTime: 5 * 60_000,
    });

    // Reset ledger selection when user changes
    useEffect(() => {
      setSelectedLedgerId(null);
    }, [activeUserId]);

    // Auto-select Household (or first) ledger when ledgers load
    useEffect(() => {
      if (ledgers.length > 0 && selectedLedgerId === null) {
        const household = ledgers.find(l => l.name === 'Household');
        setSelectedLedgerId(household?.id ?? ledgers[0].id);
      }
    }, [ledgers, selectedLedgerId]);

    return (
      <LedgerContext.Provider value={{ ledgers, selectedLedgerId, setSelectedLedgerId }}>
        {children}
      </LedgerContext.Provider>
    );
  }

  export function useLedger(): LedgerContextValue {
    const ctx = useContext(LedgerContext);
    if (!ctx) throw new Error('useLedger must be used inside <LedgerProvider>');
    return ctx;
  }
  ```

- [ ] **Step 2: Type-check**

  ```bash
  cd C:\Users\steve\OneDrive\Desktop\IDocs\Pv\Finance\March\frontend
  npx tsc --noEmit 2>&1
  ```

  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  cd C:\Users\steve\OneDrive\Desktop\IDocs\Pv\Finance\March
  git add frontend/src/context/LedgerContext.tsx
  git commit -m "fix: LedgerContext uses activeUserId from UserContext instead of hardcoded 1"
  ```

---

### Task 4: User Switcher in `TopBar.tsx`

**Files:**
- Modify: `frontend/src/components/layout/TopBar.tsx`

The TopBar already has the period dropdown and ledger switcher using a consistent pattern (ref + useEffect for outside-click, inline styles). Mirror that pattern exactly.

- [ ] **Step 1: Add `UserSwitcher` to `TopBar.tsx`**

  At the top of the file, add to imports:
  ```typescript
  import { useQuery } from '@tanstack/react-query';
  import type { UserProfile } from '../../types';
  import { useUser } from '../../context/UserContext';
  import { User } from 'lucide-react';
  ```

  Add a `userOpen` state, a `userDropdownRef`, and a matching `useEffect` for outside-click (identical to the ledger dropdown pattern).

  Add the User Switcher block in the JSX, after the ledger switcher and before the `marginLeft: 'auto'` export buttons group:

  ```tsx
  {/* User Switcher */}
  <UserSwitcherDropdown />
  ```

  Implement as an internal component at the bottom of the file (above the closing export):

  ```tsx
  function UserSwitcherDropdown() {
    const { activeUserId, setActiveUserId } = useUser();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

    const { data: profiles = [] } = useQuery<UserProfile[]>({
      queryKey: ['profiles'],
      queryFn: () => fetch(`${API}/api/profiles`).then(r => r.json()),
    });

    useEffect(() => {
      function handle(e: MouseEvent | KeyboardEvent) {
        if (e.type === 'keydown' && (e as KeyboardEvent).key === 'Escape') { setOpen(false); return; }
        if (e.type === 'mousedown' && ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
      }
      if (open) {
        document.addEventListener('mousedown', handle);
        document.addEventListener('keydown', handle);
      }
      return () => {
        document.removeEventListener('mousedown', handle);
        document.removeEventListener('keydown', handle);
      };
    }, [open]);

    const activeName = profiles.find(p => p.id === activeUserId)?.name ?? 'User';

    return (
      <div ref={ref} style={{ position: 'relative' }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            minHeight: 44, padding: '0 12px', borderRadius: 8,
            border: '1px solid var(--border-subtle)', background: 'var(--bg-card)',
            color: 'var(--text-primary)', cursor: 'pointer',
            fontSize: '0.875rem', fontWeight: 500, outline: 'none',
            transition: 'border-color 0.15s ease',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent-blue)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-subtle)'; }}
        >
          <User size={15} strokeWidth={2} />
          {activeName}
          <ChevronDown size={14} strokeWidth={2}
            style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}
          />
        </button>

        {open && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0,
            background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
            borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            minWidth: 180, zIndex: 40, overflow: 'hidden',
          }}>
            {profiles.map(profile => (
              <button
                key={profile.id}
                onClick={() => { setActiveUserId(profile.id); setOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', minHeight: 44, padding: '0 14px',
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  color: profile.id === activeUserId ? 'var(--accent-blue)' : 'var(--text-secondary)',
                  fontWeight: profile.id === activeUserId ? 600 : 400,
                  fontSize: '0.875rem', textAlign: 'left', transition: 'background 0.1s ease',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'color-mix(in srgb, var(--text-muted) 10%, transparent)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
              >
                <span>
                  {profile.name}
                  {profile.is_primary && (
                    <span style={{ marginLeft: '0.4rem', fontSize: '0.7rem', opacity: 0.5 }}>primary</span>
                  )}
                </span>
                {profile.id === activeUserId && <Check size={14} strokeWidth={2.5} />}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }
  ```

- [ ] **Step 2: Type-check**

  ```bash
  cd C:\Users\steve\OneDrive\Desktop\IDocs\Pv\Finance\March\frontend
  npx tsc --noEmit 2>&1
  ```

  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  cd C:\Users\steve\OneDrive\Desktop\IDocs\Pv\Finance\March
  git add frontend/src/components/layout/TopBar.tsx
  git commit -m "feat: User Switcher dropdown in TopBar — toggles activeUserId"
  ```

---

### Task 5: Fix `ShareLedgerModal.tsx` — self-sufficient profiles + error handling

**Files:**
- Modify: `frontend/src/components/modals/ShareLedgerModal.tsx`

Remove the `profiles` prop entirely. The modal fetches profiles internally via `useQuery`. Add `error` display from `useMutation`.

- [ ] **Step 1: Replace `ShareLedgerModal.tsx`**

  ```typescript
  import { useState } from 'react';
  import { motion, AnimatePresence } from 'framer-motion';
  import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
  import type { UserProfile } from '../../types';

  const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

  const INPUT = 'w-full px-3 py-2 rounded-md border border-gray-300 bg-white text-gray-900 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500';
  const LABEL = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1';
  const FIELD = 'mb-5';

  interface ShareLedgerModalProps {
    isOpen:     boolean;
    onClose:    () => void;
    ledgerId:   number;
    ledgerName: string;
  }

  async function postShare(ledgerId: number, userId: number, role: string) {
    const res = await fetch(`${API}/api/ledgers/${ledgerId}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, role }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { detail?: string };
      throw new Error(body.detail ?? `Server error (${res.status})`);
    }
    return res.json();
  }

  export function ShareLedgerModal({ isOpen, onClose, ledgerId, ledgerName }: ShareLedgerModalProps) {
    const [selectedUserId, setSelectedUserId] = useState<number | ''>('');
    const [selectedRole,   setSelectedRole]   = useState<'viewer' | 'admin'>('viewer');

    const queryClient = useQueryClient();

    const { data: profiles = [], isLoading: profilesLoading } = useQuery<UserProfile[]>({
      queryKey: ['profiles'],
      queryFn: () => fetch(`${API}/api/profiles`).then(r => r.json()),
      enabled: isOpen,
    });

    // Set default selection once profiles load
    const resolvedUserId = selectedUserId !== '' ? selectedUserId : (profiles[0]?.id ?? '');

    const { mutate, isPending, error, reset } = useMutation({
      mutationFn: () => {
        if (!resolvedUserId) throw new Error('No user selected');
        return postShare(ledgerId, Number(resolvedUserId), selectedRole);
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['ledgers'] });
        setSelectedUserId('');
        setSelectedRole('viewer');
        reset();
        onClose();
      },
    });

    const handleClose = () => { reset(); onClose(); };

    return (
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={handleClose}
          >
            <motion.div
              className="w-full max-w-md rounded-xl bg-white shadow-2xl p-6"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1,    opacity: 1 }}
              exit={{    scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', duration: 0.25 }}
              onClick={e => e.stopPropagation()}
            >
              <h2 className="text-lg font-bold text-gray-900 mb-5">
                Share Workspace: <span className="text-blue-600">{ledgerName}</span>
              </h2>

              {/* User Select */}
              <div className={FIELD}>
                <label className={LABEL}>User</label>
                {profilesLoading ? (
                  <p className="text-sm text-gray-400 italic">Loading members…</p>
                ) : profiles.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">No profiles available.</p>
                ) : (
                  <select
                    className={INPUT}
                    value={resolvedUserId}
                    onChange={e => setSelectedUserId(Number(e.target.value))}
                  >
                    {profiles.map(profile => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name}{profile.is_primary ? ' (Primary)' : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Role Select */}
              <div className={FIELD}>
                <label className={LABEL}>Role</label>
                <select
                  className={INPUT}
                  value={selectedRole}
                  onChange={e => setSelectedRole(e.target.value as 'viewer' | 'admin')}
                >
                  <option value="viewer">Viewer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {/* Error message */}
              {error && (
                <p className="text-sm text-red-600 mb-4 p-2 bg-red-50 rounded-md">
                  {(error as Error).message}
                </p>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 rounded-md text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isPending || profiles.length === 0}
                  onClick={() => mutate()}
                  className="px-4 py-2 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isPending ? 'Sharing…' : 'Share Access'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }
  ```

- [ ] **Step 2: Type-check**

  ```bash
  cd C:\Users\steve\OneDrive\Desktop\IDocs\Pv\Finance\March\frontend
  npx tsc --noEmit 2>&1
  ```

  Expected: errors about `profiles` prop being passed — those will be fixed in Task 6.

- [ ] **Step 3: Commit** (after Task 6 type-check passes)

  Hold this commit until Task 6 clears the callsite type errors.

---

### Task 6: Update `SettingsTab.tsx` — Add Member, activeUserId, access gating, prop cleanup

**Files:**
- Modify: `frontend/src/pages/SettingsTab.tsx`

This task has four sub-changes applied in one edit pass:

1. **Remove** the `profiles` prop from `WorkspaceAccessSection` and from `<ShareLedgerModal>` (modal now self-sufficient).
2. **Remove** the `profiles` query from `SettingsTab` (was only there to pass down).
3. **Wire** `activeUserId` from `useUser()` into `WorkspaceAccessSection`'s ledger fetch and the query key `['ledgers', activeUserId]`.
4. **Gate** the "Manage Access" button: only render it if `activeUserId` has role `'admin'` in `ledger.members`.
5. **Add Member** inline form to `HouseholdMembersSection`.

- [ ] **Step 1: Add `useUser` import and `UserProfileCreate` type import to `SettingsTab.tsx`**

  Change the existing imports block top section:
  ```typescript
  // Add to existing imports:
  import { useUser } from '../context/UserContext';
  import type { UserProfileCreate } from '../types';
  ```

- [ ] **Step 2: Update `HouseholdMembersSection` — Add Member form**

  Inside `HouseholdMembersSection`, after the existing `useMutation` for rename, add:

  ```typescript
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
        if (!r.ok) return r.json().then(e => Promise.reject(new Error(e.detail ?? `HTTP ${r.status}`)));
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
  ```

  Inside the outer `<div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>` wrapper, **after** the `{profiles.map(...)}` expression but **before** the closing `</div>` of that wrapper — so the Add Member UI inherits the `gap: '0.75rem'` spacing:


  ```tsx
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
  ```

- [ ] **Step 3: Update `WorkspaceAccessSection` — use `activeUserId` + admin gate**

  Change the component signature and internal fetch:

  ```typescript
  // Remove 'profiles' from props — modal is now self-sufficient
  function WorkspaceAccessSection() {
    const { activeUserId } = useUser();
    // ...existing state...

    const { data: ledgers = [], isLoading } = useQuery<Ledger[]>({
      queryKey: ['ledgers', activeUserId],   // <-- was ['ledgers']
      queryFn: () => fetch(`${API}/api/ledgers?user_id=${activeUserId}`).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
    });
  ```

  Change the "Manage Access" button render condition:

  ```tsx
  {/* Only admins of this ledger can manage access */}
  {ledger.members.some(m => m.user_id === activeUserId && m.role === 'admin') && (
    <button
      onClick={() => { setSelectedLedger({ id: ledger.id, name: ledger.name }); setIsModalOpen(true); }}
      // ... existing styles unchanged ...
    >
      Manage Access
    </button>
  )}
  ```

  Change `<ShareLedgerModal>` call — remove the `profiles` prop:

  ```tsx
  <ShareLedgerModal
    isOpen={isModalOpen}
    onClose={() => setIsModalOpen(false)}
    ledgerId={selectedLedger?.id ?? 0}
    ledgerName={selectedLedger?.name ?? ''}
  />
  ```

- [ ] **Step 4: Update `SettingsTab` body — remove profiles query + update section call**

  Remove from `SettingsTab`:
  ```typescript
  // DELETE this block entirely — ShareLedgerModal no longer needs profiles passed down
  const { data: profiles = [] } = useQuery<UserProfile[]>({
    queryKey: ['profiles'],
    queryFn: ...
  });
  ```

  Change the `WorkspaceAccessSection` mount — remove the `profiles` prop:
  ```tsx
  <WorkspaceAccessSection />
  ```

- [ ] **Step 5: Type-check (clears Task 5 error too)**

  ```bash
  cd C:\Users\steve\OneDrive\Desktop\IDocs\Pv\Finance\March\frontend
  npx tsc --noEmit 2>&1
  ```

  Expected: no errors.

- [ ] **Step 6: Commit both Task 5 and Task 6 together**

  ```bash
  cd C:\Users\steve\OneDrive\Desktop\IDocs\Pv\Finance\March
  git add frontend/src/components/modals/ShareLedgerModal.tsx frontend/src/pages/SettingsTab.tsx
  git commit -m "feat: Add Member form, activeUserId access gating, ShareLedgerModal self-sufficient profiles"
  ```

---

### Task 7: Build verification + push

- [ ] **Step 1: Full test suite**

  ```bash
  cd C:\Users\steve\OneDrive\Desktop\IDocs\Pv\Finance\March
  call venv\Scripts\activate
  pytest --tb=short 2>&1
  ```

  Expected: all tests pass.

- [ ] **Step 2: Frontend production build**

  ```bash
  cd C:\Users\steve\OneDrive\Desktop\IDocs\Pv\Finance\March
  npm run build 2>&1
  ```

  Expected: `dist/` emitted with no TypeScript or Vite errors.

- [ ] **Step 3: Push**

  ```bash
  git push
  ```
