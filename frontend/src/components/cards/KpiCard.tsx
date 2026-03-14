import { motion } from 'framer-motion';

interface KpiCardProps {
  label: string;
  value: string;        // pre-formatted string e.g. "$50,608.96"
  subtitle?: string;
  variant?: 'positive' | 'negative' | 'neutral' | 'special';
  highlighted?: boolean; // adds highlighted border (for special KPI)
}

const variantConfig = {
  positive: {
    textColor: 'var(--accent-green)',
  },
  negative: {
    textColor: 'var(--accent-red)',
  },
  special: {
    textColor: 'var(--accent-purple)',
  },
  neutral: {
    textColor: 'var(--text-primary)',
  },
};

const variantCssVar: Record<string, string> = {
  positive: 'var(--accent-green)',
  negative: 'var(--accent-red)',
  special: 'var(--accent-purple)',
  neutral: 'var(--accent-blue)',
};

export function KpiCard({
  label,
  value,
  subtitle,
  variant = 'neutral',
  highlighted = false,
}: KpiCardProps) {
  const config = variantConfig[variant];
  const highlightedBorderColor = highlighted ? variantCssVar[variant] : 'var(--border-subtle)';

  return (
    <div
      className="kpi-card card"
      style={{
        padding: '1.5rem',
        borderRadius: '0.875rem',
        border: `1px solid ${highlightedBorderColor}`,
        transition:
          'background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease',
      }}
    >
      {/* Label */}
      <div
        style={{
          fontSize: '0.75rem',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: 'var(--text-muted)',
          marginBottom: '0.5rem',
          lineHeight: 1.4,
        }}
      >
        {label}
      </div>

      {/* Value with animation */}
      <motion.div
        key={value}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 40 }}
        style={{
          fontSize: '2rem',
          fontWeight: 700,
          lineHeight: 1.2,
          color: config.textColor,
          marginBottom: subtitle ? '0.5rem' : 0,
          wordBreak: 'break-word',
        }}
      >
        {value}
      </motion.div>

      {/* Subtitle */}
      {subtitle && (
        <div
          style={{
            fontSize: '0.8125rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.4,
            marginTop: '0.25rem',
          }}
        >
          {subtitle}
        </div>
      )}
    </div>
  );
}
