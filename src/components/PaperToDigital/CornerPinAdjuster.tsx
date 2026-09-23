import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Point2D, QuadCorners } from '../../core/vision/HomographyWarp';

interface CornerPinAdjusterProps {
  imageSrc: string;
  corners: QuadCorners;
  onChangeCorners: (corners: QuadCorners) => void;
}

type CornerKey = 'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft';

export const CornerPinAdjuster: React.FC<CornerPinAdjusterProps> = ({
  imageSrc,
  corners,
  onChangeCorners,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const magnifierCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [activeCorner, setActiveCorner] = useState<CornerKey | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number }>({ w: 1000, h: 600 });
  const [imgElement, setImgElement] = useState<HTMLImageElement | null>(null);

  // Cargar imagen natural para obtener dimensiones exactas
  useEffect(() => {
    const img = new Image();
    img.src = imageSrc;
    img.onload = () => {
      setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
      setImgElement(img);
    };
  }, [imageSrc]);

  // Redibujar cuadrilátero y pines de esquina
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !imgElement) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = container.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    // Sin medidas válidas (p. ej. columna colapsada en landscape) no se dibuja:
    // evita escalas Infinity/NaN que romperían el canvas.
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;
    if (naturalSize.w <= 0 || naturalSize.h <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    // Factor de escala entre tamaño natural y tamaño visible
    const scaleX = w / naturalSize.w;
    const scaleY = h / naturalSize.h;

    // Proyectar esquinas a coordenadas de pantalla
    const pts: Record<CornerKey, Point2D> = {
      topLeft: { x: corners.topLeft.x * scaleX, y: corners.topLeft.y * scaleY },
      topRight: { x: corners.topRight.x * scaleX, y: corners.topRight.y * scaleY },
      bottomRight: { x: corners.bottomRight.x * scaleX, y: corners.bottomRight.y * scaleY },
      bottomLeft: { x: corners.bottomLeft.x * scaleX, y: corners.bottomLeft.y * scaleY },
    };

    // 1. Dibujar polígono semitransparente que delimita la pista detectada
    ctx.beginPath();
    ctx.moveTo(pts.topLeft.x, pts.topLeft.y);
    ctx.lineTo(pts.topRight.x, pts.topRight.y);
    ctx.lineTo(pts.bottomRight.x, pts.bottomRight.y);
    ctx.lineTo(pts.bottomLeft.x, pts.bottomLeft.y);
    ctx.closePath();

    ctx.fillStyle = 'rgba(0, 240, 255, 0.12)';
    ctx.fill();

    // Bordes perimétricos con brillo cian
    ctx.strokeStyle = '#00F0FF';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.stroke();

    // 2. Líneas centrales proyectadas (Guías reglamentarias para verificar alineación)
    ctx.setLineDash([2, 4]);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
    ctx.lineWidth = 1;

    // Eje longitudinal medio
    const midLeftX = (pts.topLeft.x + pts.bottomLeft.x) / 2;
    const midLeftY = (pts.topLeft.y + pts.bottomLeft.y) / 2;
    const midRightX = (pts.topRight.x + pts.bottomRight.x) / 2;
    const midRightY = (pts.topRight.y + pts.bottomRight.y) / 2;
    ctx.beginPath();
    ctx.moveTo(midLeftX, midLeftY);
    ctx.lineTo(midRightX, midRightY);
    ctx.stroke();

    // Eje transversal medio
    const midTopX = (pts.topLeft.x + pts.topRight.x) / 2;
    const midTopY = (pts.topLeft.y + pts.topRight.y) / 2;
    const midBottomX = (pts.bottomLeft.x + pts.bottomRight.x) / 2;
    const midBottomY = (pts.bottomLeft.y + pts.bottomRight.y) / 2;
    ctx.beginPath();
    ctx.moveTo(midTopX, midTopY);
    ctx.lineTo(midBottomX, midBottomY);
    ctx.stroke();

    // 3. Dibujar los 4 pines de esquina (Corner Pins)
    const cornerLabels: Record<CornerKey, string> = {
      topLeft: 'TL',
      topRight: 'TR',
      bottomRight: 'BR',
      bottomLeft: 'BL',
    };

    (Object.keys(pts) as CornerKey[]).forEach((key) => {
      const p = pts[key];
      const isActive = activeCorner === key;

      ctx.save();
      // Sombra exterior
      ctx.shadowColor = isActive ? '#00F0FF' : 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = isActive ? 16 : 8;

      // Anillo exterior
      ctx.beginPath();
      ctx.arc(p.x, p.y, isActive ? 16 : 13, 0, Math.PI * 2);
      ctx.fillStyle = isActive ? '#00F0FF' : 'rgba(15, 23, 42, 0.9)';
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Cruz central
      ctx.strokeStyle = isActive ? '#090D16' : '#00F0FF';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(p.x - 6, p.y);
      ctx.lineTo(p.x + 6, p.y);
      ctx.moveTo(p.x, p.y - 6);
      ctx.lineTo(p.x, p.y + 6);
      ctx.stroke();

      // Etiqueta
      ctx.font = 'bold 9px JetBrains Mono, monospace';
      ctx.fillStyle = isActive ? '#090D16' : '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cornerLabels[key], p.x, p.y - (isActive ? 22 : 18));

      ctx.restore();
    });

    ctx.restore();
  }, [corners, naturalSize, imgElement, activeCorner]);

  useEffect(() => {
    render();
  }, [render]);

  // Actualizar la Lupa cuando se arrastra un pin
  const updateMagnifier = useCallback(
    (pinNaturalX: number, pinNaturalY: number) => {
      const magCanvas = magnifierCanvasRef.current;
      if (!magCanvas || !imgElement) return;
      const ctx = magCanvas.getContext('2d');
      if (!ctx) return;
      // Anti-crash: drawImage lanza si recibe NaN/Infinity o un crop degenerado.
      if (!Number.isFinite(pinNaturalX) || !Number.isFinite(pinNaturalY)) return;

      try {
        const size = 120;
        const zoom = 2.5;

        ctx.clearRect(0, 0, size, size);

        // Dibujar porción ampliada de la imagen natural
        const cropW = size / zoom;
        const cropH = size / zoom;
        const cropX = pinNaturalX - cropW / 2;
        const cropY = pinNaturalY - cropH / 2;
        if (![cropX, cropY, cropW, cropH].every(Number.isFinite) || cropW <= 0 || cropH <= 0) {
          return;
        }

        ctx.drawImage(imgElement, cropX, cropY, cropW, cropH, 0, 0, size, size);

        // Mirilla de precisión en el centro de la lupa
        ctx.strokeStyle = '#00F0FF';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, 8, 0, Math.PI * 2);
        ctx.moveTo(size / 2 - 14, size / 2);
        ctx.lineTo(size / 2 + 14, size / 2);
        ctx.moveTo(size / 2, size / 2 - 14);
        ctx.lineTo(size / 2, size / 2 + 14);
        ctx.stroke();
      } catch {
        /* La lupa es auxiliar: nunca debe tumbar la app. */
      }
    },
    [imgElement]
  );

  /** Escalas visibles→naturales válidas, o null si el contenedor no es medible. */
  const getScales = (): { rect: DOMRect; scaleX: number; scaleY: number } | null => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    if (naturalSize.w <= 0 || naturalSize.h <= 0) return null;
    const scaleX = rect.width / naturalSize.w;
    const scaleY = rect.height / naturalSize.h;
    if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) {
      return null;
    }
    return { rect, scaleX, scaleY };
  };

  // Gestores de puntero/touch para arrastrar esquinas
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const scales = getScales();
    if (!scales) return;
    const { rect, scaleX, scaleY } = scales;

    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Buscar cuál esquina está más cerca del clic (radio de captura: 44px táctil)
    const HIT_RADIUS = 44;
    let closestKey: CornerKey | null = null;
    let minDist = HIT_RADIUS;

    for (const key of Object.keys(corners) as CornerKey[]) {
      const px = corners[key].x * scaleX;
      const py = corners[key].y * scaleY;
      const dist = Math.hypot(clickX - px, clickY - py);
      if (dist < minDist) {
        minDist = dist;
        closestKey = key;
      }
    }

    if (closestKey) {
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* Algunos navegadores no lo permiten: se ignora. */
      }
      setActiveCorner(closestKey);
      updateMagnifier(corners[closestKey].x, corners[closestKey].y);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!activeCorner) return;
    const scales = getScales();
    if (!scales) return;
    const { rect, scaleX, scaleY } = scales;

    const clickX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const clickY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

    const newNatX = Math.round(clickX / scaleX);
    const newNatY = Math.round(clickY / scaleY);
    if (!Number.isFinite(newNatX) || !Number.isFinite(newNatY)) return;

    updateMagnifier(newNatX, newNatY);

    onChangeCorners({
      ...corners,
      [activeCorner]: { x: newNatX, y: newNatY },
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeCorner) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignorar */
      }
      setActiveCorner(null);
    }
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-slate-950 select-none overflow-hidden rounded-2xl border border-white/10">
      {/* Contenedor relativo para imagen y canvas overlay */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="relative max-w-full max-h-full cursor-crosshair touch-none"
        style={{ touchAction: 'none' }}
      >
        <img
          src={imageSrc}
          alt="Hoja de Coreografía"
          className="max-w-full max-h-[60vh] object-contain block pointer-events-none rounded-xl"
        />

        {/* Canvas de líneas y pines */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />
      </div>

      {/* Lupa flotante de precisión cuando un pin está activo (herramienta, sin textos sobre la hoja) */}
      {activeCorner && (
        <div className="absolute right-3 top-3 z-30 rounded-2xl border-2 border-cyan bg-slate-900/95 p-1.5 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95">
          <canvas
            ref={magnifierCanvasRef}
            width={120}
            height={120}
            className="block h-24 w-24 rounded-xl border border-white/10 bg-black"
          />
        </div>
      )}
    </div>
  );
};

