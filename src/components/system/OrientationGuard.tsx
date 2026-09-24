import React, { useCallback, useEffect, useState } from 'react';
import { RotateCw } from 'lucide-react';
import { shouldShowRotateScreen } from '../../utils/orientation';
import type { OrientationSnapshot } from '../../utils/orientation';

/**
 * OrientationGuard — única fuente de verdad de orientación de SkateCoreo.
 *
 * Estrategia portrait-first: en teléfonos/tablets (táctil, viewport pequeño) la
 * app se usa EXCLUSIVAMENTE en vertical. Si el dispositivo gira a horizontal se
 * superpone el aviso "Gira tu dispositivo" y se pide volver a vertical.
 *
 * En escritorio nunca bloquea. Si el navegador permite `screen.orientation.lock`,
 * se intenta fijar vertical; si no, se ignora silenciosamente (sin hacks
 * frágiles). La app permanece SIEMPRE montada: en la orientación no soportada
 * solo se oculta visualmente para no destruir el estado.
 */

function readSnapshot(): OrientationSnapshot {
  const hasMatchMedia =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function';
  // La orientación se lee de `matchMedia` (física), NO del aspecto width/height:
  // al abrir el teclado virtual el alto del viewport se encoge y el aspecto
  // podría parecer horizontal aunque el dispositivo siga en vertical.
  const landscape = hasMatchMedia
    ? window.matchMedia('(orientation: landscape)').matches
    : false;
  const coarsePointer = hasMatchMedia
    ? window.matchMedia('(pointer: coarse)').matches
    : false;
  return {
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
    coarsePointer,
    landscape,
  };
}

/** Intenta bloquear la orientación en vertical (mejor esfuerzo, nunca lanza). */
function tryLockPortrait(): void {
  const orientation = (screen as unknown as { orientation?: { lock?: (o: string) => Promise<void> } })
    .orientation;
  if (orientation && typeof orientation.lock === 'function') {
    orientation.lock('portrait').catch(() => {
      /* El navegador puede exigir pantalla completa o gesto: se ignora. */
    });
  }
}

export function useOrientationGuard(): { blocked: boolean; requestPortraitLock: () => void } {
  const [blocked, setBlocked] = useState(() =>
    typeof window === 'undefined' ? false : shouldShowRotateScreen(readSnapshot())
  );

  useEffect(() => {
    const update = () => setBlocked(shouldShowRotateScreen(readSnapshot()));
    update();

    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    window.addEventListener('pageshow', update);

    const coarseQuery =
      typeof window.matchMedia === 'function' ? window.matchMedia('(pointer: coarse)') : null;
    coarseQuery?.addEventListener?.('change', update);

    // Reacciona a la orientación física real (independiente del teclado virtual).
    const orientationQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(orientation: landscape)')
        : null;
    orientationQuery?.addEventListener?.('change', update);

    // Intento de bloqueo inicial (mejor esfuerzo).
    tryLockPortrait();

    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      window.removeEventListener('pageshow', update);
      coarseQuery?.removeEventListener?.('change', update);
      orientationQuery?.removeEventListener?.('change', update);
    };
  }, []);

  const requestPortraitLock = useCallback(() => {
    tryLockPortrait();
  }, []);

  return { blocked, requestPortraitLock };
}

interface OrientationGateProps {
  children: React.ReactNode;
}

export const OrientationGate: React.FC<OrientationGateProps> = ({ children }) => {
  const { blocked, requestPortraitLock } = useOrientationGuard();

  // IMPORTANTE: la app SIEMPRE permanece montada. En la orientación no soportada
  // (horizontal en móvil) solo se oculta visualmente (visibility:hidden) y se
  // superpone el aviso. Mantenerla montada conserva el estado (activeView, etc.).
  return (
    <>
      <div
        aria-hidden={blocked}
        style={{
          visibility: blocked ? 'hidden' : 'visible',
          pointerEvents: blocked ? 'none' : 'auto',
        }}
      >
        {children}
      </div>

      {blocked && (
        <div
          role="dialog"
          aria-label="Gira tu dispositivo"
          className="fixed inset-0 z-[999] flex flex-col items-center justify-center gap-6 bg-neon-canvas px-safe pb-safe pt-safe text-center text-white select-none"
        >
          <div className="relative flex h-24 w-24 items-center justify-center rounded-3xl border border-cyan/30 bg-cyan/10 text-cyan shadow-glow-cyan">
            <RotateCw className="h-12 w-12" />
          </div>

          <div className="max-w-sm space-y-2 px-6">
            <h1 className="text-xl font-black tracking-wide text-white">Gira tu dispositivo</h1>
            <p className="text-sm leading-relaxed text-slate-400">
              SkateCoreo está diseñado para trabajar en vertical. Vuelve a colocar el
              dispositivo en posición vertical para continuar.
            </p>
          </div>

          <button
            type="button"
            onClick={requestPortraitLock}
            className="interactive-tap rounded-2xl border border-cyan/40 bg-cyan/15 px-5 py-2.5 text-xs font-black uppercase tracking-wide text-cyan transition-colors hover:bg-cyan/25"
          >
            Fijar vertical
          </button>
        </div>
      )}
    </>
  );
};
