# Architecture Refactor — Phase 2: Configuration & Frontend Hardening

> Continues from Phase 1 (`2026-03-23-arch-refactor-phase1.md`), which completed session unification and Alembic adoption.

**Goal:** Harden the backend configuration layer and apply the same discipline to the React frontend (strict type safety, query hygiene, component cleanup).

---

## Scope

- **Task 1:** (prior session — details TBD)
- **Task 2:** Centralise app configuration in `backend/config.py` via `pydantic-settings`
- **Task 3:** React Frontend Upgrades — ⏳ UPCOMING

---

## Task 2: Backend Config via pydantic-settings ✅ COMPLETE (2026-03-24)

### What was done

Created `backend/config.py` — a single `Settings(BaseSettings)` class that owns all runtime-tuneable values. Removed the hardcoded CORS list from `backend/main.py`.

### Files changed

| File | Action |
|---|---|
| `backend/config.py` | **Created** — `Settings(BaseSettings)` with `cors_origins: list[str]` |
| `backend/main.py` | Modified — imports `settings`; passes `settings.cors_origins` to `CORSMiddleware` |
| `requirements.txt` | Modified — added `pydantic-settings>=2.0` |

### Design decisions

- `Settings` reads from a `.env` file (ignored by git) and from environment variables.
- `cors_origins` defaults to `["http://localhost:3000", "http://localhost:5173"]`.
- Override at deploy time: `CORS_ORIGINS='["https://prod.example.com"]'` (JSON array string).
- `model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")` — standard pydantic-settings pattern.

### Test results

All 103 tests pass after this change.

---

## Task 3: React Frontend Upgrades ⏳ UPCOMING

*(Plan TBD — high-stakes; review full scope before touching code.)*

Key areas under consideration:
- Strict TypeScript: eliminate `any` types, tighten API response shapes
- React Query coverage: extend `useQuery`/`useMutation` beyond BudgetTab + EquityTab
- Component cleanup: audit dead props, unused chart options, stale `useEffect` patterns
- Build hygiene: Vite bundle analysis, tree-shake unused Chart.js components
