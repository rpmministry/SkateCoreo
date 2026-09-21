import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { 
  Check, 
  Copy, 
  ClipboardPaste, 
  Scissors, 
  Trash2, 
  X 
} from 'lucide-react';
import { useAudioStudioStore } from '../../store/useAudioStudioStore';

export const FloatingClipContextMenu: React.FC = () => {
  const contextMenu = useAudioStudioStore((s) => s.contextMenu);
  const closeContextMenu = useAudioStudioStore((s) => s.closeContextMenu);
  const setSelectedClipId = useAudioStudioStore((s) => s.setSelectedClipId);
  const copyClip = useAudioStudioStore((s) => s.copyClip);
  const pasteClip = useAudioStudioStore((s) => s.pasteClip);
  const splitClip = useAudioStudioStore((s) => s.splitClip);
  const deleteClip = useAudioStudioStore((s) => s.deleteClip);
  const currentTimeSec = useAudioStudioStore((s) => s.currentTimeSec);

  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeContextMenu();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeContextMenu();
    };
    document.addEventListener('pointerdown', handleOutsideClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handleOutsideClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeContextMenu]);

  /**
   * Posicionamiento con medición real: el menú se mide DESPUÉS de montarse
   * (`useLayoutEffect`, antes del pintado) y se acota al viewport con margen.
   * Así nunca se pierde fuera de pantalla aunque se abra junto al borde
   * derecho, izquierdo, superior o inferior (clave en móvil vertical).
   */
  useLayoutEffect(() => {
    if (!contextMenu?.isOpen) {
      setPos(null);
      return;
    }
    const el = menuRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      const w = rect.width || 280;
      const h = rect.height || 44;
      const margin = 8;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Centrado horizontal sobre el punto tocado, pero siempre dentro del viewport
      let left = contextMenu.x - w / 2;
      left = Math.max(margin, Math.min(Math.max(margin, vw - w - margin), left));

      // Preferir encima del punto; si no cabe, debajo; si tampoco, pegado al borde
      let top = contextMenu.y - h - margin;
      if (top < margin) {
        top = contextMenu.y + margin + 12;
      }
      top = Math.max(margin, Math.min(Math.max(margin, vh - h - margin), top));

      setPos({ left, top });
    };

    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, [contextMenu]);

  if (!contextMenu || !contextMenu.isOpen) return null;

  const { trackId, clipId } = contextMenu;

  const handleSelect = () => {
    setSelectedClipId(clipId);
    useAudioStudioStore.getState().setActiveTrackId(trackId);
    closeContextMenu();
  };

  const handleCopy = () => {
    setSelectedClipId(clipId);
    useAudioStudioStore.getState().setActiveTrackId(trackId);
    copyClip();
    closeContextMenu();
  };

  const handleSplit = () => {
    splitClip(trackId, clipId, currentTimeSec);
    closeContextMenu();
  };

  const handlePaste = () => {
    pasteClip(trackId, currentTimeSec);
    closeContextMenu();
  };

  const handleDelete = () => {
    deleteClip(trackId, clipId);
    closeContextMenu();
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-50 flex items-center gap-0.5 p-1 rounded-full bg-zinc-950/95 border border-cyan/40 shadow-2xl shadow-cyan/20 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100 max-w-[calc(100vw-1rem)] overflow-x-auto no-scrollbar"
      style={{
        // Antes de medir se mantiene invisible para evitar parpadeo en la esquina
        left: `${pos?.left ?? 0}px`,
        top: `${pos?.top ?? 0}px`,
        visibility: pos ? 'visible' : 'hidden',
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Seleccionar */}
      <button
        type="button"
        onClick={handleSelect}
        className="h-8 px-2.5 rounded-full flex items-center gap-1 text-[11px] font-bold text-slate-200 hover:text-white hover:bg-white/10 transition-colors"
        title="Seleccionar clip"
      >
        <Check className="w-3.5 h-3.5 text-cyan" />
        <span>Elegir</span>
      </button>

      {/* Copiar */}
      <button
        type="button"
        onClick={handleCopy}
        className="h-8 px-2.5 rounded-full flex items-center gap-1 text-[11px] font-bold text-slate-200 hover:text-white hover:bg-white/10 transition-colors"
        title="Copiar clip al portapapeles"
      >
        <Copy className="w-3.5 h-3.5 text-amber-400" />
        <span>Copiar</span>
      </button>

      {/* Dividir (Split) */}
      <button
        type="button"
        onClick={handleSplit}
        className="h-8 px-2.5 rounded-full flex items-center gap-1 text-[11px] font-bold text-slate-200 hover:text-white hover:bg-white/10 transition-colors"
        title="Dividir en el cabezal de reproducción"
      >
        <Scissors className="w-3.5 h-3.5 text-mint" />
        <span>Dividir</span>
      </button>

      {/* Pegar */}
      <button
        type="button"
        onClick={handlePaste}
        className="h-8 px-2.5 rounded-full flex items-center gap-1 text-[11px] font-bold text-slate-200 hover:text-white hover:bg-white/10 transition-colors"
        title="Pegar clip"
      >
        <ClipboardPaste className="w-3.5 h-3.5 text-blue-400" />
        <span>Pegar</span>
      </button>

      {/* Eliminar */}
      <button
        type="button"
        onClick={handleDelete}
        className="h-8 px-2.5 rounded-full flex items-center gap-1 text-[11px] font-bold text-rose-300 hover:text-rose-100 hover:bg-rose-500/20 transition-colors"
        title="Eliminar clip"
      >
        <Trash2 className="w-3.5 h-3.5 text-rose-400" />
        <span>Borrar</span>
      </button>

      {/* Cerrar */}
      <button
        type="button"
        onClick={closeContextMenu}
        className="h-8 w-7 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10"
        title="Cerrar menú"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

