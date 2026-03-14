import type { Theme } from '../lib/theme';

interface SettingsTabProps {
  activeTheme: Theme;
  onThemeChange: (t: Theme) => void;
}

// Hardcoded swatch colors — independent of CSS vars so they always render correctly
const THEMES: {
  id: Theme;
  label: string;
  description: string;
  swatches: [string, string, string, string]; // [bg, blue, green, red]
}[] = [
  {
    id: 'system',
    label: 'System',
    description: 'Follows your OS preference',
    swatches: ['#0f172a', '#60a5fa', '#4ade80', '#f87171'],
  },
  {
    id: 'light',
    label: 'Light',
    description: 'Clean light interface',
    swatches: ['#f0f4f8', '#2563eb', '#16a34a', '#dc2626'],
  },
  {
    id: 'dark',
    label: 'Dark',
    description: 'Easy on the eyes',
    swatches: ['#0f172a', '#60a5fa', '#4ade80', '#f87171'],
  },
  {
    id: 'pastel',
    label: 'Pastel',
    description: 'Soft, warm tones',
    swatches: ['#faf7f5', '#7c9dd4', '#7ab89a', '#d4826b'],
  },
  {
    id: 'high-contrast',
    label: 'High Contrast',
    description: 'Maximum readability',
    swatches: ['#000000', '#4fc3f7', '#69f0ae', '#ff5252'],
  },
];

export function SettingsTab({ activeTheme, onThemeChange }: SettingsTabProps) {
  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{
        fontSize: '1.5rem',
        fontWeight: 700,
        color: 'var(--text-primary)',
        marginBottom: '0.5rem',
      }}>
        Settings
      </h1>
      <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '2rem' }}>
        Customize your dashboard appearance.
      </p>

      <h2 style={{
        fontSize: '0.75rem',
        fontWeight: 600,
        color: 'var(--text-secondary)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: '0.75rem',
      }}>
        Theme
      </h2>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: '0.75rem',
      }}>
        {THEMES.map(({ id, label, description, swatches }) => {
          const isActive = activeTheme === id;
          return (
            <button
              key={id}
              onClick={() => onThemeChange(id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.625rem',
                padding: '1rem',
                borderRadius: '0.75rem',
                border: isActive
                  ? '2px solid var(--accent-blue)'
                  : '1px solid var(--border-subtle)',
                background: isActive
                  ? 'color-mix(in srgb, var(--accent-blue) 8%, var(--bg-surface))'
                  : 'var(--bg-surface)',
                cursor: 'pointer',
                textAlign: 'left',
                outline: 'none',
                transition: 'border-color 0.15s ease, background 0.15s ease',
                position: 'relative',
              }}
            >
              {/* Active checkmark */}
              {isActive && (
                <div style={{
                  position: 'absolute',
                  top: '0.5rem',
                  right: '0.5rem',
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: 'var(--accent-blue)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.625rem',
                  color: '#fff',
                }}>
                  ✓
                </div>
              )}

              {/* Color swatches */}
              <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                {swatches.map((color, i) => (
                  <div
                    key={i}
                    style={{
                      width: i === 0 ? 24 : 14,
                      height: i === 0 ? 24 : 14,
                      borderRadius: '50%',
                      background: color,
                      border: color === '#ffffff' || color === '#f0f4f8' || color === '#faf7f5'
                        ? '1px solid rgba(0,0,0,0.1)'
                        : 'none',
                      flexShrink: 0,
                    }}
                  />
                ))}
              </div>

              {/* Label */}
              <div>
                <div style={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  marginBottom: '0.2rem',
                }}>
                  {label}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {description}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
