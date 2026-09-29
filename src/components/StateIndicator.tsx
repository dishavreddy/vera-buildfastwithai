import { motion } from 'framer-motion';
import type { InterviewState } from '@/hooks/useVoiceInterview';
import { Avatar } from '@/components/Avatar';
import { StatusPill } from '@/components/ui/StatusPill';

interface StateIndicatorProps {
  state: InterviewState;
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
    sublabel: 'Speak naturally — Vera is hearing you',
    pillColor: 'success',
    pulse: true,
  },
  thinking: {
    label: 'Thinking',
    pillLabel: 'Thinking...',
    sublabel: 'Processing your response',
    pillColor: 'warning',
    pulse: false,
  },
  speaking: {
    label: 'Speaking',
    pillLabel: 'Vera is speaking',
    sublabel: 'Vera is responding — speak to interrupt',
    pillColor: 'accent',
    pulse: false,
  },
};

export function StateIndicator({ state }: StateIndicatorProps) {
  const config = STATE_CONFIG[state];

  return (
    <div className="flex flex-col items-center gap-6 py-6">
      {/* Avatar */}
      <motion.div
        key={state}
        initial={{ scale: 0.92, opacity: 0.5 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <Avatar state={state} size={220} />
      </motion.div>

      {/* Status pill */}
      <motion.div
        key={`pill-${state}`}
        initial={{ y: 8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        <StatusPill label={config.pillLabel} color={config.pillColor} pulse={config.pulse} />
      </motion.div>

      {/* Sublabel */}
      <p className="text-sm text-text-muted text-center max-w-xs">{config.sublabel}</p>
    </div>
  );
}
