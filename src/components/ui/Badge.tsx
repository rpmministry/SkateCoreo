import React from 'react';

export type BadgeVariant =
  | 'neutral'
  | 'cobalt'
  | 'mint'
  | 'coral'
  | 'coach'
  | 'rose'
  | 'amber'
  | 'danger'
  | 'ghost';
export type BadgeSize = 'xs' | 'sm' | 'md';

const BADGE_VARIANTS: Record<BadgeVariant, { container: string; dot: string }> = {
  neutral: {
    container: 'bg-white/[0.05] text-[#9CA3AF] border-white/[0.08]',
    dot: 'bg-[#9CA3AF]',
  },
  cobalt: {
    container: 'bg-[#2e7cf6]/10 text-[#60a5fa] border-[#2e7cf6]/25',
    dot: 'bg-[#2e7cf6]',
  },
  mint: {
    container: 'bg-[#0d9488]/10 text-[#2dd4bf] border-[#0d9488]/25',
    dot: 'bg-[#0d9488]',
  },
  coral: {
    container: 'bg-[#e11d48]/10 text-[#fb7185] border-[#e11d48]/25',
    dot: 'bg-[#e11d48]',
  },
  coach: {
    container: 'bg-[#e11d48]/10 text-[#fb7185] border-[#e11d48]/25',
    dot: 'bg-[#e11d48]',
  },
  rose: {
    container: 'bg-[#e11d48]/10 text-[#fb7185] border-[#e11d48]/25',
    dot: 'bg-[#e11d48]',
  },
  amber: {
    container: 'bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/25',
    dot: 'bg-[#f59e0b]',
  },
  danger: {
    container: 'bg-[#ef4444]/10 text-[#fca5a5] border-[#ef4444]/25',
    dot: 'bg-[#ef4444]',
  },
  ghost: {
    container: 'bg-transparent text-[#9CA3AF] border-white/[0.08]',
    dot: 'bg-[#9CA3AF]',
  },
};

const BADGE_SIZES: Record<BadgeSize, string> = {
  xs: 'px-1.5 py-0.5 text-[9px] gap-1',
  sm: 'px-2 py-0.5 text-[10px] gap-1.5',
  md: 'px-2.5 py-1 text-xs gap-1.5',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  icon?: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  size = 'sm',
  dot = false,
  icon,
  className = '',
  children,
  ...rest
}) => {
  const styles = BADGE_VARIANTS[variant];

  return (
    <span
      className={[
        'inline-flex items-center font-mono font-medium uppercase tracking-wider rounded-full border',
        styles.container,
        BADGE_SIZES[size],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {dot && (
        <span
          className={`h-1.5 w-1.5 rounded-full shrink-0 ${styles.dot}`}
          aria-hidden="true"
        />
      )}
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </span>
  );
};

