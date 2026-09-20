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

      const size = 120;
      const zoom = 2.5;

      ctx.clearRect(0, 0, size, size);

      // Dibujar porción ampliada de la imagen natural
      const cropW = size / zoom;
      const cropH = size / zoom;
      const cropX = pinNaturalX - cropW / 2;
      const cropY = pinNaturalY - cropH / 2;

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
    },
    [imgElement]
  );

  // Gestores de puntero/touch para arrastrar esquinas
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const scaleX = rect.width / naturalSize.w;
    const scaleY = rect.height / naturalSize.h;

    // Buscar cuál esquina está más cerca del clic (radio de captura: 36px táctil)
    const HIT_RADIUS = 36;
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
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      } catch (err) {}
      setActiveCorner(closestKey);
      updateMagnifier(corners[closestKey].x, corners[closestKey].y);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!activeCorner || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const clickY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

    const scaleX = rect.width / naturalSize.w;
    const scaleY = rect.height / naturalSize.h;

    const newNatX = Math.round(clickX / scaleX);
    const newNatY = Math.round(clickY / scaleY);

    updateMagnifier(newNatX, newNatY);

    onChangeCorners({
      ...corners,
      [activeCorner]: { x: newNatX, y: newNatY },
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeCorner) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch (err) {}
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

      {/* Lupa flotante de precisión cuando un pin está activo */}
      {activeCorner && (
        <div className="absolute top-4 right-4 z-30 flex flex-col items-center bg-slate-900/95 p-2 rounded-2xl border-2 border-cyan shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95">
          <canvas
            ref={magnifierCanvasRef}
            width={120}
            height={120}
            className="w-28 h-28 rounded-xl bg-black border border-white/10 block"
          />
          <span className="text-[10px] font-mono font-bold text-cyan mt-1">
            Lupa 2.5x (Alinea al centro ⊕)
          </span>
        </div>
      )}

      {/* Indicador de ayuda */}
      <div className="absolute bottom-2 left-4 text-[11px] font-medium text-slate-400 bg-slate-950/80 px-3 py-1 rounded-full border border-white/10 backdrop-blur pointer-events-none">
        Arrastra los <span className="text-cyan font-bold">4 pines circulares</span> a las marcas de esquina (⊕)
      </div>
    </div>
  );
};

