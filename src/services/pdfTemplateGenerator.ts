/**
 * pdfTemplateGenerator — Generador de Plantilla Reglamentaria PDF A4 Horizontal
 *
 * Exporta un documento PDF A4 Landscape (297 x 210 mm) con la pista World Skate 2:1 a escala,
 * cuadrícula milimetrada, guías de evaluación (Eje Largo, Eje Corto, Diagonales, cotas 3/4)
 * y 4 marcas fiduciales de alta precisión en las esquinas para visión artificial.
 */

import { jsPDF } from 'jspdf';
import { RinkDimensions } from '../types/choreography';
import { DEFAULT_RINK_DIMENSIONS } from '../core/canvas/RinkMath';

export interface TemplateMetadata {
  title?: string;
  athleteName?: string;
  coachName?: string;
  clubName?: string;
  category?: string;
  bpm?: number;
  durationSec?: number;
}

export class PdfTemplateGenerator {
  /**
   * Genera el documento PDF A4 Horizontal y retorna la instancia jsPDF
   */
  public static generateTemplate(
    metadata: TemplateMetadata = {},
    rink: RinkDimensions = DEFAULT_RINK_DIMENSIONS
  ): jsPDF {
    // A4 Landscape: 297mm x 210mm
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    const PAGE_W = 297;

    // Dimensiones calibradas de la pista (Escala 2:1 estricta: 240mm x 120mm)
    const RINK_W = 240;
    const RINK_H = 120;
    const RINK_X = (PAGE_W - RINK_W) / 2; // 28.5 mm
    const RINK_Y = 44; // mm

    const scaleMmPerMeter = RINK_W / rink.lengthMeters; // 4.8 mm/metro
    const cornerRadiusMm = rink.cornerRoundsMeters * scaleMmPerMeter; // 16.8 mm

    // ── 1. ENCABEZADO INSTITUCIONAL & METADATOS ──
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(10, 10, PAGE_W - 20, 26, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(0, 240, 255); // Cyan eléctrico
    doc.text('SKATECOREO · PLANTILLA REGLAMENTARIA DE COREOGRAFÍA', 14, 18);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text('Normativa World Skate & FEP · Escala 50x25m (Proporción 2:1) · Sistema Paper-to-Digital', 14, 23);

    // Campos de metadatos
    doc.setFontSize(8);
    doc.setTextColor(226, 232, 240); // slate-200
    const metaY1 = 30;

    doc.setFont('helvetica', 'bold');
    doc.text('Atleta:', 14, metaY1);
    doc.setFont('helvetica', 'normal');
    doc.text(metadata.athleteName || '________________________', 26, metaY1);

    doc.setFont('helvetica', 'bold');
    doc.text('Club / Entrenador:', 90, metaY1);
    doc.setFont('helvetica', 'normal');
    doc.text(metadata.clubName || metadata.coachName || '________________________', 122, metaY1);

    doc.setFont('helvetica', 'bold');
    doc.text('Categoría:', 185, metaY1);
    doc.setFont('helvetica', 'normal');
    doc.text(metadata.category || 'RollArt 2026', 203, metaY1);

    doc.setFont('helvetica', 'bold');
    doc.text('Tempo:', 240, metaY1);
    doc.setFont('helvetica', 'normal');
    doc.text(metadata.bpm ? `${metadata.bpm} BPM` : '140 BPM', 253, metaY1);

    // ── 2. CUADRÍCULA MILIMETRADA DE LA PISTA (1m y 5m) ──
    // Fondo de la pista (blanco técnico para dibujo a tinta)
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(RINK_X, RINK_Y, RINK_W, RINK_H, cornerRadiusMm, cornerRadiusMm, 'F');

    // Cuadrícula fina de 1 metro
    doc.setDrawColor(230, 235, 245);
    doc.setLineWidth(0.1);
    for (let m = 1; m < rink.lengthMeters; m++) {
      const gx = RINK_X + m * scaleMmPerMeter;
      doc.line(gx, RINK_Y, gx, RINK_Y + RINK_H);
    }
    for (let m = 1; m < rink.widthMeters; m++) {
      const gy = RINK_Y + m * scaleMmPerMeter;
      doc.line(RINK_X, gy, RINK_X + RINK_W, gy);
    }

    // Cuadrícula principal de 5 metros
    doc.setDrawColor(190, 205, 225);
    doc.setLineWidth(0.2);
    for (let m = 5; m < rink.lengthMeters; m += 5) {
      const gx = RINK_X + m * scaleMmPerMeter;
      doc.line(gx, RINK_Y, gx, RINK_Y + RINK_H);
    }
    for (let m = 5; m < rink.widthMeters; m += 5) {
      const gy = RINK_Y + m * scaleMmPerMeter;
      doc.line(RINK_X, gy, RINK_X + RINK_W, gy);
    }

    // ── 3. GUÍAS ESPACIALES REGLAMENTARIAS IMPRESAS ──
    // Valla perimetral de la pista
    doc.setDrawColor(71, 85, 105); // slate-600
    doc.setLineWidth(0.6);
    doc.roundedRect(RINK_X, RINK_Y, RINK_W, RINK_H, cornerRadiusMm, cornerRadiusMm, 'S');

    // Eje Largo (Long Axis)
    const midY = RINK_Y + RINK_H / 2;
    doc.setDrawColor(2, 132, 199); // Sky blue
    doc.setLineWidth(0.35);
    doc.setLineDashPattern([3, 2], 0);
    doc.line(RINK_X, midY, RINK_X + RINK_W, midY);

    // Eje Corto (Short Axis)
    const midX = RINK_X + RINK_W / 2;
    doc.line(midX, RINK_Y, midX, RINK_Y + RINK_H);
    doc.setLineDashPattern([], 0); // Restaurar sólido

    // Círculo central reglamentario (Radio 3m = 14.4mm)
    doc.setDrawColor(2, 132, 199);
    doc.setLineWidth(0.3);
    doc.circle(midX, midY, 3 * scaleMmPerMeter, 'S');

    // Diagonales (para evaluación de Scissors >= 3/4)
    doc.setDrawColor(168, 85, 247); // Púrpura
    doc.setLineWidth(0.25);
    doc.setLineDashPattern([2, 3], 0);
    doc.line(RINK_X, RINK_Y, RINK_X + RINK_W, RINK_Y + RINK_H);
    doc.line(RINK_X, RINK_Y + RINK_H, RINK_X + RINK_W, RINK_Y);
    doc.setLineDashPattern([], 0);

    // Marcas de 3/4 de Eje Largo (Skating Skills >= 37.5m)
    doc.setFillColor(2, 132, 199);
    const mark34LeftX = RINK_X + RINK_W * 0.25;
    const mark34RightX = RINK_X + RINK_W * 0.75;

    doc.rect(mark34LeftX - 0.5, midY - 3, 1, 6, 'F');
    doc.rect(mark34RightX - 0.5, midY - 3, 1, 6, 'F');

    doc.setFontSize(6);
    doc.setTextColor(2, 132, 199);
    doc.text('3/4 (37.5m)', mark34LeftX, midY - 4, { align: 'center' });
    doc.text('3/4 (37.5m)', mark34RightX, midY - 4, { align: 'center' });

    // Panel de Jueces World Skate (recuadro superior central)
    doc.setFillColor(254, 243, 199); // Amber-100
    doc.setDrawColor(245, 158, 11); // Amber-500
    doc.setLineWidth(0.3);
    const judgeBoxW = 46;
    const judgeBoxH = 5;
    const judgeBoxX = RINK_X + (RINK_W - judgeBoxW) / 2;
    const judgeBoxY = RINK_Y - 6;
    doc.roundedRect(judgeBoxX, judgeBoxY, judgeBoxW, judgeBoxH, 1, 1, 'FD');

    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(180, 83, 9);
    doc.text('PANEL DE JUECES (WORLD SKATE)', judgeBoxX + judgeBoxW / 2, judgeBoxY + 3.5, { align: 'center' });

    // ── 4. MARCAS FIDUCIALES DE ALTA PRECISIÓN (4 ESQUINAS) ──
    // Estas dianas de calibración son leídas por el motor de visión artificial
    this.drawFiducialMarker(doc, RINK_X, RINK_Y, 'TL');
    this.drawFiducialMarker(doc, RINK_X + RINK_W, RINK_Y, 'TR');
    this.drawFiducialMarker(doc, RINK_X + RINK_W, RINK_Y + RINK_H, 'BR');
    this.drawFiducialMarker(doc, RINK_X, RINK_Y + RINK_H, 'BL');

    // ── 5. PANEL INFERIOR: GUÍA DE DIBUJO E INSTRUCCIONES ──
    const footY = RINK_Y + RINK_H + 4;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.roundedRect(10, footY, PAGE_W - 20, 32, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text('INSTRUCCIONES PARA LA ENTRENADORA / COREÓGRAFA (PAPER-TO-DIGITAL):', 14, footY + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text('1. DIBUJO DE TRAZOS: Dibuje las trayectorias de desplazamiento sobre la pista con un marcador o bolígrafo de tinta oscura (negro o azul).', 14, footY + 12);
    doc.text('2. NUMERACIÓN DE NODOS: Escriba números claros dentro de pequeños círculos ( 1 , 2 , 3 ...) para indicar la secuencia temporal exacta.', 14, footY + 17);
    doc.text('3. CAPTURA DE FOTO: Tome una foto iluminada de la hoja completa. Asegúrese de que las 4 marcas de esquina ( ⊕ ) sean claramente visibles.', 14, footY + 22);
    doc.text('4. DIGITALIZACIÓN: En la app SkateCoreo, seleccione "Digitalizar Papel" y suba la foto. El sistema corregirá la perspectiva y cargará sus nodos.', 14, footY + 27);

    // Indicador de escala en esquina derecha
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text('ESCALA DE PISTA: 1 metro = 4.80 mm  |  1 mm = 0.208 m  |  Ratio 2:1 Estricto (50x25 m)', PAGE_W - 14, footY + 27, { align: 'right' });

    return doc;
  }

  /**
   * Dibuja una marca fiducial concéntrica de alto contraste (Patrón Diana + Cruz)
   * Tamaño: 12 mm x 12 mm centrada exactamente en (cx, cy)
   */
  private static drawFiducialMarker(
    doc: jsPDF,
    cx: number,
    cy: number,
    label: 'TL' | 'TR' | 'BR' | 'BL'
  ): void {
    const size = 10; // mm
    const half = size / 2;

    doc.saveGraphicsState();

    // Fondo blanco protector exterior
    doc.setFillColor(255, 255, 255);
    doc.rect(cx - half - 1.5, cy - half - 1.5, size + 3, size + 3, 'F');

    // Cuadrante exterior oscuro
    doc.setFillColor(0, 0, 0);
    doc.rect(cx - half, cy - half, size, size, 'F');

    // Círculo interior blanco
    doc.setFillColor(255, 255, 255);
    doc.circle(cx, cy, 3.2, 'F');

    // Círculo central negro
    doc.setFillColor(0, 0, 0);
    doc.circle(cx, cy, 1.4, 'F');

    // Cruz de mira de alta precisión (Crosshairs)
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.4);
    doc.line(cx - half + 0.5, cy, cx + half - 0.5, cy);
    doc.line(cx, cy - half + 0.5, cx, cy + half - 0.5);

    // Etiqueta del cuadrante
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5);
    doc.setTextColor(71, 85, 105);
    const textOffsetY = label.startsWith('T') ? -half - 1.5 : half + 2.5;
    doc.text(`[${label}]`, cx, cy + textOffsetY, { align: 'center' });

    doc.restoreGraphicsState();
  }

  /**
   * Genera el PDF y dispara la descarga automática en el navegador
   */
  public static downloadTemplate(metadata: TemplateMetadata = {}): void {
    const doc = this.generateTemplate(metadata);
    const fileName = `SkateCoreo_Plantilla_${(metadata.title || 'Coreografia').replace(/\s+/g, '_')}_A4.pdf`;
    doc.save(fileName);
  }
}
