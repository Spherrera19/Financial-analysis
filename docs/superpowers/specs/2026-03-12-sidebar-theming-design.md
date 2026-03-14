# Collapsible Sidebar + Multi-Theme System Design
**Date:** 2026-03-12
**Status:** Approved

## Overview

Add a collapsible desktop sidebar with a hamburger toggle, keep mobile bottom tabs unchanged, add a Settings tab with a 5-theme switcher (System, Light, Dark, Pastel, High Contrast), and persist the theme preference via `localStorage` + `data-theme` attribute on `<html>`.

---

## 1. Navigation Architecture

### Desktop (`md+`, ≥768px)

- Sidebar starts **open** on first load (state stored in `localStorage` as `sidebar-open`)
- A **hamburger button** (`Menu` icon from lucide-react) is fixed to the top-left of the main content area, visible only on desktop (`hidden md:block`)
- When open: sidebar animates to `x: 0`; main content animates `marginLeft` to `240`
- When closed: sidebar animates to `x: -240`; main content animates `marginLeft` to `0`
- Both animations use Framer Motion on `motion.aside` (sidebar) and `motion.main` (main content)
- Spring transition: `{ type: 'spring', stiffness: 300, damping: 30 }`
- `sidebarOpen` state lives in `App.tsx`; persisted to `localStorage` on every toggle

**`SidebarProps` update** — add one new prop:
```typescript
interface SidebarProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  asOfDate?: string;
  isOpen: boolean;          // NEW — drives motion.aside x animation
}
```

**Main content — remove static `.md-sidebar-offset` class.** Replace with a `motion.main` element whose `animate` prop drives `marginLeft`:
```tsx
<motion.main
  animate={{ marginLeft: sidebarOpen ? 240 : 0 }}
  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
  style={{ flex: 1 }}
  className="main-content"
>
```
Remove the `.md-sidebar-offset` rule from `index.css` (it will conflict with inline animated styles).

### Mobile (`< md`, <768px)

- Hamburger button: `hidden md:block` (never shown on mobile)
- Desktop sidebar: `hidden md:flex` — unchanged, never rendered on mobile
- Bottom tab bar: unchanged
- On mobile, `motion.main` should not animate `marginLeft` — use `0` always. Achieve this by only reading `sidebarOpen` for the margin when screen is `≥ md`. Since this is a static HTML/Vite app (no SSR), use a `useMediaQuery` hook or simply always animate on the `motion.main` — on mobile the sidebar is hidden anyway so `marginLeft: 0` is always correct (the sidebar being "open" in state doesn't affect mobile layout because the sidebar `display: none` via Tailwind).

### App.tsx additions

```typescript
const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
  return localStorage.getItem('sidebar-open') !== 'false';
});

const toggleSidebar = () => {
  setSidebarOpen(prev => {
    localStorage.setItem('sidebar-open', String(!prev));
    return !prev;
  });
};
```

Hamburger button placement — fixed, desktop only, animates its `left` position in sync with the sidebar so it never overlaps the open panel:
```tsx
<motion.button
  onClick={toggleSidebar}
  animate={{ left: sidebarOpen ? 256 : 16 }}
  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
  className="hidden md:flex"
  style={{ position: 'fixed', top: '1rem', zIndex: 50, ... }}
>
  <Menu size={20} />
</motion.button>
```

---

## 2. Settings Tab

### `TabKey` update (`src/types.ts`)

```typescript
export type TabKey = 'overview' | 'cashflow' | 'spending' | 'debt' | 'transactions' | 'settings';
```

### Sidebar nav item

Add to `NAV_ITEMS` in `Sidebar.tsx` (last item, before footer):
```typescript
{ id: 'settings' as TabKey, label: 'Settings', icon: Settings }
```
Import `Settings` from `lucide-react`.

### `TopBar` visibility

`TopBar` is automatically excluded when `activeTab === 'settings'` because the layout restructure (see Section 2, Layout restructure) puts `SettingsTab` in the `true` branch of a top-level ternary — the `data &&` block (which contains `TopBar`) is never reached when `activeTab === 'settings'`. No additional guard is needed inside the `data &&` block.

### Layout restructure (`App.tsx`)

`SettingsTab` must render **outside** the `{data && (...)}` guard — it doesn't need financial data and should be available even before `data.json` loads. Restructure the main content area:

```tsx
{activeTab === 'settings'
  ? <SettingsTab activeTheme={activeTheme} onThemeChange={handleThemeChange} />
  : <>
      {loading && <LoadingScreen />}
      {error && <ErrorScreen message={error} />}
      {data && (
        <>
          <TopBar ... />
          <div style={{ padding: '1.5rem' }}>
            <AnimatePresence mode="wait">
              <motion.div key={activeTab} ...>
                {renderTab()}
              </motion.div>
            </AnimatePresence>
          </div>
        </>
      )}
    </>
}
```

### `renderTab()` update (`App.tsx`)

Add the settings case to the switch (as a fallback — primary routing is the ternary above):
```typescript
case 'settings': return null; // handled above the data guard
```

### `SettingsTab` component (`src/pages/SettingsTab.tsx`)

```typescript
interface SettingsTabProps {
  activeTheme: Theme;
  onThemeChange: (t: Theme) => void;
}
```

Displays a theme switcher as a grid of 5 clickable cards. Each card shows:
- Theme name
- Color swatch strip (3–4 small circles: bg-base, accent-blue, accent-green, accent-red for that theme)
- Active ring/checkmark when selected

On click: calls `onThemeChange(theme)`.

Swatch colors (hardcoded per theme — independent of CSS vars so they always show correctly):

| Theme | bg | blue | green | red |
|---|---|---|---|---|
| system | `#0f172a` | `#60a5fa` | `#4ade80` | `#f87171` |
| light | `#f0f4f8` | `#2563eb` | `#16a34a` | `#dc2626` |
| dark | `#0f172a` | `#60a5fa` | `#4ade80` | `#f87171` |
| pastel | `#faf7f5` | `#7c9dd4` | `#7ab89a` | `#d4826b` |
| high-contrast | `#000000` | `#4fc3f7` | `#69f0ae` | `#ff5252` |

### `src/pages/index.ts` update

```typescript
export { OverviewTab } from './OverviewTab';
export { CashFlowTab } from './CashFlowTab';
export { SpendingTab } from './SpendingTab';
export { DebtTab } from './DebtTab';
export { TransactionsTab } from './TransactionsTab';
export { SettingsTab } from './SettingsTab';   // ADD
```

---

## 3. Theme System

### `src/lib/theme.ts` (new file)

```typescript
export type Theme = 'system' | 'light' | 'dark' | 'pastel' | 'high-contrast';

export function applyTheme(theme: Theme): void {
  if (theme === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
  localStorage.setItem('theme', theme);
}

export function loadTheme(): Theme {
  return (localStorage.getItem('theme') as Theme) ?? 'system';
}
```

### App.tsx integration

```typescript
// Theme state — lazy initializer (loadTheme called once on mount)
const [activeTheme, setActiveTheme] = useState<Theme>(loadTheme);

// Apply theme whenever activeTheme changes (including initial mount).
// applyTheme is idempotent, so re-running on every change is safe.
// Avoids an empty-dependency-array lint warning (react-hooks/exhaustive-deps).
useEffect(() => { applyTheme(activeTheme); }, [activeTheme]);

const handleThemeChange = (t: Theme) => {
  // Only update state — the useEffect above handles applyTheme
  setActiveTheme(t);
};
```

---

## 4. CSS Theme Definitions (`src/index.css`)

**Important: source order determines cascade winner.** All `[data-theme]` blocks must appear **after** the `@media (prefers-color-scheme: dark)` block in the file. When both a media query and a `[data-theme]` attribute selector match, the later rule in source order wins (they have equal specificity: both are pseudo-class/attribute level). Placing `[data-theme]` blocks last ensures they always override the system preference when set.

```css
/* existing :root block — light defaults */
/* existing @media (prefers-color-scheme: dark) — system dark */

/* Force light — must come after @media block */
[data-theme="light"] {
  --bg-base: #f0f4f8;
  --bg-surface: rgba(255,255,255,0.8);
  --bg-surface-2: rgba(248,250,252,0.9);
  --bg-glass: rgba(255,255,255,0.65);
  --bg-glass-border: rgba(255,255,255,0.9);
  --text-primary: #0f172a;
  --text-secondary: #475569;
  --text-muted: #94a3b8;
  --accent-blue: #2563eb;
  --accent-green: #16a34a;
  --accent-red: #dc2626;
  --accent-purple: #9333ea;
  --accent-yellow: #d97706;
  --border-subtle: rgba(148,163,184,0.2);
  --border-focus: #2563eb;
  --shadow-glass: 0 8px 32px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
  --shadow-hover: 0 16px 48px rgba(0,0,0,0.12), 0 2px 4px rgba(0,0,0,0.06);
  --blur-glass: 12px;
}

/* Force dark */
[data-theme="dark"] {
  --bg-base: #0f172a;
  --bg-surface: rgba(30,41,59,0.9);
  --bg-surface-2: rgba(15,23,42,0.8);
  --bg-glass: rgba(30,41,59,0.6);
  --bg-glass-border: rgba(71,85,105,0.4);
  --text-primary: #f1f5f9;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;
  --accent-blue: #60a5fa;
  --accent-green: #4ade80;
  --accent-red: #f87171;
  --accent-purple: #c084fc;
  --accent-yellow: #fbbf24;
  --border-subtle: rgba(71,85,105,0.3);
  --border-focus: #60a5fa;
  --shadow-glass: 0 8px 32px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3);
  --shadow-hover: 0 16px 48px rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.4);
  --blur-glass: 16px;
}

/* Pastel — soft warm palette */
[data-theme="pastel"] {
  --bg-base: #faf7f5;
  --bg-surface: rgba(255,252,250,0.85);
  --bg-surface-2: rgba(250,247,244,0.9);
  --bg-glass: rgba(255,248,244,0.7);
  --bg-glass-border: rgba(220,200,190,0.5);
  --text-primary: #2d1f1a;
  --text-secondary: #7c6b65;
  --text-muted: #b8a9a4;
  --accent-blue: #7c9dd4;
  --accent-green: #7ab89a;
  --accent-red: #d4826b;
  --accent-purple: #a98cc4;
  --accent-yellow: #c9a96e;
  --border-subtle: rgba(180,160,150,0.2);
  --border-focus: #7c9dd4;
  --shadow-glass: 0 8px 32px rgba(120,80,60,0.08), 0 1px 2px rgba(120,80,60,0.04);
  --shadow-hover: 0 16px 48px rgba(120,80,60,0.12), 0 2px 4px rgba(120,80,60,0.06);
  --blur-glass: 12px;
}

/* High Contrast — WCAG AA+, no blur */
[data-theme="high-contrast"] {
  --bg-base: #000000;
  --bg-surface: #0a0a0a;
  --bg-surface-2: #111111;
  --bg-glass: #0a0a0a;
  --bg-glass-border: #ffffff;
  --text-primary: #ffffff;
  --text-secondary: #e0e0e0;
  --text-muted: #bbbbbb;
  --accent-blue: #4fc3f7;
  --accent-green: #69f0ae;
  --accent-red: #ff5252;
  --accent-purple: #ea80fc;
  --accent-yellow: #ffd740;
  --border-subtle: rgba(255,255,255,0.4);
  --border-focus: #ffffff;
  --shadow-glass: 0 0 0 1px #ffffff;
  --shadow-hover: 0 0 0 2px #ffffff;
  --blur-glass: 0px;
}
```

---

## 5. Files Changed

| File | Action |
|---|---|
| `src/types.ts` | Add `'settings'` to `TabKey` |
| `src/lib/theme.ts` | CREATE — `Theme` type, `applyTheme`, `loadTheme` |
| `src/index.css` | Append 4 `[data-theme]` blocks; remove `.md-sidebar-offset` rule |
| `src/components/layout/Sidebar.tsx` | Add `isOpen` prop, `motion.aside` with `x` animation, Settings nav item |
| `src/App.tsx` | `sidebarOpen` state + toggle, hamburger button, `motion.main` for margin, theme init, `SettingsTab` routing, hide `TopBar` on settings tab |
| `src/pages/SettingsTab.tsx` | CREATE — theme switcher UI |
| `src/pages/index.ts` | Add `export { SettingsTab }` |
| `CLAUDE.md` | Append theming architecture + responsive nav rules (see Section 7) |

---

## 7. CLAUDE.md Content to Append

Add the following two sections to `CLAUDE.md`:

```markdown
## Theming Architecture

Themes are controlled via a `data-theme` attribute on `<html>` (set by `src/lib/theme.ts`).

- **System** (default): no `data-theme` attribute; `@media (prefers-color-scheme: dark)` applies automatically
- **Light / Dark / Pastel / High Contrast**: `data-theme="light|dark|pastel|high-contrast"` overrides the system preference
- CSS variable blocks for each theme are defined in `src/index.css`, placed **after** the `@media` dark block so source-order cascade wins
- Preference is persisted to `localStorage` under the key `theme`
- The `Theme` type and `applyTheme` / `loadTheme` helpers live in `src/lib/theme.ts`
- `App.tsx` reads the stored preference on mount via `useState<Theme>(loadTheme)` and applies it via `useEffect`

**Do not** use `.dark` class or `ThemeContext` — the `data-theme` attribute on `<html>` is the sole mechanism.

## Responsive Navigation Rules

| Screen | Navigation |
|---|---|
| Desktop (`md+`, ≥768px) | Fixed left sidebar (240px), collapsible via hamburger button |
| Mobile (`<md`, <768px) | Bottom tab bar only; sidebar never shown |

- `sidebarOpen` state lives in `App.tsx`, persisted to `localStorage` under key `sidebar-open`
- Sidebar uses `motion.aside` (Framer Motion) with `x: 0 ↔ -240` animation
- Main content uses `motion.main` with `marginLeft: 240 ↔ 0` animation
- Hamburger button uses `motion.button` with `left: 256 ↔ 16` animation (stays outside sidebar)
- Hamburger is `hidden md:flex` (desktop only); sidebar is `hidden md:flex` (desktop only)
- Bottom tab bar is `flex md:hidden` (mobile only)
- **Settings tab** renders outside the `{data && ...}` guard — it is data-independent
```

## 6. Verification

1. Desktop: sidebar opens/closes via hamburger with smooth animation; `marginLeft` on main content animates in sync; state persists on reload
2. Mobile: hamburger hidden; bottom tabs work; sidebar never appears; `marginLeft` stays 0
3. Settings tab appears in nav on both desktop (sidebar) and mobile (bottom bar)
4. `TopBar` is hidden on the Settings tab
5. Selecting each theme updates colors immediately; preference survives page reload
6. System theme removes `data-theme` and respects OS preference
7. High Contrast theme shows no blur (`--blur-glass: 0px`)
8. `npx tsc --noEmit` passes clean
9. `npm run build` succeeds
