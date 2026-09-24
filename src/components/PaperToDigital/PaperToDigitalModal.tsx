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
import { CornerPinAdjuster } from './CornerPinAdjuster';
import { ImagePrepareStage } from './ImagePrepareStage';
import { ErrorBoundary } from '../system/ErrorBoundary';
import { useChoreographyStore } from '../../store/useChoreographyStore';
import { ChoreographyPoint } from '../../types/choreography';

interface PaperToDigitalModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Se invoca cuando la digitalización ha generado nodos (navega a la Pista 2D). */
  onDigitalized?: () => void;
}

export const PaperToDigitalModal: React.FC<PaperToDigitalModalProps> = ({
  isOpen,
  onClose,
  onDigitalized,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [corners, setCorners] = useState<QuadCorners | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  /** Error de alineación: bloquea la digitalización automática si es != null. */
  const [alignmentError, setAlignmentError] = useState<string | null>(null);
  /** Orientación detectada respecto a la hoja "de pie" (0/90/180/270 aprox.). */
  const [orientationDeg, setOrientationDeg] = useState<number>(0);
  const [originFound, setOriginFound] = useState<boolean>(false);
  /** Etapa de preparación de imagen (mejora + detección) abierta. */
  const [prepareOpen, setPrepareOpen] = useState<boolean>(false);

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
    setStatusMessage(null);
    if (!file.type.startsWith('image/')) {
      setAlignmentError('El archivo seleccionado no es una imagen válida.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result as string;
      if (!src) {
        setAlignmentError('No se pudo leer la imagen. Inténtalo de nuevo.');
        return;
      }
      loadImageAndDetectCorners(src);
    };
    reader.onerror = () => {
      setAlignmentError('No se pudo leer la imagen (memoria insuficiente o archivo dañado).');
      setIsProcessing(false);
      setStatusMessage(null);
    };
    reader.readAsDataURL(file);
  };

  const loadImageAndDetectCorners = (src: string) => {
    setIsProcessing(true);
    setStatusMessage('Detectando marcas fiduciales (targets QR)...');
    setAlignmentError(null);
    setPrepareOpen(false);

    const img = new Image();
    img.src = src;
    img.onload = () => {
      try {
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
      } catch (err) {
        // Nunca dejar la app en estado "procesando" ni propagar el error.
        setAlignmentError(
          'Ocurrió un error al analizar la foto. Prueba con una imagen más ligera o vuelve a capturarla.'
        );
        // eslint-disable-next-line no-console
        console.error('[PaperToDigital] Error al detectar marcas:', err);
      } finally {
        setIsProcessing(false);
        setStatusMessage(null);
      }
    };
    img.onerror = () => {
      setAlignmentError('Error cargando la imagen. Por favor intenta con otra foto.');
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

    // Trayectoria neutra (gris, NO saturada) → no interfiere con la máscara de color.
    ctx.strokeStyle = '#64748B';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(220, 340);
    ctx.bezierCurveTo(400, 180, 700, 500, 920, 260);
    ctx.stroke();

    // Nodos manuscritos: círculos de marcador ROJO/AZUL (algunos SIN número).
    const drawInkNode = (x: number, y: number, color: string, num?: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(x, y, 20, 0, Math.PI * 2);
      ctx.stroke();
      if (num != null) {
        ctx.fillStyle = color;
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${num}`, x, y + 1);
      }
    };

    drawInkNode(220, 340, '#DC2626', 1);
    drawInkNode(550, 320, '#1D4ED8', 2);
    drawInkNode(920, 260, '#DC2626'); // nodo sin número

    const demoUrl = demoCanvas.toDataURL('image/jpeg', 0.9);
    setImageSrc(demoUrl);
    setCorners({ topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl });
    setOrientationDeg(0);
    setOriginFound(true);
    setAlignmentError(null);
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

  // ── ETAPA 2: Digitalización (nodos confirmados desde la etapa de preparación) ──
  const handleConfirmDigitalization = (points: ChoreographyPoint[]) => {
    if (points.length === 0) return;
    setPoints(points);
    setPhase(points.length >= 2 ? 'curve' : 'plot');

    // Navegación garantizada (además del evento global).
    try {
      window.dispatchEvent(new CustomEvent('skatecoreo:goto-rink'));
    } catch {
      /* entorno sin window */
    }
    try {
      onDigitalized?.();
    } catch {
      /* no-op */
    }
    setPrepareOpen(false);
    onClose();
  };

  const resetAll = () => {
    setImageSrc(null);
    setCorners(null);
    setPrepareOpen(false);
    clearPaperTraceOverlay();
  };

  /**
   * Cambiar de foto SOLO descarta la imagen actual: NO debe borrar el calco
   * (onion skin) que el usuario ya haya colocado en la pista.
   */
  const handleChangePhoto = () => {
    setImageSrc(null);
    setCorners(null);
    setPrepareOpen(false);
    setAlignmentError(null);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-stretch justify-center overflow-hidden bg-slate-950/85 p-0 backdrop-blur-md animate-in fade-in sm:items-center sm:p-4 lg:p-6">
      {/*
        Layout móvil/escritorio SEGURO: el modal ocupa exactamente el viewport
        dinámico (dvh) con áreas seguras, header y footer fijos y SOLO el cuerpo
        con scroll interno. Nada se sale de la pantalla ni tapa el escaneo.
      */}
      <div className="flex h-full max-h-full w-full max-w-5xl flex-col overflow-hidden border-0 border-cyan/30 bg-[#0D1322] text-slate-100 shadow-2xl pt-safe pb-safe sm:h-[90dvh] sm:max-h-[90dvh] sm:rounded-3xl sm:border landscape:h-full landscape:max-h-full landscape:rounded-none landscape:border-0">
        {/* ── Modal Header ── */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-slate-950/70 px-4 sm:px-5 landscape:h-11 landscape:px-3">
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
                Convierte tus coreografías dibujadas a mano en nodos digitales interactivos
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

        {/* ── Modal Body ── */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-4 lg:overflow-hidden landscape:p-2">
          {prepareOpen && imageSrc && corners ? (
            <ImagePrepareStage
              imageSrc={imageSrc}
              corners={corners}
              onBack={() => setPrepareOpen(false)}
              onConfirm={handleConfirmDigitalization}
            />
          ) : (
            <div className="grid min-h-0 grid-cols-1 gap-3 sm:gap-4 lg:h-full lg:grid-cols-[minmax(0,1fr)_300px] landscape:h-full landscape:min-h-0 landscape:grid-cols-[minmax(0,1fr)_minmax(200px,42%)]">

              {/* ░░ COLUMNA 1: ÁREA DE LA HOJA A4 (sin textos superpuestos) ░░ */}
              <div className="flex min-h-[42dvh] flex-col sm:min-h-[48dvh] lg:min-h-0 landscape:min-h-0">
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
                  <div className="relative flex min-h-[30dvh] flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950 lg:min-h-0 landscape:h-full landscape:min-h-0 landscape:max-h-full">
                    {corners && (
                      <ErrorBoundary
                        inline
                        inlineMessage="No se pudo abrir el ajuste de esquinas. Vuelve a intentarlo."
                      >
                        <CornerPinAdjuster
                          imageSrc={imageSrc}
                          corners={corners}
                          onChangeCorners={(c) => {
                            setCorners(c);
                            // El ajuste manual confirma la alineación: permite continuar.
                            if (alignmentError) setAlignmentError(null);
                          }}
                        />
                      </ErrorBoundary>
                    )}
                  </div>
                )}
              </div>

              {/* ░░ COLUMNA 2: PANEL LATERAL (instrucciones, controles y estado) ░░ */}
              <aside className="flex shrink-0 flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/95 p-4 lg:min-h-0 lg:overflow-y-auto landscape:min-h-0 landscape:shrink landscape:overflow-y-auto">
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
                      onClick={handleChangePhoto}
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

                <div className="mt-auto space-y-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[10px] leading-relaxed text-slate-400">
                  <p>
                    <strong className="text-rose-300">Dibuja los nodos con bolígrafo/marcador ROJO o AZUL</strong>{' '}
                    (círculo, con o sin número). El número NO es obligatorio: un nodo sin número sigue siendo válido.
                  </p>
                  <p>
                    Al pulsar <strong className="text-cyan">Preparar y Detectar</strong> podrás mejorar la imagen,
                    comparar Original/Procesada y revisar las máscaras roja/azul antes de digitalizar.
                  </p>
                </div>
              </aside>
            </div>
          )}
        </div>

        {/* ── Modal Footer: Botones de Acción (solo en la fase de alineación) ── */}
        {!prepareOpen && (imageSrc || paperTraceOverlay) && (
          <div className="p-4 border-t border-white/10 bg-slate-950/80 flex flex-wrap items-center justify-between gap-3 shrink-0 landscape:p-2 landscape:gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={resetAll}
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

                {/* Opción B: Etapa 2 (Preparar imagen + detección) */}
                <button
                  type="button"
                  onClick={() => setPrepareOpen(true)}
                  disabled={isProcessing || !!alignmentError}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-black bg-cyan text-slate-950 hover:bg-cyan/90 border border-white/20 shadow-glow-cyan transition-all interactive-tap disabled:opacity-30"
                  title="Mejora la imagen, revisa las máscaras roja/azul y detecta los nodos"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Preparar y Detectar</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
