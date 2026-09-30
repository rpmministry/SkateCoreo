import React from 'react';

export interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Etiqueta visible (admite nodos para asteriscos de requerido). */
  label?: React.ReactNode;
  /** Icono Lucide alineado a la izquierda dentro del campo. */
  icon?: React.ReactNode;
  /** Elemento opcional alineado a la derecha (ej. botón de alternar visibilidad de contraseña). */
  rightElement?: React.ReactNode;
  /** Color de foco / acento. */
  tone?: 'cobalt' | 'cyan' | 'mint' | 'coral' | 'danger';
  /** Mensaje de error para validación visual y accesibilidad. */
  error?: string;
  /** Texto de ayuda opcional debajo del campo. */
  helperText?: string;
}

/**
 * Field — campo de formulario con etiqueta, iconos, validación y soporte de accesibilidad,
 * alineado al sistema visual Obsidian Precision Tech (surface-2, borde sutil, foco de marca).
 */
export const Field = React.forwardRef<HTMLInputElement, FieldProps>(
  (
    {
      label,
      icon,
      rightElement,
      tone = 'cobalt',
      error,
      helperText,
      className = '',
      id,
      ...rest
    },
    ref
  ) => {
    const generatedId = React.useId();
    const inputId = id || generatedId;
    const errorId = error ? `${inputId}-error` : undefined;
    const helperId = helperText ? `${inputId}-helper` : undefined;

    const toneClasses = {
      cobalt: 'focus:border-cobalt-400 focus:ring-cobalt-400/30',
      cyan: 'focus:border-cobalt-400 focus:ring-cobalt-400/30', // Aliased for backward compatibility
      mint: 'focus:border-mint-400 focus:ring-mint-400/30',
      coral: 'focus:border-coral-400 focus:ring-coral-400/30',
      danger: 'focus:border-danger focus:ring-danger/30',
    }[error ? 'danger' : tone];

    const borderClass = error
      ? 'border-danger/60 text-white'
      : 'border-white/[0.12] hover:border-white/20 text-white';

    return (
      <div className="min-w-0 flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-semibold text-slate-300 select-none">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {icon && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            >
              {icon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={!!error}
            aria-describedby={errorId || helperId}
            className={[
              'w-full min-h-[44px] rounded-xl border bg-surface-2/90 py-2.5 text-sm transition-all focus:outline-none focus:ring-2',
              'placeholder:text-slate-500 shadow-inner',
              'disabled:cursor-not-allowed disabled:opacity-60 disabled:bg-surface-1',
              icon ? 'pl-10' : 'pl-3.5',
              rightElement ? 'pr-10' : 'pr-3.5',
              borderClass,
              toneClasses,
              className,
            ].join(' ')}
            {...rest}
          />
          {rightElement && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
              {rightElement}
            </div>
          )}
        </div>
        {error && (
          <p id={errorId} className="text-xs text-danger font-medium animate-fade-in">
            {error}
          </p>
        )}
        {!error && helperText && (
          <p id={helperId} className="text-[11px] text-slate-400">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Field.displayName = 'Field';
