/**
 * CoachDashboard.tsx — Dashboard Inicial del Entrenador
 *
 * Muestra información útil y accionable:
 *  - Mis atletas y desglose por categorías
 *  - Coreografías recientes
 *  - Almacenamiento local vs nube personal
 *  - Estado de sincronización y fecha del último backup
 */

import React from 'react';
import {
  Users,
  HardDrive,
  CheckCircle2,
  ArrowRight,
  Plus,
  RefreshCw,
  FolderSync,
  Archive,
} from 'lucide-react';
import { useCoachStore } from '../store/useCoachStore';
import { CoachAthlete } from '../types';

interface CoachDashboardProps {
  onNavigateToAthletes: () => void;
  onSelectAthlete: (athlete: CoachAthlete) => void;
  onNavigateToStorage: () => void;
  onNavigateToBackup: () => void;
  onRegisterAthlete: () => void;
}

export const CoachDashboard: React.FC<CoachDashboardProps> = ({
  onNavigateToAthletes,
  onSelectAthlete,
  onNavigateToStorage,
  onNavigateToBackup,
  onRegisterAthlete,
}) => {
  const { athletes, storageSummary, profile, syncAllToCloud, isLoading } = useCoachStore();

  // Desglose por categorías oficiales
  const categoryStats = React.useMemo(() => {
    const counts: Record<string, number> = {
      TOT: 0,
      MINI: 0,
      ESPOIR: 0,
      CADET: 0,
      MAYOR: 0,
    };
    athletes.forEach((a) => {
      if (counts[a.category] !== undefined) {
        counts[a.category]++;
      }
    });
    return counts;
  }, [athletes]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatTime = (ts?: number) => {
    if (!ts) return 'Ninguno registrado';
    return new Date(ts).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6 animate-fade-in text-white pb-12">
      {/* Saludo y acciones rápidas */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 rounded-3xl bg-gradient-to-r from-cyan/15 via-white/[0.02] to-transparent border border-cyan/20 shadow-soft-elevation">
        <div>
          <h2 className="text-xl font-black text-white tracking-tight">
            Bienvenido, {profile?.name || 'Entrenador/a'}
          </h2>
          <p className="text-xs text-slate-300 mt-1 max-w-xl">
            Gestiona tus atletas, fichas deportivas y archivos .coreo con persistencia local y sincronización en tu nube personal sin pasar por Supabase Storage.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRegisterAthlete}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-cyan text-neon-canvas font-black text-xs shadow-glow-cyan hover:bg-cyan/90 transition-all interactive-tap"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Nueva Atleta</span>
          </button>
        </div>
      </div>

      {/* Tarjetas KPI principales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Atletas Registrados */}
        <div
          onClick={onNavigateToAthletes}
          className="p-5 rounded-3xl bg-neon-surface border border-white/10 shadow-soft-elevation space-y-2 cursor-pointer hover:border-cyan/40 transition-all group"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-black uppercase tracking-wider">Mis Atletas</span>
            <Users className="w-4 h-4 text-cyan" />
          </div>
          <div className="text-3xl font-black text-white font-mono">{athletes.length}</div>
          <div className="text-[11px] text-slate-400 flex items-center justify-between group-hover:text-cyan transition-colors">
            <span>Ver directorio completo</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Almacenamiento */}
        <div
          onClick={onNavigateToStorage}
          className="p-5 rounded-3xl bg-neon-surface border border-white/10 shadow-soft-elevation space-y-2 cursor-pointer hover:border-mint/40 transition-all group"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-black uppercase tracking-wider">Almacenamiento</span>
            <HardDrive className="w-4 h-4 text-mint" />
          </div>
          <div className="text-2xl font-black text-white font-mono">
            {formatSize(storageSummary?.totalStorageBytes || 0)}
          </div>
          <div className="text-[11px] text-slate-400 flex items-center justify-between group-hover:text-mint transition-colors">
            <span className="capitalize">
              {storageSummary?.activeProvider === 'local' ? '100% Local (IndexedDB)' : storageSummary?.activeProvider}
            </span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Estado Sincronización */}
        <div className="p-5 rounded-3xl bg-neon-surface border border-white/10 shadow-soft-elevation space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-black uppercase tracking-wider">Sincronización</span>
            <FolderSync className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-sm font-bold text-slate-200">
            {storageSummary?.syncState === 'synced' ? (
              <span className="text-mint flex items-center gap-1.5 font-bold">
                <CheckCircle2 className="w-4 h-4" /> Al día con la nube
              </span>
            ) : storageSummary?.pendingSyncCount ? (
              <span className="text-amber-400 font-bold">
                {storageSummary.pendingSyncCount} pendientes
              </span>
            ) : (
              <span className="text-slate-400">Almacenamiento Local</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => syncAllToCloud()}
            disabled={isLoading || storageSummary?.activeProvider === 'local'}
            className="text-[11px] text-cyan font-bold hover:underline flex items-center gap-1 disabled:opacity-40"
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Sincronizar ahora</span>
          </button>
        </div>

        {/* Último Backup */}
        <div
          onClick={onNavigateToBackup}
          className="p-5 rounded-3xl bg-neon-surface border border-white/10 shadow-soft-elevation space-y-2 cursor-pointer hover:border-coral/40 transition-all group"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-black uppercase tracking-wider">Último Respaldo</span>
            <Archive className="w-4 h-4 text-coral" />
          </div>
          <div className="text-xs font-bold text-white truncate">
            {formatTime(profile?.lastBackupDate)}
          </div>
          <div className="text-[11px] text-slate-400 flex items-center justify-between group-hover:text-coral transition-colors">
            <span>Gestionar copias ZIP</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>

      {/* Desglose por Categorías del Reglamento 2026 */}
      <div className="p-6 rounded-3xl bg-neon-surface border border-white/10 shadow-soft-elevation space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Distribución por Categorías Oficiales 2026
          </h3>
          <span className="text-xs text-slate-400">Reglamento Nacional RollArt</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {Object.entries(categoryStats).map(([cat, count]) => (
            <div
              key={cat}
              className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col items-center text-center space-y-1"
            >
              <span className="font-mono text-xs font-bold text-cyan">{cat}</span>
              <span className="text-2xl font-black text-white font-mono">{count}</span>
              <span className="text-[10px] text-slate-400">atletas</span>
            </div>
          ))}
        </div>
      </div>

      {/* Atletas Recientes */}
      <div className="p-6 rounded-3xl bg-neon-surface border border-white/10 shadow-soft-elevation space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Atletas Recientes
          </h3>
          <button
            type="button"
            onClick={onNavigateToAthletes}
            className="text-xs text-cyan font-bold hover:underline"
          >
            Ver todos ({athletes.length})
          </button>
        </div>

        {athletes.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-400">
            Aún no has registrado ningún atleta. Haz clic en "Nueva Atleta" para comenzar.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {athletes.slice(0, 6).map((athlete) => (
              <div
                key={athlete.id}
                onClick={() => onSelectAthlete(athlete)}
                className="p-3.5 rounded-2xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 flex items-center justify-between cursor-pointer transition-all group"
              >
                <div>
                  <h4 className="font-bold text-sm text-white group-hover:text-cyan transition-colors">
                    {athlete.name}
                  </h4>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                    <span className="font-mono text-amber-300 font-bold">{athlete.category}</span>
                    <span>• {athlete.age} años</span>
                  </div>
                </div>

                <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-cyan transition-colors" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
