/**
 * licensePdfService.ts — Generador Editorial de Documentos PDF de Licencias Comerciales
 *
 * Emite documentos con calidad de imprenta profesional para clubes y organizaciones,
 * respetando la identidad visual oficial de SkateCoreo (logo, tipografía, cuadrícula).
 *
 * Contenido:
 *   · Encabezado con logotipo oficial de SkateCoreo e información institucional.
 *   · Resumen del acuerdo comercial (plan, cantidad, precio unitario, subtotal, descuento, total y ahorro).
 *   · Fechas de vigencia y términos de renovación.
 *   · Instrucciones paso a paso para la activación de cada atleta/entrenador.
 *   · Grilla paginada de códigos únicos (Licencia 001, Licencia 002, ...) numerados y legibles.
 *   · Paginación automática ("Página X de Y") y pie de página corporativo.
 */

import { jsPDF } from 'jspdf';
import { SKATECOREO_LOGO_COLOR_PNG } from '../constants/brand/logoDataUri';
import type { LicenseCodeItem } from './commercialLicenseService';

export interface LicensePdfMetadata {
  packageNumber: string;
  clientName: string;
  clientEmail?: string;
  plan: 'annual' | 'monthly';
  totalLicenses: number;
  unitBasePrice: number;
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  totalAmount: number;
  startsAt: string;
  expiresAt: string;
  authorizedBy: string;
  paymentReference?: string;
  notes?: string;
}

export class LicensePdfService {
  /**
   * Genera el documento PDF A4 vertical oficial con las licencias del club.
   */
  public static generateDocument(
    metadata: LicensePdfMetadata,
    codes: (LicenseCodeItem | string)[]
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

    // Paleta cromática corporativa
    const SLATE_900 = [15, 23, 42] as const;
    const SLATE_700 = [51, 65, 85] as const;
    const SLATE_500 = [100, 116, 139] as const;
    const CYAN_700 = [14, 116, 144] as const;
    const MINT_700 = [13, 148, 136] as const;
    const GRAY_LIGHT = [248, 250, 252] as const;
    const BORDER_GRAY = [226, 232, 240] as const;

    // Helper de fechas
    const formatDate = (isoString: string): string => {
      try {
        return new Intl.DateTimeFormat('es-ES', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        }).format(new Date(isoString));
      } catch {
        return isoString;
      }
    };

    let y = margin;

    // ── 1. ENCABEZADO PRINCIPAL (Página 1) ──────────────────────────────────
    try {
      doc.addImage(SKATECOREO_LOGO_COLOR_PNG, 'PNG', margin, y, 46, 7.5);
    } catch {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(...SLATE_900);
      doc.text('SKATECOREO', margin, y + 6);
    }

    // Datos institucionales a la derecha
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...CYAN_700);
    doc.text('ENTREGA OFICIAL DE LICENCIAS', pageW - margin, y + 3, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...SLATE_500);
    doc.text(`Paquete: ${metadata.packageNumber} · AlsizTech SaaS`, pageW - margin, y + 7, { align: 'right' });

    y += 12;

    // Línea divisoria superior
    doc.setDrawColor(...CYAN_700);
    doc.setLineWidth(0.6);
    doc.line(margin, y, pageW - margin, y);
    y += 6;

    // Título editorial
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...SLATE_900);
    doc.text('ACTA DE ASIGNACIÓN DE LICENCIAS CORPORATIVAS', margin, y);
    y += 4.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...SLATE_700);
    doc.text(
      'Documento comercial emitido para la distribución de accesos profesionales al software SkateCoreo.',
      margin,
      y
    );
    y += 6;

    // ── 2. FICHA DEL CLIENTE Y RESUMEN COMERCIAL ─────────────────────────
    const boxY = y;
    const boxH = 43;

    // Fondo caja de información
    doc.setFillColor(...GRAY_LIGHT);
    doc.setDrawColor(...BORDER_GRAY);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, boxY, contentW, boxH, 2, 2, 'FD');

    // Columna Izquierda: Datos del Cliente
    const col1X = margin + 4;
    let textY = boxY + 6;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...CYAN_700);
    doc.text('DATOS DE LA ENTIDAD / CLUB', col1X, textY);
    textY += 4.5;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...SLATE_900);
    doc.text(metadata.clientName, col1X, textY);
    textY += 4;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...SLATE_700);
    if (metadata.clientEmail) {
      doc.text(`Contacto: ${metadata.clientEmail}`, col1X, textY);
      textY += 3.5;
    }
    doc.text(`Autorizado por: ${metadata.authorizedBy}`, col1X, textY);
    textY += 3.5;
    doc.text(`Vigencia: ${formatDate(metadata.startsAt)} al ${formatDate(metadata.expiresAt)}`, col1X, textY);
    textY += 3.5;
    if (metadata.paymentReference) {
      doc.text(`Referencia de Pago: ${metadata.paymentReference}`, col1X, textY);
    }

    // Columna Derecha: Resumen Económico
    const col2X = margin + 100;
    textY = boxY + 6;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...CYAN_700);
    doc.text('RESUMEN DEL ACUERDO COMERCIAL', col2X, textY);
    textY += 4.5;

    const row = (label: string, value: string, isBold = false, isAccent = false) => {
      doc.setFont('helvetica', isBold ? 'bold' : 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(isAccent ? MINT_700[0] : SLATE_700[0], isAccent ? MINT_700[1] : SLATE_700[1], isAccent ? MINT_700[2] : SLATE_700[2]);
      doc.text(label, col2X, textY);
      doc.text(value, pageW - margin - 4, textY, { align: 'right' });
      textY += 3.8;
    };

    const planLabel = metadata.plan === 'monthly' ? 'Mensual' : 'Anual (365 días)';
    row('Plan y Cobertura:', planLabel);
    row('Licencias Adquiridas:', `${metadata.totalLicenses} unidades`);
    row('Precio Unitario Base:', `$${metadata.unitBasePrice.toFixed(2)} USD`);
    row('Subtotal Bruto:', `$${metadata.subtotal.toFixed(2)} USD`);
    if (metadata.discountPercent > 0) {
      row('Descuento Autorizado:', `${metadata.discountPercent.toFixed(1)}% (-$${metadata.discountAmount.toFixed(2)} USD)`, false, true);
    }

    // Total final
    doc.setDrawColor(...BORDER_GRAY);
    doc.line(col2X, textY - 1, pageW - margin - 4, textY - 1);
    textY += 1;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...SLATE_900);
    doc.text('TOTAL FACTURADO:', col2X, textY);
    doc.text(`$${metadata.totalAmount.toFixed(2)} USD`, pageW - margin - 4, textY, { align: 'right' });

    y = boxY + boxH + 5;

    // ── 3. INSTRUCCIONES DE ACTIVACIÓN PARA ATLETAS ──────────────────────
    doc.setFillColor(240, 253, 250); // Menta muy suave
    doc.setDrawColor(204, 251, 241);
    doc.roundedRect(margin, y, contentW, 17, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...MINT_700);
    doc.text('GUÍA RÁPIDA DE ACTIVACIÓN PARA CADA ATLETA O ENTRENADOR', margin + 3.5, y + 4.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...SLATE_700);
    doc.text(
      '1. Ingresar a https://skate-coreo.vercel.app en cualquier teléfono, tablet o computadora (hasta 3 equipos por usuario).',
      margin + 3.5,
      y + 8
    );
    doc.text(
      '2. En la pantalla inicial, pulsar «¿Tienes un código de licencia o de club? Actívalo aquí».',
      margin + 3.5,
      y + 11.5
    );
    doc.text(
      '3. Introducir su código individual numerado abajo, su correo y su clave personal. Su acceso quedará activo al instante.',
      margin + 3.5,
      y + 15
    );

    y += 22;

    // ── 4. LISTADO DE CÓDIGOS DE LICENCIA ─────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...SLATE_900);
    doc.text(`CÓDIGOS INDIVIDUALES DE ACTIVACIÓN (${codes.length} LICENCIAS)`, margin, y);
    y += 4;

    const cardW = (contentW - 4) / 2; // Dos columnas
    const cardH = 11;
    const maxY = pageH - 18;

    codes.forEach((codeItem, index) => {
      const codeStr = typeof codeItem === 'string' ? codeItem : codeItem.code;
      const licenseNum = String(index + 1).padStart(3, '0');

      // Calcular columna y posición
      const colIndex = index % 2;
      const cardX = margin + colIndex * (cardW + 4);

      // Si es la primera columna y se pasa del fondo, nueva página
      if (colIndex === 0 && y + cardH > maxY) {
        doc.addPage();
        y = margin + 8;

        // Encabezado de continuación
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...CYAN_700);
        doc.text(`SKATECOREO · CÓDIGOS DE LICENCIA (CONTINUACIÓN) · PAQUETE ${metadata.packageNumber}`, margin, y - 2);
        doc.setDrawColor(...CYAN_700);
        doc.setLineWidth(0.4);
        doc.line(margin, y, pageW - margin, y);
        y += 5;
      }

      // Dibujar tarjeta de licencia
      doc.setFillColor(...GRAY_LIGHT);
      doc.setDrawColor(...BORDER_GRAY);
      doc.setLineWidth(0.25);
      doc.roundedRect(cardX, y, cardW, cardH, 1.5, 1.5, 'FD');

      // Número de licencia
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(...SLATE_500);
      doc.text(`LICENCIA #${licenseNum}`, cardX + 3.5, y + 4.5);

      // Código de licencia destacado en tipografía monoespaciada
      doc.setFont('courier', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(...SLATE_900);
      doc.text(codeStr, cardX + 3.5, y + 9);

      // Indicador de estado o marca segura
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(...MINT_700);
      doc.text('USO ÚNICO', cardX + cardW - 3.5, y + 7, { align: 'right' });

      // Avanzar Y al completar la segunda columna
      if (colIndex === 1 || index === codes.length - 1) {
        y += cardH + 2.5;
      }
    });

    // ── 5. NUMERACIÓN DE PÁGINAS Y PIE DE PÁGINA ──────────────────────────
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...SLATE_500);

      // Línea divisoria pie
      doc.setDrawColor(...BORDER_GRAY);
      doc.setLineWidth(0.2);
      doc.line(margin, pageH - 10, pageW - margin, pageH - 10);

      doc.text('SkateCoreo SaaS · AlsizTech · Documento Oficial de Licenciamiento', margin, pageH - 6.5);
      doc.text(`Página ${p} de ${totalPages}`, pageW - margin, pageH - 6.5, { align: 'right' });
    }

    return doc;
  }

  /**
   * Genera y descarga el archivo PDF directamente en el navegador del administrador.
   */
  public static downloadDocument(
    metadata: LicensePdfMetadata,
    codes: (LicenseCodeItem | string)[],
    filename?: string
  ): void {
    const doc = this.generateDocument(metadata, codes);
    const safeName = metadata.clientName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const finalFilename = filename || `licencias_skatecoreo_${safeName}_${metadata.packageNumber}.pdf`;
    doc.save(finalFilename);
  }
}
