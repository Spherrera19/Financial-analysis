# B2B SaaS UI/UX Overhaul — Design Spec
**Date:** 2026-03-14
**Status:** Approved
**Scope:** Design system rewrite, nav fixes, TopBar dropdown, chart mobile responsiveness

---

## Background

The dashboard currently uses a glassmorphism aesthetic (translucent backgrounds, `backdrop-filter: blur`, rgba surfaces). For a data-dense finance dashboard this creates visual clutter and poor contrast. We are pivoting to a **Modern B2B SaaS** design language: solid opaque backgrounds, crisp 1px borders, subtle shadows, high-contrast text.

---

## Task 1 — Design System Rewrite (`frontend/src/index.css`)

### Font
Add Google Fonts via `<link>` tags in `frontend/index.html` (inside `<head>`) instead of `@import` in CSS. The `@import` approach blocks the CSS parser while fetching the font; `<link>` tags allow parallel fetching and are the Vite-idiomatic approach.

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
```

- Set `font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` on `body` in `index.css`
- Do **not** add an `@import` for Inter in `index.css`

### CSS Token Rename (semantic cleanup)
Remove dead glassmorphism tokens and replace with solid-surface semantics across **all six theme blocks** (`:root`, `@media (prefers-color-scheme: dark)`, `[data-theme="light"]`, `[data-theme="dark"]`, `[data-theme="pastel"]`, `[data-theme="high-contrast"]`):

| Old token | New token | Notes |
|---|---|---|
| `--bg-glass` | `--bg-card` | Solid opaque card surface color |
| `--bg-glass-border` | *(removed)* | No longer needed; use `--border-subtle` |
| `--blur-glass` | *(removed)* | No longer used anywhere |
| `--bg-surface` | `--bg-surface` | Keep name; change value to solid hex |
| `--bg-surface-2` | `--bg-surface-2` | Keep name; change value to solid hex |
| `--border-subtle` | `--border-subtle` | Keep name; change value to solid hex |

**Solid hex values by theme:**

*Light / `[data-theme="light"]`:*
- `--bg-surface: #ffffff`
- `--bg-surface-2: #f8fafc`
- `--bg-card: #ffffff`
- `--border-subtle: #e2e8f0`

*Dark / `[data-theme="dark"]`:*
- `--bg-surface: #1e293b`
- `--bg-surface-2: #0f172a`
- `--bg-card: #1e293b`
- `--border-subtle: #334155`

*Pastel `[data-theme="pastel"]`:*
- `--bg-surface: #fffcfa`
- `--bg-surface-2: #faf7f4`
- `--bg-card: #fffcfa`
- `--border-subtle: #dcc8be`

*High Contrast `[data-theme="high-contrast"]`:*
- `--bg-surface: #0a0a0a` (already solid)
- `--bg-surface-2: #111111` (already solid)
- `--bg-card: #0a0a0a`
- `--border-subtle: rgba(255,255,255,0.4)` (keep as-is for HC)

### `.glass-card` → `.card` (CSS definition)
Replace the `.glass-card` rule with `.card`:
- Remove `backdrop-filter` and `-webkit-backdrop-filter`
- Remove `background: var(--bg-glass)` → `background: var(--bg-card)`
- Keep `border: 1px solid var(--border-subtle)`, `border-radius: 16px`, `box-shadow: var(--shadow-glass)` (rename shadow var to `--shadow-card` if desired, or keep as-is)
- Keep hover `box-shadow` transition

**JSX files that reference `glass-card` and must be updated to `card`:**
- `frontend/src/components/cards/KpiCard.tsx` — `className="kpi-card glass-card"` → `className="kpi-card card"`
- `frontend/src/components/cards/CollapsibleCard.tsx` — `className={cn('glass-card', className)}` → `className={cn('card', className)}`
- `frontend/src/components/modals/TransactionModal.tsx` — `className="glass-card"` on the modal inner div → `className="card"`

### Custom Scrollbar
Add after the base styles section:
```css
/* Thin themed scrollbars (WebKit) */
::-webkit-scrollbar        { width: 6px; height: 6px; }
::-webkit-scrollbar-track  { background: transparent; }
::-webkit-scrollbar-thumb  { background: var(--border-subtle); border-radius: 9999px; }
::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

/* Utility class for horizontal-scroll chart containers */
.custom-scrollbar::-webkit-scrollbar        { height: 6px; }
.custom-scrollbar::-webkit-scrollbar-track  { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb  { background: var(--border-subtle); border-radius: 9999px; }
```

---

## Task 2 — Navigation Fixes (`frontend/src/components/layout/Sidebar.tsx`)

### Desktop Nav Rail
- Change `background: 'var(--bg-base)'` → `background: 'var(--bg-card)'` on the `<aside>` element
- `borderRight: '1px solid var(--border-subtle)'` stays unchanged
- No structural or CSS-transition changes

### Mobile Bottom Bar — Bug Fix
**Root cause:** The `<nav>` has `className="flex md:hidden"` but its `style` object contains `display: 'flex'`, `justifyContent: 'space-around'`, and `alignItems: 'center'`. Inline styles have higher specificity than Tailwind utility classes, so `md:hidden` (`display: none`) is overridden by the inline `display: 'flex'`. Both the rail and bottom bar render on desktop.

**Fix — style object:** Remove these three keys from the inline `style`:
- `display: 'flex'`
- `justifyContent: 'space-around'`
- `alignItems: 'center'`

**Fix — className:** Change `className="flex md:hidden"` to `className="flex md:hidden justify-around items-center"`

**Glassmorphism removal on bottom bar — replace in `style` object:**
- `background: 'var(--bg-glass)'` → `background: 'var(--bg-card)'`
- `borderTop: '1px solid var(--bg-glass-border)'` → `borderTop: '1px solid var(--border-subtle)'`
- Remove `backdropFilter: 'blur(var(--blur-glass))'`
- Remove `WebkitBackdropFilter: 'blur(var(--blur-glass))'`

**Critical guardrail — iOS safe area:** The following MUST remain in the `style` object:
```
paddingBottom: 'env(safe-area-inset-bottom, 0px)'
```

### Mobile Touch Targets
Add `minHeight: 44` to each mobile tab `<button>` style object.

---

## Task 3 — TopBar Period Dropdown (`frontend/src/components/layout/TopBar.tsx`)

### Replace pill buttons with a dropdown trigger + menu

**New imports needed:** `useState`, `useRef`, `useEffect` from React; `CalendarDays`, `ChevronDown`, `Check` from `lucide-react`

**State:**
```ts
const [open, setOpen] = useState(false);
const dropdownRef = useRef<HTMLDivElement>(null);
```

**Click-outside + Escape handler:**

Combine both interactions into one `useEffect` with a single unified handler:

```ts
useEffect(() => {
  function handleInteraction(e: MouseEvent | KeyboardEvent) {
    if (e.type === 'keydown' && (e as KeyboardEvent).key === 'Escape') {
      setOpen(false);
      return;
    }
    if (e.type === 'mousedown' && dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)) {
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
```

**Trigger button** (replaces the entire pill-buttons `<div>`):

The trigger button must meet the 44px touch-target minimum. Use `minHeight: 44` in its style.

```tsx
<div ref={dropdownRef} style={{ position: 'relative' }}>
  <button onClick={() => setOpen(o => !o)} style={{
    display: 'flex', alignItems: 'center', gap: '0.5rem',
    padding: '6px 12px', minHeight: 44, borderRadius: 8,
    border: '1px solid var(--border-subtle)',
    background: 'var(--bg-card)',
    color: 'var(--text-primary)', cursor: 'pointer',
    fontSize: '0.875rem', fontWeight: 500, outline: 'none',
  }}>
    <CalendarDays size={15} strokeWidth={2} />
    {PERIOD_LABELS.find(p => p.key === activePeriod)?.label}
    <ChevronDown size={14} strokeWidth={2}
      style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}
    />
  </button>

  {open && (
    <div style={{
      position: 'absolute', top: 'calc(100% + 4px)', left: 0,
      background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
      borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
      minWidth: 160, zIndex: 40,
      overflow: 'hidden',
    }}>
      {PERIOD_LABELS.map(({ key, label }) => (
        <button key={key} onClick={() => { onPeriodChange(key); setOpen(false); }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            width: '100%', minHeight: 44, padding: '0 14px',
            border: 'none', background: 'transparent', cursor: 'pointer',
            color: key === activePeriod ? 'var(--accent-blue)' : 'var(--text-secondary)',
            fontWeight: key === activePeriod ? 600 : 400,
            fontSize: '0.875rem', textAlign: 'left',
          }}
        >
          {label}
          {key === activePeriod && <Check size={14} strokeWidth={2.5} />}
        </button>
      ))}
    </div>
  )}
</div>
```

**Dropdown positioning note:** The dropdown uses `left: 0` which works correctly since the trigger lives at the left side of the TopBar. On narrow viewports the TopBar has `padding: 0.75rem 1.5rem` so no viewport-edge clipping is expected.

**Z-index rationale:** `zIndex: 40` is used (not 100) because the TopBar itself has `zIndex: 90` (sticky) and the TransactionModal overlay has `zIndex: 1000`. The dropdown only needs to clear other in-page content; the modal will always render above it. Using 40 keeps z-index values consistent with the nav rail (`zIndex: 40`) and avoids any risk of the dropdown bleeding over a modal backdrop.

**TopBar container — glassmorphism removal:**
- Remove `backdropFilter: 'blur(8px)'` and `WebkitBackdropFilter: 'blur(8px)'`
- Change `background: 'color-mix(in srgb, var(--bg-base) 95%, transparent)'` → `background: 'var(--bg-card)'`

---

## Task 4 — Chart Mobile Responsiveness

### `frontend/src/components/charts/SankeyChart.tsx`
The component has two render paths: an empty-state path and the chart path. The scroll wrapper applies only to the **chart render path** (when `flows.length > 0`). The empty-state `<div style={{ height: '340px' }}>` is left unchanged.

**No-reflow note:** The main content area has a static `margin-left: 72px` that never changes (the nav rail floats over content on hover). Chart.js therefore never sees a resize event during hover. The `w-full overflow-x-auto` outer div is safe.

Replace (chart render path only):
```tsx
<div style={{ height: '340px' }}>
  <Chart ... />
</div>
```
With:
```tsx
<div className="w-full overflow-x-auto pb-4 custom-scrollbar" style={{ WebkitOverflowScrolling: 'touch' }}>
  <div style={{ height: 340, minWidth: 600 }}>
    <Chart ... />
  </div>
</div>
```

### `frontend/src/components/charts/FlowChart.tsx`
Replace:
```tsx
<div style={{ height: '280px' }}>
  <Bar ... />
</div>
```
With:
```tsx
<div className="w-full overflow-x-auto pb-4 custom-scrollbar" style={{ WebkitOverflowScrolling: 'touch' }}>
  <div style={{ height: 280, minWidth: 560 }}>
    <Bar ... />
  </div>
</div>
```

`-webkit-overflow-scrolling: touch` is included as a graceful fallback for iOS ≤ 12. iOS 13+ applies momentum scrolling automatically to `overflow: auto/scroll` elements, so modern iPhones will scroll natively without it. Keeping the property causes no harm and ensures older devices behave correctly.

---

## Files Changed

| File | Change |
|---|---|
| `frontend/index.html` | Add Inter font preconnect + stylesheet `<link>` tags in `<head>` |
| `frontend/src/index.css` | Inter body font-family, token rename, `.glass-card`→`.card`, scrollbar rules |
| `frontend/src/components/layout/Sidebar.tsx` | Rail bg, mobile nav bug fix (inline→Tailwind), touch targets, remove glassmorphism |
| `frontend/src/components/layout/TopBar.tsx` | Dropdown replaces pills, remove glassmorphism from container |
| `frontend/src/components/cards/KpiCard.tsx` | `glass-card` → `card` className |
| `frontend/src/components/cards/CollapsibleCard.tsx` | `glass-card` → `card` className |
| `frontend/src/components/modals/TransactionModal.tsx` | `glass-card` → `card` className |
| `frontend/src/components/charts/SankeyChart.tsx` | Horizontal scroll wrapper + iOS touch scrolling |
| `frontend/src/components/charts/FlowChart.tsx` | Horizontal scroll wrapper + iOS touch scrolling |

---

## Non-Goals
- No changes to Python backend or `generate_dashboard.py`
- No changes to TypeScript interfaces in `types.ts`
- No changes to App.tsx data-fetching or tab routing logic
- No changes to Framer Motion animations
- No changes to the 5-theme system architecture (only token values change)
- No changes to `CategoryBar`, `DebtTrendLine`, or `SpendingDonut` charts
