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

  if (!contextMenu || !contextMenu.isOpen) return null;

  const { x, y, trackId, clipId } = contextMenu;

  // Anclaje dinámico como barra de herramientas flotante compacta
  // Asegura que la onda de audio permanezca 100% visible sin obstrucción
  const menuWidth = 320;
  const menuHeight = 36;
  const clampedX = Math.max(12, Math.min(window.innerWidth - menuWidth - 12, x - menuWidth / 2));
  
  // Si hay espacio superior libre (>= 50px de margen respecto a la cabecera), flotar arriba del clip
  // De lo contrario, flotar debajo del clip (y + 64px) para no quedar tapado ni tapar la onda
  const hasSpaceAbove = y >= 52;
  const clampedY = hasSpaceAbove 
    ? Math.max(8, y - menuHeight - 8) 
    : Math.min(window.innerHeight - menuHeight - 10, y + 64);

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
      className="fixed z-50 flex items-center gap-0.5 p-1 rounded-full bg-zinc-950/95 border border-cyan/40 shadow-2xl shadow-cyan/20 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100"
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

