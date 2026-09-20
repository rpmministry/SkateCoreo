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

import { AudioStudioTrack, StudioMetronomeConfig } from '../../types/audioStudio';

export interface StudioMixdownResult {
  buffer: AudioBuffer;
  durationSec: number;
  sampleRate: number;
}

export async function renderStudioMixdown(
  tracks: AudioStudioTrack[],
  totalDurationSec: number = 120,
  metronomeConfig?: StudioMetronomeConfig
): Promise<StudioMixdownResult> {
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

  // 3. Calcular la duración máxima real considerando todos los clips
  let maxEndTime = Math.max(5, totalDurationSec);
  activeTracks.forEach((track) => {
    const clips = track.clips && track.clips.length > 0
      ? track.clips
      : track.buffer
        ? [{
            id: 'legacy-clip',
            name: track.name,
            buffer: track.buffer,
            startOffsetSec: 0,
            trimStartSec: track.trimStartSec || 0,
            trimEndSec: track.trimEndSec || track.buffer.duration,
            fadeInSec: track.fadeInSec || 0,
            fadeOutSec: track.fadeOutSec || 0,
          }]
        : [];

    clips.forEach((clip) => {
      const clipDuration = Math.max(0.1, clip.trimEndSec - clip.trimStartSec);
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

  // 5. Renderizar cada pista activa
  activeTracks.forEach((track) => {
    const trackGain = offlineCtx.createGain();
    trackGain.gain.value = Math.max(0, Math.min(1, track.volume));
    trackGain.connect(offlineCtx.destination);

    // Obtener los clips de la pista o fallback al buffer directo
    const clips = track.clips && track.clips.length > 0
      ? track.clips
      : track.buffer
        ? [{
            id: `legacy-${track.id}`,
            name: track.name,
            buffer: track.buffer,
            startOffsetSec: 0,
            trimStartSec: track.trimStartSec || 0,
            trimEndSec: track.trimEndSec || track.buffer.duration,
            fadeInSec: track.fadeInSec || 0,
            fadeOutSec: track.fadeOutSec || 0,
          }]
        : [];

    clips.forEach((clip) => {
      if (!clip.buffer) return;

      const clipDuration = Math.max(0.05, clip.trimEndSec - clip.trimStartSec);
      const startTimeline = Math.max(0, clip.startOffsetSec);

      // Si el clip cae completamente fuera de la duración programada, saltar
      if (startTimeline >= durationSec) return;

      const source = offlineCtx.createBufferSource();
      source.buffer = clip.buffer;

      const clipGain = offlineCtx.createGain();

      // Envolvente de Fade In y Fade Out
      const effectiveDuration = Math.min(clipDuration, durationSec - startTimeline);
      const fadeIn = Math.min(clip.fadeInSec || 0, effectiveDuration / 2);
      const fadeOut = Math.min(clip.fadeOutSec || 0, effectiveDuration / 2);

      if (fadeIn > 0) {
        clipGain.gain.setValueAtTime(0.0001, startTimeline);
        clipGain.gain.linearRampToValueAtTime(1.0, startTimeline + fadeIn);
      } else {
        clipGain.gain.setValueAtTime(1.0, startTimeline);
      }

      if (fadeOut > 0) {
        const fadeOutStart = startTimeline + effectiveDuration - fadeOut;
        clipGain.gain.setValueAtTime(1.0, Math.max(startTimeline + fadeIn, fadeOutStart));
        clipGain.gain.linearRampToValueAtTime(0.0001, startTimeline + effectiveDuration);
      }

      source.connect(clipGain);
      clipGain.connect(trackGain);

      const offsetInBuffer = Math.max(0, clip.trimStartSec);
      source.start(startTimeline, offsetInBuffer, effectiveDuration);
    });
  });

  // 6. Superponer metrónomo sintético si está activado
  if (metronomeConfig?.enabled && metronomeConfig.bpm > 0) {
    const bpm = metronomeConfig.bpm;
    const beatsPerMeasure = metronomeConfig.beatsPerMeasure || 4;
    const secondsPerBeat = 60.0 / bpm;
    let currentBeatTime = 0;
    let beatIndex = 0;

    const metroGain = offlineCtx.createGain();
    metroGain.gain.value = Math.max(0, Math.min(1, metronomeConfig.volume || 0.8));
    metroGain.connect(offlineCtx.destination);

    while (currentBeatTime < durationSec) {
      const isDownbeat = beatIndex % beatsPerMeasure === 0;
      const osc = offlineCtx.createOscillator();
      const oscGain = offlineCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(isDownbeat ? 1760 : 880, currentBeatTime);

      oscGain.gain.setValueAtTime(isDownbeat ? 0.9 : 0.6, currentBeatTime);
      oscGain.gain.exponentialRampToValueAtTime(0.0001, currentBeatTime + 0.025);

      osc.connect(oscGain);
      oscGain.connect(metroGain);

      osc.start(currentBeatTime);
      osc.stop(currentBeatTime + 0.03);

      currentBeatTime += secondsPerBeat;
      beatIndex++;
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
