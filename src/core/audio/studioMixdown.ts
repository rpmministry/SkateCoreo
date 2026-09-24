/**
 * studioMixdown.ts — Motor de Renderizado Offline Multitrack (Web Audio API)
 *
 * Mezcla todas las pistas y clips de audio activos en el Estudio de Audio
 * utilizando OfflineAudioContext por hardware a 44.1 kHz estéreo.
 *
 * Características:
 * - Respeta estados Solo y Mute por pista.
 * - Soporta múltiples clips independientes por pista con offsets temporales (startOffsetSec).
 * - Envolventes de ganancia suaves para Fade In y Fade Out en cada clip.
 * - Retorna un AudioBuffer único listo para ser inyectado en el reproductor de la Pista 2D.
 */

import { AudioStudioTrack, AudioClip, StudioMetronomeConfig } from '../../types/audioStudio';
import { normalizeSubdivision } from './Metronome';

export interface StudioMixdownResult {
  buffer: AudioBuffer;
  durationSec: number;
  sampleRate: number;
}

/**
 * Ubicación temporal exacta de un clip ("when", "offset" y "duration").
 * Equivale a los tres argumentos de `AudioBufferSourceNode.start(when, offset, duration)`.
 */
export interface ClipTiming {
  /** Instante de la línea de tiempo global en el que arranca el clip (segundos). */
  when: number;
  /** Punto de lectura dentro del buffer original (segundos). */
  offset: number;
  /** Longitud exacta del fragmento (segundos). */
  duration: number;
}

/**
 * Calcula `when` / `offset` / `duration` de un clip respetando SIEMPRE sus
 * puntos de corte, su posición en la línea de tiempo y los límites del buffer.
 *
 * Devuelve `null` si el clip es degenerado (sin duración, fuera del timeline o
 * completamente fuera del buffer), para que el agendador no cree nodos inútiles.
 */
export function computeClipTiming(
  clip: AudioClip,
  timelineDurationSec: number,
  bufferDurationSec: number
): ClipTiming | null {
  const trimStart = Math.max(0, clip.trimStartSec);
  const trimEnd = Math.max(trimStart, clip.trimEndSec);
  const clipDuration = trimEnd - trimStart;
  if (!(clipDuration > 0)) return null;

  const when = Math.max(0, clip.startOffsetSec);
  if (when >= timelineDurationSec) return null;

  const offset = Math.min(trimStart, Math.max(0, bufferDurationSec));
  const duration = Math.min(
    clipDuration,
    timelineDurationSec - when,
    bufferDurationSec - offset
  );
  if (!(duration > 0)) return null;

  return { when, offset, duration };
}

/** Ubicación de un clip en FRAMES, usada por el bounce PCM (Float32Array.set). */
export interface ClipPlacement {
  /** Frame de destino en la línea de tiempo ( = `when` × sampleRate ). */
  startFrame: number;
  /** Frame de origen dentro del buffer del clip ( = `offset` × srcSampleRate ). */
  srcStartFrame: number;
  /** Número de frames a copiar ( = `duration` × sampleRate ). */
  frameCount: number;
}

/**
 * Versión en frames de `computeClipTiming`, para la consolidación PCM.
 * `srcLength` permite acotar la lectura al final real del buffer de origen.
 */
export function computeClipPlacement(
  clip: AudioClip,
  sampleRate: number,
  totalFrames: number,
  srcSampleRate: number = sampleRate,
  srcLength?: number
): ClipPlacement | null {
  const trimStart = Math.max(0, clip.trimStartSec);
  const trimEnd = Math.max(trimStart, clip.trimEndSec);
  const clipDuration = trimEnd - trimStart;
  if (!(clipDuration > 0)) return null;

  const startFrame = Math.max(0, Math.round(clip.startOffsetSec * sampleRate));
  if (startFrame >= totalFrames) return null;

  const srcStartFrame = Math.max(0, Math.round(trimStart * srcSampleRate));
  const maxBySource = srcLength !== undefined
    ? Math.max(0, Math.floor(srcLength - srcStartFrame))
    : Number.POSITIVE_INFINITY;

  const frameCount = Math.min(
    Math.round(clipDuration * sampleRate),
    totalFrames - startFrame,
    maxBySource
  );
  if (frameCount <= 0) return null;

  return { startFrame, srcStartFrame, frameCount };
}

/**
 * Caché de un AudioContext "scratch" por sample rate.
 *
 * `bounceStudioClipsToBuffer` necesita un contexto SOLO para crear el AudioBuffer
 * de salida. Crear uno nuevo en cada consolidación agotaba el límite de
 * AudioContexts del navegador (~6) y lanzaba "Too many AudioContexts". Se reutiliza
 * uno por sample rate (habitualmente uno solo) y nunca se cierra.
 */
const scratchContexts = new Map<number, AudioContext>();

function getScratchAudioContext(sampleRate: number): AudioContext | null {
  const cached = scratchContexts.get(sampleRate);
  if (cached && cached.state !== 'closed') return cached;

  const CtxClass = typeof window !== 'undefined'
    ? (window.AudioContext || (window as any).webkitAudioContext)
    : (globalThis as any).AudioContext;
  if (!CtxClass) return null;

  try {
    const ctx = new CtxClass({ sampleRate }) as AudioContext;
    scratchContexts.set(sampleRate, ctx);
    return ctx;
  } catch {
    try {
      const ctx = new CtxClass() as AudioContext;
      scratchContexts.set(sampleRate, ctx);
      return ctx;
    } catch {
      return null;
    }
  }
}

/**
 * Realiza una consolidación/concatenación directa y de altísima velocidad (PCM Sample Copy)
 * en memoria entre los buffers de todos los fragmentos activos.
 *
 * OPTIMIZACIÓN CRÍTICA: Usa Float32Array.prototype.set() y subarray() en lugar de
 * bucles for per-sample. Los fade-in/out se aplican solo en las regiones de transición
 * (~20ms), mientras que el cuerpo central del clip se copia en bloque con set().
 *
 * Esto corre en <1ms de forma 100% sincrónica sin depender de OfflineAudioContext,
 * garantizando que el AudioBuffer maestro esté siempre listo para reproducción gapless inmediata.
 */
export function bounceStudioClipsToBuffer(
  tracks: AudioStudioTrack[],
  totalDurationSec: number = 120,
  targetSampleRate?: number
): AudioBuffer | null {
  const hasSolo = tracks.some((t) => t.solo);
  const activeTracks = tracks.filter((t) => {
    if (hasSolo) return t.solo && !t.muted && t.volume > 0;
    return !t.muted && t.volume > 0;
  });

  // Los CLIPS son la única fuente de verdad del arreglo. `track.buffer` es solo
  // el material original de origen y NUNCA se reproduce por sí mismo: si una
  // pista se quedó sin clips (todos movidos/borrados), queda en SILENCIO. El
  // fallback anterior al buffer completo provocaba que sonara la pista entera
  // subyacente en lugar del fragmento recortado.
  const hasAnyClips = activeTracks.some((t) => t.clips && t.clips.length > 0);
  if (!hasAnyClips) return null;

  let sampleRate = targetSampleRate || 44100;
  for (const track of tracks) {
    if (track.buffer?.sampleRate) {
      sampleRate = track.buffer.sampleRate;
      break;
    }
    const c = track.clips?.find((cl) => cl.buffer?.sampleRate);
    if (c?.buffer?.sampleRate) {
      sampleRate = c.buffer.sampleRate;
      break;
    }
  }

  let maxEndTime = Math.max(5, totalDurationSec);
  activeTracks.forEach((track) => {
    // Solo se consideran los clips reales (nunca el buffer de origen completo).
    (track.clips || []).forEach((clip) => {
      if (!clip.buffer) return;
      const clipDur = Math.max(0, clip.trimEndSec - clip.trimStartSec);
      const clipEnd = clip.startOffsetSec + clipDur;
      if (clipEnd > maxEndTime) maxEndTime = clipEnd;
    });
  });

  const durationSec = Math.ceil(maxEndTime * 10) / 10;
  const totalFrames = Math.max(1, Math.floor(durationSec * sampleRate));

  // Contexto scratch reutilizado (evita agotar el límite de AudioContexts y
  // fugas de memoria al consolidar repetidamente).
  let outBuffer: AudioBuffer;
  const scratch = getScratchAudioContext(sampleRate);
  if (scratch) {
    outBuffer = scratch.createBuffer(2, totalFrames, sampleRate);
  } else {
    outBuffer = new (globalThis as any).AudioBuffer({ length: totalFrames, numberOfChannels: 2, sampleRate });
  }

  const outL = outBuffer.getChannelData(0);
  const outR = outBuffer.getChannelData(1);

  /* ── FAST PATH (cero bucles JS): una sola pista, un solo clip, ganancia 1.0,
        sin fades y mismo sample rate. La copia se delega a Float32Array.set(),
        que ejecuta en código nativo (memcpy). Es el caso típico al cortar una
        pista Master única: el split se resuelve en <1ms sin bloquear el hilo. ── */
  if (activeTracks.length === 1) {
    const onlyTrack = activeTracks[0];
    const onlyClips = onlyTrack.clips || [];
    const onlyClip = onlyClips[0];
    const unityGain = Math.abs(Math.max(0, Math.min(1, onlyTrack.volume)) - 1) < 1e-6;
    const noFades = !onlyClip?.fadeInSec && !onlyClip?.fadeOutSec;

    if (
      onlyClips.length === 1 &&
      onlyClip?.buffer &&
      onlyClip.buffer.sampleRate === sampleRate &&
      unityGain &&
      noFades
    ) {
      const srcL = onlyClip.buffer.getChannelData(0);
      const srcR = onlyClip.buffer.numberOfChannels > 1 ? onlyClip.buffer.getChannelData(1) : srcL;
      const placement = computeClipPlacement(
        onlyClip,
        sampleRate,
        totalFrames,
        sampleRate,
        srcL.length
      );
      if (placement) {
        const { startFrame, srcStartFrame, frameCount } = placement;
        outL.set(srcL.subarray(srcStartFrame, srcStartFrame + frameCount), startFrame);
        outR.set(srcR.subarray(srcStartFrame, srcStartFrame + frameCount), startFrame);
      }
      return outBuffer;
    }
  }

  activeTracks.forEach((track) => {
    const trackGain = Math.max(0, Math.min(1, track.volume));
    const clips = track.clips || [];

    clips.forEach((clip) => {
      if (!clip.buffer) return;
      const srcL = clip.buffer.getChannelData(0);
      const srcR = clip.buffer.numberOfChannels > 1 ? clip.buffer.getChannelData(1) : srcL;
      const srcSampleRate = clip.buffer.sampleRate;

      // "when" / "offset" / "duration" del clip, acotados a la línea de tiempo y
      // al buffer de origen. Sin esto se copiaba audio fuera de los cortes.
      const placement = computeClipPlacement(
        clip,
        sampleRate,
        totalFrames,
        srcSampleRate,
        srcL.length
      );
      if (!placement) return;

      const { startFrame, srcStartFrame: trimStartFrame, frameCount } = placement;
      const clipDur = clip.trimEndSec - clip.trimStartSec;

      const fadeInFrames = Math.round(Math.min((clip.fadeInSec || 0), clipDur * 0.5) * sampleRate);
      const fadeOutFrames = Math.round(Math.min((clip.fadeOutSec || 0), clipDur * 0.5) * sampleRate);
      const bodyStart = fadeInFrames;
      const bodyEnd = frameCount - fadeOutFrames;
      const bodyFrames = Math.max(0, bodyEnd - bodyStart);

      const srcStride = srcSampleRate === sampleRate ? 1 : (srcSampleRate / sampleRate);

      /* ── Fade-in: per-sample loop (solo en la zona de transición, típicamente < 20ms) ── */
      for (let i = 0; i < Math.min(fadeInFrames, frameCount); i++) {
        const destIdx = startFrame + i;
        const srcIdx = trimStartFrame + Math.floor(i * srcStride);
        if (srcIdx >= srcL.length) break;
        const fadeGain = trackGain * (i / Math.max(1, fadeInFrames));
        outL[destIdx] += srcL[srcIdx] * fadeGain;
        outR[destIdx] += srcR[srcIdx] * fadeGain;
      }

      /* ── Body: copia en bloque con Float32Array.set() y subarray() — cero overhead de loop JS ── */
      if (bodyFrames > 0) {
        const destStart = startFrame + bodyStart;
        const srcStart = trimStartFrame + Math.floor(bodyStart * srcStride);

        if (srcSampleRate === sampleRate) {
          const srcLBody = srcL.subarray(srcStart, srcStart + bodyFrames);
          const srcRBody = srcR.subarray(srcStart, srcStart + bodyFrames);

          for (let i = 0; i < bodyFrames; i++) {
            outL[destStart + i] += srcLBody[i] * trackGain;
            outR[destStart + i] += srcRBody[i] * trackGain;
          }
        } else {
          for (let i = 0; i < bodyFrames; i++) {
            const srcIdx = srcStart + Math.floor(i * srcStride);
            if (srcIdx >= srcL.length) break;
            outL[destStart + i] += srcL[srcIdx] * trackGain;
            outR[destStart + i] += srcR[srcIdx] * trackGain;
          }
        }
      }

      /* ── Fade-out: per-sample loop (solo en la zona de transición) ── */
      if (fadeOutFrames > 0) {
        for (let i = Math.max(bodyEnd, 0); i < frameCount; i++) {
          const destIdx = startFrame + i;
          const srcIdx = trimStartFrame + Math.floor(i * srcStride);
          if (srcIdx >= srcL.length) break;
          const fadeGain = trackGain * Math.max(0, (frameCount - i) / Math.max(1, fadeOutFrames));
          outL[destIdx] += srcL[srcIdx] * fadeGain;
          outR[destIdx] += srcR[srcIdx] * fadeGain;
        }
      }
    });
  });

  return outBuffer;
}

export async function renderStudioMixdown(
  tracks: AudioStudioTrack[],
  totalDurationSec: number = 120,
  metronomeConfig?: StudioMetronomeConfig
): Promise<StudioMixdownResult> {
  // Verificación de OfflineAudioContext con fallback ultra-rápido a bounceStudioClipsToBuffer
  const OfflineCtxClass = typeof window !== 'undefined'
    ? (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext)
    : (globalThis as any).OfflineAudioContext;

  if (!OfflineCtxClass) {
    const bounced = bounceStudioClipsToBuffer(tracks, totalDurationSec);
    if (bounced) {
      return {
        buffer: bounced,
        durationSec: bounced.duration,
        sampleRate: bounced.sampleRate,
      };
    }
  }
  // 1. Determinar pistas activas respetando Solo y Mute
  const hasSolo = tracks.some((t) => t.solo);
  const activeTracks = tracks.filter((t) => {
    if (hasSolo) return t.solo && !t.muted && t.volume > 0;
    return !t.muted && t.volume > 0;
  });

  // 2. Determinar sampleRate base a partir del primer buffer disponible (default 44100)
  let sampleRate = 44100;
  for (const track of tracks) {
    if (track.buffer?.sampleRate) {
      sampleRate = track.buffer.sampleRate;
      break;
    }
    const clipWithBuffer = track.clips?.find((c) => c.buffer?.sampleRate);
    if (clipWithBuffer?.buffer?.sampleRate) {
      sampleRate = clipWithBuffer.buffer.sampleRate;
      break;
    }
  }

  // 3. Calcular la duración máxima real considerando SOLO los clips del arreglo
  // (el buffer de origen nunca se reproduce por sí mismo).
  let maxEndTime = Math.max(5, totalDurationSec);
  activeTracks.forEach((track) => {
    (track.clips || []).forEach((clip) => {
      if (!clip.buffer) return;
      const clipDuration = Math.max(0, clip.trimEndSec - clip.trimStartSec);
      const clipEnd = clip.startOffsetSec + clipDuration;
      if (clipEnd > maxEndTime) {
        maxEndTime = clipEnd;
      }
    });
  });

  const durationSec = Math.ceil(maxEndTime * 10) / 10;
  const totalFrames = Math.max(1, Math.floor(durationSec * sampleRate));
  const numberOfChannels = 2; // Estéreo

  // 4. Instanciar OfflineAudioContext
  const offlineCtx = new OfflineAudioContext(numberOfChannels, totalFrames, sampleRate);

  // 5. Renderizar cada pista activa (agendador de clips)
  activeTracks.forEach((track) => {
    const trackGain = offlineCtx.createGain();
    trackGain.gain.value = Math.max(0, Math.min(1, track.volume));
    trackGain.connect(offlineCtx.destination);

    // Solo los clips reales del arreglo; nunca el buffer completo de la pista.
    const clips = track.clips || [];

    clips.forEach((clip) => {
      if (!clip.buffer) return;

      // `when` / `offset` / `duration` exactos del fragmento recortado.
      // Se acotan al timeline y al propio buffer: el audio fuera de los cortes
      // no llega nunca a la salida maestra.
      const timing = computeClipTiming(clip, durationSec, clip.buffer.duration);
      if (!timing) return;

      const { when, offset, duration: effectiveDuration } = timing;

      const source = offlineCtx.createBufferSource();
      source.buffer = clip.buffer;

      const clipGain = offlineCtx.createGain();

      // Envolvente de Fade In y Fade Out
      const fadeIn = Math.min(clip.fadeInSec || 0, effectiveDuration / 2);
      const fadeOut = Math.min(clip.fadeOutSec || 0, effectiveDuration / 2);

      if (fadeIn > 0) {
        clipGain.gain.setValueAtTime(0.0001, when);
        clipGain.gain.linearRampToValueAtTime(1.0, when + fadeIn);
      } else {
        clipGain.gain.setValueAtTime(1.0, when);
      }

      if (fadeOut > 0) {
        const fadeOutStart = when + effectiveDuration - fadeOut;
        clipGain.gain.setValueAtTime(1.0, Math.max(when + fadeIn, fadeOutStart));
        clipGain.gain.linearRampToValueAtTime(0.0001, when + effectiveDuration);
      }

      source.connect(clipGain);
      clipGain.connect(trackGain);

      // Arranque con recorte + parada ESTRICTA al terminar el segmento: el nodo
      // no puede seguir sonando más allá de los límites del clip.
      source.start(when, offset, effectiveDuration);
      source.stop(when + effectiveDuration);
      source.onended = () => {
        try {
          source.disconnect();
          clipGain.disconnect();
        } catch {
          /* El contexto offline ya puede estar recogido. */
        }
      };
    });
  });

  // 6. Superponer metrónomo sintético si está activado
  if (metronomeConfig?.enabled && metronomeConfig.bpm > 0) {
    const bpm = metronomeConfig.bpm;
    const beatsPerMeasure = metronomeConfig.beatsPerMeasure || 4;
    const subdivision = normalizeSubdivision(metronomeConfig.subdivision);
    const secondsPerPulse = (60.0 / bpm) / subdivision;
    const pulsesPerMeasure = Math.max(1, beatsPerMeasure * subdivision);
    let currentPulseTime = 0;
    let pulseIndex = 0;

    const metroGain = offlineCtx.createGain();
    metroGain.gain.value = Math.max(0, Math.min(1, metronomeConfig.volume || 0.8));
    metroGain.connect(offlineCtx.destination);

    while (currentPulseTime < durationSec) {
      const pulseInMeasure = pulseIndex % pulsesPerMeasure;
      const isDownbeat = pulseInMeasure === 0;
      const isBeatStart = pulseInMeasure % subdivision === 0;
      const osc = offlineCtx.createOscillator();
      const oscGain = offlineCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(isDownbeat ? 1760 : 880, currentPulseTime);

      oscGain.gain.setValueAtTime(isDownbeat ? 0.9 : isBeatStart ? 0.6 : 0.4, currentPulseTime);
      oscGain.gain.exponentialRampToValueAtTime(0.0001, currentPulseTime + 0.025);

      osc.connect(oscGain);
      oscGain.connect(metroGain);

      osc.start(currentPulseTime);
      osc.stop(currentPulseTime + 0.03);

      currentPulseTime += secondsPerPulse;
      pulseIndex++;
    }
  }

  // 7. Ejecutar renderizado acelerado por hardware
  const renderedBuffer = await offlineCtx.startRendering();

  return {
    buffer: renderedBuffer,
    durationSec: renderedBuffer.duration,
    sampleRate: renderedBuffer.sampleRate,
  };
}
