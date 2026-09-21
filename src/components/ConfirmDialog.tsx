import React, { useEffect, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { usePressAction } from '../hooks/usePressAction';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Estilo de la acción principal. `danger` para acciones destructivas. */
  tone?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * ConfirmDialog — Confirmación rápida accesible (48×48px, safe areas).
 *
 * Se usa para proteger acciones destructivas como «Limpiar Pista 2D», que ahora
 * está a un toque en la interfaz principal. Sin este paso, un roce accidental
 * borraría el trabajo de la coreógrafa.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'danger',
  onConfirm,
  onCancel,
}) => {
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const press = usePressAction();

  // Escape cierra sin confirmar; el foco inicial va a "Cancelar" para que un
  // Enter reflejo no destruya el trabajo.
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    const focusTimer = setTimeout(() => cancelRef.current?.focus(), 30);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(focusTimer);
    };
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const confirmClasses =
    tone === 'danger'
      ? 'bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-500/30'
      : 'bg-cyan text-neon-canvas hover:brightness-110 shadow-glow-cyan';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm animate-fade-in sm:items-center sm:p-4"
      onClick={onCancel}
    >
      <div
        className="glass-panel w-full max-w-md rounded-3xl p-5 shadow-2xl animate-scale-in sm:p-6"
        style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span
            className={[
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1',
              tone === 'danger'
                ? 'bg-red-500/15 text-red-400 ring-red-500/30'
                : 'bg-cyan/15 text-cyan ring-cyan/30',
            ].join(' ')}
          >
            <AlertTriangle className="h-5 w-5" />
          </span>

          <div className="min-w-0 flex-1">
            <h2
              id="confirm-dialog-title"
              className="font-display text-base font-black leading-tight text-white"
            >
              {title}
            </h2>
            <p
              id="confirm-dialog-message"
              className="mt-1.5 text-[13px] leading-snug text-slate-300"
            >
              {message}
            </p>
          </div>

          <button
            type="button"
            {...press(onCancel)}
            aria-label="Cerrar"
            className="press flex h-12 w-12 min-h-touch min-w-touch shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            {...press(onCancel)}
            className="press flex min-h-touch w-full items-center justify-center rounded-2xl border border-white/15 bg-white/[0.06] px-4 text-sm font-bold text-slate-200 hover:bg-white/[0.12] sm:w-auto"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            {...press(onConfirm)}
            className={`press flex min-h-touch w-full items-center justify-center rounded-2xl px-5 text-sm font-black sm:w-auto ${confirmClasses}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
