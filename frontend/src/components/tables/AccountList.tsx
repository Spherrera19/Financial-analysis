import type { Account } from '../../types';

interface AccountListProps {
  accounts: Account[];
  showType?: 'all' | 'assets' | 'liabilities';
}

function formatBalance(b: number): string {
  const abs = Math.abs(b).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return b < 0 ? `-$${abs}` : `$${abs}`;
}

function AccountList({ accounts, showType = 'all' }: AccountListProps) {
  const filtered = accounts.filter((a) => {
    if (showType === 'assets') return a.type === 'asset';
    if (showType === 'liabilities') return a.type === 'liability';
    return true;
  });

  const total = filtered.reduce((sum, a) => sum + a.balance, 0);

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        borderRadius: 12,
        border: '1px solid var(--border-subtle)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ maxHeight: 320, overflowY: 'auto', flex: 1 }}>
        {filtered.length === 0 ? (
          <div
            style={{
              padding: '24px 16px',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: 13,
            }}
          >
            No accounts to display.
          </div>
        ) : (
          filtered.map((account, i) => (
            <div
              key={account.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 16px',
                background: 'var(--bg-surface-2)',
                borderBottom:
                  i < filtered.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                gap: 12,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    color: 'var(--text-primary)',
                    fontSize: 13,
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {account.name}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 1 }}>
                  {account.type === 'asset' ? 'Asset' : 'Liability'} · {account.date}
                </div>
              </div>
              <div
                style={{
                  color: account.balance >= 0 ? 'var(--accent-green)' : 'var(--accent-red)',
                  fontWeight: 600,
                  fontSize: 13,
                  fontVariantNumeric: 'tabular-nums',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {formatBalance(account.balance)}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Total row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          borderTop: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface)',
        }}
      >
        <span style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600 }}>
          Total
        </span>
        <span
          style={{
            color: total >= 0 ? 'var(--accent-green)' : 'var(--accent-red)',
            fontSize: 13,
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {formatBalance(total)}
        </span>
      </div>
    </div>
  );
}

export { AccountList };
