import React from 'react';
import { RotateCcw, Sparkles, Clock, Music, Layers } from 'lucide-react';
import { SessionSnapshot } from '../services/sessionLifecycle';

interface SessionRecoveryModalProps {
  isOpen: boolean;
  snapshot: SessionSnapshot | null;
  onContinueSession: () => void;
  onStartCleanSession: () => void;
}

export const SessionRecoveryModal: React.FC<SessionRecoveryModalProps> = ({
  isOpen,
  snapshot,
  onContinueSession,
  onStartCleanSession,
}) => {
  if (!isOpen || !snapshot) return null;

  const dateStr = new Date(snapshot.savedAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div 
        className="w-full max-w-md bg-charcoal border border-white/15 rounded-2xl shadow-2xl p-6 text-white select-none space-y-5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recovery-modal-title"
      >
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-cyan/15 text-cyan flex items-center justify-center shrink-0 border border-cyan/30">
            <RotateCcw className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h2 id="recovery-modal-title" className="text-base font-bold tracking-tight text-white">
              Sesión anterior detectada
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Existe trabajo no guardado de una sesión previa en este dispositivo. Puedes continuar donde lo dejaste o comenzar desde cero.
            </p>
          </div>
        </div>

        {/* Resumen del trabajo encontrado */}
        <div className="bg-black/40 border border-white/10 rounded-xl p-3.5 space-y-2 text-xs">
          <div className="flex items-center justify-between text-slate-300">
            <span className="flex items-center gap-1.5 text-slate-400">
              <Clock className="w-3.5 h-3.5 text-slate-400" /> Fecha y hora
            </span>
            <span className="font-mono">{dateStr}</span>
          </div>

          {snapshot.pointsCount > 0 && (
            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-1.5 text-slate-400">
                <Layers className="w-3.5 h-3.5 text-cyan" /> Nodos de pista
              </span>
              <span className="font-semibold text-cyan">{snapshot.pointsCount} nodos</span>
            </div>
          )}

          {snapshot.hasAudio && (
            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-1.5 text-slate-400">
                <Music className="w-3.5 h-3.5 text-mint" /> Pista musical
              </span>
              <span className="truncate max-w-[180px] font-mono text-mint" title={snapshot.audioFileName || ''}>
                {snapshot.audioFileName || 'Pista de audio'}
              </span>
            </div>
          )}
        </div>

        {/* Acciones */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            onClick={onStartCleanSession}
            className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 active:bg-white/15 border border-white/10 transition-all flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4 text-slate-400" />
            Iniciar sesión limpia
          </button>

          <button
            type="button"
            onClick={onContinueSession}
            className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-black bg-cyan hover:bg-cyan/90 active:scale-[0.98] shadow-lg shadow-cyan/20 transition-all flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Continuar sesión
          </button>
        </div>
      </div>
    </div>
  );
};
