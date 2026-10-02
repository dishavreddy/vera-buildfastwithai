import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-accent-500 text-black font-bold hover:scale-105 active:scale-[0.98] primary-glow border border-accent-300/50',
  secondary:
    'glass text-text-primary hover:bg-white/[0.08] hover:border-accent-300/30 active:bg-white/[0.1] active:scale-[0.98]',
  ghost:
    'text-text-secondary hover:text-text-primary hover:bg-white/5 active:scale-[0.98]',
  danger:
    'bg-rose-400/10 text-rose-200 border border-rose-300/30 hover:bg-rose-400/20 active:bg-rose-400/15 active:scale-[0.98]',
};

const SIZES: Record<Size, string> = {
  sm: 'px-4 py-2 text-xs rounded-full gap-1.5 min-h-10',
  md: 'px-5 py-3 text-sm rounded-full gap-2 min-h-11',
  lg: 'px-7 py-4 text-base rounded-full gap-2.5 min-h-12',
};

export function Button({
  variant = 'primary',
  size = 'md',
  children,
  className = '',
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled}
      className={[
        'inline-flex items-center justify-center font-semibold tracking-tight',
        'transition-transform duration-200 ease-out outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:active:scale-100',
        VARIANTS[variant],
        SIZES[size],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </button>
  );
}
