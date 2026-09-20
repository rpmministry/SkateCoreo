/**
 * coreoPackage.ts — Proprietary .coreo Project Bundle Manager.
 * Uses JSZip to package Choreography Nodes JSON + Audio Blob + Pre-cached TTS Audio
 * into a single portable, 100% offline file.
 */

import JSZip from 'jszip';
import { ChoreographyPathPoint } from '../types/choreography';
import { ttsService } from './ttsService';
import { isSpeakableFigure } from '../core/audio/VoiceCueEngine';

export interface CoreoManifest {
  format: 'SKATECOREO_BUNDLE' | 'SKATEART_COREO';
  version: '1.1.0';
  appVersion: '2.0.0';
  createdAt: number;
  program: {
    title: string;
    category?: string;
    durationMs: number;
    skaterGender?: string;
  };
  audioMeta: {
    fileName: string;
    bpm?: number;
    beatsPerMeasure?: number;
    playbackRate?: number;
  };
  ttsMeta?: {
    totalCues: number;
    hasVoiceCues: boolean;
  };
}

export interface CoreoProjectData {
  manifest: CoreoManifest;
  points: ChoreographyPathPoint[];
  audioBlob: Blob | null;
  ttsCachedCount: number;
}

/**
 * Exporta el proyecto completo a un archivo .coreo (ZIP comprimido)
 * incluyendo la música, los nodos coreográficos y todos los audios TTS pre-cacheados.
 */
export async function exportCoreoProject(
  programTitle: string,
  category: string,
  skaterGender: string,
  points: ChoreographyPathPoint[],
  audioBlob: Blob | null,
  audioFileName: string | null,
  bpm?: number,
  beatsPerMeasure?: number,
  playbackRate: number = 1.0
): Promise<Blob> {
  const zip = new JSZip();

  // 1. Recopilar y empaquetar audios TTS cacheados para las figuras de la coreografía
  const speakableFigures = points
    .filter((p) => isSpeakableFigure(p.label, p.type))
    .map((p) => p.label!.trim());
  const uniqueFigures = Array.from(new Set(speakableFigures));

  const ttsManifest: Record<string, { key: string; fileName: string; text: string }> = {};
  let ttsSavedCount = 0;

  const ttsFolder = zip.folder('tts_cues');

  for (let i = 0; i < uniqueFigures.length; i++) {
    const text = uniqueFigures[i];
    try {
      const bytes = await ttsService.getCachedAudioArrayBuffer(text);
      if (bytes && bytes.byteLength > 0 && ttsFolder) {
        const fileId = `cue_${i + 1}`;
        const fileName = `${fileId}.mp3`;
        ttsFolder.file(fileName, bytes);
        ttsManifest[text] = {
          key: text.toLowerCase(),
          fileName,
          text
        };
        ttsSavedCount++;
      }
    } catch (e) {
      // Ignorar errores individuales para no detener la exportación
    }
  }

  // 2. Crear manifiesto del proyecto
  const manifest: CoreoManifest = {
    format: 'SKATECOREO_BUNDLE',
    version: '1.1.0',
    appVersion: '2.0.0',
    createdAt: Date.now(),
    program: {
      title: programTitle || 'Programa Coreográfico',
      category: category || 'Standard',
      durationMs: points.length > 0 ? points[points.length - 1].time_ms + 5000 : 120000,
      skaterGender: skaterGender || 'female'
    },
    audioMeta: {
      fileName: audioFileName || 'pista_audio.wav',
      bpm,
      beatsPerMeasure,
      playbackRate
    },
    ttsMeta: {
      totalCues: ttsSavedCount,
      hasVoiceCues: ttsSavedCount > 0
    }
  };

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('nodes.json', JSON.stringify(points, null, 2));

  if (ttsSavedCount > 0) {
    zip.file('tts_manifest.json', JSON.stringify(ttsManifest, null, 2));
  }

  // 3. Añadir pista de música si existe
  if (audioBlob) {
    const audioBytes = await audioBlob.arrayBuffer();
    zip.file('audio.bin', audioBytes);
  }

  // 4. Generar binario comprimido
  return await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/octet-stream',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
}

/**
 * Importa y desempaca un archivo .coreo en cualquier dispositivo,
 * inyectando automáticamente los audios TTS en IndexedDB para funcionamiento 100% offline.
 */
export async function importCoreoProject(file: File | Blob): Promise<CoreoProjectData> {
  const zip = await JSZip.loadAsync(file);

  // 1. Leer manifest.json
  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) {
    throw new Error('El archivo no es un proyecto .coreo válido (falta manifest.json).');
  }
  const manifestText = await manifestFile.async('string');
  const manifest: CoreoManifest = JSON.parse(manifestText);

  // 2. Leer nodes.json
  const nodesFile = zip.file('nodes.json');
  let points: ChoreographyPathPoint[] = [];
  if (nodesFile) {
    const nodesText = await nodesFile.async('string');
    points = JSON.parse(nodesText);
  }

  // 3. Leer audio.bin
  const audioFile = zip.file('audio.bin');
  let audioBlob: Blob | null = null;
  if (audioFile) {
    const audioBytes = await audioFile.async('arraybuffer');
    audioBlob = new Blob([audioBytes], { type: 'audio/wav' });
  }

  // 4. Leer y restaurar audios TTS en caché IndexedDB local
  let ttsCachedCount = 0;
  const ttsManifestFile = zip.file('tts_manifest.json');
  if (ttsManifestFile) {
    try {
      const ttsManifestText = await ttsManifestFile.async('string');
      const ttsManifest: Record<string, { key: string; fileName: string; text: string }> = JSON.parse(ttsManifestText);

      for (const item of Object.values(ttsManifest)) {
        const cueFile = zip.file(`tts_cues/${item.fileName}`);
        if (cueFile) {
          const cueBytes = await cueFile.async('arraybuffer');
          await ttsService.saveAudioBytes(item.key, cueBytes);
          ttsCachedCount++;
        }
      }
    } catch (e) {
      console.warn('[coreoPackage] No se pudieron restaurar algunos audios TTS:', e);
    }
  }

  return {
    manifest,
    points,
    audioBlob,
    ttsCachedCount
  };
}
