import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalShellProps {
  open: boolean;
  /** Si se omite, el modal es bloqueante (sin cierre ni backdrop/Escape). */
  onClose?: () => void;
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * ModalShell — diálogo modal unificado de SkateCoreo.
 *
 * Reglas comunes a todos los modales: backdrop glass consistente, superficie
 * `glass-panel`, radio y sombra de marca, cabecera clara con cierre táctil,
 * scroll interno, altura segura (`modal-safe-height` con fallback sin `dvh`)
 * y respeto de las safe areas. En móvil se presenta como bottom-sheet.
 *
 * Si no se entrega `onClose`, el modal es bloqueante (pasos obligatorios como
 * «completar registro tras el pago»), preservando el comportamiento existente.
 */
export const ModalShell: React.FC<ModalShellProps> = ({
  open,
  onClose,
  title,
  icon,
  children,
}) => {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const dismissible = typeof onClose === 'function';

  useEffect(() => {
    if (!open || !dismissible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener('keydown', onKey);
    const t = setTimeout(() => closeRef.current?.focus(), 30);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [open, dismissible, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/80 backdrop-blur-md animate-fade-in sm:items-center sm:p-4"
      onClick={dismissible ? onClose : undefined}
    >
      <div
        className={[
          'glass-panel modal-safe-height relative flex w-full flex-col overflow-hidden rounded-t-3xl shadow-2xl animate-scale-in sm:max-w-md sm:rounded-3xl',
        ].join(' ')}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            {icon && <span className="shrink-0 text-cyan">{icon}</span>}
            <h2 className="truncate font-display text-base font-black text-white">{title}</h2>
          </div>
          {dismissible && (
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="press flex h-12 w-12 min-h-touch min-w-touch shrink-0 items-center justify-center rounded-2xl text-slate-400 hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
      </div>
    </div>
  );
};
