import React from 'react';

export type ButtonVariant = 'primary' | 'mint' | 'secondary';

export type ButtonSize = 'md' | 'lg';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-cyan text-neon-canvas font-black shadow-glow-cyan hover:brightness-110',
  mint: 'bg-mint text-neon-canvas font-black shadow-glow-mint hover:brightness-110',
  secondary:
    'border border-white/15 bg-white/[0.06] text-slate-100 font-bold hover:bg-white/[0.12]',
};

const SIZE: Record<ButtonSize, string> = {
  md: 'min-h-touch px-4 text-xs sm:text-[13px]',
  lg: 'min-h-[52px] px-5 text-sm',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Ocupa el ancho disponible (útil en formularios y acciones de tarjeta). */
  block?: boolean;
}

/**
 * Button — único punto de verdad para la jerarquía de acciones de la app
 * (Primary / Secondary / Tertiary / Destructive). Reutiliza los tokens de
 * `index.css` (cyan/mint, radios, `press`, touch target de 48px).
 */
export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  block = false,
  className = '',
  type = 'button',
  ...rest
}) => (
  <button
    type={type}
    className={[
      'press inline-flex items-center justify-center gap-2 rounded-2xl transition-colors',
      'disabled:pointer-events-none disabled:opacity-50',
      VARIANT[variant],
      SIZE[size],
      block ? 'w-full' : '',
      className,
    ].join(' ')}
    {...rest}
  />
);
