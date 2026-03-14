# B2B SaaS UI/UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the glassmorphism design language with a clean Modern B2B SaaS aesthetic — solid opaque surfaces, crisp 1px borders, Inter font — and fix the mobile double-nav bug, TopBar period dropdown, and chart mobile scrollability.

**Architecture:** All changes are pure frontend (no Python backend or data layer touched). CSS variables are renamed semantically, component class references updated in place, and two components (TopBar, charts) get structural additions (dropdown state, scroll wrappers). No new files are created.

**Tech Stack:** React 18, TypeScript, Tailwind CSS v4, Vite, Framer Motion, Lucide React, Chart.js

**Spec:** `docs/superpowers/specs/2026-03-14-b2b-ui-overhaul-design.md`

**Verification harness:** No test suite configured. Each task uses `npm run build` (TypeScript compilation) as the automated safety net, plus browser spot-checks via `npx serve frontend/dist`.

---

## Chunk 1: CSS Foundation

> **Files:**
> - Modify: `frontend/index.html`
> - Modify: `frontend/src/index.css`

---

### Task 1: Add Inter font via `<link>` tags in index.html

**Why `<link>` not `@import`:** `@import` in CSS blocks the CSS parser while fetching the remote font file. `<link rel="stylesheet">` in `<head>` allows parallel fetching by the browser's preload scanner, which is faster in a Vite-built SPA.

- [ ] **Open `frontend/index.html`**

- [ ] **Add the three Inter font link tags inside `<head>`, after the existing `<link rel="icon">` line:**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Finance Dashboard</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Run build to verify no errors:**

```bash
cd frontend && npm run build
```

Expected: `✓ built in X.XXs` with no TypeScript errors.

- [ ] **Commit:**

```bash
git add frontend/index.html
git commit -m "feat: load Inter font via preconnect link tags in index.html"
```

---

### Task 2: Rewrite CSS variables — rename tokens, remove glassmorphism

This is the largest single edit. Work through `frontend/src/index.css` theme block by theme block.

**Rule:** Never leave a dangling `var(--bg-glass)`, `var(--bg-glass-border)`, or `var(--blur-glass)` reference anywhere after this task.

#### 2a: Update `:root` (light mode defaults)

- [ ] **Replace the entire `:root` block with:**

```css
:root {
  /* Backgrounds */
  --bg-base:      #f0f4f8;
  --bg-surface:   #ffffff;
  --bg-surface-2: #f8fafc;
  --bg-card:      #ffffff;

  /* Text */
  --text-primary:   #0f172a;
  --text-secondary: #475569;
  --text-muted:     #94a3b8;

  /* Accents */
  --accent-blue:   #2563eb;
  --accent-green:  #16a34a;
  --accent-red:    #dc2626;
  --accent-purple: #9333ea;
  --accent-yellow: #d97706;

  /* Borders */
  --border-subtle: #e2e8f0;
  --border-focus:  #2563eb;

  /* Shadows */
  --shadow-card:  0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
  --shadow-hover: 0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04);
}
```

#### 2b: Update `@media (prefers-color-scheme: dark)` block

- [ ] **Replace the dark media block with:**

```css
@media (prefers-color-scheme: dark) {
  :root {
    /* Backgrounds */
    --bg-base:      #0f172a;
    --bg-surface:   #1e293b;
    --bg-surface-2: #0f172a;
    --bg-card:      #1e293b;

    /* Text */
    --text-primary:   #f1f5f9;
    --text-secondary: #94a3b8;
    --text-muted:     #64748b;

    /* Accents */
    --accent-blue:   #60a5fa;
    --accent-green:  #4ade80;
    --accent-red:    #f87171;
    --accent-purple: #c084fc;
    --accent-yellow: #fbbf24;

    /* Borders */
    --border-subtle: #334155;
    --border-focus:  #60a5fa;

    /* Shadows */
    --shadow-card:  0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2);
    --shadow-hover: 0 4px 12px rgba(0,0,0,0.4), 0 2px 4px rgba(0,0,0,0.3);
  }
}
```

#### 2c: Update `[data-theme="light"]`

- [ ] **Replace with:**

```css
[data-theme="light"] {
  --bg-base:      #f0f4f8;
  --bg-surface:   #ffffff;
  --bg-surface-2: #f8fafc;
  --bg-card:      #ffffff;
  --text-primary:   #0f172a;
  --text-secondary: #475569;
  --text-muted:     #94a3b8;
  --accent-blue:    #2563eb;
  --accent-green:   #16a34a;
  --accent-red:     #dc2626;
  --accent-purple:  #9333ea;
  --accent-yellow:  #d97706;
  --border-subtle:  #e2e8f0;
  --border-focus:   #2563eb;
  --shadow-card:    0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
  --shadow-hover:   0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04);
}
```

#### 2d: Update `[data-theme="dark"]`

- [ ] **Replace with:**

```css
[data-theme="dark"] {
  --bg-base:      #0f172a;
  --bg-surface:   #1e293b;
  --bg-surface-2: #0f172a;
  --bg-card:      #1e293b;
  --text-primary:   #f1f5f9;
  --text-secondary: #94a3b8;
  --text-muted:     #64748b;
  --accent-blue:    #60a5fa;
  --accent-green:   #4ade80;
  --accent-red:     #f87171;
  --accent-purple:  #c084fc;
  --accent-yellow:  #fbbf24;
  --border-subtle:  #334155;
  --border-focus:   #60a5fa;
  --shadow-card:    0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2);
  --shadow-hover:   0 4px 12px rgba(0,0,0,0.4), 0 2px 4px rgba(0,0,0,0.3);
}
```

#### 2e: Update `[data-theme="pastel"]`

- [ ] **Replace with:**

```css
[data-theme="pastel"] {
  --bg-base:      #faf7f5;
  --bg-surface:   #fffcfa;
  --bg-surface-2: #faf7f4;
  --bg-card:      #fffcfa;
  --text-primary:   #2d1f1a;
  --text-secondary: #7c6b65;
  --text-muted:     #b8a9a4;
  --accent-blue:    #7c9dd4;
  --accent-green:   #7ab89a;
  --accent-red:     #d4826b;
  --accent-purple:  #a98cc4;
  --accent-yellow:  #c9a96e;
  --border-subtle:  #dcc8be;
  --border-focus:   #7c9dd4;
  --shadow-card:    0 1px 3px rgba(120,80,60,0.06), 0 1px 2px rgba(120,80,60,0.04);
  --shadow-hover:   0 4px 12px rgba(120,80,60,0.10), 0 2px 4px rgba(120,80,60,0.06);
}
```

#### 2f: Update `[data-theme="high-contrast"]`

- [ ] **Replace with:**

```css
[data-theme="high-contrast"] {
  --bg-base:      #000000;
  --bg-surface:   #0a0a0a;
  --bg-surface-2: #111111;
  --bg-card:      #0a0a0a;
  --text-primary:   #ffffff;
  --text-secondary: #e0e0e0;
  --text-muted:     #bbbbbb;
  --accent-blue:    #4fc3f7;
  --accent-green:   #69f0ae;
  --accent-red:     #ff5252;
  --accent-purple:  #ea80fc;
  --accent-yellow:  #ffd740;
  --border-subtle:  rgba(255,255,255,0.4);
  --border-focus:   #ffffff;
  --shadow-card:    0 0 0 1px #ffffff;
  --shadow-hover:   0 0 0 2px #ffffff;
}
```

- [ ] **Run build to verify no TS errors and no dangling CSS var references:**

```bash
cd frontend && npm run build
```

Expected: clean build. If there are errors, search for remaining `--bg-glass`, `--bg-glass-border`, or `--blur-glass` references:

```bash
grep -r "bg-glass\|blur-glass\|glass-border" frontend/src/
```

- [ ] **Commit:**

```bash
git add frontend/src/index.css
git commit -m "feat: rename glass CSS tokens to solid B2B SaaS design tokens"
```

---

### Task 3: Replace `.glass-card` with `.card` in index.css + update body font

- [ ] **In `frontend/src/index.css`, update the `body` rule** to use Inter:

```css
body {
  background-color: var(--bg-base);
  color: var(--text-primary);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  min-height: 100vh;
  transition: background-color 0.2s ease, color 0.2s ease;
}
```

- [ ] **Remove the `.glass-card` rule entirely and replace with `.card`:**

```css
.card {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  box-shadow: var(--shadow-card);
  transition: box-shadow 0.2s ease, transform 0.2s ease;
}

.card:hover {
  box-shadow: var(--shadow-hover);
}
```

- [ ] **Add the custom scrollbar rules** after the `.card` block:

```css
/* ============================================================
   Custom scrollbars (WebKit)
   ============================================================ */
::-webkit-scrollbar        { width: 6px; height: 6px; }
::-webkit-scrollbar-track  { background: transparent; }
::-webkit-scrollbar-thumb  { background: var(--border-subtle); border-radius: 9999px; }
::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

/* Utility for horizontal-scroll chart containers */
.custom-scrollbar::-webkit-scrollbar        { height: 6px; }
.custom-scrollbar::-webkit-scrollbar-track  { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb  { background: var(--border-subtle); border-radius: 9999px; }
```

- [ ] **Run build:**

```bash
cd frontend && npm run build
```

Expected: clean build.

- [ ] **Commit:**

```bash
git add frontend/src/index.css
git commit -m "feat: replace .glass-card with .card, add Inter font-family, custom scrollbar"
```

---

### Task 4: Update glass-card → card in component JSX

Three files reference `glass-card` as a className string. Update each with a surgical string replacement.

- [ ] **`frontend/src/components/cards/KpiCard.tsx` line ~45:**

Change:
```tsx
className="kpi-card glass-card"
```
To:
```tsx
className="kpi-card card"
```

- [ ] **`frontend/src/components/cards/CollapsibleCard.tsx` line ~22:**

Change:
```tsx
className={cn('glass-card', className)}
```
To:
```tsx
className={cn('card', className)}
```

- [ ] **`frontend/src/components/modals/TransactionModal.tsx` line ~75:**

Change:
```tsx
className="glass-card"
```
To:
```tsx
className="card"
```

- [ ] **Verify no remaining `glass-card` references:**

```bash
grep -r "glass-card" frontend/src/
```

Expected: no output.

- [ ] **Run build:**

```bash
cd frontend && npm run build
```

- [ ] **Commit:**

```bash
git add frontend/src/components/cards/KpiCard.tsx \
        frontend/src/components/cards/CollapsibleCard.tsx \
        frontend/src/components/modals/TransactionModal.tsx
git commit -m "feat: migrate glass-card → card className in KpiCard, CollapsibleCard, TransactionModal"
```

---

## Chunk 2: Navigation Fixes

> **Files:**
> - Modify: `frontend/src/components/layout/Sidebar.tsx`

---

### Task 5: Fix desktop nav rail background

The rail's `<aside>` currently uses `background: 'var(--bg-base)'`, making it blend into the page background. Change to `var(--bg-card)` so it reads as a distinct surface panel.

- [ ] **In `frontend/src/components/layout/Sidebar.tsx`, find the `<aside>` style object (around line 41) and change:**

```ts
background: 'var(--bg-base)',
```
To:
```ts
background: 'var(--bg-card)',
```

- [ ] **Run build:**

```bash
cd frontend && npm run build
```

- [ ] **Commit:**

```bash
git add frontend/src/components/layout/Sidebar.tsx
git commit -m "fix: nav rail background uses --bg-card instead of --bg-base"
```

---

### Task 6: Fix mobile bottom bar — double-nav bug + glassmorphism removal

**The bug:** The `<nav>` has `className="flex md:hidden"` but its inline `style` object also contains `display: 'flex'`. Inline styles have higher CSS specificity than Tailwind utilities, so `md:hidden` (`display: none`) is overridden on desktop — both the rail and bottom bar show at the same time.

**Fix:** Delete the three flex layout keys from `style`, add them as Tailwind classes.

- [ ] **Find the mobile `<nav>` element (around line 166). Replace the entire element opening tag:**

Change `className`:
```tsx
className="flex md:hidden"
```
To:
```tsx
className="flex md:hidden justify-around items-center"
```

- [ ] **Remove these three keys from the `style` object** on the same `<nav>`:
  - `display: 'flex',`
  - `justifyContent: 'space-around',`
  - `alignItems: 'center',`

- [ ] **While in the same `style` object, also remove glassmorphism and replace with solid surface:**

Remove:
```ts
background: 'var(--bg-glass)',
borderTop: '1px solid var(--bg-glass-border)',
backdropFilter: 'blur(var(--blur-glass))',
WebkitBackdropFilter: 'blur(var(--blur-glass))',
```

Add:
```ts
background: 'var(--bg-card)',
borderTop: '1px solid var(--border-subtle)',
```

**Critical: verify `paddingBottom: 'env(safe-area-inset-bottom, 0px)'` is still in the style object.** Do not remove it.

- [ ] **After the fix, the mobile `<nav>` opening should look like:**

```tsx
<nav
  className="flex md:hidden justify-around items-center"
  style={{
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    height: 64,
    background: 'var(--bg-card)',
    borderTop: '1px solid var(--border-subtle)',
    zIndex: 40,
    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
  }}
>
```

- [ ] **Run build:**

```bash
cd frontend && npm run build
```

- [ ] **Commit:**

```bash
git add frontend/src/components/layout/Sidebar.tsx
git commit -m "fix: mobile bottom nav double-display bug; remove glassmorphism from bottom bar"
```

---

### Task 7: Add 44px touch targets to mobile tab buttons

- [ ] **In the mobile `<nav>` section, find the `<button>` inside the `NAV_ITEMS.map()` (around line 188). Add `minHeight: 44` to its style object:**

The button style should include:
```ts
minHeight: 44,
```

This applies to all 6 mobile nav buttons (they share one style definition inside the map).

- [ ] **Run build:**

```bash
cd frontend && npm run build
```

- [ ] **Commit:**

```bash
git add frontend/src/components/layout/Sidebar.tsx
git commit -m "fix: add 44px min touch target to mobile nav tab buttons (Apple HIG)"
```

---

## Chunk 3: TopBar Period Dropdown

> **Files:**
> - Modify: `frontend/src/components/layout/TopBar.tsx`

---

### Task 8: Rewrite TopBar.tsx with period dropdown

This task replaces the entire `TopBar.tsx` file. The current implementation uses 5 pill buttons in a wrapping flex row. The new implementation uses a single dropdown trigger.

- [ ] **Replace the full contents of `frontend/src/components/layout/TopBar.tsx` with:**

```tsx
import { useState, useRef, useEffect } from 'react';
import { Copy, Download, CalendarDays, ChevronDown, Check } from 'lucide-react';
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
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  const activeLabel = PERIOD_LABELS.find(p => p.key === activePeriod)?.label ?? '';

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
```

- [ ] **Run build:**

```bash
cd frontend && npm run build
```

Expected: clean build. If TypeScript complains about `MouseEvent | KeyboardEvent` union, ensure the `useEffect` handler type annotation matches exactly as written above.

- [ ] **Spot-check dropdown behavior in browser:**

```bash
cd frontend && npx serve dist -p 3000
```

Open `http://localhost:3000`. Verify:
1. The period selector is now a single button showing "Last Month" (or current active period) with a calendar icon and chevron
2. Clicking it opens a dropdown with all 5 options; the active one has a checkmark
3. Clicking an option updates the trigger label and closes the dropdown
4. Pressing `Escape` closes the dropdown
5. Clicking outside the dropdown closes it
6. The TopBar background is solid (no blur/transparency)

- [ ] **Commit:**

```bash
git add frontend/src/components/layout/TopBar.tsx
git commit -m "feat: replace TopBar pill buttons with accessible period dropdown"
```

---

## Chunk 4: Chart Mobile Responsiveness

> **Files:**
> - Modify: `frontend/src/components/charts/SankeyChart.tsx`
> - Modify: `frontend/src/components/charts/FlowChart.tsx`

---

### Task 9: Add horizontal scroll wrapper to SankeyChart

The Sankey chart is complex and will compress to illegibility on narrow viewports. Wrapping it in `overflow-x-auto` with a `minWidth` preserves its natural layout and lets mobile users scroll.

**Important:** Only the chart render path gets the scroll wrapper. The empty-state path (`flows.length === 0`) is unchanged.

- [ ] **In `frontend/src/components/charts/SankeyChart.tsx`, find the chart return path (around line 41).**

Change:
```tsx
return (
  <div style={{ height: '340px' }}>
    <Chart
      type={'sankey' as any}
      data={chartData as any}
      options={options}
    />
  </div>
);
```

To:
```tsx
return (
  <div className="w-full overflow-x-auto pb-4 custom-scrollbar" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
    <div style={{ height: 340, minWidth: 600 }}>
      <Chart
        type={'sankey' as any}
        data={chartData as any}
        options={options}
      />
    </div>
  </div>
);
```

**Note on `WebkitOverflowScrolling`:** TypeScript's `React.CSSProperties` type doesn't include this vendor-prefixed property, hence the `as React.CSSProperties` cast. iOS 13+ doesn't need it (momentum scrolling is default), but it's a zero-harm fallback for iOS ≤ 12.

- [ ] **Run build:**

```bash
cd frontend && npm run build
```

- [ ] **Commit:**

```bash
git add frontend/src/components/charts/SankeyChart.tsx
git commit -m "feat: wrap SankeyChart in horizontal scroll container for mobile"
```

---

### Task 10: Add horizontal scroll wrapper to FlowChart

Same pattern as Task 9.

- [ ] **In `frontend/src/components/charts/FlowChart.tsx`, find the return statement (around line 46).**

Change:
```tsx
return (
  <div style={{ height: '280px' }}>
    <Bar data={data} options={options} />
  </div>
);
```

To:
```tsx
return (
  <div className="w-full overflow-x-auto pb-4 custom-scrollbar" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
    <div style={{ height: 280, minWidth: 560 }}>
      <Bar data={data} options={options} />
    </div>
  </div>
);
```

- [ ] **Run build:**

```bash
cd frontend && npm run build
```

- [ ] **Final browser spot-check** (all changes combined):

```bash
cd frontend && npx serve dist -p 3000
```

Verify across all themes (use Settings tab to switch):
1. **Cards** — solid backgrounds, crisp borders, no blur artifacts
2. **Nav rail (desktop)** — visible as a distinct surface panel; only the rail shows on desktop (no bottom bar)
3. **Bottom nav (mobile)** — simulate mobile viewport in DevTools; only bottom bar shows; safe-area padding preserved
4. **TopBar** — solid background, dropdown works, keyboard Escape closes it
5. **Inter font** — text renders in Inter (visible in browser DevTools → Computed Styles)
6. **Charts** — Sankey and FlowChart scroll horizontally on narrow viewports; custom thin scrollbar visible

- [ ] **Commit:**

```bash
git add frontend/src/components/charts/FlowChart.tsx
git commit -m "feat: wrap FlowChart in horizontal scroll container for mobile"
```

- [ ] **Push all commits:**

```bash
git push
```

---

## Summary of All Commits (10 tasks → 10 commits)

| # | Message |
|---|---|
| 1 | `feat: load Inter font via preconnect link tags in index.html` |
| 2 | `feat: rename glass CSS tokens to solid B2B SaaS design tokens` |
| 3 | `feat: replace .glass-card with .card, add Inter font-family, custom scrollbar` |
| 4 | `feat: migrate glass-card → card className in KpiCard, CollapsibleCard, TransactionModal` |
| 5 | `fix: nav rail background uses --bg-card instead of --bg-base` |
| 6 | `fix: mobile bottom nav double-display bug; remove glassmorphism from bottom bar` |
| 7 | `fix: add 44px min touch target to mobile nav tab buttons (Apple HIG)` |
| 8 | `feat: replace TopBar pill buttons with accessible period dropdown` |
| 9 | `feat: wrap SankeyChart in horizontal scroll container for mobile` |
| 10 | `feat: wrap FlowChart in horizontal scroll container for mobile` |
