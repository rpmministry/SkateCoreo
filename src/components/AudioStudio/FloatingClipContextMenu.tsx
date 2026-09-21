import React, { useEffect, useRef } from 'react';
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

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeContextMenu();
      }
    };
    document.addEventListener('pointerdown', handleOutsideClick);
    return () => document.removeEventListener('pointerdown', handleOutsideClick);
  }, [closeContextMenu]);

  if (!contextMenu || !contextMenu.isOpen) return null;

  const { x, y, trackId, clipId } = contextMenu;

  // Ajustar posición para no desbordar viewport en landscape (altura típica 360px-420px)
  const menuWidth = 240;
  const menuHeight = 44;
  const clampedX = Math.max(10, Math.min(window.innerWidth - menuWidth - 10, x - menuWidth / 2));
  const clampedY = Math.max(45, Math.min(window.innerHeight - menuHeight - 15, y - menuHeight - 12));

  const handleSelect = () => {
    setSelectedClipId(clipId);
    closeContextMenu();
  };

  const handleCopy = () => {
    setSelectedClipId(clipId);
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
      className="fixed z-50 flex items-center gap-0.5 p-1 rounded-full bg-zinc-900/95 border border-white/20 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100"
      style={{
        left: `${clampedX}px`,
        top: `${clampedY}px`,
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

