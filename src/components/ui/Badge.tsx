import React from 'react';

export type BadgeVariant = 'neutral' | 'cobalt' | 'mint' | 'coral' | 'amber' | 'danger';
export type BadgeSize = 'xs' | 'sm' | 'md';

const BADGE_VARIANTS: Record<BadgeVariant, { container: string; dot: string }> = {
  neutral: {
    container: 'bg-white/[0.06] text-slate-300 border-white/10',
    dot: 'bg-slate-400',
  },
  cobalt: {
    container: 'bg-[#0072FF]/15 text-[#338EFF] border-[#0072FF]/30',
    dot: 'bg-[#0072FF]',
  },
  mint: {
    container: 'bg-[#00E599]/15 text-[#00E599] border-[#00E599]/30',
    dot: 'bg-[#00E599]',
  },
  coral: {
    container: 'bg-[#FF3366]/15 text-[#FF3366] border-[#FF3366]/30',
    dot: 'bg-[#FF3366]',
  },
  amber: {
    container: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    dot: 'bg-amber-400',
  },
  danger: {
    container: 'bg-red-500/15 text-red-400 border-red-500/30',
    dot: 'bg-red-400',
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
        'inline-flex items-center font-mono uppercase tracking-wider rounded-full border',
        styles.container,
        BADGE_SIZES[size],
        className,
      ].join(' ')}
      {...rest}
    >
      {dot && <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} />}
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{children}</span>
    </span>
  );
};
