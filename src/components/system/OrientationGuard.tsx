import React, { useCallback, useEffect, useState } from 'react';
import { RotateCw } from 'lucide-react';
import { shouldShowRotateScreen } from '../../utils/orientation';

/**
 * OrientationGuard — única fuente de verdad de orientación de SkateCoreo.
 *
 * En teléfonos/tablets (táctil, viewport pequeño) en vertical NO se monta la app:
 * se muestra "Gira tu dispositivo". Así el lienzo, el audio y las herramientas no
 * llegan a inicializarse en una orientación no soportada.
 *
 * En escritorio nunca bloquea. Si el navegador permite `screen.orientation.lock`,
 * se intenta fijar horizontal; si no, se ignora silenciosamente.
 */

function readSnapshot(): { width: number; height: number; coarsePointer: boolean } {
  const coarsePointer =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)').matches
      : false;
  return {
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
    coarsePointer,
  };
}

/** Intenta bloquear la orientación en horizontal (mejor esfuerzo, nunca lanza). */
function tryLockLandscape(): void {
  const orientation = (screen as unknown as { orientation?: { lock?: (o: string) => Promise<void> } })
    .orientation;
  if (orientation && typeof orientation.lock === 'function') {
    orientation.lock('landscape').catch(() => {
      /* El navegador puede exigir pantalla completa o gesto: se ignora. */
    });
  }
}

export function useOrientationGuard(): { blocked: boolean; requestLandscapeLock: () => void } {
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

    // Intento de bloqueo inicial (mejor esfuerzo).
    tryLockLandscape();

    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      window.removeEventListener('pageshow', update);
      coarseQuery?.removeEventListener?.('change', update);
    };
  }, []);

  const requestLandscapeLock = useCallback(() => {
    tryLockLandscape();
  }, []);

  return { blocked, requestLandscapeLock };
}

interface OrientationGateProps {
  children: React.ReactNode;
}

export const OrientationGate: React.FC<OrientationGateProps> = ({ children }) => {
  const { blocked, requestLandscapeLock } = useOrientationGuard();

  // IMPORTANTE: la app SIEMPRE permanece montada. En vertical solo se oculta
  // visualmente (visibility:hidden) y se superpone el aviso. Antes se desmontaba
  // <App/>, lo que destruía el estado (activeView volvía a 'home') al abrir la
  // cámara del móvil y volver. Mantenerla montada conserva el estado.
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
              SkateCoreo está diseñado para trabajar con la pista en orientación horizontal.
            </p>
          </div>

          <button
            type="button"
            onClick={requestLandscapeLock}
            className="interactive-tap rounded-2xl border border-cyan/40 bg-cyan/15 px-5 py-2.5 text-xs font-black uppercase tracking-wide text-cyan transition-colors hover:bg-cyan/25"
          >
            Fijar horizontal
          </button>
        </div>
      )}
    </>
  );
};
