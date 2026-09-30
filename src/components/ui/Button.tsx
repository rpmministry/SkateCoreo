import React from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant =
  | 'primary'
  | 'cobalt'
  | 'mint'
  | 'coach'
  | 'secondary'
  | 'outline'
  | 'destructive'
  | 'ghost';

export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary:
    'bg-[#0072FF] text-white font-bold shadow-[0_0_20px_rgba(0,114,255,0.35)] hover:bg-[#005ECC] active:scale-[0.98]',
  cobalt:
    'bg-[#0072FF] text-white font-bold shadow-[0_0_20px_rgba(0,114,255,0.35)] hover:bg-[#005ECC] active:scale-[0.98]',
  mint:
    'bg-[#00E599] text-[#070A10] font-black shadow-[0_0_20px_rgba(0,229,153,0.35)] hover:bg-[#00C782] active:scale-[0.98]',
  coach:
    'bg-[#FF3366] text-white font-bold shadow-[0_0_20px_rgba(255,51,102,0.35)] hover:bg-[#E61E52] active:scale-[0.98]',
  secondary:
    'border border-white/12 bg-white/[0.05] text-slate-100 font-semibold hover:bg-white/[0.10] hover:border-white/20 active:scale-[0.98]',
  outline:
    'border border-white/20 bg-transparent text-slate-200 font-semibold hover:bg-white/[0.08] active:scale-[0.98]',
  destructive:
    'border border-red-500/30 bg-red-500/15 text-red-400 font-bold hover:bg-red-500/25 hover:border-red-500/50 active:scale-[0.98]',
  ghost:
    'text-slate-300 hover:text-white hover:bg-white/[0.08] font-semibold active:scale-[0.98]',
};

const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: 'min-h-[32px] px-3 py-1 text-xs rounded-xl gap-1.5',
  md: 'min-h-[40px] px-4 py-2 text-xs sm:text-[13px] rounded-xl gap-2',
  lg: 'min-h-[48px] px-5 py-2.5 text-sm rounded-xl gap-2.5',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      block = false,
      loading = false,
      icon,
      iconPosition = 'left',
      className = '',
      children,
      disabled,
      type = 'button',
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        className={[
          'inline-flex items-center justify-center font-medium transition-all select-none',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0072FF]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#070A10]',
          'disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed',
          VARIANT_STYLES[variant],
          SIZE_STYLES[size],
          block ? 'w-full' : '',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...props}
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
        {!loading && icon && iconPosition === 'left' && (
          <span className="shrink-0">{icon}</span>
        )}
        {children}
        {!loading && icon && iconPosition === 'right' && (
          <span className="shrink-0">{icon}</span>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
