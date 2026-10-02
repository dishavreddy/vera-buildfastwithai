import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  glow?: boolean;
}

export function Card({ children, className = '', glow = false }: CardProps) {
  return (
    <div
      className={[
        'glass rounded-[2rem] p-5 transition-transform duration-200 hover-lime',
        glow ? 'glow-accent' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}

export const GlassCard = Card;
