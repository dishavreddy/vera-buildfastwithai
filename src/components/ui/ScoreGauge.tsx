interface ScoreGaugeProps {
  label: string;
  value?: string;
}

function getLevel(value?: string): { color: string; level: string; percentage: number; badgeBg: string } {
  const lower = (value || '').toLowerCase();
  if (
    lower.includes('strong') ||
    lower.includes('high') ||
    lower.includes('excellent') ||
    lower.includes('great') ||
    lower.includes('advanced') ||
    lower.includes('8') ||
    lower.includes('9') ||
    lower.includes('10')
  ) {
    return { color: '#34d399', level: 'Strong', percentage: 92, badgeBg: 'rgba(52, 211, 153, 0.12)' };
  }
  if (
    lower.includes('moderate') ||
    lower.includes('medium') ||
    lower.includes('good') ||
    lower.includes('solid') ||
    lower.includes('average') ||
    lower.includes('6') ||
    lower.includes('7')
  ) {
    return { color: '#22d3ee', level: 'Moderate', percentage: 68, badgeBg: 'rgba(34, 211, 238, 0.12)' };
  }
  if (
    lower.includes('need') ||
    lower.includes('work') ||
    lower.includes('weak') ||
    lower.includes('poor') ||
    lower.includes('low') ||
    lower.includes('below') ||
    lower.includes('improve') ||
    lower.includes('fair')
  ) {
    return { color: '#f59e0b', level: 'Needs work', percentage: 38, badgeBg: 'rgba(245, 158, 11, 0.12)' };
  }
  return { color: '#22d3ee', level: 'Moderate', percentage: 65, badgeBg: 'rgba(34, 211, 238, 0.12)' };
}

export function ScoreGauge({ label, value = 'Moderate' }: ScoreGaugeProps) {
  const { color, level, percentage, badgeBg } = getLevel(value);
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2.5 p-3 rounded-2xl glass hover:border-white/20 transition-all">
      <div className="relative w-24 h-24 flex items-center justify-center">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="7"
          />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 1s ease-out' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] font-bold tracking-tight text-center px-1" style={{ color }}>
            {level}
          </span>
          <span className="text-[9px] text-text-muted mt-0.5">{percentage}%</span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-xs font-semibold text-text-primary leading-tight">{label}</p>
        <span
          className="inline-block text-[10px] px-2 py-0.5 rounded-full mt-1 font-medium"
          style={{ backgroundColor: badgeBg, color }}
        >
          {level}
        </span>
      </div>
    </div>
  );
}
