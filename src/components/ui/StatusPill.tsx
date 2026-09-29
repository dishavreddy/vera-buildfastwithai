type PillColor = 'success' | 'warning' | 'accent' | 'muted';

interface StatusPillProps {
  label: string;
  color: PillColor;
  pulse?: boolean;
}

const COLORS: Record<PillColor, { dot: string; text: string; bg: string }> = {
  success: { dot: 'bg-success-400', text: 'text-success-400', bg: 'bg-success-500/10' },
  warning: { dot: 'bg-warning-400', text: 'text-warning-400', bg: 'bg-warning-500/10' },
  accent: { dot: 'bg-accent-400', text: 'text-accent-300', bg: 'bg-accent-500/10' },
  muted: { dot: 'bg-text-muted', text: 'text-text-muted', bg: 'bg-white/5' },
};

export function StatusPill({ label, color, pulse = false }: StatusPillProps) {
  const c = COLORS[color];
  return (
    <div
      className={[
        'inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium',
        c.bg,
        c.text,
      ].join(' ')}
    >
      <span
        className={[
          'w-2 h-2 rounded-full',
          c.dot,
          pulse ? 'animate-pulse' : '',
        ].join(' ')}
      />
      {label}
    </div>
  );
}
