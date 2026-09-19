/**
 * audioMixdown.ts — High-speed offline audio rendering using OfflineAudioContext.
 * Mixes the base music track with metronome clicks and voice cues at exact timestamps.
 * 
 * Strict Dual-Mono / Stereo Panning Matrix:
 * - Canal Derecho (R): Pista de música limpia (0% metrónomo, 0% voz de coach).
 * - Canal Izquierdo (L): Pista del entrenador (100% metrónomo + 100% guías vocales, 0% música).
 */

import { ChoreographyPathPoint } from '../../types/choreography';
import { isSpeakableFigure } from './VoiceCueEngine';
import { ttsService } from '../../services/ttsService';

export interface MixdownOptions {
  musicBuffer: AudioBuffer;
  bpm: number;
  beatsPerMeasure: number;
  metronomeEnabled: boolean;
  voiceCuesEnabled?: boolean;
  warningLeadTimeSec?: number;
  musicVolume?: number;     // 0.0 to 1.0
  coachVolume?: number;     // 0.0 to 1.0
  metronomeVolume?: number; // Aliased to coachVolume for compatibility
  points?: ChoreographyPathPoint[];
  playbackRate?: number;
  phaseOffsetSec?: number;
}

/**
 * Renderiza la mezcla final por hardware utilizando OfflineAudioContext
 * garantizando aislamiento absoluto L/R (L = Coach/Metrónomo/Voz, R = Música).
 */
export async function renderChoreographyMixdown(
  options: MixdownOptions
): Promise<Blob> {
  const {
    musicBuffer,
    bpm,
    beatsPerMeasure,
    metronomeEnabled,
    voiceCuesEnabled = true,
    warningLeadTimeSec = 3,
    musicVolume = 1.0,
    coachVolume = options.coachVolume ?? options.metronomeVolume ?? 0.85,
    points = [],
    playbackRate = 1.0,
    phaseOffsetSec = 0
  } = options;

  const sampleRate = musicBuffer.sampleRate;
  const effectivePlaybackRate = Math.max(0.5, Math.min(2.0, playbackRate));
  const durationSec = musicBuffer.duration / effectivePlaybackRate;
  const totalFrames = Math.floor(durationSec * sampleRate);
  const numberOfChannels = 2; // Stereo (0 = Left, 1 = Right)

  // 1. Crear OfflineAudioContext por hardware
  const offlineCtx = new OfflineAudioContext(numberOfChannels, totalFrames, sampleRate);

  // 2. Matriz de Mezcla Estricta (Merger de 2 canales)
  const merger = offlineCtx.createChannelMerger(2);
  merger.connect(offlineCtx.destination);

  // ── BUS DE MÚSICA (Exclusivamente Canal Derecho - R: input 1) ──
  const musicSource = offlineCtx.createBufferSource();
  musicSource.buffer = musicBuffer;
  musicSource.playbackRate.value = effectivePlaybackRate;

  const musicGain = offlineCtx.createGain();
  musicGain.gain.value = musicVolume;

  musicSource.connect(musicGain);
  // Conectar música exclusivamente al canal derecho (input 1 del merger)
  musicGain.connect(merger, 0, 1);
  musicSource.start(0);

  // ── BUS DEL COACH (Exclusivamente Canal Izquierdo - L: input 0) ──
  const coachGain = offlineCtx.createGain();
  coachGain.gain.value = coachVolume;
  coachGain.connect(merger, 0, 0);

  // 3. Superposición de pulsos de Metrónomo en marcas exactas sobre el Canal L
  if (metronomeEnabled && bpm > 0) {
    const secondsPerBeat = (60.0 / bpm) / effectivePlaybackRate;
    let currentBeatTime = Math.max(0, phaseOffsetSec / effectivePlaybackRate);
    let beatIndex = 0;

    while (currentBeatTime < durationSec) {
      const isDownbeat = beatIndex % beatsPerMeasure === 0;
      const freq = isDownbeat ? 1760 : 880; // A6 (primer compás acentuado) vs A5 (resto)

      const osc = offlineCtx.createOscillator();
      const oscGain = offlineCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, currentBeatTime);

      // Envolvente de volumen percusiva (30ms)
      oscGain.gain.setValueAtTime(isDownbeat ? 1.0 : 0.75, currentBeatTime);
      oscGain.gain.exponentialRampToValueAtTime(0.0001, currentBeatTime + 0.030);

      osc.connect(oscGain);
      oscGain.connect(coachGain);

      osc.start(currentBeatTime);
      osc.stop(currentBeatTime + 0.030);

      currentBeatTime += secondsPerBeat;
      beatIndex++;
    }
  }

  // 4. Inserción de Avisos Vocales y Conteos (Voice Cues) sobre el Canal L
  if (voiceCuesEnabled && points.length > 0) {
    const speakableNodes = points.filter(
      (p) => p.time_ms > 0 && isSpeakableFigure(p.label, p.type)
    );

    for (const node of speakableNodes) {
      const figureTimeSec = (node.time_ms / 1000) / effectivePlaybackRate;
      const leadTimeSec = Math.max(1, warningLeadTimeSec) / effectivePlaybackRate;
      const cueTimeSec = Math.max(0, figureTimeSec - leadTimeSec);

      const figureName = node.label!.trim();

      // Generar o recuperar audio sintetizado para el nombre de la figura
      try {
        const figureBuffer = await ttsService.getAudioBufferForText(figureName);
        if (figureBuffer && cueTimeSec < durationSec) {
          const cueSource = offlineCtx.createBufferSource();
          cueSource.buffer = figureBuffer;
          cueSource.connect(coachGain);
          cueSource.start(cueTimeSec);
        }
      } catch (err) {
        // En caso de que no haya conexión a TTS, se omite el fragmento sin detener la mezcla
      }

      // Beep o tono de confirmación en la llegada exacta (¡Ya!)
      if (figureTimeSec < durationSec) {
        const arrivalOsc = offlineCtx.createOscillator();
        const arrivalGain = offlineCtx.createGain();
        arrivalOsc.type = 'triangle';
        arrivalOsc.frequency.setValueAtTime(1200, figureTimeSec);
        arrivalGain.gain.setValueAtTime(0.9, figureTimeSec);
        arrivalGain.gain.exponentialRampToValueAtTime(0.0001, figureTimeSec + 0.05);

        arrivalOsc.connect(arrivalGain);
        arrivalGain.connect(coachGain);
        arrivalOsc.start(figureTimeSec);
        arrivalOsc.stop(figureTimeSec + 0.05);
      }
    }
  }

  // 5. Renderizado acelerado por hardware
  const renderedBuffer: AudioBuffer = await offlineCtx.startRendering();

  // 6. Codificación PCM 16-bit WAV Estéreo
  return audioBufferToWavBlob(renderedBuffer);
}

/**
 * Codificador PCM 16-bit WAV en memoria del navegador
 */
export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const numSamples = buffer.length * numChannels;
  const dataSize = numSamples * 2;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // Encabezado RIFF estándar
  writeString(0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
  view.setUint16(32, numChannels * (bitDepth / 8), true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Interleaving de canales de audio a 16-bit con clamp
  let offset = 44;
  const channels: Float32Array[] = [];
  for (let i = 0; i < numChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }

  return new Blob([view], { type: 'audio/wav' });
}
