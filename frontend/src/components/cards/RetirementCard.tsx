import type { RetirementAccount } from '../../types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function getDayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.floor((d.getTime() - start.getTime()) / 86_400_000) + 1;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface RetirementCardProps {
  account: RetirementAccount;
  onEdit: (account: RetirementAccount) => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function RetirementCard({ account, onEdit }: RetirementCardProps) {
  const now = new Date();

  // Guard against division by zero (annual_limit validated as > 0 in backend, but defensive)
  if (account.annual_limit <= 0) return null;

  const dayOfYear = getDayOfYear(now);
  const daysInYear = isLeapYear(now.getFullYear()) ? 366 : 365;
  const targetPace = (dayOfYear / daysInYear) * account.annual_limit;

  const fillPct  = Math.min(100, (account.ytd_contributions / account.annual_limit) * 100);
  const pacePct  = Math.min(100, (targetPace / account.annual_limit) * 100);
  const isOnPace = account.ytd_contributions >= targetPace;

  const matchTarget   = account.employer_match_target;
  const matchSecured  = matchTarget !== null && account.ytd_contributions >= matchTarget;
  const matchPct      = matchTarget !== null ? Math.min(100, (matchTarget / account.annual_limit) * 100) : null;

  // Catch-up text (shown only when behind)
  const monthOfYear     = now.getMonth(); // 0-indexed; December = 11
  const monthsRemaining = Math.max(1, 12 - monthOfYear);
  const deficit         = targetPace - account.ytd_contributions;
  const monthlyNeeded   = deficit / monthsRemaining;

  const barColor = isOnPace ? '#22c55e' : '#f59e0b';

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-[0.875rem] p-5 mb-4">
      {/* Header */}
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="font-bold text-base text-[var(--text-primary)]">
            {account.account_name}
          </div>
          <div className="text-xs text-[var(--text-muted)] mt-[0.15rem]">
            {account.account_type}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {matchSecured && (
            <span className="bg-[linear-gradient(135deg,#f59e0b,#d97706)] text-white text-[0.6875rem] font-bold px-2 py-[0.2rem] rounded-full tracking-[0.03em]">
              🏆 Match Secured
            </span>
          )}
          <button
            onClick={() => onEdit(account)}
            title="Edit account"
            className="bg-transparent border border-[var(--border-subtle)] rounded-[0.375rem] px-2 py-1 cursor-pointer text-[var(--text-muted)] text-xs"
          >
            ✏️
          </button>
        </div>
      </div>

      {/* Contribution amounts */}
      <div className="flex justify-between mb-[0.625rem]">
        <span className="text-lg font-bold text-[var(--text-primary)]">
          {fmt(account.ytd_contributions)}
        </span>
        <span className="text-sm text-[var(--text-muted)]">
          of {fmt(account.annual_limit)} limit
        </span>
      </div>

      {/* Progress bar track */}
      <div className="relative h-3 rounded-full bg-[var(--bg-base)] border border-[var(--border-subtle)] overflow-visible mb-2">
        {/* Fill */}
        <div
          className="absolute left-0 top-0 bottom-0 rounded-full transition-[width] duration-[400ms]"
          style={{ width: `${fillPct}%`, background: barColor }}
        />

        {/* Ghost car notch */}
        <div
          title={`On-pace target: ${fmt(targetPace)}`}
          className="absolute -top-0.5 -bottom-0.5 w-[2px] bg-white/85 rounded-[2px] z-[2] -translate-x-1/2"
          style={{ left: `${pacePct}%` }}
        />
        {/* Ghost car label */}
        <div
          className="absolute -top-[18px] text-[0.5625rem] text-[var(--text-muted)] whitespace-nowrap pointer-events-none -translate-x-1/2"
          style={{ left: `${pacePct}%` }}
        >
          👻
        </div>

        {/* Match checkpoint (shown only when not yet secured and target exists) */}
        {matchPct !== null && !matchSecured && (
          <>
            <div
              title={`Free money checkpoint: ${fmt(matchTarget!)}`}
              className="absolute -top-1 -bottom-1 w-[2px] border-l-2 border-dashed border-amber-400 z-[3] -translate-x-1/2"
              style={{ left: `${matchPct}%` }}
            />
            <div
              className="absolute -top-5 text-[0.625rem] whitespace-nowrap pointer-events-none -translate-x-1/2"
              style={{ left: `${matchPct}%` }}
            >
              ⭐
            </div>
          </>
        )}
      </div>

      {/* Status text */}
      <div className="text-xs min-h-4">
        {isOnPace ? (
          <span className="text-green-500 font-semibold">✓ On pace</span>
        ) : (
          <span className="text-amber-400 font-semibold">
            +{fmt(monthlyNeeded)}/mo to catch up
          </span>
        )}
      </div>
    </div>
  );
}
