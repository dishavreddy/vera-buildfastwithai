import type { ReactNode } from 'react';

type ChipColor = 'accent' | 'success' | 'warning' | 'muted';

interface ChipProps {
  children: ReactNode;
  color?: ChipColor;
  className?: string;
}

const COLORS: Record<ChipColor, string> = {
  accent: 'bg-accent-500/10 text-lime-100 border-accent-500/25',
  success: 'bg-success-500/10 text-success-400 border-success-500/20',
  warning: 'bg-warning-500/10 text-warning-400 border-warning-500/20',
  muted: 'bg-white/5 text-text-secondary border-white/10',
};

export function Chip({ children, color = 'muted', className = '' }: ChipProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium',
        'transition-transform duration-200',
        COLORS[color],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </span>
  );
}
