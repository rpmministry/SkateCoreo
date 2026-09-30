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
 * Field — campo de formulario accesible alineado a Carbon Design System
 * (fondo neutro, borde nítido, foco interactivo IBM Blue 60 y tipografía legible).
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

    const borderFocusClass = error
      ? 'border-[#da1e28] focus:border-[#da1e28] focus:ring-1 focus:ring-[#da1e28] text-white'
      : 'border-white/[0.12] hover:border-white/20 focus:border-[#0f62fe] focus:ring-1 focus:ring-[#0f62fe] text-[#f4f4f4]';

    return (
      <div className="min-w-0 flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-medium text-[#c6c6c6] select-none">
            {label}
          </label>
        )}

        <div className="relative flex items-center">
          {icon && (
            <span
              className="absolute left-3 flex items-center pointer-events-none text-[#8d8d8d]"
              aria-hidden="true"
            >
              {icon}
            </span>
          )}

          <input
            ref={ref}
            id={inputId}
            aria-invalid={Boolean(error)}
            aria-describedby={[errorId, helperId].filter(Boolean).join(' ') || undefined}
            className={[
              'w-full bg-[#161b24] rounded-md py-2 text-xs text-[#f4f4f4] placeholder-[#8d8d8d] outline-none transition-colors border shadow-inner',
              icon ? 'pl-9' : 'pl-3',
              rightElement ? 'pr-9' : 'pr-3',
              borderFocusClass,
              className,
            ]
              .filter(Boolean)
              .join(' ')}
            {...rest}
          />

          {rightElement && (
            <div className="absolute right-2.5 flex items-center">{rightElement}</div>
          )}
        </div>

        {error && (
          <p id={errorId} role="alert" className="text-[11px] font-medium text-[#ff8389]">
            {error}
          </p>
        )}

        {!error && helperText && (
          <p id={helperId} className="text-[11px] text-[#8d8d8d]">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Field.displayName = 'Field';
