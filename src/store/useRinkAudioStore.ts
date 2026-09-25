import { create } from 'zustand';
import { audioEngine } from '../services/audioEngine';

/**
 * useRinkAudioStore — Fuente de verdad del AUDIO PUBLICADO de la Pista 2D.
 *
 * PRINCIPIO DRAFT → PUBLISH
 * -------------------------
 *  - El Audio Studio trabaja sobre un BORRADOR editable (su propio store y su
 *    propio slot de audio en el motor).
 *  - La Pista 2D solo consume lo PUBLICADO. Este store guarda los METADATOS de esa
 *    publicación (identidad + revisión + nombre + duración). El `AudioBuffer`
 *    real vive en el motor (slot 'rink'), de modo que no se duplica PCM.
 *
 * Solo `publishRinkAudio()` del motor puede reemplazar el audio publicado; editar
 * el Studio, cargar/consolidar buffers o reproducir la preview NO lo modifican.
 */

export type RinkAudioSourceKind = 'direct-file' | 'studio-mix';

export interface PublishedRinkAudio {
  /** Identidad de la publicación (cambia en cada nueva revisión). */
  id: string;
  /** Número de revisión; incrementa con cada publicación. */
  revision: number;
  kind: RinkAudioSourceKind;
  name: string | null;
  durationSec: number;
}

interface RinkAudioState {
  publishedAudio: PublishedRinkAudio | null;
  /**
   * El borrador del Studio tiene cambios desde la última publicación.
   * Alimenta el indicador "Cambios sin enviar" del editor.
   */
  studioDirty: boolean;
  /** Relee los metadatos publicados desde el motor (tras cargar o publicar). */
  syncFromEngine: () => void;
  /** Marca/desmarca cambios pendientes del borrador del Studio. */
  markStudioDirty: (dirty: boolean) => void;
  /** Vacía la referencia publicada (cambio de cuenta / proyecto sin audio). */
  clear: () => void;
}

function readFromEngine(): PublishedRinkAudio | null {
  const published = audioEngine.getPublishedAudio();
  if (!published.buffer) return null;
  return {
    id: published.id,
    revision: published.revision,
    kind: published.kind,
    name: published.name,
    durationSec: published.durationSec,
  };
}

export const useRinkAudioStore = create<RinkAudioState>((set) => ({
  publishedAudio: readFromEngine(),
  studioDirty: false,
  syncFromEngine: () => set({ publishedAudio: readFromEngine() }),
  markStudioDirty: (dirty) => set({ studioDirty: dirty }),
  clear: () => set({ publishedAudio: null, studioDirty: false }),
}));

/**
 * Buffer del audio publicado. Vive en el motor (no en el store) para no duplicar
 * el PCM en React/Zustand. Devuelve `null` si no hay nada publicado.
 */
export function getPublishedRinkBuffer(): AudioBuffer | null {
  return audioEngine.getPublishedAudio().buffer;
}
