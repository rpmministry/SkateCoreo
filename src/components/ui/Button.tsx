import React from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant =
  | 'primary'
  | 'cobalt'
  | 'mint'
  | 'coach'
  | 'coral'
  | 'secondary'
  | 'outline'
  | 'tertiary'
  | 'destructive'
  | 'ghost';

export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary:
    'bg-[#2e7cf6] hover:bg-[#2563eb] active:bg-[#1d4ed8] text-white font-medium shadow-sm transition-all focus-visible:ring-2 focus-visible:ring-[#2e7cf6]/50',
  cobalt:
    'bg-[#2e7cf6] hover:bg-[#2563eb] active:bg-[#1d4ed8] text-white font-medium shadow-sm transition-all focus-visible:ring-2 focus-visible:ring-[#2e7cf6]/50',
  mint:
    'bg-[#0d9488] hover:bg-[#0f766e] active:bg-[#115e59] text-white font-medium shadow-sm transition-all focus-visible:ring-2 focus-visible:ring-[#0d9488]/50',
  coach:
    'bg-[#e11d48] hover:bg-[#be123c] active:bg-[#9f1239] text-white font-medium shadow-sm transition-all focus-visible:ring-2 focus-visible:ring-[#e11d48]/50',
  coral:
    'bg-[#e11d48] hover:bg-[#be123c] active:bg-[#9f1239] text-white font-medium shadow-sm transition-all focus-visible:ring-2 focus-visible:ring-[#e11d48]/50',
  secondary:
    'bg-white/[0.05] hover:bg-white/[0.09] active:bg-white/[0.04] text-[#F7F8F9] font-medium border border-white/[0.08] hover:border-white/15 shadow-sm transition-all focus-visible:ring-2 focus-visible:ring-[#2e7cf6]/40',
  outline:
    'bg-transparent border border-white/[0.12] text-[#F7F8F9] hover:border-[#2e7cf6]/60 hover:bg-[#2e7cf6]/10 font-medium transition-all focus-visible:ring-2 focus-visible:ring-[#2e7cf6]/40',
  tertiary:
    'bg-transparent border border-white/[0.08] text-[#9CA3AF] hover:border-white/20 hover:bg-white/[0.04] hover:text-[#F7F8F9] font-medium transition-all',
  destructive:
    'bg-[#ef4444]/15 hover:bg-[#ef4444] active:bg-[#dc2626] text-[#fca5a5] hover:text-white font-medium border border-[#ef4444]/30 hover:border-[#ef4444] shadow-sm transition-all focus-visible:ring-2 focus-visible:ring-[#ef4444]/40',
  ghost:
    'bg-transparent text-[#9CA3AF] hover:text-[#F7F8F9] hover:bg-white/[0.05] active:bg-white/[0.08] font-medium transition-all',
};

const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: 'min-h-[32px] px-3 py-1 text-xs rounded-lg gap-1.5',
  md: 'min-h-[38px] px-4 py-1.5 text-xs sm:text-[13px] rounded-lg gap-2',
  lg: 'min-h-[44px] px-5 py-2 text-sm rounded-xl gap-2.5',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  loading?: boolean;
  selected?: boolean;
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
      selected = false,
      icon,
      iconPosition = 'left',
      className = '',
      children,
      disabled,
      ...rest
    },
    ref
  ) => {
    const variantStyle = VARIANT_STYLES[variant] || VARIANT_STYLES.primary;
    const sizeStyle = SIZE_STYLES[size] || SIZE_STYLES.md;
    const isDisabled = disabled || loading;

    const selectedStyle = selected
      ? variant === 'coach'
        ? 'border-[#e11d48]/60 bg-[#e11d48]/15 text-white font-medium ring-1 ring-[#e11d48]/40'
        : variant === 'mint'
        ? 'border-[#0d9488]/60 bg-[#0d9488]/15 text-white font-medium ring-1 ring-[#0d9488]/40'
        : 'border-[#2e7cf6]/60 bg-[#2e7cf6]/15 text-white font-medium ring-1 ring-[#2e7cf6]/40'
      : '';

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        aria-pressed={selected ? true : undefined}
        className={[
          'inline-flex items-center justify-center select-none font-sans outline-none active:scale-[0.98]',
          selected ? selectedStyle : variantStyle,
          sizeStyle,
          block ? 'w-full' : '',
          isDisabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : 'cursor-pointer',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...rest}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
        ) : (
          icon && iconPosition === 'left' && <span className="shrink-0">{icon}</span>
        )}

        {children && <span>{children}</span>}

        {!loading && icon && iconPosition === 'right' && (
          <span className="shrink-0">{icon}</span>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
