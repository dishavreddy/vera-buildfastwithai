import type { InterviewState } from '@/hooks/useVoiceInterview';

interface StateIndicatorProps {
  state: InterviewState;
}

const STATE_CONFIG: Record<
  InterviewState,
  { label: string; color: string; dotClass: string; sublabel: string }
> = {
  idle: {
    label: 'Ready',
    color: 'text-slate-400',
    dotClass: 'bg-slate-400',
    sublabel: 'Press Start to begin',
  },
  listening: {
    label: 'Listening',
    color: 'text-emerald-400',
    dotClass: 'bg-emerald-400',
    sublabel: 'Speak naturally — Vera is hearing you',
  },
  thinking: {
    label: 'Thinking',
    color: 'text-amber-400',
    dotClass: 'bg-amber-400',
    sublabel: 'Processing your response…',
  },
  speaking: {
    label: 'Speaking',
    color: 'text-sky-400',
    dotClass: 'bg-sky-400',
    sublabel: 'Vera is responding — speak to interrupt',
  },
};

export function StateIndicator({ state }: StateIndicatorProps) {
  const config = STATE_CONFIG[state];
  const isActive = state !== 'idle';

  return (
    <div className="flex flex-col items-center gap-4 py-8">
      {/* Animated dots / waveform */}
      <div className="flex items-center gap-2 h-12">
        {isActive ? (
          <>
            <span
              className={`inline-block w-3 h-3 rounded-full ${config.dotClass} animate-pulse`}
              style={{ animationDelay: '0ms' }}
            />
            <span
              className={`inline-block rounded-full ${config.dotClass} animate-pulse`}
              style={{
                animationDelay: '150ms',
                width: state === 'speaking' ? '6px' : '4px',
                height: state === 'speaking' ? '28px' : '24px',
              }}
            />
            <span
              className={`inline-block rounded-full ${config.dotClass} animate-pulse`}
              style={{
                animationDelay: '300ms',
                width: state === 'speaking' ? '6px' : '4px',
                height: state === 'speaking' ? '40px' : '32px',
              }}
            />
            <span
              className={`inline-block rounded-full ${config.dotClass} animate-pulse`}
              style={{
                animationDelay: '450ms',
                width: state === 'speaking' ? '6px' : '4px',
                height: state === 'speaking' ? '28px' : '24px',
              }}
            />
            <span
              className={`inline-block w-3 h-3 rounded-full ${config.dotClass} animate-pulse`}
              style={{ animationDelay: '600ms' }}
            />
          </>
        ) : (
          <span className="inline-block w-3 h-3 rounded-full bg-slate-500" />
        )}
      </div>

      {/* State label */}
      <div className="text-center">
        <p className={`text-2xl font-semibold tracking-tight ${config.color}`}>
          {config.label}
        </p>
        <p className="text-sm text-slate-500 mt-1">{config.sublabel}</p>
      </div>
    </div>
  );
}
