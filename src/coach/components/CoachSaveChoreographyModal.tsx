/**
 * CoachSaveChoreographyModal.tsx — Guardar Coreografía en la Ficha del Atleta
 *
 * Se abre desde la Pista 2D para:
 *  - Asociar la coreografía terminada al expediente del atleta seleccionado
 *  - Proponer automáticamente un nombre profesional: [Nombre_Atleta]_[Tipo]_[Año]
 *  - Versionar ordenadamente (v1, v2, v3) sin sobrescrituras destructivas
 *  - Empaquetar y guardar el archivo .coreo en almacenamiento local (IndexedDB)
 */

import React, { useState, useEffect } from 'react';
import { Compass, User, AlertCircle, X } from 'lucide-react';
import { useCoachStore } from '../store/useCoachStore';
import { CoachAthlete } from '../types';
import { ChoreographyPathPoint } from '../../types/choreography';
import { exportCoreoProject } from '../../services/coreoPackage';
import { Button } from '../../components/ui';

interface CoachSaveChoreographyModalProps {
  isOpen: boolean;
  onClose: () => void;
  points: ChoreographyPathPoint[];
  audioBlob: Blob | null;
  audioFileName: string | null;
  bpm?: number;
  beatsPerMeasure?: number;
  subdivision?: number;
  playbackRate?: number;
  initialAthleteId?: string | null;
  initialTitle?: string;
  onSavedSuccess?: (athlete: CoachAthlete) => void;
}

export const CoachSaveChoreographyModal: React.FC<CoachSaveChoreographyModalProps> = ({
  isOpen,
  onClose,
  points,
  audioBlob,
  audioFileName,
  bpm,
  beatsPerMeasure,
  subdivision = 1,
  playbackRate = 1.0,
  initialAthleteId,
  initialTitle,
  onSavedSuccess,
}) => {
  const { athletes, saveChoreographyToDossier } = useCoachStore();

  const [selectedAthleteId, setSelectedAthleteId] = useState<string>(initialAthleteId || '');
  const [title, setTitle] = useState(initialTitle || 'Programa Libre 2026');
  const [programType, setProgramType] = useState('Libre');
  const [year] = useState(new Date().getFullYear());
  const [versionNotes, setVersionNotes] = useState('');
  const [customFileName, setCustomFileName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialAthleteId) setSelectedAthleteId(initialAthleteId);
    if (initialTitle) setTitle(initialTitle);
  }, [initialAthleteId, initialTitle, isOpen]);

  // Si no hay atleta seleccionado y hay atletas, preseleccionar el primero
  useEffect(() => {
    if (!selectedAthleteId && athletes.length > 0) {
      setSelectedAthleteId(athletes[0].id);
    }
  }, [athletes, selectedAthleteId]);

  const targetAthlete = athletes.find((a) => a.id === selectedAthleteId);

  // Sugerencia automática de nombre: [Nombre_Atleta]_[Tipo]_[Año].coreo
  const defaultSuggestedName = React.useMemo(() => {
    const athletePart = (targetAthlete?.name || 'Atleta').replace(/[^a-zA-Z0-9]/g, '_');
    const titlePart = (title || 'Programa').replace(/[^a-zA-Z0-9]/g, '_');
    return `${athletePart}_${titlePart}_${year}.coreo`;
  }, [targetAthlete, title, year]);

  useEffect(() => {
    if (!customFileName) {
      setCustomFileName(defaultSuggestedName);
    }
  }, [defaultSuggestedName]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetAthlete) {
      setError('Debes seleccionar un atleta para asociar la coreografía.');
      return;
    }
    if (!title.trim()) {
      setError('El título de la coreografía es obligatorio.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // 1. Empaquetar proyecto .coreo completo con JSZip
      const coreoBlob = await exportCoreoProject(
        title.trim(),
        targetAthlete.category,
        targetAthlete.gender === 'male' ? 'male' : 'female',
        points,
        audioBlob,
        audioFileName,
        bpm,
        beatsPerMeasure,
        playbackRate,
        subdivision
      );

      // Duración calculada a partir de los puntos o por defecto
      const durationMs = points.length > 0 ? points[points.length - 1].time_ms + 5000 : 120000;

      // 2. Guardar en expediente del atleta en IndexedDB
      await saveChoreographyToDossier({
        athleteId: targetAthlete.id,
        title: title.trim(),
        programType,
        year,
        durationMs,
        pointsCount: points.length,
        hasAudio: Boolean(audioBlob),
        audioFileName: audioFileName || undefined,
        coreoBlob,
        versionNotes: versionNotes.trim() || undefined,
      });

      if (onSavedSuccess) {
        onSavedSuccess(targetAthlete);
      }
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Error al guardar coreografía en la ficha.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in text-white">
      <form
        onSubmit={handleSave}
        className="w-full max-w-lg bg-surface-2 border border-white/[0.08] rounded-2xl p-6 shadow-elevation-2 space-y-5"
      >
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-2xl bg-[#0f62fe]/15 text-[#78a9ff] ring-1 ring-[#0f62fe]/30">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black tracking-tight text-white">
                Guardar en Ficha de Atleta
              </h3>
              <p className="text-[11px] text-slate-400">
                Empaqueta el proyecto .coreo y lo asocia al expediente del patinador.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-950/80 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-4 text-xs">
          {/* Selector de Atleta */}
          <div>
            <label className="block text-slate-400 font-bold mb-1 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-[#78a9ff]" />
              Atleta Asignado:
            </label>
            {athletes.length === 0 ? (
              <div className="p-3 rounded-xl bg-surface-1 border border-amber-400/30 text-amber-300 text-[11px]">
                No tienes atletas registrados en el panel. Por favor crea uno primero en el Panel de Entrenadores.
              </div>
            ) : (
              <select
                value={selectedAthleteId}
                onChange={(e) => setSelectedAthleteId(e.target.value)}
                className="w-full bg-surface-1 border border-white/10 rounded-xl px-3 py-2.5 text-white outline-none focus:border-[#0f62fe] font-semibold text-xs"
              >
                {athletes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.category} {a.club ? `(${a.club})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Título y Tipo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 font-bold mb-1">Título de la Coreografía:</label>
              <input
                type="text"
                required
                placeholder="ej. Programa Libre 2026"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-surface-1 border border-white/10 rounded-xl px-3 py-2 text-white outline-none focus:border-[#0f62fe] text-xs font-semibold"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-bold mb-1">Tipo de Rutina:</label>
              <select
                value={programType}
                onChange={(e) => setProgramType(e.target.value)}
                className="w-full bg-surface-1 border border-white/10 rounded-xl px-3 py-2 text-white outline-none focus:border-[#0f62fe] text-xs"
              >
                <option value="Libre">Programa Libre</option>
                <option value="Corto">Programa Corto</option>
                <option value="Danza">Danza</option>
                <option value="Style Dance">Style Dance</option>
                <option value="Free Dance">Free Dance</option>
                <option value="Exhibición">Exhibición</option>
              </select>
            </div>
          </div>

          {/* Nombre de Archivo Sugerido */}
          <div>
            <label className="block text-slate-400 font-bold mb-1">Nombre sugerido del archivo .coreo:</label>
            <input
              type="text"
              required
              value={customFileName}
              onChange={(e) => setCustomFileName(e.target.value)}
              className="w-full bg-surface-1 border border-white/10 rounded-xl px-3 py-2 text-[#78a9ff] font-mono outline-none focus:border-[#0f62fe] text-xs font-bold"
            />
            <span className="text-[10px] text-slate-500 mt-1 block">
              Estructurado automáticamente con Atleta + Título + Año para evitar colisiones.
            </span>
          </div>

          {/* Notas de versión */}
          <div>
            <label className="block text-slate-400 font-medium mb-1">Notas de la versión (opcional):</label>
            <input
              type="text"
              placeholder="ej. Ajuste de curva en el segundo salto y entrada en biellmann"
              value={versionNotes}
              onChange={(e) => setVersionNotes(e.target.value)}
              className="w-full bg-surface-1 border border-white/10 rounded-xl px-3 py-2 text-white outline-none focus:border-[#0f62fe] text-xs"
            />
          </div>

          <div className="p-3 rounded-2xl bg-surface-1 border border-white/5 text-[11px] text-slate-300 space-y-1">
            <div className="flex items-center justify-between">
              <span>Nodos en pista:</span>
              <strong className="text-[#78a9ff] font-mono">{points.length} puntos</strong>
            </div>
            <div className="flex items-center justify-between">
              <span>Pista de audio:</span>
              <strong className="text-mint truncate max-w-[200px]">{audioFileName || 'Sin audio'}</strong>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="cobalt"
            size="md"
            disabled={isSaving || !targetAthlete}
          >
            {isSaving ? 'Guardando...' : 'Guardar en Expediente'}
          </Button>
        </div>
      </form>
    </div>
  );
};
