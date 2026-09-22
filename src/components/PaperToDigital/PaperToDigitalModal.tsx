import React, { useState, useRef } from 'react';
import {
  Camera,
  Sparkles,
  Layers,
  X,
  RefreshCw,
  CheckCircle2,
  FileText,
  Trash2,
} from 'lucide-react';
import { QuadCorners, HomographyWarp } from '../../core/vision/HomographyWarp';
import { FiducialDetector } from '../../core/vision/FiducialDetector';
import { PaperOcrEngine, OcrDebugEntry } from '../../core/vision/PaperOcrEngine';
import { PaperColorDetector } from '../../core/vision/PaperColorDetector';
import { CornerPinAdjuster } from './CornerPinAdjuster';
import { useChoreographyStore } from '../../store/useChoreographyStore';
import { ChoreographyPoint } from '../../types/choreography';

/**
 * Overlay de depuración: dibuja el centroide detectado de cada círculo (punto
 * rojo) y, al lado, el texto que el OCR ha leído (o el motivo de descarte).
 */
function buildOcrDebugOverlay(binarized: HTMLCanvasElement, debug: OcrDebugEntry[]): string {
  const canvas = document.createElement('canvas');
  canvas.width = binarized.width;
  canvas.height = binarized.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return binarized.toDataURL('image/png');

  ctx.drawImage(binarized, 0, 0);

  for (const d of debug) {
    // Verde = aceptado (pasa al OCR) · Azul = rechazado por los filtros.
    const color = d.rejected ? '#3B82F6' : d.accepted ? '#22C55E' : '#F59E0B';

    ctx.beginPath();
    ctx.arc(d.x, d.y, Math.max(8, d.radius), 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(d.x, d.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    const label = d.rejected
      ? 'FILTRADO'
      : d.accepted
        ? d.text
          ? `OK: ${d.text}`
          : 'NODO'
        : d.text
          ? `X: ${d.text}`
          : 'PENDIENTE';
    ctx.font = 'bold 20px monospace';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#FFFFFF';
    ctx.strokeText(label, d.x + 12, d.y - 10);
    ctx.fillStyle = color;
    ctx.fillText(label, d.x + 12, d.y - 10);
  }

  return canvas.toDataURL('image/png');
}

interface PaperToDigitalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PaperToDigitalModal: React.FC<PaperToDigitalModalProps> = ({
  isOpen,
  onClose,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [corners, setCorners] = useState<QuadCorners | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  /** Error de alineación: bloquea la digitalización automática si es != null. */
  const [alignmentError, setAlignmentError] = useState<string | null>(null);
  /** Preview de la imagen preprocesada/binarizada (modo debug). */
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  /** Máscara de color (fondo negro, trazos del marcador en blanco) para depurar. */
  const [maskUrl, setMaskUrl] = useState<string | null>(null);
  const [debugView, setDebugView] = useState<'nodes' | 'mask'>('nodes');
  const [showDebug, setShowDebug] = useState<boolean>(false);
  /** Orientación detectada respecto a la hoja "de pie" (0/90/180/270 aprox.). */
  const [orientationDeg, setOrientationDeg] = useState<number>(0);
  const [originFound, setOriginFound] = useState<boolean>(false);

  const setPaperTraceOverlay = useChoreographyStore((s) => s.setPaperTraceOverlay);
  const clearPaperTraceOverlay = useChoreographyStore((s) => s.clearPaperTraceOverlay);
  const paperTraceOverlay = useChoreographyStore((s) => s.paperTraceOverlay);
  const setPoints = useChoreographyStore((s) => s.setPoints);
  const setPhase = useChoreographyStore((s) => s.setPhase);

  if (!isOpen) return null;

  // Carga de archivo de imagen (desde disco o cámara del dispositivo)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result as string;
      loadImageAndDetectCorners(src);
    };
    reader.readAsDataURL(file);
  };

  const loadImageAndDetectCorners = (src: string) => {
    setIsProcessing(true);
    setStatusMessage('Detectando marcas fiduciales (targets QR)...');
    setPreviewUrl(null);
    setMaskUrl(null);

    const img = new Image();
    img.src = src;
    img.onload = () => {
      setImageSrc(src);

      // Detección ESTRICTA: si no hay 4 marcas válidas, no se auto-generan nodos.
      const result = FiducialDetector.detectMarkers(img);
      if (result.corners) {
        setCorners(result.corners);
        setAlignmentError(null);
        setOrientationDeg(result.rotationDeg);
        setOriginFound(result.originFound);
      } else {
        // Se ofrecen esquinas por defecto SOLO para que el usuario ajuste a mano.
        setCorners(FiducialDetector.getDefaultCorners(img.naturalWidth, img.naturalHeight));
        setOrientationDeg(0);
        setOriginFound(false);
        setAlignmentError(
          `No se detectaron las 4 marcas fiduciales (encontradas: ${result.detected}). ` +
          'Ajusta los 4 pines manualmente hasta las marcas o vuelve a escanear con mejor luz.'
        );
      }

      setIsProcessing(false);
      setStatusMessage(null);
    };
    img.onerror = () => {
      alert('Error cargando la imagen. Por favor intenta con otra foto.');
      setIsProcessing(false);
      setStatusMessage(null);
    };
  };

  // Cargar imagen de prueba sintética para demostración instantánea
  const handleLoadDemoSheet = () => {
    setIsProcessing(true);
    setStatusMessage('Generando hoja de demostración...');

    // Crear un canvas representativo de la hoja con trazos dibujados a mano
    const demoCanvas = document.createElement('canvas');
    demoCanvas.width = 1200;
    demoCanvas.height = 700;
    const ctx = demoCanvas.getContext('2d');
    if (!ctx) return;

    // Fondo papel con leve ángulo simulado
    ctx.fillStyle = '#E2E8F0';
    ctx.fillRect(0, 0, 1200, 700);

    // Hoja A4 blanca
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(80, 50);
    ctx.lineTo(1120, 70);
    ctx.lineTo(1100, 650);
    ctx.lineTo(70, 620);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 4 Marcas Fiduciales: TL SÓLIDA (origen) y las otras 3 tipo target (anillo).
    const drawFiducial = (x: number, y: number, solid: boolean) => {
      const S = 44; // ≥1.5 cm escalado, alto contraste
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(x - S / 2 - 4, y - S / 2 - 4, S + 8, S + 8);
      ctx.fillStyle = '#000000';
      ctx.fillRect(x - S / 2, y - S / 2, S, S);
      if (solid) return; // origen: cuadrado sólido
      ctx.fillStyle = '#FFFFFF';
      const inner = S * 0.62;
      ctx.fillRect(x - inner / 2, y - inner / 2, inner, inner);
      ctx.fillStyle = '#000000';
      const core = S * 0.30;
      ctx.fillRect(x - core / 2, y - core / 2, core, core);
    };

    const tl = { x: 130, y: 130 };
    const tr = { x: 1040, y: 145 };
    const br = { x: 1020, y: 560 };
    const bl = { x: 120, y: 540 };

    drawFiducial(tl.x, tl.y, true);
    drawFiducial(tr.x, tr.y, false);
    drawFiducial(br.x, br.y, false);
    drawFiducial(bl.x, bl.y, false);

    // Contorno de la pista en perspectiva
    ctx.strokeStyle = '#64748B';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tl.x, tl.y);
    ctx.lineTo(tr.x, tr.y);
    ctx.lineTo(br.x, br.y);
    ctx.lineTo(bl.x, bl.y);
    ctx.closePath();
    ctx.stroke();

    // Trazos simulados a mano de la entrenadora (tinta azul oscura)
    // Trayectoria neutra (gris, NO saturada) → no interfiere con la máscara de color.
    ctx.strokeStyle = '#64748B';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(220, 340);
    ctx.bezierCurveTo(400, 180, 700, 500, 920, 260);
    ctx.stroke();

    // Nodos numerados manuscritos (círculos con 1, 2, 3)
    const drawNode = (num: number, x: number, y: number) => {
      ctx.fillStyle = '#1E3A8A';
      ctx.beginPath();
      ctx.arc(x, y, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${num}`, x, y + 1);
    };

    drawNode(1, 220, 340);
    drawNode(2, 550, 320);
    drawNode(3, 920, 260);

    const demoUrl = demoCanvas.toDataURL('image/jpeg', 0.9);
    setImageSrc(demoUrl);
    setCorners({ topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl });
    setIsProcessing(false);
    setStatusMessage(null);
  };

  // ── ETAPA 1: Usar como Fondo de Calco Asistido (Onion Skin) ──
  const handleApplyAsTraceOverlay = () => {
    if (!imageSrc || !corners) return;

    setIsProcessing(true);
    setStatusMessage('Corrigiendo perspectiva y aplanando imagen a escala 2:1...');

    const img = new Image();
    img.src = imageSrc;
    img.onload = () => {
      try {
        // Warp ortogonal plano calibrado 2000 x 1000 píxeles
        const warpedCanvas = HomographyWarp.warpPerspective(img, corners, 2000, 1000);
        const warpedDataUrl = warpedCanvas.toDataURL('image/png');

        setPaperTraceOverlay({
          imageUrl: warpedDataUrl,
          opacity: 0.65,
          visible: true,
        });

        setIsProcessing(false);
        setStatusMessage(null);
        onClose();
      } catch (err: any) {
        alert('Error en la rectificación de perspectiva: ' + (err?.message || err));
        setIsProcessing(false);
        setStatusMessage(null);
      }
    };
  };

  // ── ETAPA 2: Digitalización Automática Completa (Alineación + OCR) ──
  const handleAutoVectorizeAndOcr = async () => {
    if (!imageSrc || !corners) return;

    // REQUISITO: si las 4 esquinas no están alineadas, se pide re-escanear en
    // lugar de generar nodos en coordenadas erróneas.
    if (alignmentError) {
      alert(
        'La alineación no es fiable: no se detectaron las 4 marcas fiduciales.\n\n' +
        'Vuelve a escanear la hoja con buena luz o ajusta manualmente los 4 pines hasta que coincidan con las marcas, y reintenta.'
      );
      return;
    }

    setIsProcessing(true);
    setStatusMessage('Paso 1/3: Corrigiendo perspectiva (homografía)...');

    const img = new Image();
    img.src = imageSrc;
    img.onload = async () => {
      try {
        const warpedCanvas = HomographyWarp.warpPerspective(img, corners, 2000, 1000);

        // ── BLOQUEO ABSOLUTO DE VECTORES/TRAZOS ───────────────────────────────
        // El escáner NO extrae ni sube líneas: solo coordenadas de nodos. No se
        // vectoriza nada y el array de trazos queda vacío por diseño.

        // Paso 2/3: reconocimiento SOBRE LA IMAGEN YA ALINEADA (nunca la original).
        //   · Con clave de Cloud Vision → HTR (lee el número manuscrito).
        //   · Sin clave → "truco del marcador": segmentación por COLOR rojo/azul.
        setStatusMessage('Paso 2/3: Reconociendo nodos (IA de visión o segmentación por color)...');
        const ocrResult = await PaperOcrEngine.detectNumberedNodesWithDebug(warpedCanvas);

        // Debug visual: overlay con los nodos detectados sobre la hoja alineada
        // y la MÁSCARA DE COLOR (negro + trazos del marcador en blanco).
        setPreviewUrl(buildOcrDebugOverlay(warpedCanvas, ocrResult.debug));
        setMaskUrl(PaperColorDetector.buildMaskCanvas(warpedCanvas).toDataURL('image/png'));
        const rawDetectedNodes = ocrResult.nodes;

        // ── FAIL-SAFE ─────────────────────────────────────────────────────────
        // TODO contorno detectado se convierte en nodo, aunque el OCR falle
        // (número 0 = pendiente). Primero los reconocidos por número; luego los
        // pendientes, en el mismo orden en que se detectaron.
        const detectedNodes = rawDetectedNodes;
        const recognizedNodes = detectedNodes.filter((n) => n.sequenceNumber >= 1);
        const pendingNodes = detectedNodes.filter((n) => n.sequenceNumber < 1);
        const sortedOcrNodes = [...recognizedNodes].sort((a, b) => a.sequenceNumber - b.sequenceNumber).concat(pendingNodes);

        if (detectedNodes.length > 0) {

          // Solo se generan NODOS sueltos (sin path ni segmentos de unión).
          const generatedPoints: ChoreographyPoint[] = sortedOcrNodes.map((node, idx) => {
            const timeMs = idx * 4000; // Distribución temporal base
            const recognized = node.sequenceNumber >= 1;

            return {
              id: `node-paper-${Date.now()}-${idx + 1}`,
              timestamp: timeMs,
              time_ms: timeMs,
              x: node.positionMeters.x,
              y: node.positionMeters.y,
              controlPoint1: { x: node.positionMeters.x + 3, y: node.positionMeters.y },
              controlPoint2: { x: node.positionMeters.x + 6, y: node.positionMeters.y },
              cp1x: node.positionMeters.x + 3,
              cp1y: node.positionMeters.y,
              cp2x: node.positionMeters.x + 6,
              cp2y: node.positionMeters.y,
              type: recognized ? 'Step' : 'Marker',
              // La plantilla solo aporta un número de orden, NO una figura técnica.
              // Nodo pendiente (OCR falló) ⇒ etiqueta '?' para editarla a mano.
              label: recognized ? '' : '?',
              isMainNode: true,
              unrecognized: !recognized,
              nodeNumber: recognized ? node.sequenceNumber : undefined,
              // El escáner sube SOLO coordenadas sueltas: sin trazos ni uniones.
              unlinked: true,
              path: undefined,
            };
          });

          setPoints(generatedPoints);
          setPhase('curve'); // Pasa directamente a modo curva interactiva

          // Navegación garantizada: la app conmuta a la Pista 2D al terminar.
          // (Sin `alert()`: los diálogos bloqueantes podían cerrar/suspender la PWA.)
          try {
            window.dispatchEvent(new CustomEvent('skatecoreo:goto-rink'));
          } catch {
            /* entorno sin window (SSR/tests) */
          }

          setIsProcessing(false);
          setStatusMessage(null);
          onClose();
          return;
        }

        // Sin nodos: NO se cierra el modal, para que el usuario revise la máscara.
        setIsProcessing(false);
        setStatusMessage(
          'No se detectaron nodos. Abre «Vista previa → Máscara de color»: dibuja los círculos con marcador ROJO o AZUL ' +
          'y vuelve a intentar. Si la máscara se ve bien, sube MIN_AREA o baja el filtro de aspecto.'
        );
      } catch (err: any) {
        setIsProcessing(false);
        setStatusMessage('Error en la digitalización: ' + (err?.message || err));
      }
    };
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-stretch justify-center overflow-hidden bg-slate-950/85 p-0 backdrop-blur-md animate-in fade-in sm:items-center sm:p-4 lg:p-6">
      {/*
        Layout móvil/escritorio SEGURO: el modal ocupa exactamente el viewport
        dinámico (dvh) con áreas seguras, header y footer fijos y SOLO el cuerpo
        con scroll interno. Nada se sale de la pantalla ni tapa el escaneo.
      */}
      <div className="flex h-[100dvh] max-h-[100dvh] w-full max-w-4xl flex-col overflow-hidden border-0 border-cyan/30 bg-[#0D1322] text-slate-100 shadow-2xl pt-safe pb-safe sm:h-[90dvh] sm:max-h-[90dvh] sm:rounded-3xl sm:border">
        {/* ── Modal Header ── */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-slate-950/70 px-4 sm:px-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan/15 text-cyan flex items-center justify-center border border-cyan/30">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-black tracking-wide text-white uppercase flex items-center gap-2">
                <span>Paper-to-Digital</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan/15 text-cyan border border-cyan/30 font-bold lowercase">
                  visión artificial
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Convierte tus coreografías dibujadas a mano en trazados digitales interactivos
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Modal Body: GRID aislado (imagen 100% limpia | panel lateral) ── */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-4 lg:overflow-hidden">
          <div className="grid min-h-0 grid-cols-1 gap-3 sm:gap-4 lg:h-full lg:grid-cols-[minmax(0,1fr)_300px]">

            {/* ░░ COLUMNA 1: ÁREA DE LA HOJA A4 (sin textos superpuestos) ░░ */}
            <div className="flex min-h-[42dvh] flex-col sm:min-h-[48dvh] lg:min-h-0">
              {!imageSrc ? (
                /* Pantalla inicial de selección de imagen */
                <div className="flex flex-1 min-h-[350px] flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-white/15 bg-slate-950/40 p-6 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan/25 bg-cyan/10 text-cyan shadow-glow-cyan">
                    <FileText className="h-8 w-8" />
                  </div>

                  <div className="max-w-md space-y-1">
                    <h3 className="text-base font-bold text-white">
                      Sube o toma una foto de la plantilla impresa
                    </h3>
                    <p className="text-xs leading-relaxed text-slate-400">
                      Asegúrate de que la hoja esté bien iluminada y que las{' '}
                      <strong className="text-cyan">4 marcas fiduciales (⊕)</strong> de las esquinas sean visibles.
                    </p>
                  </div>

                  {/* Botones de subida */}
                  <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="interactive-tap flex items-center gap-2 rounded-2xl bg-cyan px-5 py-2.5 text-xs font-black text-slate-950 shadow-glow-cyan transition-all hover:bg-cyan/90"
                    >
                      <Camera className="h-4 w-4" />
                      <span>Tomar Foto / Subir Imagen</span>
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={handleFileChange}
                    />

                    <button
                      type="button"
                      onClick={handleLoadDemoSheet}
                      className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-bold text-slate-300 transition-all hover:bg-white/10"
                    >
                      <Sparkles className="h-4 w-4 text-amber-400" />
                      <span>Probar con Hoja Demo</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* Visualizador y Calibrador de Esquinas (imagen aislada) */
                <div className="relative flex min-h-[30dvh] flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950 lg:min-h-0">
                  {corners && (
                    <CornerPinAdjuster
                      imageSrc={imageSrc}
                      corners={corners}
                      onChangeCorners={(c) => {
                        setCorners(c);
                        // El ajuste manual confirma la alineación: permite continuar.
                        if (alignmentError) setAlignmentError(null);
                      }}
                    />
                  )}
                </div>
              )}
            </div>

            {/* ░░ COLUMNA 2: PANEL LATERAL (instrucciones, controles y estado) ░░ */}
            <aside className="flex shrink-0 flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/95 p-4 lg:min-h-0 lg:overflow-y-auto">
              <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-cyan">
                <CheckCircle2 className="h-4 w-4" />
                Alineación de la hoja
              </h3>

              <p className="text-[11px] leading-relaxed text-slate-400">
                Arrastra los <span className="font-bold text-cyan">4 pines circulares</span> hasta las marcas
                fiduciales (⊕) de las esquinas. Toda la hoja debe quedar dentro del recuadro cian.
              </p>

              {/* Orientación normalizada (marca de origen asimétrica) */}
              {imageSrc && corners && !alignmentError && (
                <div className="rounded-xl border border-cyan/25 bg-cyan/10 px-3 py-2 text-[10px] font-semibold leading-relaxed text-cyan">
                  Orientación:{' '}
                  {Math.abs(orientationDeg) < 15
                    ? 'correcta (0°)'
                    : `${orientationDeg}° → corregida automáticamente`}
                  <br />
                  {originFound
                    ? 'Marca de origen (cuadrado sólido) localizada.'
                    : 'Origen estimado por heurística de diseño.'}
                </div>
              )}

              {imageSrc && (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => imageSrc && loadImageAndDetectCorners(imageSrc)}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-semibold text-slate-200 transition-all hover:bg-white/10"
                    title="Volver a buscar las marcas automáticamente"
                  >
                    <RefreshCw className="h-3.5 w-3.5 text-cyan" />
                    <span>Auto-Alinear marcas</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setImageSrc(null)}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-[11px] font-semibold text-slate-400 transition-colors hover:text-red-400"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Cambiar foto</span>
                  </button>
                </div>
              )}

              {/* Estado del procesamiento (SIEMPRE fuera de la imagen) */}
              {statusMessage && (
                <div className="flex items-center gap-2 rounded-xl border border-cyan/30 bg-cyan/15 px-3 py-2 text-[11px] font-semibold text-cyan">
                  <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  <span>{statusMessage}</span>
                </div>
              )}

              {/* Error de alineación: bloquea la digitalización automática */}
              {alignmentError && (
                <div className="rounded-xl border border-red-500/40 bg-red-500/15 px-3 py-2 text-[11px] font-semibold leading-relaxed text-red-200">
                  {alignmentError}
                </div>
              )}

              {/* Modo debug: nodos detectados y MÁSCARA DE COLOR */}
              {imageSrc && (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setShowDebug((v) => !v)}
                    className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-semibold text-slate-200 transition-all hover:bg-white/10"
                  >
                    <span>Vista previa (depuración)</span>
                    <span className="text-cyan">{showDebug ? 'Ocultar' : 'Mostrar'}</span>
                  </button>

                  {showDebug && (
                    <div className="space-y-2 rounded-xl border border-white/10 bg-black/40 p-2">
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => setDebugView('nodes')}
                          className={`flex-1 rounded-lg px-2 py-1.5 text-[10px] font-bold transition-colors ${
                            debugView === 'nodes' ? 'bg-cyan text-slate-950' : 'bg-white/10 text-slate-300'
                          }`}
                        >
                          Nodos
                        </button>
                        <button
                          type="button"
                          onClick={() => setDebugView('mask')}
                          className={`flex-1 rounded-lg px-2 py-1.5 text-[10px] font-bold transition-colors ${
                            debugView === 'mask' ? 'bg-cyan text-slate-950' : 'bg-white/10 text-slate-300'
                          }`}
                        >
                          Máscara de color
                        </button>
                      </div>

                      {(debugView === 'mask' ? maskUrl : previewUrl) ? (
                        <img
                          src={(debugView === 'mask' ? maskUrl : previewUrl) as string}
                          alt={debugView === 'mask' ? 'Máscara de color' : 'Nodos detectados'}
                          className="w-full rounded-lg border border-white/10 object-contain"
                        />
                      ) : (
                        <p className="p-2 text-center text-[10px] text-slate-500">
                          La vista previa aparecerá al digitalizar (paso 2/3).
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-auto space-y-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[10px] leading-relaxed text-slate-400">
                <p>
                  <strong className="text-rose-300">Dibuja los nodos con bolígrafo/marcador ROJO o AZUL</strong>{' '}
                  (círculo + número). La plantilla impresa desaparece y cada mancha se detecta como un nodo.
                </p>
                <p>
                  Con Google Cloud Vision configurado, la IA lee además el número manuscrito.
                </p>
                <p>Si un número no se lee, aparece en naranja: haz doble clic en la Pista 2D para escribirlo.</p>
              </div>
            </aside>
          </div>
        </div>

        {/* ── Modal Footer: Botones de Acción (Etapa 1 vs Etapa 2) ── */}
        {(imageSrc || paperTraceOverlay) && (
          <div className="p-4 border-t border-white/10 bg-slate-950/80 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setImageSrc(null);
                  setCorners(null);
                  clearPaperTraceOverlay();
                }}
                disabled={isProcessing}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30 transition-all interactive-tap disabled:opacity-30"
                title="Descartar foto cargada y eliminar plantilla"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Descartar Plantilla / Limpiar</span>
              </button>
            </div>

            {imageSrc && (
              <div className="flex items-center gap-2.5">
                {/* Opción A: Etapa 1 (Manual Asistido / Onion Skin) */}
                <button
                  type="button"
                  onClick={handleApplyAsTraceOverlay}
                  disabled={isProcessing}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/15 text-slate-200 border border-white/10 transition-all interactive-tap disabled:opacity-30"
                  title="Inserta la hoja aplanada como fondo transparente en el lienzo para que puedas calcar por encima"
                >
                  <Layers className="w-4 h-4 text-cyan" />
                  <span>Usar como Fondo de Calco</span>
                </button>

                {/* Opción B: Etapa 2 (Automatización Mágica) */}
                <button
                  type="button"
                  onClick={handleAutoVectorizeAndOcr}
                  disabled={isProcessing}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-black bg-cyan text-slate-950 hover:bg-cyan/90 border border-white/20 shadow-glow-cyan transition-all interactive-tap disabled:opacity-30"
                  title="Aísla la tinta, detecta los números y crea automáticamente los nodos interactivos en la pista"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Digitalizar Trazos con IA</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

