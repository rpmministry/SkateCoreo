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
import { Badge, Tabs, Button } from '../../components/ui';

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
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/[0.07]">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-1 hover:bg-surface-2 border border-white/[0.08] text-slate-300 hover:text-white text-xs font-medium transition-all"
        >
          <ArrowLeft className="w-4 h-4 text-slate-400" />
          <span>Volver al Directorio</span>
        </button>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSyncToCloud}
            disabled={isSyncing}
            icon={<CloudUpload className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />}
            title="Sube la ficha completa con sus coreografías a tu nube personal"
          >
            {isSyncing ? 'Sincronizando...' : 'Subir Ficha a mi Nube'}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditModalOpen(true)}
            icon={<Edit className="w-3.5 h-3.5 text-slate-400" />}
          >
            Editar Ficha
          </Button>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
            statusMessage.isError
              ? 'bg-rose-500/10 border-rose-500/25 text-rose-300'
              : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
          }`}
        >
          <span>{statusMessage.text}</span>
          <button onClick={() => setStatusMessage(null)} className="p-1 hover:opacity-75">✕</button>
        </div>
      )}

      {/* Tarjeta de Expediente de Atleta */}
      <div className="bg-surface-1 border border-white/[0.07] rounded-2xl p-6 shadow-subtle space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-2xl bg-surface-2 border border-white/[0.08] flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
              {athlete.photoDataUrl ? (
                <img src={athlete.photoDataUrl} alt={athlete.name} className="w-full h-full object-cover" />
              ) : (
                <User className="w-10 h-10 text-slate-500 stroke-[1.5]" />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight text-white">{athlete.name}</h2>
                <Badge variant="coach" size="sm">
                  {athlete.category}
                </Badge>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {athlete.club || 'Sin Club asignado'} {athlete.trainerName && `• Entrenador: ${athlete.trainerName}`}
              </p>
              <div className="flex items-center gap-2 mt-1.5 text-[11px] text-slate-400">
                <span className="font-mono text-coach-rose font-medium">{athlete.age} años</span>
                <span>• Nacimiento: {athlete.birthDate || 'No registrada'}</span>
                <span>• Nivel: <strong className="text-slate-300">{athlete.level}</strong></span>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
            <Button
              variant="coach"
              size="md"
              onClick={() => startEvaluationForAthlete(athlete)}
              icon={<Award className="w-4 h-4 stroke-[2]" />}
            >
              Evaluar Rutina
            </Button>

            <Button
              variant="outline"
              size="md"
              onClick={() => onCreateNewChoreography(athlete)}
              icon={<Compass className="w-4 h-4 stroke-[2]" />}
            >
              Nueva Coreografía
            </Button>
          </div>
        </div>

        {/* Rejilla de Parámetros Deportivos */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-surface-2/60 border border-white/[0.06]">
            <div className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1.5 mb-1 tracking-wider">
              <Award className="w-3.5 h-3.5 text-coach-rose" />
              Categoría Oficial
            </div>
            <div className="font-mono font-bold text-amber-300 text-sm">{athlete.category}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {athlete.categoryAuto ? 'Cálculo automático' : 'Ajustada manualmente'}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-surface-2/60 border border-white/[0.06]">
            <div className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1.5 mb-1 tracking-wider">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              Eficiencia RollArt
            </div>
            <div className="font-mono font-bold text-white text-sm">{athlete.eficiencia || 'BÁSICA'}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Reglamento 2026</div>
          </div>

          <div className="p-3.5 rounded-xl bg-surface-2/60 border border-white/[0.06]">
            <div className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1.5 mb-1 tracking-wider">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              Especialidad
            </div>
            <div className="font-bold text-white text-sm">{athlete.specialty || 'Libre'}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">{athlete.level || 'Federado'}</div>
          </div>

          <div className="p-3.5 rounded-xl bg-surface-2/60 border border-white/[0.06]">
            <div className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1.5 mb-1 tracking-wider">
              <FolderSync className="w-3.5 h-3.5 text-ice-primary" />
              Estado en Nube
            </div>
            <div className="font-medium text-xs capitalize text-slate-200">
              {athlete.syncState === 'synced' ? (
                <span className="text-emerald-400 flex items-center gap-1"><FileCheck className="w-3.5 h-3.5" /> Sincronizado</span>
              ) : athlete.syncState === 'pending_upload' ? (
                <span className="text-amber-400">Pendiente de subir</span>
              ) : athlete.syncState === 'error' ? (
                <span className="text-rose-400">Error sync</span>
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-white/[0.06] text-xs">
            {athlete.technicalNotes && (
              <div className="p-3.5 rounded-xl bg-surface-2/40 border border-white/[0.05] space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Observaciones Técnicas y Deportivas
                </span>
                <p className="text-slate-300 leading-relaxed text-[11px] whitespace-pre-wrap">
                  {athlete.technicalNotes}
                </p>
              </div>
            )}

            {(athlete.contactInfo?.guardianName || athlete.contactInfo?.phone || athlete.contactInfo?.email) && (
              <div className="p-3.5 rounded-xl bg-surface-2/40 border border-white/[0.05] space-y-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-slate-400" /> Contacto del Representante
                </span>
                <div className="text-[11px] text-slate-300 space-y-1">
                  {athlete.contactInfo.guardianName && <div>Tutor: <strong className="text-white font-medium">{athlete.contactInfo.guardianName}</strong></div>}
                  {athlete.contactInfo.phone && <div>Teléfono: <span className="font-mono text-slate-300">{athlete.contactInfo.phone}</span></div>}
                  {athlete.contactInfo.email && <div>Correo: <span className="text-slate-400">{athlete.contactInfo.email}</span></div>}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Selector de Pestañas del Expediente: Evaluaciones vs Coreografías */}
      <div className="pb-3 border-b border-white/[0.07]">
        <Tabs
          tabs={[
            {
              id: 'evaluations',
              label: 'Puntajes y Evaluaciones',
              icon: <Award className="w-4 h-4" />,
              badge: athleteEvaluations.length,
            },
            {
              id: 'choreographies',
              label: 'Coreografías y Archivos .coreo',
              icon: <Compass className="w-4 h-4" />,
              badge: athleteChoreographies.length,
            },
          ]}
          activeTab={activeSubTab}
          onChange={(id) => setActiveSubTab(id as 'choreographies' | 'evaluations')}
        />
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
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Compass className="w-4 h-4 text-coach-rose" />
              Coreografías y Archivos .coreo ({athleteChoreographies.length})
            </h3>
            <p className="text-xs text-slate-400">
              Expediente técnico con versiones de rutinas, música y nodos de la pista 2D.
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onCreateNewChoreography(athlete)}
            icon={<Plus className="w-4 h-4" />}
          >
            Nueva Coreografía
          </Button>
        </div>

        {athleteChoreographies.length === 0 ? (
          <div className="p-8 rounded-2xl bg-surface-1 border border-white/[0.07] text-center space-y-3 shadow-subtle">
            <p className="text-xs text-slate-400">
              {athlete.name} aún no tiene coreografías registradas en su ficha.
            </p>
            <Button
              variant="coach"
              size="sm"
              onClick={() => onCreateNewChoreography(athlete)}
              icon={<Compass className="w-4 h-4" />}
            >
              Diseñar la primera coreografía
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {athleteChoreographies.map((choreo) => {
              const latestVersion = choreo.versions[choreo.versions.length - 1];

              return (
                <div
                  key={choreo.id}
                  className="bg-surface-1 border border-white/[0.07] hover:border-white/[0.14] rounded-2xl p-5 shadow-subtle space-y-4 transition-all flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-coach-rose">
                          {choreo.programType} · {choreo.year}
                        </span>
                        <h4 className="text-base font-bold text-white tracking-tight">{choreo.title}</h4>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-medium bg-surface-2 border border-white/[0.07] text-slate-300">
                          v{choreo.currentVersion}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteChoreo(choreo.id, choreo.title)}
                          className="p-1 text-slate-400 hover:text-rose-400 rounded-lg transition-colors"
                          title="Eliminar coreografía"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 py-2 px-3 rounded-xl bg-surface-2/60 border border-white/[0.06] text-[11px] font-mono text-slate-300">
                      <div>
                        <span className="text-slate-500 block text-[9px] uppercase tracking-wider">Duración</span>
                        <span className="font-semibold text-white">{formatDuration(choreo.durationMs)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[9px] uppercase tracking-wider">Puntos Pista</span>
                        <span className="font-semibold text-coach-rose">{choreo.pointsCount}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[9px] uppercase tracking-wider">Categoría</span>
                        <span className="font-semibold text-amber-300 truncate block">{choreo.category}</span>
                      </div>
                    </div>

                    {choreo.hasAudio && (
                      <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                        <Music className="w-3.5 h-3.5 text-studio-mint" />
                        <span className="truncate">{choreo.audioFileName || 'Pista musical vinculada'}</span>
                      </div>
                    )}

                    {/* Historial de versiones */}
                    <div className="pt-2 border-t border-white/[0.06] space-y-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">
                        Versiones disponibles ({choreo.versions.length})
                      </span>
                      <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
                        {choreo.versions.map((ver) => (
                          <div
                            key={ver.versionNumber}
                            className="flex items-center justify-between py-1 px-2.5 rounded-lg bg-surface-2/50 hover:bg-surface-2 border border-white/[0.04] text-[11px]"
                          >
                            <span className="font-mono text-coach-rose font-medium">{ver.versionLabel}</span>
                            <span className="text-slate-400 truncate max-w-[150px]">{ver.fileName}</span>
                            <span className="text-[10px] font-mono text-slate-500">
                              {(ver.coreoBlobSize / 1024).toFixed(0)} KB
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Acciones principales de la coreografía */}
                  <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-white/[0.06]">
                    <Button
                      variant="coach"
                      size="sm"
                      className="flex-1"
                      onClick={() => onOpenChoreographyInEditor(choreo, latestVersion)}
                      icon={<Compass className="w-4 h-4 stroke-[2]" />}
                    >
                      Abrir en Editor
                    </Button>

                    <button
                      type="button"
                      onClick={() =>
                        handleDownloadCoreoDirect(latestVersion.coreoBlobId, latestVersion.fileName)
                      }
                      className="p-2 rounded-xl bg-surface-2 hover:bg-surface-3 border border-white/[0.08] text-slate-300 hover:text-white transition-all"
                      title="Descargar archivo .coreo"
                    >
                      <Download className="w-4 h-4 text-slate-300" />
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
                      className="p-2 rounded-xl bg-surface-2 hover:bg-surface-3 border border-white/[0.08] text-slate-300 hover:text-white transition-all"
                      title="Compartir mediante Web Share API"
                    >
                      <Share2 className="w-4 h-4 text-studio-mint" />
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
