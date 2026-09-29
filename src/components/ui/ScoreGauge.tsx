interface ScoreGaugeProps {
  label: string;
  value: string;
}

function getLevel(value: string): { color: string; level: string; percentage: number } {
  const lower = value.toLowerCase();
  if (lower.includes('strong') || lower.includes('excellent') || lower.includes('great') || lower.includes('8') || lower.includes('9')) {
    return { color: '#34d399', level: 'Strong', percentage: 90 };
  }
  if (lower.includes('moderate') || lower.includes('good') || lower.includes('solid') || lower.includes('6') || lower.includes('7')) {
    return { color: '#22d3ee', level: 'Moderate', percentage: 65 };
  }
  if (lower.includes('needs') || lower.includes('weak') || lower.includes('poor') || lower.includes('low') || lower.includes('below')) {
    return { color: '#fbbf24', level: 'Needs work', percentage: 35 };
  }
  return { color: '#a0a0b0', level: '—', percentage: 50 };
}

export function ScoreGauge({ label, value }: ScoreGaugeProps) {
  const { color, level, percentage } = getLevel(value);
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="6"
          />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-semibold" style={{ color }}>
            {level}
          </span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-xs font-medium text-text-primary">{label}</p>
      </div>
    </div>
  );
}
