import type { ReactNode } from 'react';

export function Tag({ children, tone = 'lime', dot = false, className = '' }: { children: ReactNode; tone?: 'lime' | 'emerald' | 'muted' | 'rose'; dot?: boolean; className?: string }) {
  const tones = {
    lime: 'border-lime-300/20 bg-lime-300/[.07] text-lime-100',
    emerald: 'border-emerald-400/20 bg-emerald-400/[.07] text-emerald-200',
    muted: 'border-white/10 bg-white/[.035] text-text-secondary',
    rose: 'border-rose-300/20 bg-rose-300/[.07] text-rose-100',
  };
  return <span className={`inline-flex min-h-7 items-center gap-2 rounded-full border px-3 py-1 font-micro ${tones[tone]} ${className}`}>{dot && <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse"/>}{children}</span>;
}

export function Stepper({ steps, current, completed = -1 }: { steps: string[]; current: number; completed?: number }) {
  return (
    <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label="Progress">
      {steps.map((step, index) => {
        const done = index <= completed;
        const active = index === current;
        return <li key={step} className={`flex min-w-0 items-center gap-2 rounded-full border px-3 py-2.5 ${active ? 'border-lime-300/40 bg-lime-300/[.07]' : done ? 'border-emerald-400/20 bg-emerald-400/[.04]' : 'border-white/[.08] bg-white/[.02]'}`} aria-current={active ? 'step' : undefined}>
          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${active ? 'bg-lime-300 text-black' : done ? 'bg-emerald-400/15 text-emerald-200' : 'bg-white/[.07] text-text-muted'}`}>{done ? '✓' : index + 1}</span>
          <span className={`truncate text-xs ${active ? 'text-text-primary' : 'text-text-secondary'}`}>{step}</span>
        </li>;
      })}
    </ol>
  );
}

export function MicMeter({ level, status = 'idle' }: { level: number; status?: 'idle' | 'checking' | 'ready' | 'failed' }) {
  const safeLevel = Math.max(0, Math.min(1, level));
  return <div className="flex min-w-0 items-center gap-3" role="meter" aria-label="Microphone input level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(safeLevel * 100)}>
    <div className="flex h-8 flex-1 items-center gap-1" aria-hidden="true">
      {Array.from({ length: 24 }, (_, i) => {
        const threshold = (i + 1) / 24;
        const lit = safeLevel >= threshold;
        return <span key={i} className={`h-1.5 flex-1 rounded-full transition-transform duration-150 ${lit ? (status === 'failed' ? 'bg-rose-300' : 'bg-lime-300') : 'bg-white/10'}`} style={{ transform: `scaleY(${lit ? 1 + safeLevel * 1.5 : .66})` }} />;
      })}
    </div>
    <span className="w-8 text-right font-micro text-text-muted">{Math.round(safeLevel * 100)}%</span>
  </div>;
}
