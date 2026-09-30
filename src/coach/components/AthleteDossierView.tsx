/**
 * AthleteDossierView.tsx — Ficha Deportiva Individual (Expediente Digital del Atleta)
 *
 * Muestra:
 *  - Identificación personal y deportiva
 *  - Categoría oficial y cuenta regresiva al próximo cambio
 *  - Lista de coreografías asociadas y sus versiones (.coreo)
 *  - Botón para abrir el editor oficial de SkateCoreo (Pista 2D)
 *  - Acciones para descargar, compartir por Web Share API y sincronizar a la nube
 */

import React, { useState } from 'react';
import {
  User,
  ArrowLeft,
  Calendar,
  Award,
  Shield,
  Phone,
  Edit,
  Plus,
  Compass,
  Download,
  Share2,
  CloudUpload,
  Music,
  Trash2,
  FolderSync,
  FileCheck,
} from 'lucide-react';
import { CoachAthlete, CoachChoreography, CoachChoreographyVersion } from '../types';
import { useCoachStore } from '../store/useCoachStore';
import { ShareCoreoModal } from './ShareCoreoModal';
import { AthleteEditModal } from './AthleteEditModal';
import { AthleteEvaluationsList } from './technical/AthleteEvaluationsList';
import { coachDb } from '../services/coachDb';

interface AthleteDossierViewProps {
  athlete: CoachAthlete;
  onBack: () => void;
  onOpenChoreographyInEditor: (choreo: CoachChoreography, version: CoachChoreographyVersion) => void;
  onCreateNewChoreography: (athlete: CoachAthlete) => void;
}

export const AthleteDossierView: React.FC<AthleteDossierViewProps> = ({
  athlete,
  onBack,
  onOpenChoreographyInEditor,
  onCreateNewChoreography,
}) => {
  const {
    athleteChoreographies,
    athleteEvaluations,
    startEvaluationForAthlete,
    createOrUpdateAthlete,
    syncAthleteToCloud,
    deleteChoreography,
    storageSummary,
  } = useCoachStore();

  const [activeSubTab, setActiveSubTab] = useState<'choreographies' | 'evaluations'>('evaluations');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [sharingVersion, setSharingVersion] = useState<{
    fileName: string;
    blobId: string;
    choreoTitle: string;
  } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  const formatDuration = (ms: number): string => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')} min`;
  };

  const handleSyncToCloud = async () => {
    setIsSyncing(true);
    setStatusMessage(null);
    try {
      const res = await syncAthleteToCloud(athlete.id);
      setStatusMessage({ text: res.message, isError: !res.success });
    } catch (e: any) {
      setStatusMessage({ text: 'Error al sincronizar: ' + e.message, isError: true });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteChoreo = async (id: string, title: string) => {
    if (window.confirm(`¿Estás seguro de eliminar la coreografía "${title}" de la ficha de ${athlete.name}?`)) {
      await deleteChoreography(id);
    }
  };

  const handleDownloadCoreoDirect = async (blobId: string, fileName: string) => {
    const file = await coachDb.getBinaryFile(blobId);
    if (!file || !file.blob) {
      alert('Archivo no encontrado en almacenamiento local.');
      return;
    }
    const url = URL.createObjectURL(file.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-fade-in text-white pb-12">
      {/* Barra superior de navegación */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/10">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/10 text-slate-300 hover:text-white text-xs font-semibold transition-all interactive-tap"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver al Directorio</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSyncToCloud}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan/15 hover:bg-cyan/25 text-cyan border border-cyan/30 text-xs font-bold transition-all interactive-tap shadow-soft-elevation disabled:opacity-50"
            title="Sube la ficha completa con sus coreografías a tu nube personal"
          >
            <CloudUpload className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Sincronizando...' : 'Subir Ficha a mi Nube'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsEditModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/10 text-slate-200 text-xs font-semibold transition-all interactive-tap"
          >
            <Edit className="w-3.5 h-3.5 text-cyan" />
            <span>Editar Ficha</span>
          </button>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-3 rounded-2xl border text-xs flex items-center justify-between ${
            statusMessage.isError
              ? 'bg-red-950/80 border-red-500/40 text-red-200'
              : 'bg-mint/15 border-mint/30 text-mint'
          }`}
        >
          <span>{statusMessage.text}</span>
          <button onClick={() => setStatusMessage(null)} className="p-1 hover:opacity-75">✕</button>
        </div>
      )}

      {/* Tarjeta de Expediente de Atleta */}
      <div className="bg-neon-surface border border-white/10 rounded-3xl p-6 shadow-soft-elevation space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
              {athlete.photoDataUrl ? (
                <img src={athlete.photoDataUrl} alt={athlete.name} className="w-full h-full object-cover" />
              ) : (
                <User className="w-10 h-10 text-slate-500" />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-white">{athlete.name}</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-400/20 text-amber-300 border border-amber-400/30">
                  {athlete.category}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {athlete.club || 'Sin Club asignado'} {athlete.trainerName && `• Entrenador: ${athlete.trainerName}`}
              </p>
              <div className="flex items-center gap-2 mt-1.5 text-[11px] text-slate-400">
                <span className="font-mono text-cyan">{athlete.age} años</span>
                <span>• Nacimiento: {athlete.birthDate || 'No registrada'}</span>
                <span>• Nivel: <strong className="text-slate-300">{athlete.level}</strong></span>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => startEvaluationForAthlete(athlete)}
              className="w-full sm:w-auto flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-cyan text-neon-canvas font-black text-xs shadow-glow-cyan hover:bg-cyan/90 transition-all interactive-tap"
            >
              <Award className="w-4 h-4 stroke-[2.5]" />
              <span>Evaluar Rutina</span>
            </button>

            <button
              type="button"
              onClick={() => onCreateNewChoreography(athlete)}
              className="w-full sm:w-auto flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-white/5 hover:bg-white/10 text-white font-bold text-xs transition-all interactive-tap border border-white/10"
            >
              <Compass className="w-4 h-4 stroke-[2.5]" />
              <span>Nueva Coreografía</span>
            </button>
          </div>
        </div>

        {/* Rejilla de Parámetros Deportivos */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5">
            <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1 mb-1">
              <Award className="w-3 h-3 text-cyan" />
              Categoría Oficial
            </div>
            <div className="font-mono font-bold text-amber-300 text-sm">{athlete.category}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {athlete.categoryAuto ? 'Cálculo automático' : 'Ajustada manualmente'}
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5">
            <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1 mb-1">
              <Shield className="w-3 h-3 text-mint" />
              Eficiencia RollArt
            </div>
            <div className="font-mono font-bold text-white text-sm">{athlete.eficiencia || 'BÁSICA'}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Reglamento 2026</div>
          </div>

          <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5">
            <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1 mb-1">
              <Calendar className="w-3 h-3 text-coral" />
              Especialidad
            </div>
            <div className="font-bold text-white text-sm">{athlete.specialty || 'Libre'}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">{athlete.level || 'Federado'}</div>
          </div>

          <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5">
            <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1 mb-1">
              <FolderSync className="w-3 h-3 text-cyan" />
              Estado en Nube
            </div>
            <div className="font-bold text-xs capitalize text-slate-200">
              {athlete.syncState === 'synced' ? (
                <span className="text-mint flex items-center gap-1"><FileCheck className="w-3 h-3" /> Sincronizado</span>
              ) : athlete.syncState === 'pending_upload' ? (
                <span className="text-amber-400">Pendiente de subir</span>
              ) : athlete.syncState === 'error' ? (
                <span className="text-red-400">Error sync</span>
              ) : (
                <span className="text-slate-400">Guardado local</span>
              )}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {storageSummary?.activeProvider === 'local' ? 'Sin nube conectada' : storageSummary?.activeProvider}
            </div>
          </div>
        </div>

        {/* Observaciones y Contacto */}
        {(athlete.technicalNotes || athlete.contactInfo?.guardianName || athlete.contactInfo?.phone) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-white/5 text-xs">
            {athlete.technicalNotes && (
              <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Observaciones Técnicas y Deportivas
                </span>
                <p className="text-slate-300 leading-relaxed text-[11px] whitespace-pre-wrap">
                  {athlete.technicalNotes}
                </p>
              </div>
            )}

            {(athlete.contactInfo?.guardianName || athlete.contactInfo?.phone || athlete.contactInfo?.email) && (
              <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <Phone className="w-3 h-3 text-cyan" /> Contacto del Representante
                </span>
                <div className="text-[11px] text-slate-300 space-y-1">
                  {athlete.contactInfo.guardianName && <div>Tutor: <strong className="text-white">{athlete.contactInfo.guardianName}</strong></div>}
                  {athlete.contactInfo.phone && <div>Teléfono: <span className="font-mono text-cyan">{athlete.contactInfo.phone}</span></div>}
                  {athlete.contactInfo.email && <div>Correo: <span className="text-slate-400">{athlete.contactInfo.email}</span></div>}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Selector de Pestañas del Expediente: Evaluaciones vs Coreografías */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-3">
        <button
          type="button"
          onClick={() => setActiveSubTab('evaluations')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black transition-all interactive-tap ${
            activeSubTab === 'evaluations'
              ? 'bg-cyan text-neon-canvas shadow-glow-cyan'
              : 'bg-white/5 text-slate-300 hover:text-white'
          }`}
        >
          <Award className="w-4 h-4" />
          <span>Puntajes y Evaluaciones ({athleteEvaluations.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('choreographies')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black transition-all interactive-tap ${
            activeSubTab === 'choreographies'
              ? 'bg-cyan text-neon-canvas shadow-glow-cyan'
              : 'bg-white/5 text-slate-300 hover:text-white'
          }`}
        >
          <Compass className="w-4 h-4" />
          <span>Coreografías y Archivos .coreo ({athleteChoreographies.length})</span>
        </button>
      </div>

      {activeSubTab === 'evaluations' ? (
        <AthleteEvaluationsList
          athlete={athlete}
          onStartNewEvaluation={() => startEvaluationForAthlete(athlete)}
        />
      ) : (
        /* Sección de Coreografías y Archivos .coreo */
        <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <Compass className="w-5 h-5 text-cyan" />
              Coreografías y Archivos .coreo ({athleteChoreographies.length})
            </h3>
            <p className="text-xs text-slate-400">
              Expediente técnico con versiones de rutinas, música y nodos de la pista 2D.
            </p>
          </div>

          <button
            type="button"
            onClick={() => onCreateNewChoreography(athlete)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-cyan/15 hover:bg-cyan/25 text-cyan border border-cyan/30 text-xs font-bold transition-all interactive-tap"
          >
            <Plus className="w-4 h-4 text-cyan" />
            <span>Nueva Coreografía</span>
          </button>
        </div>

        {athleteChoreographies.length === 0 ? (
          <div className="p-10 rounded-3xl bg-neon-surface border border-white/5 text-center space-y-3">
            <p className="text-xs text-slate-400">
              {athlete.name} aún no tiene coreografías registradas en su ficha.
            </p>
            <button
              type="button"
              onClick={() => onCreateNewChoreography(athlete)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan text-neon-canvas font-black text-xs shadow-glow-cyan hover:bg-cyan/90 transition-all"
            >
              <Compass className="w-4 h-4" />
              <span>Diseñar la primera coreografía</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {athleteChoreographies.map((choreo) => {
              const latestVersion = choreo.versions[choreo.versions.length - 1];

              return (
                <div
                  key={choreo.id}
                  className="bg-neon-surface border border-white/10 rounded-3xl p-5 shadow-soft-elevation space-y-4 hover:border-cyan/30 transition-all flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-cyan">
                          {choreo.programType} · {choreo.year}
                        </span>
                        <h4 className="text-base font-bold text-white tracking-tight">{choreo.title}</h4>
                      </div>

                      <div className="flex items-center gap-1">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white/10 text-slate-200">
                          v{choreo.currentVersion}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteChoreo(choreo.id, choreo.title)}
                          className="p-1 text-slate-500 hover:text-red-400 rounded-lg transition-colors"
                          title="Eliminar coreografía"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 py-2 px-3 rounded-2xl bg-white/[0.02] border border-white/5 text-[11px] font-mono text-slate-300">
                      <div>
                        <span className="text-slate-500 block text-[9px]">Duración</span>
                        <span className="font-bold text-white">{formatDuration(choreo.durationMs)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[9px]">Puntos Pista</span>
                        <span className="font-bold text-cyan">{choreo.pointsCount}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[9px]">Categoría Creación</span>
                        <span className="font-bold text-amber-300 truncate block">{choreo.category}</span>
                      </div>
                    </div>

                    {choreo.hasAudio && (
                      <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                        <Music className="w-3.5 h-3.5 text-mint" />
                        <span className="truncate">{choreo.audioFileName || 'Pista musical vinculada'}</span>
                      </div>
                    )}

                    {/* Historial de versiones */}
                    <div className="pt-2 border-t border-white/5 space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Versiones disponibles ({choreo.versions.length})
                      </span>
                      <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
                        {choreo.versions.map((ver) => (
                          <div
                            key={ver.versionNumber}
                            className="flex items-center justify-between py-1 px-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] text-[11px]"
                          >
                            <span className="font-mono text-cyan font-bold">{ver.versionLabel}</span>
                            <span className="text-slate-400 truncate max-w-[150px]">{ver.fileName}</span>
                            <span className="text-[10px] text-slate-500">
                              {(ver.coreoBlobSize / 1024).toFixed(0)} KB
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Acciones principales de la coreografía */}
                  <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-white/5">
                    <button
                      type="button"
                      onClick={() => onOpenChoreographyInEditor(choreo, latestVersion)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-cyan text-neon-canvas font-black text-xs shadow-glow-cyan hover:bg-cyan/90 transition-all interactive-tap"
                    >
                      <Compass className="w-4 h-4 stroke-[2]" />
                      <span>Abrir en Editor SkateCoreo</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        handleDownloadCoreoDirect(latestVersion.coreoBlobId, latestVersion.fileName)
                      }
                      className="p-2.5 rounded-xl bg-white/[0.06] hover:bg-white/10 text-slate-200 transition-all interactive-tap"
                      title="Descargar archivo .coreo"
                    >
                      <Download className="w-4 h-4 text-cyan" />
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setSharingVersion({
                          fileName: latestVersion.fileName,
                          blobId: latestVersion.coreoBlobId,
                          choreoTitle: choreo.title,
                        })
                      }
                      className="p-2.5 rounded-xl bg-white/[0.06] hover:bg-white/10 text-slate-200 transition-all interactive-tap"
                      title="Compartir mediante Web Share API"
                    >
                      <Share2 className="w-4 h-4 text-mint" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* Modal de Compartir */}
      {sharingVersion && (
        <ShareCoreoModal
          isOpen={Boolean(sharingVersion)}
          onClose={() => setSharingVersion(null)}
          fileName={sharingVersion.fileName}
          blobId={sharingVersion.blobId}
          athleteName={athlete.name}
          choreographyTitle={sharingVersion.choreoTitle}
        />
      )}

      {/* Modal de Edición de Atleta */}
      <AthleteEditModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        initialData={athlete}
        onSave={async (updated) => {
          await createOrUpdateAthlete(updated);
        }}
      />
    </div>
  );
};
