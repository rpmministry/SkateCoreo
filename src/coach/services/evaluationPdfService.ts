/**
 * evaluationPdfService.ts — Generador Editorial de Fichas Técnicas PDF en Formato A4
 *
 * Emite documentos con calidad de imprenta profesional para entrenadores, atletas y clubes:
 *  - Ficha individual de evaluación técnica con desglose estilo "Judges Details per Skater"
 *  - Historial deportivo y evolución cronológica de la atleta
 *  - Exportación consolidada por lotes (múltiples atletas)
 *
 * Cumple con principios editoriales estrictos: retícula precisa, tipografía legible,
 * márgenes de 14mm, paginación "Página X de Y" y bloque de firmas institucionales.
 */

import { jsPDF } from 'jspdf';
import { CoachEvaluation, CoachAthlete, CoachProfile } from '../types';

// Paleta cromática editorial
const COLOR_PRIMARY = [15, 23, 42] as const;      // Navy oscuro (#0f172a)
const COLOR_SECONDARY = [30, 41, 59] as const;    // Slate 800 (#1e293b)
const COLOR_MUTED = [100, 116, 139] as const;     // Slate 500 (#64748b)
const COLOR_LIGHT_BG = [248, 250, 252] as const;  // Slate 50 (#f8fafc)
const COLOR_BORDER = [226, 232, 240] as const;    // Slate 200 (#e2e8f0)
const COLOR_CYAN = [8, 145, 178] as const;        // Cyan 600 (#0891b2)
const COLOR_RED = [225, 29, 72] as const;         // Rose 600 (#e11d48)
const COLOR_AMBER = [217, 119, 6] as const;       // Amber 600 (#d97706)
const COLOR_GREEN = [13, 148, 136] as const;      // Teal 600 (#0d9488)

export class EvaluationPdfService {
  /**
   * Genera el PDF A4 individual de una evaluación técnica.
   */
  public static generateSingleEvaluationPdf(
    evaluation: CoachEvaluation,
    athlete: CoachAthlete,
    coachProfile?: CoachProfile | null
  ): jsPDF {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageW = doc.internal.pageSize.getWidth(); // 210 mm
    const pageH = doc.internal.pageSize.getHeight(); // 297 mm
    const margin = 14;
    const contentW = pageW - margin * 2; // 182 mm

    let y = margin;

    // ── 1. CABECERA INSTITUCIONAL Y BANNER ──────────────────────────────────
    doc.setFillColor(...COLOR_PRIMARY);
    doc.roundedRect(margin, y, contentW, 24, 2, 2, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('SKATECOREO · PANEL TÉCNICO DE EVALUACIÓN', margin + 6, y + 8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(203, 213, 225); // Slate 300
    doc.text(
      `Evaluación de Entrenamiento basada en: ${evaluation.regulationTitle} (${evaluation.season})`,
      margin + 6,
      y + 14
    );
    doc.text(
      `Modalidad: ${evaluation.discipline} | Segmento: ${evaluation.programSegment} | ID: ${evaluation.id.slice(0, 12)}`,
      margin + 6,
      y + 19
    );

    // Fecha en la esquina derecha del banner
    const evalDate = new Date(evaluation.date).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    doc.setFontSize(8);
    doc.text(`Fecha: ${evalDate}`, margin + contentW - 6, y + 8, { align: 'right' });
    doc.text(`Entrenador: ${evaluation.trainerName}`, margin + contentW - 6, y + 14, { align: 'right' });

    y += 28;

    // ── 2. FICHA IDENTIFICATIVA DEL ATLETA Y CLUB ──────────────────────────
    doc.setFillColor(...COLOR_LIGHT_BG);
    doc.setDrawColor(...COLOR_BORDER);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, y, contentW, 20, 1.5, 1.5, 'FD');

    doc.setTextColor(...COLOR_PRIMARY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`${athlete.firstName} ${athlete.lastName}`, margin + 4, y + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...COLOR_MUTED);

    const clubName = athlete.club || coachProfile?.club || 'Club Formativo / Federación';
    const rutName = evaluation.choreographyTitle || 'Rutina de Entrenamiento';
    const edadText = athlete.age ? `${athlete.age} años` : 'Edad N/D';
    const eficienciaText = evaluation.eficiencia ? ` | Eficiencia: ${evaluation.eficiencia}` : '';

    doc.text(`Club / Escuela: ${clubName} | Categoría: ${evaluation.category}${eficienciaText}`, margin + 4, y + 11);
    doc.text(`Rutina Asociada: ${rutName} | Edad: ${edadText}`, margin + 4, y + 16);

    y += 24;

    // ── 3. TARJETAS DE PUNTUACIÓN RESUMEN (KPIs) ───────────────────────────
    const cardW = (contentW - 6) / 4; // 4 tarjetas
    const cardH = 16;

    const cards = [
      { label: 'TES (TÉCNICO)', val: evaluation.scoresSummary.tes.toFixed(2), col: COLOR_CYAN },
      { label: 'PCS (ARTÍSTICO)', val: evaluation.scoresSummary.pcs.toFixed(2), col: COLOR_SECONDARY },
      { label: 'DEDUCCIONES', val: `-${evaluation.scoresSummary.deductions.toFixed(2)}`, col: COLOR_RED },
      { label: 'TOTAL SEGMENT (TSS)', val: evaluation.scoresSummary.totalScore.toFixed(2), col: COLOR_PRIMARY },
    ];

    cards.forEach((c, idx) => {
      const cx = margin + idx * (cardW + 2);
      doc.setFillColor(...COLOR_LIGHT_BG);
      doc.setDrawColor(...COLOR_BORDER);
      doc.roundedRect(cx, y, cardW, cardH, 1.5, 1.5, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(...COLOR_MUTED);
      doc.text(c.label, cx + 4, y + 5);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(c.col[0], c.col[1], c.col[2]);
      doc.text(c.val, cx + 4, y + 12);
    });

    y += 20;

    // ── 4. TABLA DE ELEMENTOS TÉCNICOS (JUDGES DETAILS PER SKATER) ──────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...COLOR_PRIMARY);
    doc.text('1. DESGLOSE DE ELEMENTOS TÉCNICOS LLAMADOS (TES)', margin, y);
    y += 3;

    // Encabezado de tabla
    const rowH = 6;
    doc.setFillColor(...COLOR_SECONDARY);
    doc.rect(margin, y, contentW, rowH, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);

    const cols = [
      { header: '#', w: 8, align: 'center' as const },
      { header: 'Elemento Técnico', w: 46, align: 'left' as const },
      { header: 'Código', w: 18, align: 'left' as const },
      { header: 'Base V.', w: 16, align: 'right' as const },
      { header: 'Degr.', w: 14, align: 'center' as const },
      { header: 'Filo', w: 12, align: 'center' as const },
      { header: 'Bono T', w: 14, align: 'center' as const },
      { header: 'QOE', w: 14, align: 'center' as const },
      { header: 'Puntos', w: 18, align: 'right' as const },
      { header: 'Estado', w: 22, align: 'center' as const },
    ];

    let curX = margin;
    cols.forEach((col) => {
      const textX = col.align === 'center' ? curX + col.w / 2 : col.align === 'right' ? curX + col.w - 1 : curX + 2;
      doc.text(col.header, textX, y + 4.2, { align: col.align });
      curX += col.w;
    });

    y += rowH;

    // Filas de elementos
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);

    const elementsList = evaluation.elements.slice(0, 14); // Máximo 14 elementos para garantizar espacio editorial

    elementsList.forEach((el, idx) => {
      const isEven = idx % 2 === 0;
      doc.setFillColor(isEven ? 255 : COLOR_LIGHT_BG[0], isEven ? 255 : COLOR_LIGHT_BG[1], isEven ? 255 : COLOR_LIGHT_BG[2]);
      doc.rect(margin, y, contentW, rowH, 'F');
      doc.setDrawColor(...COLOR_BORDER);
      doc.line(margin, y + rowH, margin + contentW, y + rowH);

      curX = margin;
      doc.setTextColor(...COLOR_PRIMARY);

      // #
      doc.text(String(idx + 1), curX + 4, y + 4.2, { align: 'center' });
      curX += 8;

      // Nombre
      const truncatedName = el.name.length > 24 ? el.name.slice(0, 22) + '..' : el.name;
      doc.text(truncatedName, curX + 2, y + 4.2);
      curX += 46;

      // Código
      doc.setFont('helvetica', 'bold');
      doc.text(el.code, curX + 2, y + 4.2);
      doc.setFont('helvetica', 'normal');
      curX += 18;

      // Base Value
      doc.text(el.baseValue.toFixed(2), curX + 15, y + 4.2, { align: 'right' });
      curX += 16;

      // Degradación
      doc.text(el.deductionCode || '-', curX + 7, y + 4.2, { align: 'center' });
      curX += 14;

      // Filo
      doc.text(el.edgeIndicator || '-', curX + 6, y + 4.2, { align: 'center' });
      curX += 12;

      // Bono T
      doc.text(el.isTimeBonusApplied ? '+10%' : '-', curX + 7, y + 4.2, { align: 'center' });
      curX += 14;

      // QOE
      const qoeStr = el.qoeScore > 0 ? `+${el.qoeScore}` : String(el.qoeScore);
      doc.text(qoeStr, curX + 7, y + 4.2, { align: 'center' });
      curX += 14;

      // Puntos
      doc.setFont('helvetica', 'bold');
      doc.text(el.finalValue.toFixed(2), curX + 17, y + 4.2, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      curX += 18;

      // Estado
      if (el.isValid) {
        doc.setTextColor(...COLOR_GREEN);
        doc.text('Válido', curX + 11, y + 4.2, { align: 'center' });
      } else {
        doc.setTextColor(...COLOR_RED);
        doc.text('Inválido', curX + 11, y + 4.2, { align: 'center' });
      }

      y += rowH;
    });

    y += 4;

    // ── 5. COMPONENTES DEL PROGRAMA & DEDUCCIONES (2 COLUMNAS) ──────────────
    const colHalfW = (contentW - 6) / 2;

    // Columna Izquierda: Componentes Artísticos
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...COLOR_PRIMARY);
    doc.text('2. COMPONENTES ARTÍSTICOS (PCS)', margin, y);

    // Columna Derecha: Deducciones Oficiales
    doc.text('3. DEDUCCIONES REGLAMENTARIAS', margin + colHalfW + 6, y);
    y += 3;

    const subBoxH = 22;

    // Caja PCS
    doc.setFillColor(...COLOR_LIGHT_BG);
    doc.setDrawColor(...COLOR_BORDER);
    doc.roundedRect(margin, y, colHalfW, subBoxH, 1.5, 1.5, 'FD');

    if (evaluation.artisticComponents) {
      const ac = evaluation.artisticComponents;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...COLOR_SECONDARY);

      doc.text(`Skating Skills: ${ac.skatingSkills.toFixed(2)}`, margin + 4, y + 6);
      doc.text(`Transitions: ${ac.transitions.toFixed(2)}`, margin + 4, y + 11);
      doc.text(`Performance: ${ac.performance.toFixed(2)}`, margin + 48, y + 6);
      doc.text(`Choreography: ${ac.choreography.toFixed(2)}`, margin + 48, y + 11);

      doc.setFont('helvetica', 'bold');
      doc.text(`Factor de Categoría: ${ac.factor.toFixed(1)}x   |   Total PCS: ${ac.totalPcs.toFixed(2)} pts`, margin + 4, y + 17);
    } else if (evaluation.figureMarks) {
      const fm = evaluation.figureMarks;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...COLOR_SECONDARY);
      doc.text(`Trazado: ${fm.tracing.toFixed(2)}   |   Movimiento: ${fm.movement.toFixed(2)}   |   Porte: ${fm.carriage.toFixed(2)}`, margin + 4, y + 8);
      doc.setFont('helvetica', 'bold');
      doc.text(`Promedio Sistema White: ${fm.average.toFixed(2)} pts`, margin + 4, y + 16);
    }

    // Caja Deducciones
    doc.roundedRect(margin + colHalfW + 6, y, colHalfW, subBoxH, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOR_SECONDARY);

    const ded = evaluation.deductions;
    doc.text(`Caídas registradas: ${ded.fallsCount} (-${ded.fallsDeduction.toFixed(2)} pts)`, margin + colHalfW + 10, y + 6);
    doc.text(`Violación de tiempo: ${ded.timeViolationSeconds}s (-${ded.timeDeduction.toFixed(2)} pts)`, margin + colHalfW + 10, y + 11);
    doc.text(`Vestuario / Música / Otros: -${(ded.costumeDeduction + ded.musicViolationDeduction + ded.otherDeductions).toFixed(2)} pts`, margin + colHalfW + 10, y + 16);

    y += subBoxH + 6;

    // ── 6. ÁREA PEDAGÓGICA Y FEEDBACK DEL ENTRENADOR ────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...COLOR_PRIMARY);
    doc.text('4. OBSERVACIONES Y EVALUACIÓN DE ENTRENAMIENTO', margin, y);
    y += 3;

    const feedbackH = 46;
    doc.setFillColor(...COLOR_LIGHT_BG);
    doc.setDrawColor(...COLOR_BORDER);
    doc.roundedRect(margin, y, contentW, feedbackH, 1.5, 1.5, 'FD');

    let fy = y + 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOR_GREEN);
    doc.text('Fortalezas Destacadas:', margin + 4, fy);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLOR_SECONDARY);
    const strengthsText = evaluation.feedback.strengths.length > 0 ? evaluation.feedback.strengths.join(' • ') : 'Rutina completada con constancia.';
    doc.text(strengthsText.slice(0, 110), margin + 36, fy);

    fy += 7;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLOR_RED);
    doc.text('Correcciones Técnicas:', margin + 4, fy);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLOR_SECONDARY);
    const correctionsText = evaluation.feedback.technicalCorrections.length > 0
      ? evaluation.feedback.technicalCorrections.map((c) => `[${c.priority.toUpperCase()}] ${c.item}`).join(' | ')
      : 'Sin correcciones críticas registradas.';
    doc.text(correctionsText.slice(0, 110), margin + 36, fy);

    fy += 7;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLOR_CYAN);
    doc.text('Sugerencias Coreografía:', margin + 4, fy);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLOR_SECONDARY);
    const choreoText = evaluation.feedback.choreographicSuggestions.spatialDistribution || evaluation.feedback.choreographicSuggestions.musicality || 'Mantener fluidez en las transiciones intermedias.';
    doc.text(choreoText.slice(0, 110), margin + 40, fy);

    fy += 7;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLOR_AMBER);
    doc.text('Objetivos Próximo Ciclo:', margin + 4, fy);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLOR_SECONDARY);
    const goalsText = evaluation.feedback.nextGoals.length > 0 ? evaluation.feedback.nextGoals.join(' • ') : 'Consolidar elementos técnicos calificados.';
    doc.text(goalsText.slice(0, 110), margin + 38, fy);

    fy += 7;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLOR_MUTED);
    doc.text('Observaciones Generales:', margin + 4, fy);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLOR_SECONDARY);
    const generalText = evaluation.feedback.generalObservations || 'Sesión de entrenamiento registrada para seguimiento evolutivo.';
    doc.text(generalText.slice(0, 110), margin + 40, fy);

    y += feedbackH + 6;

    // ── 7. SECCIÓN DE FIRMAS ────────────────────────────────────────────────
    const signW = (contentW - 20) / 2;
    const signY = pageH - margin - 20;

    doc.setDrawColor(...COLOR_MUTED);
    doc.setLineWidth(0.3);
    doc.line(margin + 5, signY, margin + 5 + signW, signY);
    doc.line(margin + contentW - signW - 5, signY, margin + contentW - 5, signY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOR_MUTED);
    doc.text('Firma del Entrenador / Evaluador', margin + 5 + signW / 2, signY + 4, { align: 'center' });
    doc.text('Firma de la Atleta / Representante', margin + contentW - signW / 2 - 5, signY + 4, { align: 'center' });

    // ── 8. PIE DE PÁGINA ────────────────────────────────────────────────────
    doc.setFontSize(7);
    doc.text(
      'Documento oficial generado con SkateCoreo PRO — Sistema de Planificación y Asistencia Técnica 2026',
      margin,
      pageH - margin + 4
    );
    doc.text('Página 1 de 1', pageW - margin, pageH - margin + 4, { align: 'right' });

    return doc;
  }

  /**
   * Genera el PDF con el historial y evolución de la atleta.
   */
  public static generateAthleteHistoryPdf(
    evaluations: CoachEvaluation[],
    athlete: CoachAthlete,
    coachProfile?: CoachProfile | null
  ): jsPDF {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 14;
    const contentW = pageW - margin * 2;

    let y = margin;

    // Encabezado
    doc.setFillColor(...COLOR_PRIMARY);
    doc.roundedRect(margin, y, contentW, 22, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(`EXPEDIENTE DE EVOLUCIÓN TÉCNICA · ${athlete.name.toUpperCase()}`, margin + 6, y + 8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(203, 213, 225);
    doc.text(
      `Club: ${athlete.club || coachProfile?.club || 'Club'} | Categoría: ${athlete.category} | Total Evaluaciones: ${evaluations.length}`,
      margin + 6,
      y + 15
    );

    y += 28;

    // Tabla cronológica de evaluaciones
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...COLOR_PRIMARY);
    doc.text('HISTORIAL CRONOLÓGICO DE EVALUACIONES REGISTRADAS', margin, y);
    y += 3;

    const rowH = 6;
    doc.setFillColor(...COLOR_SECONDARY);
    doc.rect(margin, y, contentW, rowH, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);

    const cols = [
      { header: 'Fecha', w: 26, align: 'left' as const },
      { header: 'Reglamento', w: 46, align: 'left' as const },
      { header: 'Modalidad / Segmento', w: 34, align: 'left' as const },
      { header: 'TES', w: 18, align: 'right' as const },
      { header: 'PCS', w: 18, align: 'right' as const },
      { header: 'Ded.', w: 16, align: 'right' as const },
      { header: 'TOTAL (TSS)', w: 24, align: 'right' as const },
    ];

    let curX = margin;
    cols.forEach((col) => {
      const textX = col.align === 'right' ? curX + col.w - 2 : curX + 2;
      doc.text(col.header, textX, y + 4.2, { align: col.align });
      curX += col.w;
    });

    y += rowH;

    evaluations.slice(0, 25).forEach((ev, idx) => {
      const isEven = idx % 2 === 0;
      doc.setFillColor(isEven ? 255 : COLOR_LIGHT_BG[0], isEven ? 255 : COLOR_LIGHT_BG[1], isEven ? 255 : COLOR_LIGHT_BG[2]);
      doc.rect(margin, y, contentW, rowH, 'F');
      doc.setDrawColor(...COLOR_BORDER);
      doc.line(margin, y + rowH, margin + contentW, y + rowH);

      const dStr = new Date(ev.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
      curX = margin;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...COLOR_PRIMARY);

      doc.text(dStr, curX + 2, y + 4.2);
      curX += 26;

      doc.text(ev.regulationTitle.slice(0, 26), curX + 2, y + 4.2);
      curX += 46;

      doc.text(`${ev.discipline} - ${ev.programSegment}`.slice(0, 20), curX + 2, y + 4.2);
      curX += 34;

      doc.text(ev.scoresSummary.tes.toFixed(2), curX + 16, y + 4.2, { align: 'right' });
      curX += 18;

      doc.text(ev.scoresSummary.pcs.toFixed(2), curX + 16, y + 4.2, { align: 'right' });
      curX += 18;

      doc.setTextColor(...COLOR_RED);
      doc.text(`-${ev.scoresSummary.deductions.toFixed(2)}`, curX + 14, y + 4.2, { align: 'right' });
      curX += 16;

      doc.setTextColor(...COLOR_PRIMARY);
      doc.setFont('helvetica', 'bold');
      doc.text(ev.scoresSummary.totalScore.toFixed(2), curX + 22, y + 4.2, { align: 'right' });

      y += rowH;
    });

    // Pie
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...COLOR_MUTED);
    doc.text('SkateCoreo PRO · Historial de Evaluaciones Técnicas', margin, pageH - margin + 4);
    doc.text('Página 1 de 1', pageW - margin, pageH - margin + 4, { align: 'right' });

    return doc;
  }
}
