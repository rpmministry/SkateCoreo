import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  RotateCcw,
  ScanLine,
  SlidersHorizontal,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { QuadCorners, HomographyWarp } from '../../core/vision/HomographyWarp';
import { DEFAULT_RINK_DIMENSIONS } from '../../core/canvas/RinkMath';
import { ChoreographyPoint } from '../../types/choreography';
import {
  EnhanceParams,
  NEUTRAL_PARAMS,
  analyzeImage,
  autoEnhanceParams,
  downscaleImage,
  enhanceImage,
  optimizeForNodesParams,
  paramsAreNeutral,
} from '../../core/vision/scan/ImageEnhance';
import { ScannedNode, DEFAULT_RINK } from '../../core/vision/scan/types';
import { scanPaper } from '../../core/vision/scan/PaperScanner';
import {
  buildScanOverlayCanvas,
  canvasToRgbaImage,
  maskToCanvas,
  rgbaImageToCanvas,
  combinedColorMaskToCanvas,
} from '../../core/vision/PaperScannerCanvas';
import { PaperOcrEngine, DetectedNodeMarker } from '../../core/vision/PaperOcrEngine';

/** Resolución de la imagen rectificada para detección (2:1, la pista completa). */
const WARP_W = 1400;
const WARP_H = 700;
/**
 * Resolución de la pasada FINAL de mejora/detección. Ligera reducción respecto a
 * la rectificada: mantiene precisión (22 px/m) y recorta el coste de CLAHE/ruido,
 * evitando bloquear el hilo principal en móviles de gama baja.
 */
const FINAL_W = 1100;
/** Resolución del preview mientras se arrastran los sliders (UI fluida). */
const PREVIEW_W = 720;

type ViewMode = 'processed' | 'original' | 'compare';
type DiagStage = 'enhanced' | 'rectified' | 'red' | 'blue' | 'combined' | 'candidates' | 'result';

export interface ImagePrepareStageProps {
  imageSrc: string;
  corners: QuadCorners;
  /** Vuelve al ajuste de esquinas. */
  onBack: () => void;
  /** Digitaliza los nodos confirmados y cierra. */
  onConfirm: (points: ChoreographyPoint[]) => void;
}

/* ── Slider compacto y accesible ─────────────────────────────────────────── */
const ParamSlider: React.FC<{
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}> = ({ label, value, onChange, disabled }) => (
  <label className="block space-y-1">
    <span className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
      <span>{label}</span>
      <span className="font-mono text-cyan">{Math.round(value * 100)}</span>
    </span>
    <input
      type="range"
      min={-100}
      max={100}
      step={1}
      value={Math.round(value * 100)}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value) / 100)}
      className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-cyan disabled:opacity-40"
    />
  </label>
);

/** Rectifica la imagen (homografía) y aplica la cadena de mejora. */
function processCanvas(
  rectified: HTMLCanvasElement,
  params: EnhanceParams,
  quality: 'preview' | 'final',
  maxWidth?: number
): HTMLCanvasElement {
  let img = canvasToRgbaImage(rectified);
  if (maxWidth && img.width > maxWidth) img = downscaleImage(img, maxWidth);
  const enhanced = enhanceImage(img, params, {
    quality,
    chromaBoost: quality === 'preview' ? 0.45 : undefined,
  });
  return rgbaImageToCanvas(enhanced);
}

function buildPoints(nodes: ScannedNode[], includeReview: boolean): ChoreographyPoint[] {
  const usable = includeReview ? nodes : nodes.filter((n) => n.decision === 'accept');
  const base = Date.now();
  return usable.map((n, idx) => {
    const timeMs = idx * 4000;
    return {
      id: `node-paper-${base}-${idx + 1}`,
      timestamp: timeMs,
      time_ms: timeMs,
      x: n.xMeters,
      y: n.yMeters,
      controlPoint1: { x: n.xMeters + 3, y: n.yMeters },
      controlPoint2: { x: n.xMeters + 6, y: n.yMeters },
      cp1x: n.xMeters + 3,
      cp1y: n.yMeters,
      cp2x: n.xMeters + 6,
      cp2y: n.yMeters,
      type: n.digit != null ? 'Step' : 'Marker',
      label: '',
      isMainNode: true,
      unrecognized: n.digit == null,
      nodeNumber: n.digit ?? undefined,
      inkColor: n.channel,
      unlinked: true,
      colorConfidence: n.confidence.colorConfidence,
      geometryConfidence: n.confidence.circleConfidence,
      positionConfidence: n.confidence.positionConfidence,
      digitConfidence: n.confidence.digitConfidence,
      path: undefined,
    };
  });
}

/**
 * Etapa «Preparar imagen para escaneo» del Paper-to-Digital.
 *
 * Mantiene SIEMPRE dos versiones de la imagen: la rectificada ORIGINAL y la
 * PROCESADA (nunca se sobrescribe la original). Ofrece Auto Mejorar, Optimizar
 * para nodos, ajuste manual con límites seguros, comparación Original/Procesada
 * (con deslizador Antes/Después), modo de diagnóstico por etapas y un resumen de
 * validación antes de confirmar la digitalización.
 */
export const ImagePrepareStage: React.FC<ImagePrepareStageProps> = ({
  imageSrc,
  corners,
  onBack,
  onConfirm,
}) => {
  const [rectified, setRectified] = useState<HTMLCanvasElement | null>(null);
  const [rectifiedUrl, setRectifiedUrl] = useState<string | null>(null);
  const [debugError, setDebugError] = useState<string | null>(null);

  const [params, setParams] = useState<EnhanceParams>(NEUTRAL_PARAMS);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('compare');
  const [comparePos, setComparePos] = useState(50);

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const [scanNodes, setScanNodes] = useState<ScannedNode[] | null>(null);
  const [includeReview, setIncludeReview] = useState(true);
  const [diagStage, setDiagStage] = useState<DiagStage>('enhanced');
  const [diagUrls, setDiagUrls] = useState<Record<string, string>>({});
  const [showDiag, setShowDiag] = useState(false);

  const statsRef = useRef<ReturnType<typeof analyzeImage> | null>(null);

  // ── 1. Rectificado inicial (una sola vez) ────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setRectified(null);
    setRectifiedUrl(null);
    setDebugError(null);
    setParams(NEUTRAL_PARAMS);
    setScanNodes(null);
    setDiagUrls({});

    const img = new Image();
    img.src = imageSrc;
    img.onload = () => {
      if (cancelled) return;
      try {
        const canvas = HomographyWarp.warpPerspective(img, corners, WARP_W, WARP_H);
        statsRef.current = analyzeImage(canvasToRgbaImage(canvas));
        setRectified(canvas);
        setRectifiedUrl(canvas.toDataURL('image/jpeg', 0.85));
      } catch (err: any) {
        setDebugError('No se pudo rectificar la imagen: ' + (err?.message || err));
      }
    };
    img.onerror = () => !cancelled && setDebugError('No se pudo cargar la imagen.');
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageSrc, corners.topLeft.x, corners.topLeft.y, corners.topRight.x, corners.topRight.y, corners.bottomRight.x, corners.bottomRight.y, corners.bottomLeft.x, corners.bottomLeft.y]);

  // ── 2. Preview en tiempo real (baja resolución + debounce) ───────────────
  useEffect(() => {
    if (!rectified) return;
    let cancelled = false;
    const handle = window.setTimeout(() => {
      try {
        const small = processCanvas(rectified, params, 'preview', PREVIEW_W);
        if (!cancelled) setPreviewUrl(small.toDataURL('image/jpeg', 0.82));
      } catch {
        /* preview no bloqueante */
      }
    }, 110);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [rectified, params]);

  const applyAuto = useCallback(() => {
    if (!statsRef.current) return;
    setParams(autoEnhanceParams(statsRef.current));
  }, []);

  const applyOptimize = useCallback(() => {
    if (!statsRef.current) return;
    setParams(optimizeForNodesParams(statsRef.current));
  }, []);

  const reset = useCallback(() => setParams(NEUTRAL_PARAMS), []);

  /** Une los números leídos por HTR a los nodos detectados por color/geometría. */
  const attachNumbers = useCallback(
    async (nodes: ScannedNode[], canvas: HTMLCanvasElement): Promise<ScannedNode[]> => {
      let numbers: DetectedNodeMarker[] = [];
      try {
        numbers = await PaperOcrEngine.readHandwrittenNumbers(canvas, DEFAULT_RINK_DIMENSIONS);
      } catch {
        numbers = [];
      }
      if (numbers.length === 0) return nodes;
      const matchRadius = Math.min(DEFAULT_RINK.lengthMeters, DEFAULT_RINK.widthMeters) * 0.12;
      return nodes.map((n) => {
        let best: DetectedNodeMarker | null = null;
        let bestDist = Infinity;
        for (const m of numbers) {
          const d = Math.hypot(m.positionMeters.x - n.xMeters, m.positionMeters.y - n.yMeters);
          if (d < bestDist) {
            bestDist = d;
            best = m;
          }
        }
        if (best && bestDist <= matchRadius) {
          return { ...n, digit: best.sequenceNumber, review: false, decision: 'accept' as const };
        }
        return n;
      });
    },
    []
  );

  // ── 3. Detección (procesamiento FINAL a resolución completa) ─────────────
  const handleDetect = useCallback(async () => {
    if (!rectified) return;
    setBusy(true);
    setStatus('Procesando imagen y detectando nodos…');
    try {
      const full = processCanvas(rectified, params, 'final', FINAL_W);
      const rgba = canvasToRgbaImage(full);
      const result = await scanPaper(rgba, { rink: DEFAULT_RINK });
      const nodes = await attachNumbers(result.nodes, full);
      setScanNodes(nodes);

      // Vistas de diagnóstico (dimensiones reales de la imagen procesada).
      const urls: Record<string, string> = {
        enhanced: full.toDataURL('image/jpeg', 0.85),
        candidates: buildScanOverlayCanvas(
          full,
          [],
          result.debug.candidates,
          DEFAULT_RINK
        ).toDataURL('image/jpeg', 0.85),
        result: buildScanOverlayCanvas(full, nodes, [], DEFAULT_RINK).toDataURL('image/jpeg', 0.85),
        red: maskToCanvas(result.debug.redMask, full.width, full.height, [235, 45, 45]).toDataURL('image/png'),
        blue: maskToCanvas(result.debug.blueMask, full.width, full.height, [45, 120, 245]).toDataURL('image/png'),
        combined: combinedColorMaskToCanvas(result.debug.redMask, result.debug.blueMask, full.width, full.height).toDataURL('image/jpeg', 0.85),
      };
      setDiagUrls(urls);
      setDiagStage('result');
      setShowDiag(true);
      setStatus(
        nodes.length === 0
          ? 'No se detectaron nodos. Revisa la máscara roja/azul o dibuja los círculos con más intensidad.'
          : null
      );
    } catch (err: any) {
      setStatus('Error en la detección: ' + (err?.message || err));
    } finally {
      setBusy(false);
    }
  }, [rectified, params, attachNumbers]);

  const points = useMemo(
    () => (scanNodes ? buildPoints(scanNodes, includeReview) : []),
    [scanNodes, includeReview]
  );

  const summary = useMemo(() => {
    const reds = points.filter((p) => p.inkColor === 'red').length;
    const blues = points.filter((p) => p.inkColor === 'blue').length;
    const withNumber = points.filter((p) => p.nodeNumber != null).length;
    const withoutNumber = points.length - withNumber;
    return { total: points.length, reds, blues, withNumber, withoutNumber };
  }, [points]);

  const displayUrl =
    viewMode === 'original'
      ? rectifiedUrl
      : showDiag && scanNodes
        ? (diagStage === 'rectified' ? rectifiedUrl : diagUrls[diagStage]) ?? previewUrl
        : previewUrl;

  return (
    <div className="grid min-h-0 grid-cols-1 gap-3 sm:gap-4 lg:h-full lg:grid-cols-[minmax(0,1fr)_320px]">
      {/* ░░ COLUMNA 1: VISUALIZADOR ░░ */}
      <div className="flex min-h-[40dvh] flex-col gap-2 lg:min-h-0">
        {/* Selector de vista */}
        <div className="flex flex-wrap items-center gap-1.5">
          {([
            ['processed', 'Procesada'],
            ['original', 'Original'],
            ['compare', 'Antes / Después'],
          ] as Array<[ViewMode, string]>).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={[
                'rounded-lg px-3 py-1.5 text-[11px] font-bold transition-colors',
                viewMode === mode ? 'bg-cyan text-slate-950' : 'bg-white/10 text-slate-300 hover:bg-white/15',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
          {scanNodes && (
            <button
              type="button"
              onClick={() => {
                setShowDiag((v) => !v);
                setViewMode('processed');
              }}
              className={[
                'ml-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold transition-colors',
                showDiag ? 'bg-emerald-500 text-slate-950' : 'bg-white/10 text-slate-300 hover:bg-white/15',
              ].join(' ')}
            >
              <Eye className="h-3.5 w-3.5" />
              Ver detección
            </button>
          )}
        </div>

        {/* Lienzo */}
        <div className="relative flex min-h-[30dvh] flex-1 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-slate-950 lg:min-h-0">
          {debugError ? (
            <p className="p-6 text-center text-xs text-red-300">{debugError}</p>
          ) : !displayUrl ? (
            <div className="flex flex-col items-center gap-2 text-slate-500">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan/30 border-t-cyan" />
              <span className="text-[11px]">Rectificando imagen…</span>
            </div>
          ) : viewMode === 'compare' ? (
            <div className="relative h-full w-full">
              <img src={previewUrl ?? rectifiedUrl ?? ''} alt="Imagen procesada" className="absolute inset-0 h-full w-full object-contain" />
              <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - comparePos}% 0 0)` }}>
                <img src={rectifiedUrl ?? ''} alt="Imagen original" className="h-full w-full object-contain" />
              </div>
              <div
                className="pointer-events-none absolute inset-y-0 w-0.5 bg-cyan"
                style={{ left: `${comparePos}%` }}
              />
            </div>
          ) : (
            <img
              src={displayUrl}
              alt={viewMode === 'original' ? 'Imagen original' : 'Imagen procesada'}
              className="h-full w-full object-contain"
            />
          )}
        </div>

        {/* Deslizador Antes/Después */}
        {viewMode === 'compare' && (
          <label className="flex items-center gap-2 px-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Antes</span>
            <input
              type="range"
              min={0}
              max={100}
              value={comparePos}
              onChange={(e) => setComparePos(Number(e.target.value))}
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/15 accent-cyan"
            />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Después</span>
          </label>
        )}

        {/* Diagnóstico por etapas */}
        {showDiag && scanNodes && (
          <div className="rounded-xl border border-white/10 bg-black/40 p-2">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {([
                ['rectified', 'Rectificada', rectifiedUrl],
                ['enhanced', 'Mejorada', diagUrls.enhanced],
                ['red', 'Máscara roja', diagUrls.red],
                ['blue', 'Máscara azul', diagUrls.blue],
                ['combined', 'Combinada', diagUrls.combined],
                ['candidates', 'Candidatos', diagUrls.candidates],
                ['result', 'Resultado', diagUrls.result],
              ] as Array<[DiagStage, string, string | undefined]>).map(([stage, label, url]) => (
                <button
                  key={stage}
                  type="button"
                  disabled={!url}
                  onClick={() => {
                    setDiagStage(stage);
                    setViewMode('processed');
                  }}
                  className={[
                    'rounded-lg px-2.5 py-1 text-[10px] font-bold transition-colors disabled:opacity-30',
                    diagStage === stage && viewMode === 'processed'
                      ? 'bg-cyan text-slate-950'
                      : 'bg-white/10 text-slate-300 hover:bg-white/15',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[10px] leading-relaxed text-slate-500">
              Verde = nodo aceptado · Ámbar = candidato o nodo a revisar. La detección trabaja sobre la
              imagen mejorada, nunca sobre la foto deformada.
            </p>
          </div>
        )}
      </div>

      {/* ░░ COLUMNA 2: CONTROLES ░░ */}
      <aside className="flex shrink-0 flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/95 p-4 lg:min-h-0 lg:overflow-y-auto">
        <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-cyan">
          <SlidersHorizontal className="h-4 w-4" />
          Preparar imagen para escaneo
        </h3>

        <div className="space-y-3">
          <ParamSlider label="Brillo" value={params.brightness} onChange={(v) => setParams((p) => ({ ...p, brightness: v }))} disabled={busy} />
          <ParamSlider label="Contraste" value={params.contrast} onChange={(v) => setParams((p) => ({ ...p, contrast: v }))} disabled={busy} />
          <ParamSlider label="Exposición" value={params.exposure} onChange={(v) => setParams((p) => ({ ...p, exposure: v }))} disabled={busy} />
          <ParamSlider label="Saturación" value={params.saturation} onChange={(v) => setParams((p) => ({ ...p, saturation: v }))} disabled={busy} />
          <ParamSlider label="Nitidez" value={Math.max(0, params.sharpness)} onChange={(v) => setParams((p) => ({ ...p, sharpness: Math.max(0, v) }))} disabled={busy} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={applyAuto}
            disabled={busy || !rectified}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-cyan px-3 py-2.5 text-xs font-black text-slate-950 shadow-glow-cyan transition-all hover:bg-cyan/90 disabled:opacity-30"
          >
            <Wand2 className="h-4 w-4" />
            Auto Mejorar
          </button>
          <button
            type="button"
            onClick={applyOptimize}
            disabled={busy || !rectified}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-3 py-2.5 text-xs font-black text-emerald-300 transition-all hover:bg-emerald-400/20 disabled:opacity-30"
            title="Maximiza la separación rojo/azul/plantilla para detección"
          >
            <Sparkles className="h-4 w-4" />
            Optimizar para nodos
          </button>
        </div>

        <button
          type="button"
          onClick={reset}
          disabled={busy || paramsAreNeutral(params)}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-semibold text-slate-300 transition-all hover:bg-white/10 disabled:opacity-30"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Restablecer
        </button>

        {status && (
          <div className="rounded-xl border border-cyan/30 bg-cyan/15 px-3 py-2 text-[11px] font-semibold text-cyan">
            {status}
          </div>
        )}

        {/* Resumen de validación FINAL antes de digitalizar */}
        {scanNodes && (
          <div className="space-y-2 rounded-xl border border-mint/30 bg-mint/10 p-3">
            <p className="text-xs font-black text-mint">
              Se detectaron {summary.total} nodo{summary.total === 1 ? '' : 's'}
            </p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-200">
              <span>Rojo: <strong className="text-red-300">{summary.reds}</strong></span>
              <span>Azul: <strong className="text-blue-300">{summary.blues}</strong></span>
              <span>Con número: <strong>{summary.withNumber}</strong></span>
              <span>Sin número: <strong className="text-orange-300">{summary.withoutNumber}</strong></span>
            </div>
            <label className="flex items-center gap-2 pt-1 text-[11px] text-slate-300">
              <input
                type="checkbox"
                checked={includeReview}
                onChange={(e) => setIncludeReview(e.target.checked)}
                className="h-3.5 w-3.5 accent-cyan"
              />
              Incluir nodos a revisar
            </label>
          </div>
        )}

        <div className="mt-auto space-y-2">
          {scanNodes ? (
            <>
              <button
                type="button"
                onClick={() => onConfirm(points)}
                disabled={busy || points.length === 0}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan px-5 py-3 text-xs font-black text-slate-950 shadow-glow-cyan transition-all hover:bg-cyan/90 disabled:opacity-30"
              >
                <CheckCircle2 className="h-4 w-4" />
                Confirmar digitalización
              </button>
              <button
                type="button"
                onClick={() => {
                  setScanNodes(null);
                  setShowDiag(false);
                  setStatus(null);
                }}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-bold text-slate-300 transition-all hover:bg-white/10 disabled:opacity-30"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Editar ajustes y reintentar
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleDetect}
              disabled={busy || !rectified}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan px-5 py-3 text-xs font-black text-slate-950 shadow-glow-cyan transition-all hover:bg-cyan/90 disabled:opacity-30"
            >
              {busy ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950/30 border-t-slate-950" />
              ) : (
                <ScanLine className="h-4 w-4" />
              )}
              {busy ? 'Detectando…' : 'Detectar Nodos'}
            </button>
          )}

          <button
            type="button"
            onClick={onBack}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-[11px] font-semibold text-slate-400 transition-colors hover:text-white disabled:opacity-30"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver a ajustar esquinas
          </button>
        </div>
      </aside>
    </div>
  );
};
