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
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-subtle)',
      borderRadius: '0.875rem',
      padding: '1.25rem',
      marginBottom: '1rem',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
            {account.account_name}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
            {account.account_type}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {matchSecured && (
            <span style={{
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              color: '#fff',
              fontSize: '0.6875rem',
              fontWeight: 700,
              padding: '0.2rem 0.5rem',
              borderRadius: '999px',
              letterSpacing: '0.03em',
            }}>
              🏆 Match Secured
            </span>
          )}
          <button
            onClick={() => onEdit(account)}
            title="Edit account"
            style={{
              background: 'transparent',
              border: '1px solid var(--border-subtle)',
              borderRadius: '0.375rem',
              padding: '0.25rem 0.5rem',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              fontSize: '0.75rem',
            }}
          >
            ✏️
          </button>
        </div>
      </div>

      {/* Contribution amounts */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.625rem' }}>
        <span style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          {fmt(account.ytd_contributions)}
        </span>
        <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          of {fmt(account.annual_limit)} limit
        </span>
      </div>

      {/* Progress bar track */}
      <div style={{
        position: 'relative',
        height: 12,
        borderRadius: 999,
        background: 'var(--bg-base)',
        border: '1px solid var(--border-subtle)',
        overflow: 'visible',
        marginBottom: '0.5rem',
      }}>
        {/* Fill */}
        <div style={{
          position: 'absolute',
          left: 0, top: 0, bottom: 0,
          width: `${fillPct}%`,
          background: barColor,
          borderRadius: 999,
          transition: 'width 0.4s ease',
        }} />

        {/* Ghost car notch */}
        <div
          title={`On-pace target: ${fmt(targetPace)}`}
          style={{
            position: 'absolute',
            top: -2, bottom: -2,
            left: `${pacePct}%`,
            width: 2,
            background: 'rgba(255,255,255,0.85)',
            borderRadius: 2,
            zIndex: 2,
            transform: 'translateX(-50%)',
          }}
        />
        {/* Ghost car label */}
        <div style={{
          position: 'absolute',
          top: -18,
          left: `${pacePct}%`,
          transform: 'translateX(-50%)',
          fontSize: '0.5625rem',
          color: 'var(--text-muted)',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}>
          👻
        </div>

        {/* Match checkpoint (shown only when not yet secured and target exists) */}
        {matchPct !== null && !matchSecured && (
          <>
            <div
              title={`Free money checkpoint: ${fmt(matchTarget!)}`}
              style={{
                position: 'absolute',
                top: -4, bottom: -4,
                left: `${matchPct}%`,
                width: 2,
                borderLeft: '2px dashed #f59e0b',
                zIndex: 3,
                transform: 'translateX(-50%)',
              }}
            />
            <div style={{
              position: 'absolute',
              top: -20,
              left: `${matchPct}%`,
              transform: 'translateX(-50%)',
              fontSize: '0.625rem',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
            }}>
              ⭐
            </div>
          </>
        )}
      </div>

      {/* Status text */}
      <div style={{ fontSize: '0.75rem', minHeight: '1rem' }}>
        {isOnPace ? (
          <span style={{ color: '#22c55e', fontWeight: 600 }}>✓ On pace</span>
        ) : (
          <span style={{ color: '#f59e0b', fontWeight: 600 }}>
            +{fmt(monthlyNeeded)}/mo to catch up
          </span>
        )}
      </div>
    </div>
  );
}
