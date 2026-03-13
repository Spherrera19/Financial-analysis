import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronUp } from 'lucide-react';
import { cn } from '../../lib/utils';

interface CollapsibleCardProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export function CollapsibleCard({
  title,
  children,
  defaultOpen = true,
  className,
}: CollapsibleCardProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={cn('glass-card', className)}>
      {/* Header */}
      <button
        onClick={() => setIsOpen(prev => !prev)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: '1.25rem 1.5rem',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          outline: 'none',
          textAlign: 'left',
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: '1rem',
            fontWeight: 600,
            color: 'var(--text-primary)',
            lineHeight: 1.3,
          }}
        >
          {title}
        </h2>
        <motion.span
          animate={{ rotate: isOpen ? 0 : 180 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}
        >
          <ChevronUp size={18} strokeWidth={2} />
        </motion.span>
      </button>

      {/* Collapsible content */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '0 1.5rem 1.5rem' }}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
