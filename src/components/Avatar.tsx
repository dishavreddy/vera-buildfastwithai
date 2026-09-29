import type { InterviewState } from '@/hooks/useVoiceInterview';

interface AvatarProps {
  state: InterviewState;
  size?: number;
}

const GLOW_COLORS: Record<InterviewState, { ring: string; glow: string; shadow: string }> = {
  idle: {
    ring: 'rgba(160, 160, 176, 0.2)',
    glow: 'rgba(160, 160, 176, 0.08)',
    shadow: '0 0 60px 8px rgba(160, 160, 176, 0.08)',
  },
  listening: {
    ring: 'rgba(52, 211, 153, 0.5)',
    glow: 'rgba(52, 211, 153, 0.2)',
    shadow: '0 0 80px 12px rgba(52, 211, 153, 0.2)',
  },
  thinking: {
    ring: 'rgba(251, 191, 36, 0.4)',
    glow: 'rgba(251, 191, 36, 0.12)',
    shadow: '0 0 60px 8px rgba(251, 191, 36, 0.12)',
  },
  speaking: {
    ring: 'rgba(34, 211, 238, 0.6)',
    glow: 'rgba(34, 211, 238, 0.25)',
    shadow: '0 0 80px 12px rgba(34, 211, 238, 0.25)',
  },
};

export function Avatar({ state, size = 200 }: AvatarProps) {
  const colors = GLOW_COLORS[state];

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {/* Outer glow ring */}
      <div
        className="absolute inset-0 rounded-full transition-all duration-500"
        style={{
          background: `radial-gradient(circle, ${colors.glow} 0%, transparent 70%)`,
        }}
      />

      {/* Pulse rings — listening */}
      {state === 'listening' && (
        <>
          <div
            className="absolute rounded-full border-2 animate-pulse-ring"
            style={{
              width: size * 0.8,
              height: size * 0.8,
              borderColor: colors.ring,
            }}
          />
          <div
            className="absolute rounded-full border-2 animate-pulse-ring"
            style={{
              width: size * 0.8,
              height: size * 0.8,
              borderColor: colors.ring,
              animationDelay: '1.2s',
            }}
          />
        </>
      )}

      {/* Orbiting dots — thinking */}
      {state === 'thinking' && (
        <>
          {[0, 120, 240].map((delay) => (
            <div
              key={delay}
              className="absolute rounded-full animate-orbit"
              style={{
                width: 6,
                height: 6,
                background: colors.ring,
                animationDelay: `${delay}ms`,
              }}
            />
          ))}
        </>
      )}

      {/* Main ring */}
      <div
        className="rounded-full flex items-center justify-center transition-all duration-500"
        style={{
          width: size * 0.7,
          height: size * 0.7,
          background: 'rgba(255, 255, 255, 0.02)',
          border: `2px solid ${colors.ring}`,
          boxShadow: colors.shadow,
          backdropFilter: 'blur(10px)',
        }}
      >
        {/* Inner orb */}
        <div
          className="rounded-full flex items-center justify-center transition-all duration-500"
          style={{
            width: size * 0.45,
            height: size * 0.45,
            background: `radial-gradient(circle at 35% 35%, ${colors.glow}, rgba(10, 10, 15, 0.8))`,
            border: `1px solid ${colors.ring}`,
          }}
        >
          {/* Center mark — "V" logo */}
          <svg
            width={size * 0.15}
            height={size * 0.15}
            viewBox="0 0 24 24"
            fill="none"
          >
            <path
              d="M4 6L12 18L20 6"
              stroke={colors.ring}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={state === 'idle' ? 0.4 : 0.8}
            />
          </svg>
        </div>
      </div>

      {/* Speaking wave bars — overlaid at bottom */}
      {state === 'speaking' && (
        <div
          className="absolute flex items-end justify-center gap-1"
          style={{ bottom: size * 0.08 }}
        >
          {[0, 100, 200, 300, 400].map((delay) => (
            <div
              key={delay}
              className="rounded-full animate-wave-bar"
              style={{
                width: 4,
                height: size * 0.12,
                background: colors.ring,
                transformOrigin: 'bottom',
                animationDelay: `${delay}ms`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
