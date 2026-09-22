/**
 * pdfTemplateGenerator — Plantilla reglamentaria PDF A4 horizontal (297 × 210 mm).
 *
 * Diseño editorial con cuadrícula explícita (todo elemento pertenece a una banda
 * y ninguna se solapa). El layout y los textos se exportan (`PDF_LAYOUT`,
 * `PDF_TEXTS`) para poder verificarlos con pruebas automáticas.
 *
 * Bandas verticales (mm):
 *   10 ─ 32   ENCABEZADO  · contenedor cerrado: solo logotipo + datos institucionales
 *   32 ─ 43   Título principal (centrado)
 *   43 ─ 60   DATOS DE ESCRITURA MANUAL (Atleta / Club / Entrenador) en negro puro
 *   61 ─ 66   Panel de jueces (centrado, fuera de la pista)
 *   69 ─ 179  PISTA reglamentaria 220 × 110 mm (proporción 2:1 exacta)
 *  188 ─ 204  Instrucciones + crédito de desarrollo
 *
 * Los 4 fiduciales se centran en las esquinas de la pista y disponen de un halo
 * blanco de aislamiento (`fiducial.halo`) que ninguna otra banda invade: así el
 * motor de visión artificial los detecta sin interferencias.
 */

import { jsPDF } from 'jspdf';
import { RinkDimensions } from '../types/choreography';
import { DEFAULT_RINK_DIMENSIONS } from '../core/canvas/RinkMath';
import { SKATECOREO_LOGO_REVERSO_PNG } from '../constants/brand/logoDataUri';

export interface TemplateMetadata {
  title?: string;
  athleteName?: string;
  clubName?: string;
  coachName?: string;
  /** Reservados para uso interno; NO se imprimen en la plantilla. */
  category?: string;
  bpm?: number;
  durationSec?: number;
}

/* ══════════════════════════════════════════════════════════════════
   Cuadrícula del documento (milímetros). Fuente única de verdad.
   ══════════════════════════════════════════════════════════════════ */
export const PDF_LAYOUT = {
  /** A4 horizontal: 297 × 210 mm. */
  page: { width: 297, height: 210 },
  margin: 10,

  /** Encabezado: contenedor cerrado (logotipo + datos institucionales). */
  header: { x: 10, y: 10, w: 277, h: 22 },
  logo: { x: 14, y: 16.95, w: 48, h: 8.1 },
  divider: { x: 65, y: 15.5, h: 13 },
  institutionalTitle: { x: 69, baseline: 20 },
  institutionalSubtitle: { x: 69, baseline: 25.5 },

  /** Título principal del documento (centrado). */
  documentTitle: { baseline: 39.5 },

  /** Campos de escritura manual (área blanca, tinta negra pura). */
  data: {
    labelX: 10,
    valueX: 38,
    row1: { label: 46.5, line: 48.5 },
    row2: { label: 55.5, line: 57.5 },
    clubLineEnd: 150,
    coachLabelX: 158,
    coachValueX: 196,
  },

  /** Panel de jueces: centrado, siempre FUERA del área de la pista. */
  judges: { w: 46, h: 5, y: 61 },

  /** Pista reglamentaria: proporción 2:1 exacta (200 × 100 mm), centrada. */
  rink: { x: 48.5, y: 76, w: 200, h: 100 },

  /** Fiduciales: cuadrado negro de 15 mm (≥1.5 cm) + halo blanco de aislamiento. */
  fiducial: { size: 15, halo: 2 },

  /** Bloque inferior: instrucciones + crédito de desarrollo. */
  instructions: {
    x: 10,
    y: 186.5,
    w: 277,
    h: 13.5,
    /** Baselines con espaciado editorial: título → cuerpo (×2) → crédito. */
    titleBaseline: 190,
    lineBaselines: [193.2, 196.2],
    creditBaseline: 199.4,
    /** Margen interno de seguridad respecto a los bordes del bloque. */
    paddingX: 4,
    bodyLinePitch: 3,
    titleToBodyGap: 3.2,
    bodyToCreditGap: 3.4,
  },
} as const;

/* ══════════════════════════════════════════════════════════════════
   Textos del documento. Centralizados para poder auditarlos.
   ══════════════════════════════════════════════════════════════════ */
export const PDF_TEXTS = {
  institutionalTitle: 'SKATECOREO · SISTEMA PAPER-TO-DIGITAL',
  institutionalSubtitle: 'Normativa World Skate & FEP · Reglamento 2026 · Pista 50×25 m (2:1)',
  documentTitle: 'PLANTILLA REGLAMENTARIA DE COREOGRAFÍA',
  labels: {
    athlete: 'ATLETA',
    club: 'CLUB',
    coach: 'ENTRENADOR',
  },
  judgesPanel: 'PANEL DE JUECES (WORLD SKATE)',
  instructionsTitle: 'INSTRUCCIONES (PAPER-TO-DIGITAL)',
  instructions: [
    '1) Trace las trayectorias sobre la pista con tinta oscura.   2) Numere los nodos en secuencia (1, 2, 3…).   3) Fotografíe la hoja completa y bien iluminada.',
    '4) En SkateCoreo pulse «Digitalizar Papel» y suba la foto: la perspectiva se corrige sola. Mantenga las 4 marcas de esquina visibles y la hoja sin doblar.',
  ],
  credit: 'Desarrollado por AlsisTech | Asesoría Técnica: Avril Andrade Sanchez',
} as const;

/** Color de tinta de los campos manuales: negro puro, contraste máximo. */
const INK_BLACK: [number, number, number] = [0, 0, 0];
const SLATE_900: [number, number, number] = [15, 23, 42];
const SLATE_400: [number, number, number] = [148, 163, 184];
const SLATE_600: [number, number, number] = [71, 85, 105];
const CYAN: [number, number, number] = [0, 240, 255];
const SKY: [number, number, number] = [2, 132, 199];
const PURPLE: [number, number, number] = [168, 85, 247];

export class PdfTemplateGenerator {
  /** Genera el documento PDF A4 horizontal y retorna la instancia jsPDF. */
  public static generateTemplate(
    metadata: TemplateMetadata = {},
    rink: RinkDimensions = DEFAULT_RINK_DIMENSIONS
  ): jsPDF {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    const L = PDF_LAYOUT;
    const T = PDF_TEXTS;

    // Dimensiones reales de la página (derivadas, no asumidas).
    const pageW = doc.internal.pageSize.getWidth();
    const usableRight = pageW - L.margin;
    const centerX = pageW / 2;

    const scaleMmPerMeter = L.rink.w / rink.lengthMeters; // 4.4 mm por metro
    const cornerRadiusMm = rink.cornerRoundsMeters * scaleMmPerMeter;

    /* ── 1. ENCABEZADO: contenedor cerrado ──────────────────────────
       Solo logotipo + datos institucionales primarios. Los campos de
       escritura manual viven FUERA, en el área blanca inferior. */
    doc.setFillColor(...SLATE_900);
    doc.rect(L.header.x, L.header.y, L.header.w, L.header.h, 'F');

    try {
      doc.addImage(
        SKATECOREO_LOGO_REVERSO_PNG,
        'PNG',
        L.logo.x,
        L.logo.y,
        L.logo.w,
        L.logo.h
      );
    } catch {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(255, 255, 255);
      doc.text('SKATECOREO', L.logo.x, L.logo.y + 5.5);
    }

    // Separador vertical del lockup
    doc.setDrawColor(51, 65, 85);
    doc.setLineWidth(0.3);
    doc.line(L.divider.x, L.divider.y, L.divider.x, L.divider.y + L.divider.h);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...CYAN);
    doc.text(T.institutionalTitle, L.institutionalTitle.x, L.institutionalTitle.baseline);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...SLATE_400);
    doc.text(T.institutionalSubtitle, L.institutionalSubtitle.x, L.institutionalSubtitle.baseline);

    /* ── 2. TÍTULO PRINCIPAL (centrado) ──────────────────────────── */
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...SLATE_900);
    doc.text(T.documentTitle, centerX, L.documentTitle.baseline, { align: 'center' });

    /* ── 3. CAMPOS DE ESCRITURA MANUAL (área blanca, negro puro) ────
       Etiquetas a la izquierda y línea continua debajo para escribir con
       lapicero o marcador oscuro. Sin fondos ni adornos que estorben. */
    const drawWriteField = (
      label: string,
      labelX: number,
      valueX: number,
      valueEndX: number,
      labelBaseline: number,
      lineY: number
    ) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...INK_BLACK);
      doc.text(label, labelX, labelBaseline);

      doc.setDrawColor(...INK_BLACK);
      doc.setLineWidth(0.25);
      doc.line(valueX, lineY, valueEndX, lineY);
    };

    const D = L.data;

    // Fila 1 — Atleta (línea de ancho completo)
    drawWriteField(T.labels.athlete, D.labelX, D.valueX, usableRight, D.row1.label, D.row1.line);
    if (metadata.athleteName) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...INK_BLACK);
      doc.text(metadata.athleteName, D.valueX, D.row1.label);
    }

    // Fila 2 — Club | Entrenador (dos columnas alineadas a la misma cuadrícula)
    drawWriteField(T.labels.club, D.labelX, D.valueX, D.clubLineEnd, D.row2.label, D.row2.line);
    drawWriteField(
      T.labels.coach,
      D.coachLabelX,
      D.coachValueX,
      usableRight,
      D.row2.label,
      D.row2.line
    );
    if (metadata.clubName) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...INK_BLACK);
      doc.text(metadata.clubName, D.valueX, D.row2.label);
    }
    if (metadata.coachName) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...INK_BLACK);
      doc.text(metadata.coachName, D.coachValueX, D.row2.label);
    }

    /* ── 4. PANEL DE JUECES (fuera de la pista, centrado) ─────────── */
    const judgeBoxX = (pageW - L.judges.w) / 2;
    doc.setFillColor(254, 243, 199);
    doc.setDrawColor(245, 158, 11);
    doc.setLineWidth(0.3);
    doc.roundedRect(judgeBoxX, L.judges.y, L.judges.w, L.judges.h, 1, 1, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.setTextColor(180, 83, 9);
    doc.text(T.judgesPanel, centerX, L.judges.y + 3.5, { align: 'center' });

    /* ── 5. PISTA: fondo blanco libre de tipografía ──────────────── */
    const RINK_X = L.rink.x;
    const RINK_Y = L.rink.y;
    const RINK_W = L.rink.w;
    const RINK_H = L.rink.h;

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

    // Valla perimetral
    doc.setDrawColor(...SLATE_600);
    doc.setLineWidth(0.6);
    doc.roundedRect(RINK_X, RINK_Y, RINK_W, RINK_H, cornerRadiusMm, cornerRadiusMm, 'S');

    // Ejes reglamentarios
    const midY = RINK_Y + RINK_H / 2;
    const midX = RINK_X + RINK_W / 2;

    doc.setDrawColor(...SKY);
    doc.setLineWidth(0.35);
    doc.setLineDashPattern([3, 2], 0);
    doc.line(RINK_X, midY, RINK_X + RINK_W, midY);
    doc.line(midX, RINK_Y, midX, RINK_Y + RINK_H);
    doc.setLineDashPattern([], 0);

    // Círculo central (radio 3 m)
    doc.setDrawColor(...SKY);
    doc.setLineWidth(0.3);
    doc.circle(midX, midY, 3 * scaleMmPerMeter, 'S');

    // Diagonales de evaluación
    doc.setDrawColor(...PURPLE);
    doc.setLineWidth(0.25);
    doc.setLineDashPattern([2, 3], 0);
    doc.line(RINK_X, RINK_Y, RINK_X + RINK_W, RINK_Y + RINK_H);
    doc.line(RINK_X, RINK_Y + RINK_H, RINK_X + RINK_W, RINK_Y);
    doc.setLineDashPattern([], 0);

    // Marcas de 3/4 de eje largo: SOLO la marca gráfica, sin ningún rótulo.
    doc.setFillColor(...SKY);
    doc.rect(RINK_X + RINK_W * 0.25 - 0.5, midY - 3, 1, 6, 'F');
    doc.rect(RINK_X + RINK_W * 0.75 - 0.5, midY - 3, 1, 6, 'F');

    /* ── 6. FIDUCIALES: se dibujan AL FINAL sobre la pista y con halo ──
       El halo blanco aísla cada diana de cualquier línea o texto vecino,
       de modo que la detección por visión artificial no tenga ruido. */
    this.drawFiducialMarker(doc, RINK_X, RINK_Y);
    this.drawFiducialMarker(doc, RINK_X + RINK_W, RINK_Y);
    this.drawFiducialMarker(doc, RINK_X + RINK_W, RINK_Y + RINK_H);
    this.drawFiducialMarker(doc, RINK_X, RINK_Y + RINK_H);

    /* ── 7. BLOQUE INFERIOR: instrucciones + crédito ────────────────
       Maquetación editorial: cada instrucción se ajusta al ancho útil con
       `splitTextToSize` (nada de líneas que se salgan del bloque) y las
       baselines se calculan con un paso constante; el crédito siempre queda
       separado del cuerpo para que NUNCA se superpongan textos. */
    const I = L.instructions;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.roundedRect(I.x, I.y, I.w, I.h, 2, 2, 'FD');

    // Título del bloque
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...SLATE_900);
    doc.text(T.instructionsTitle, centerX, I.titleBaseline, { align: 'center' });

    // Cuerpo: ancho útil con margen interno; salto de línea real si hace falta.
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(51, 65, 85);

    const bodyWidth = I.w - I.paddingX * 2;
    const bodyLines: string[] = [];
    T.instructions.forEach((line) => {
      bodyLines.push(...(doc.splitTextToSize(line, bodyWidth) as string[]));
    });

    const bodyTop = I.titleBaseline + I.titleToBodyGap;
    let lastBodyBaseline = bodyTop;
    bodyLines.forEach((line, index) => {
      const baseline = bodyTop + index * I.bodyLinePitch;
      doc.text(line, I.x + I.paddingX, baseline);
      lastBodyBaseline = baseline;
    });

    // Crédito de desarrollo: siempre POR DEBAJO del cuerpo (separación mínima).
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(...SLATE_600);
    const creditBaseline = Math.max(I.creditBaseline, lastBodyBaseline + I.bodyToCreditGap);
    doc.text(T.credit, centerX, creditBaseline, { align: 'center' });

    return doc;
  }

  /**
   * Marca fiducial TIPO QR (target): cuadrado negro + anillo blanco cuadrado +
   * núcleo negro. Alto contraste (negro puro sobre blanco) y ≥1.5 cm de lado para
   * garantizar la detección bajo cualquier iluminación.
   * `size` y `halo` provienen de `PDF_LAYOUT.fiducial`.
   */
  private static drawFiducialMarker(doc: jsPDF, cx: number, cy: number): void {
    const size = PDF_LAYOUT.fiducial.size;
    const halo = PDF_LAYOUT.fiducial.halo;
    const half = size / 2;

    doc.saveGraphicsState();

    // Halo blanco de aislamiento (libera las esquinas de cualquier vecino)
    doc.setFillColor(255, 255, 255);
    doc.rect(cx - half - halo, cy - half - halo, size + halo * 2, size + halo * 2, 'F');

    // Marco exterior negro (negro puro)
    doc.setFillColor(0, 0, 0);
    doc.rect(cx - half, cy - half, size, size, 'F');

    // Anillo blanco CUADRADO (62% del lado) — patrón verificable por el detector
    const white = size * 0.62;
    doc.setFillColor(255, 255, 255);
    doc.rect(cx - white / 2, cy - white / 2, white, white, 'F');

    // Núcleo negro (30% del lado)
    const core = size * 0.30;
    doc.setFillColor(0, 0, 0);
    doc.rect(cx - core / 2, cy - core / 2, core, core, 'F');

    doc.restoreGraphicsState();
  }

  /** Genera el PDF y dispara la descarga automática en el navegador. */
  public static downloadTemplate(metadata: TemplateMetadata = {}): void {
    const doc = this.generateTemplate(metadata);
    const fileName = `SkateCoreo_Plantilla_${(metadata.title || 'Coreografia').replace(/\s+/g, '_')}_A4.pdf`;
    doc.save(fileName);
  }
}
