import React from 'react';

export type BadgeVariant = 'neutral' | 'cobalt' | 'mint' | 'coral' | 'amber' | 'danger';
export type BadgeSize = 'xs' | 'sm' | 'md';

const BADGE_VARIANTS: Record<BadgeVariant, { container: string; dot: string }> = {
  neutral: {
    container: 'bg-[#283243] text-[#f4f4f4] border-white/10',
    dot: 'bg-[#c6c6c6]',
  },
  cobalt: {
    container: 'bg-[#0f62fe]/15 text-[#78a9ff] border-[#0f62fe]/30',
    dot: 'bg-[#78a9ff]',
  },
  mint: {
    container: 'bg-[#009d9a]/15 text-[#3ddbd9] border-[#009d9a]/30',
    dot: 'bg-[#3ddbd9]',
  },
  coral: {
    container: 'bg-[#ee5396]/15 text-[#ff7eb6] border-[#ee5396]/30',
    dot: 'bg-[#ff7eb6]',
  },
  amber: {
    container: 'bg-[#f1c21b]/15 text-[#f1c21b] border-[#f1c21b]/30',
    dot: 'bg-[#f1c21b]',
  },
  danger: {
    container: 'bg-[#da1e28]/15 text-[#ff8389] border-[#da1e28]/30',
    dot: 'bg-[#ff8389]',
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
        'inline-flex items-center font-mono font-medium uppercase tracking-wider rounded-md border',
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
