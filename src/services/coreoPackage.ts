/**
 * coreoPackage.ts — Proprietary .coreo Project Bundle Manager.
 * Uses JSZip to package Choreography Nodes JSON + Audio Blob into a single portable file.
 */

import JSZip from 'jszip';
import { ChoreographyPathPoint } from '../types/choreography';

export interface CoreoManifest {
  format: 'SKATEART_COREO';
  version: '1.0.0';
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
  };
}

export interface CoreoProjectData {
  manifest: CoreoManifest;
  points: ChoreographyPathPoint[];
  audioBlob: Blob | null;
}

/**
 * Exporta el proyecto completo a un archivo .coreo (ZIP renombrado)
 */
export async function exportCoreoProject(
  programTitle: string,
  category: string,
  skaterGender: string,
  points: ChoreographyPathPoint[],
  audioBlob: Blob | null,
  audioFileName: string | null,
  bpm?: number,
  beatsPerMeasure?: number
): Promise<Blob> {
  const zip = new JSZip();

  const manifest: CoreoManifest = {
    format: 'SKATEART_COREO',
    version: '1.0.0',
    appVersion: '2.0.0',
    createdAt: Date.now(),
    program: {
      title: programTitle || 'Programa Coreográfico',
      category: category || 'RollArt Standard',
      durationMs: points.length > 0 ? points[points.length - 1].time_ms + 5000 : 120000,
      skaterGender: skaterGender || 'female',
    },
    audioMeta: {
      fileName: audioFileName || 'pista_audio.wav',
      bpm,
      beatsPerMeasure,
    }
  };

  // 1. Añadir manifiesto
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  // 2. Añadir nodos de coreografía
  zip.file('nodes.json', JSON.stringify(points, null, 2));

  // 3. Añadir Blob de audio si existe
  if (audioBlob) {
    const audioBytes = await audioBlob.arrayBuffer();
    zip.file('audio.bin', audioBytes);
  }

  // Generar Blob .coreo comprimido
  return await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/octet-stream',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
}

/**
 * Importa y desempaca un archivo .coreo
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

  return {
    manifest,
    points,
    audioBlob,
  };
}

