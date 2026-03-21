# Polling Interceptor for GuidedTour — Design Spec

## Problem

The controlled react-joyride tour navigates the app to the correct tab before each step, then calls `setStepIndex` directly. Because React re-renders and Chart.js chart initialisation are asynchronous, Joyride sometimes tries to attach its tooltip before the target DOM element exists or has painted — causing it to panic, skip the step, or crash.

The current workaround is a 400ms `setTimeout` in `handleCallback`. This is a fixed delay that is simultaneously too short on slow machines and too long on fast ones.

## Solution

Replace the fixed delay with a **Polling Interceptor**: a `useEffect` that pauses Joyride (`run={false}`) whenever the step index changes, then polls `document.querySelector` at 100ms intervals until the target element exists and has a non-zero rendered width. Only then does it resume Joyride (`run={true}`). This makes the tour self-timing — it waits exactly as long as needed, regardless of device speed or chart render time.

---

## Architecture

Single file change: `frontend/src/components/layout/GuidedTour.tsx`.

### Component restructure

The current component early-returns `null` before any logic. React's rules of hooks require all hooks to appear before any conditional return. The component must be restructured so that `useState` and `useEffect` appear at the top, and the early return moves below them:

```
GuidedTour() {
  // 1. Hooks (unconditional)
  const [runTour, setRunTour] = useState(false);
  const steps    = activeTour === 'basic' ? BASIC_STEPS    : ADVANCED_STEPS;
  const stepTabs = activeTour === 'basic' ? BASIC_STEP_TABS : ADVANCED_STEP_TABS;
  useEffect(/* polling interceptor */, [activeTour, stepIndex]);

  // 2. Early return (after hooks)
  if (!activeTour) return null;

  // 3. Callback + JSX
  function handleCallback(...) { ... }
  return <Joyride run={runTour} ... />;
}
```

`steps` and `stepTabs` are derived before the early return because the polling `useEffect` needs them. When `activeTour` is null, they default to `ADVANCED_STEPS`/`ADVANCED_STEP_TABS` — this is safe because the useEffect guards on `!activeTour` and returns immediately.

---

## Polling useEffect

**Dependencies:** `[activeTour, stepIndex]`

The full body of the effect:

```
if (!activeTour) {
  setRunTour(false);
  return;
}

setRunTour(false);                          // pause Joyride immediately

const targetSelector = steps[stepIndex]?.target as string;
let attempts = 0;
const MAX_ATTEMPTS = 50;                    // 50 × 100ms = 5s timeout

const intervalId = setInterval(() => {
  attempts++;
  const el = document.querySelector(targetSelector);

  if (el && el.getBoundingClientRect().width > 0) {
    // Target exists and has painted — resume tour
    setRunTour(true);
    clearInterval(intervalId);
    return;
  }

  if (attempts >= MAX_ATTEMPTS) {
    clearInterval(intervalId);
    console.warn(`[GuidedTour] Target not found after 5s: "${targetSelector}"`);

    const nextIndex = stepIndex + 1;
    if (nextIndex < steps.length) {
      setActiveTab(stepTabs[nextIndex]);
      setStepIndex(nextIndex);
    } else {
      // activeTour is guaranteed non-null here: the effect returns early when !activeTour,
      // so the interval can never reach this branch unless activeTour is set.
      onFinish(activeTour!);
    }
  }
}, 100);

// Cleanup: cancel in-flight poll when deps change or component unmounts
return () => clearInterval(intervalId);
```

**Key properties:**
- `setRunTour(false)` fires synchronously on every step change — Joyride never sees a step it can't attach to
- The 100ms poll is negligible overhead; the interval is always cleared immediately on success
- The cleanup function prevents stale intervals from firing if the user navigates quickly
- `getBoundingClientRect().width > 0` confirms the element has actually painted, not just been inserted into the DOM as a zero-size placeholder

---

## Updated handleCallback

`setTimeout` is removed entirely. Setting `setStepIndex` now triggers the `useEffect` which handles all timing.

| Event | Action | New behavior |
|---|---|---|
| `STATUS.FINISHED` / `STATUS.SKIPPED` | any | `onFinish(activeTour!)` — unchanged, early return |
| `EVENTS.STEP_AFTER` | `ACTIONS.NEXT` | `setRunTour(false)` → `setActiveTab(stepTabs[nextIndex])` → `setStepIndex(nextIndex)` directly |
| `EVENTS.STEP_AFTER` | `ACTIONS.PREV` | `setRunTour(false)` → `setActiveTab(stepTabs[prevIndex])` → `setStepIndex(prevIndex)` directly |
| `EVENTS.TARGET_NOT_FOUND` | any | Force-advance: same behavior as NEXT (skip broken step) |

**Bounds guards retained:**
- NEXT: `if (nextIndex < steps.length)` — last-step NEXT does nothing; `STATUS.FINISHED` fires next and handles cleanup
- PREV: `if (prevIndex >= 0)` — step-0 PREV does nothing; Joyride hides the Back button at step 0

---

## Joyride prop change

```tsx
// Before:
run={true}

// After:
run={runTour}
```

All other Joyride props are unchanged.

---

## Error handling

| Failure scenario | Handling |
|---|---|
| Target never appears (5s timeout) | Warn to console, auto-advance to next step (or finish if last) |
| `TARGET_NOT_FOUND` event from Joyride | Force-advance to next step |
| Component unmounts mid-poll | `clearInterval` in useEffect cleanup — no state update on dead component |
| `activeTour` set to null mid-tour | useEffect fires, `setRunTour(false)`, returns — tour pauses and the `if (!activeTour) return null` renders nothing |

---

## What is NOT changing

- `BASIC_STEPS`, `ADVANCED_STEPS`, `BASIC_STEP_TABS`, `ADVANCED_STEP_TABS` — unchanged
- `JOYRIDE_STYLES` — unchanged
- All Joyride props except `run` — unchanged
- `useTour.ts` — unchanged
- `App.tsx` — unchanged
- All tab page files — unchanged
