import { motion } from 'framer-motion';
import type { InterviewState } from '@/hooks/useVoiceInterview';
import { VeraAvatar } from '@/components/VeraAvatar';
import { StatusPill } from '@/components/ui/StatusPill';

interface StateIndicatorProps {
  state: InterviewState;
  speaking?: boolean;
  wordTick?: number;
  isInterrupted?: boolean;
  audioLevel?: number;
}

const STATE_CONFIG: Record<
  InterviewState,
  { label: string; pillLabel: string; sublabel: string; pillColor: 'success' | 'warning' | 'accent' | 'muted'; pulse: boolean }
> = {
  idle: {
    label: 'Ready',
    pillLabel: 'Ready',
    sublabel: 'Press Start to begin',
    pillColor: 'muted',
    pulse: false,
  },
  listening: {
    label: 'Listening',
    pillLabel: 'Listening...',
    sublabel: 'Speak naturally — Vera is listening',
    pillColor: 'success',
    pulse: true,
  },
  thinking: {
    label: 'Thinking',
    pillLabel: 'Thinking...',
    sublabel: 'Analyzing your response',
    pillColor: 'warning',
    pulse: false,
  },
  speaking: {
    label: 'Speaking',
    pillLabel: 'Vera is speaking',
    sublabel: 'Speak anytime to interrupt',
    pillColor: 'accent',
    pulse: false,
  },
};

export function StateIndicator({
  state,
  speaking = false,
  wordTick = 0,
  isInterrupted = false,
  audioLevel,
}: StateIndicatorProps) {
  const config = STATE_CONFIG[state];

  return (
    <div className="flex flex-col items-center gap-5 py-4">
      {/* Vera SVG Avatar */}
      <motion.div
        key="avatar"
        initial={{ scale: 0.95, opacity: 0.8 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        <VeraAvatar
          state={state}
          audioLevel={audioLevel}
          micLevel={0}
          wordTick={wordTick}
          interrupted={isInterrupted}
          size={240}
        />
      </motion.div>

      {/* Status pill directly underneath */}
      <motion.div
        key={`pill-${state}`}
        initial={{ y: 6, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
      >
        <StatusPill label={config.pillLabel} color={config.pillColor} pulse={config.pulse} />
      </motion.div>

      {/* Helper hint */}
      <p className="text-xs text-text-muted text-center max-w-xs">{config.sublabel}</p>
    </div>
  );
}
