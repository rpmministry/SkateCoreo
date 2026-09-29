/**
 * CoachPortal.tsx — Módulo Principal del Panel de Entrenadores
 *
 * Módulo desacoplado e independiente con:
 *  - Navegación propia (Dashboard, Atletas, Ficha, Almacenamiento, Copias de Seguridad, Ajustes)
 *  - Expediente deportivo digital de cada patinadora/patinador
 *  - Vinculación directa con el editor existente de SkateCoreo (Pista 2D y Estudio de Audio)
 *  - Almacenamiento local-first + sincronización con Google Drive, OneDrive y Dropbox
 *  - Cero dependencias de Supabase Storage para archivos de atletas
 */

import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Users,
  FileText,
  HardDrive,
  Archive,
  Settings,
  ArrowLeft,
} from 'lucide-react';
import { useCoachStore, CoachTab } from '../store/useCoachStore';
import { CoachDashboard } from './CoachDashboard';
import { AthleteDirectory } from './AthleteDirectory';
import { AthleteDossierView } from './AthleteDossierView';
import { CoachStorageView } from './CoachStorageView';
import { CoachBackupView } from './CoachBackupView';
import { CoachSettingsView } from './CoachSettingsView';
import { AthleteEditModal } from './AthleteEditModal';
import { CoachAthlete, CoachChoreography, CoachChoreographyVersion } from '../types';

interface CoachPortalProps {
  onOpenEditorForAthlete: (
    athlete: CoachAthlete,
    choreo?: CoachChoreography,
    version?: CoachChoreographyVersion
  ) => void;
  onExitCoachPortal: () => void;
}

export const CoachPortal: React.FC<CoachPortalProps> = ({
  onOpenEditorForAthlete,
  onExitCoachPortal,
}) => {
  const {
    activeCoachTab,
    setActiveCoachTab,
    selectedAthlete,
    selectAthlete,
    loadInitialData,
    createOrUpdateAthlete,
    storageSummary,
  } = useCoachStore();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  const navItems: { id: CoachTab; label: string; icon: React.ReactNode; disabled?: boolean }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'athletes', label: 'Mis Atletas', icon: <Users className="w-4 h-4" /> },
    {
      id: 'dossier',
      label: selectedAthlete ? `Ficha (${selectedAthlete.name.split(' ')[0]})` : 'Ficha de Atleta',
      icon: <FileText className="w-4 h-4" />,
      disabled: !selectedAthlete,
    },
    { id: 'storage', label: 'Mi Almacenamiento & Nube', icon: <HardDrive className="w-4 h-4" /> },
    { id: 'backup', label: 'Copias de Seguridad', icon: <Archive className="w-4 h-4" /> },
    { id: 'settings', label: 'Ajustes', icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-neon-canvas text-white overflow-hidden select-none">
      {/* ═══ Header Propio del Panel de Entrenadores ═══ */}
      <header className="shrink-0 z-30 glass-hud border-b border-white/10 px-4 py-2.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Izquierda: Marca y Salida */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onExitCoachPortal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/10 text-slate-300 hover:text-white text-xs font-bold transition-all interactive-tap"
              title="Volver a la vista principal de SkateCoreo"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">SkateCoreo</span>
            </button>

            <div className="flex items-center gap-2 border-l border-white/10 pl-3">
              <span className="text-sm font-black tracking-tight text-white flex items-center gap-1.5">
                <span className="text-cyan font-black">Panel</span> Entrenadores
              </span>
              <span className="hidden md:inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-cyan/15 text-cyan border border-cyan/30">
                PRO 2026
              </span>
            </div>
          </div>

          {/* Centro: Navegación de Pestañas del Entrenador */}
          <nav className="hidden lg:flex items-center gap-1 bg-white/[0.03] p-1 rounded-2xl border border-white/5">
            {navItems.map((item) => {
              const isActive = activeCoachTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={item.disabled}
                  onClick={() => setActiveCoachTab(item.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all disabled:opacity-30 disabled:pointer-events-none interactive-tap ${
                    isActive
                      ? 'bg-cyan text-neon-canvas font-black shadow-glow-cyan'
                      : 'text-slate-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Derecha: Indicador de Almacenamiento & Modo */}
          <div className="flex items-center gap-2 text-xs">
            <div
              onClick={() => setActiveCoachTab('storage')}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/[0.04] border border-white/10 text-slate-300 cursor-pointer hover:bg-white/[0.08] transition-all text-[11px]"
              title={`Proveedor actual: ${storageSummary?.activeProvider}`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  storageSummary?.activeProvider !== 'local' ? 'bg-mint animate-pulse' : 'bg-cyan'
                }`}
              />
              <span className="hidden sm:inline capitalize">
                {storageSummary?.activeProvider === 'local' ? 'Local-First' : storageSummary?.activeProvider}
              </span>
            </div>
          </div>
        </div>

        {/* Sub-navegación móvil / tablet (< lg) */}
        <div className="lg:hidden flex items-center gap-1 overflow-x-auto pt-2 pb-1 scroll-touch">
          {navItems.map((item) => {
            const isActive = activeCoachTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                disabled={item.disabled}
                onClick={() => setActiveCoachTab(item.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 disabled:opacity-30 interactive-tap ${
                  isActive
                    ? 'bg-cyan text-neon-canvas font-black shadow-glow-cyan'
                    : 'bg-white/[0.04] text-slate-300 hover:text-white'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* ═══ Contenido Principal del Módulo ═══ */}
      <main className="flex-1 min-h-0 overflow-y-auto scroll-touch p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">
          {activeCoachTab === 'dashboard' && (
            <CoachDashboard
              onNavigateToAthletes={() => setActiveCoachTab('athletes')}
              onSelectAthlete={(athlete) => selectAthlete(athlete)}
              onNavigateToStorage={() => setActiveCoachTab('storage')}
              onNavigateToBackup={() => setActiveCoachTab('backup')}
              onRegisterAthlete={() => setIsAddModalOpen(true)}
            />
          )}

          {activeCoachTab === 'athletes' && (
            <AthleteDirectory
              onSelectAthlete={(athlete) => selectAthlete(athlete)}
              onCreateChoreography={(athlete) => onOpenEditorForAthlete(athlete)}
            />
          )}

          {activeCoachTab === 'dossier' && selectedAthlete && (
            <AthleteDossierView
              athlete={selectedAthlete}
              onBack={() => setActiveCoachTab('athletes')}
              onOpenChoreographyInEditor={(choreo, version) =>
                onOpenEditorForAthlete(selectedAthlete, choreo, version)
              }
              onCreateNewChoreography={(athlete) => onOpenEditorForAthlete(athlete)}
            />
          )}

          {activeCoachTab === 'storage' && <CoachStorageView />}

          {activeCoachTab === 'backup' && <CoachBackupView />}

          {activeCoachTab === 'settings' && <CoachSettingsView />}
        </div>
      </main>

      {/* Modal para agregar atleta */}
      <AthleteEditModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSave={async (data) => {
          await createOrUpdateAthlete(data);
          setActiveCoachTab('athletes');
        }}
      />
    </div>
  );
};
