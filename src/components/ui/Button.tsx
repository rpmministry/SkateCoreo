import React from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant =
  | 'primary'
  | 'cobalt'
  | 'mint'
  | 'coach'
  | 'secondary'
  | 'outline'
  | 'tertiary'
  | 'destructive'
  | 'ghost';

export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary:
    'bg-[#0f62fe] hover:bg-[#0353e9] active:bg-[#002d9c] text-white font-semibold shadow-sm focus-visible:ring-2 focus-visible:ring-[#0f62fe] focus-visible:ring-offset-2 focus-visible:ring-offset-[#12161f] transition-colors',
  cobalt:
    'bg-[#0f62fe] hover:bg-[#0353e9] active:bg-[#002d9c] text-white font-semibold shadow-sm focus-visible:ring-2 focus-visible:ring-[#0f62fe] focus-visible:ring-offset-2 focus-visible:ring-offset-[#12161f] transition-colors',
  mint:
    'bg-[#009d9a] hover:bg-[#007d79] active:bg-[#005d5d] text-white font-semibold shadow-sm focus-visible:ring-2 focus-visible:ring-[#009d9a] focus-visible:ring-offset-2 focus-visible:ring-offset-[#12161f] transition-colors',
  coach:
    'bg-[#d12771] hover:bg-[#b8195f] active:bg-[#9f1853] text-white font-semibold shadow-sm focus-visible:ring-2 focus-visible:ring-[#d12771] focus-visible:ring-offset-2 focus-visible:ring-offset-[#12161f] transition-colors',
  secondary:
    'bg-[#283243] hover:bg-[#323e54] active:bg-[#1e2633] text-[#f4f4f4] font-medium border border-white/10 shadow-sm transition-colors',
  outline:
    'bg-transparent border border-[#0f62fe] text-[#78a9ff] hover:bg-[#0f62fe] hover:text-white font-medium transition-colors',
  tertiary:
    'bg-transparent border border-[#0f62fe] text-[#78a9ff] hover:bg-[#0f62fe] hover:text-white font-medium transition-colors',
  destructive:
    'bg-[#da1e28] hover:bg-[#ba1b23] active:bg-[#750e13] text-white font-semibold shadow-sm focus-visible:ring-2 focus-visible:ring-[#da1e28] focus-visible:ring-offset-2 focus-visible:ring-offset-[#12161f] transition-colors',
  ghost:
    'bg-transparent text-[#f4f4f4] hover:bg-white/[0.08] active:bg-white/[0.12] font-medium transition-colors',
};

const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: 'min-h-[32px] px-3 py-1 text-xs rounded-md gap-1.5',
  md: 'min-h-[40px] px-4 py-2 text-xs sm:text-[13px] rounded-lg gap-2',
  lg: 'min-h-[48px] px-5 py-2.5 text-sm rounded-lg gap-2.5',
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
      ...rest
    },
    ref
  ) => {
    const variantStyle = VARIANT_STYLES[variant] || VARIANT_STYLES.primary;
    const sizeStyle = SIZE_STYLES[size] || SIZE_STYLES.md;
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={[
          'inline-flex items-center justify-center select-none font-sans outline-none active:scale-[0.98]',
          variantStyle,
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
