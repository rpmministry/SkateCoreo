import React, { useEffect, useState } from 'react';
import { tabAudioCoordinator } from '../../core/audio/tabAudioCoordinator';

/**
 * Aviso de ownership de audio entre pestañas.
 *
 * REGLA DE ORO DE PRODUCTO:
 * El aviso SOLO aparece cuando exista EVIDENCIA REAL de otra fuente de audio
 * activa (música o metrónomo ajeno). Si ninguna otra pestaña está reproduciendo
 * audio físicamente, este componente devuelve NULL y no interfiere en la UI.
 *
 * Al pulsar "Tomar control", el traspaso se resuelve de forma inmediata y limpia:
 * la otra pestaña detiene su audio y esta pestaña asume el control sin bloquear
 * jamás la navegación, la carga de canciones ni la interacción del usuario.
 */
export const AudioOwnershipBanner: React.FC = () => {
  const [snapshot, setSnapshot] = useState(() => tabAudioCoordinator.getSnapshot());
  const [isTakingOver, setIsTakingOver] = useState(false);

  useEffect(() => tabAudioCoordinator.onChange(setSnapshot), []);

  // Si esta pestaña es dueña, o si NO hay ninguna otra pestaña sonando realmente,
  // NO se muestra ningún aviso (cero falsos positivos en pestaña única o reposo).
  const otherAudible = !snapshot.isOwner && (snapshot.otherTabPlaying || snapshot.otherTabMetronomeOn);
  if (!otherAudible) return null;

  const handleTakeover = async () => {
    setIsTakingOver(true);
    try {
      await tabAudioCoordinator.claim('banner-takeover');
    } finally {
      setIsTakingOver(false);
    }
  };

  return (
    <aside
      className="pointer-events-none fixed left-1/2 top-2 z-[90] w-[min(92vw,440px)] -translate-x-1/2"
      role="status"
      aria-live="polite"
      aria-label="Aviso de control de audio"
    >
      <div className="pointer-events-auto flex items-start gap-2.5 rounded-2xl border border-amber-400/40 bg-black/95 p-3 text-[11px] text-amber-100 shadow-2xl backdrop-blur">
        <span className="mt-1 h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-400" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-amber-200">
            El audio está sonando en otra pestaña de SkateCore
          </p>
          <p className="mt-0.5 text-amber-200/80">
            Para evitar sonido duplicado, esta pestaña permanece en silencio. Puedes tomar el control aquí en cualquier momento.
          </p>
        </div>
        <button
          type="button"
          disabled={isTakingOver}
          onClick={handleTakeover}
          className="press shrink-0 rounded-lg border border-amber-300/60 bg-amber-400/25 px-2.5 py-1.5 font-bold text-amber-100 hover:bg-amber-400/35 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
        >
          {isTakingOver ? 'Tomando...' : 'Tomar control'}
        </button>
      </div>
    </aside>
  );
};

