import React, { useEffect, useState } from 'react';
import { tabAudioCoordinator } from '../../core/audio/tabAudioCoordinator';

/**
 * Aviso de ownership de audio entre pestañas.
 *
 * En Android (Chrome/Brave) varias pestañas de SkateCore pueden convivir; solo
 * UNA puede reproducir. Cuando esta pestaña no tiene el control, aquí se explica
 * por qué y se ofrece tomarlo de forma controlada (sin crear segundas fuentes:
 * si la otra pestaña está sonando, el traspaso se deniega hasta que se detenga).
 */
export const AudioOwnershipBanner: React.FC = () => {
  const [snapshot, setSnapshot] = useState(() => tabAudioCoordinator.getSnapshot());
  const [deniedAt, setDeniedAt] = useState(0);

  useEffect(() => tabAudioCoordinator.onChange(setSnapshot), []);

  if (snapshot.isOwner) return null;

  const otherAudible = snapshot.otherTabPlaying || snapshot.otherTabMetronomeOn;
  const deniedRecently = deniedAt > 0 && Date.now() - deniedAt < 6000;

  const handleTakeover = () => {
    void tabAudioCoordinator.claim('banner-takeover').then((granted) => {
      if (!granted) setDeniedAt(Date.now());
    });
  };

  return (
    <div
      className="fixed left-1/2 top-2 z-[80] w-[min(92vw,420px)] -translate-x-1/2 rounded-2xl border border-amber-400/40 bg-black/90 px-3 py-2 text-[11px] text-amber-100 shadow-2xl backdrop-blur"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-amber-400" aria-hidden />
        <div className="flex-1">
          <p className="font-semibold">
            {otherAudible
              ? 'El audio está sonando en otra pestaña de SkateCore'
              : 'Otra pestaña tiene el control del audio'}
          </p>
          <p className="mt-0.5 text-amber-200/80">
            {otherAudible
              ? 'Para evitar audio duplicado, esta pestaña permanece en silencio. Detén la reproducción en la otra pestaña (o ciérrala) y vuelve a intentarlo.'
              : 'Puedes tomar el control aquí: la otra pestaña quedará en silencio automáticamente.'}
          </p>
          {deniedRecently && (
            <p className="mt-0.5 font-medium text-rose-300">
              La otra pestaña sigue reproduciendo: detén su audio o ciérrala para poder tomar el control.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleTakeover}
          className="shrink-0 rounded-lg border border-amber-300/50 bg-amber-400/20 px-2 py-1 font-semibold text-amber-100 hover:bg-amber-400/30"
        >
          Tomar control
        </button>
      </div>
    </div>
  );
};
