import React from 'react';

export interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Etiqueta visible (admite nodos para asteriscos de requerido). */
  label?: React.ReactNode;
  /** Icono Lucide alineado a la izquierda dentro del campo. */
  icon?: React.ReactNode;
  /** Color de foco: cyan (por defecto) o mint (códigos / acciones de regalo). */
  tone?: 'cyan' | 'mint';
}

/**
 * Field — campo de formulario con etiqueta e icono opcional, alineado al
 * sistema visual (surface-950, borde sutil, foco de marca, 46px de alto).
 * Es puramente presentacional: reenvía todas las props al `<input>`.
 */
export const Field: React.FC<FieldProps> = ({
  label,
  icon,
  tone = 'cyan',
  className = '',
  id,
  ...rest
}) => {
  const focusRing =
    tone === 'mint' ? 'focus:border-mint focus:ring-mint' : 'focus:border-cyan focus:ring-cyan';

  return (
    <div className="min-w-0">
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-[11px] font-semibold text-slate-300">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
          >
            {icon}
          </span>
        )}
        <input
          id={id}
          className={[
            'w-full min-h-[46px] rounded-xl border border-white/15 bg-slate-950 py-2.5 text-sm text-white',
            'placeholder:text-slate-500 transition-all focus:outline-none focus:ring-1',
            'disabled:cursor-not-allowed disabled:opacity-80',
            icon ? 'pl-10 pr-3.5' : 'px-3.5',
            focusRing,
            className,
          ].join(' ')}
          {...rest}
        />
      </div>
    </div>
  );
};
