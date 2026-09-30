/**
 * CoachStorageView.tsx — Gestión de Almacenamiento y Conexión de Nube Personal
 *
 * Permite conectar:
 *  - Almacenamiento Local (IndexedDB / OPFS - Prioridad offline-first)
 *  - Google Drive (Scope oficial mínimo drive.file)
 *  - Microsoft OneDrive (Microsoft Graph API v1.0)
 *  - Dropbox (Dropbox API v2)
 *
 * Sin utilizar Supabase Storage.
 */

import React, { useState } from 'react';
import {
  HardDrive,
  Cloud,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  Database,
} from 'lucide-react';
import { useCoachStore } from '../store/useCoachStore';
import { storageManager } from '../services/storage/StorageManager';
import { CloudProviderId } from '../types';
import { dbService } from '../../services/db';

export const CoachStorageView: React.FC = () => {
  const {
    storageSummary,
    connectCloudProvider,
    disconnectCloudProvider,
    syncAllToCloud,
    isLoading,
  } = useCoachStore();

  const [persistentActive, setPersistentActive] = useState<boolean | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  React.useEffect(() => {
    void (async () => {
      const persisted = await dbService.isStoragePersisted();
      setPersistentActive(persisted);
    })();
  }, []);

  const handleRequestPersistent = async () => {
    const res = await dbService.requestPersistentStorage();
    setPersistentActive(res.persisted);
    if (res.persisted) {
      setStatusMessage({ text: 'Persistencia activada contra borrado automático del navegador.' });
    } else {
      setStatusMessage({ text: 'El navegador denegó o ya tenía configurada la persistencia.', isError: true });
    }
  };

  const handleConnectProvider = async (providerId: CloudProviderId) => {
    setStatusMessage(null);
    const success = await connectCloudProvider(providerId);
    if (success) {
      setStatusMessage({ text: `Conexión establecida con éxito.` });
    }
  };

  const handleDisconnectProvider = async (providerId: CloudProviderId) => {
    await disconnectCloudProvider(providerId);
    setStatusMessage({ text: `Proveedor desconectado. Operando 100% en almacenamiento local.` });
  };



  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const currentProvider = storageManager.getActiveProvider();

  return (
    <div className="space-y-6 animate-fade-in text-white pb-12">
      <div>
        <h2 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
          <HardDrive className="w-6 h-6 text-cyan" />
          Mi Almacenamiento &amp; Nube Personal
        </h2>
        <p className="text-xs text-slate-400">
          Tus archivos .coreo y fichas deportivas residen en tu dispositivo y en la nube personal que elijas, con privacidad total y sin repositorio en Supabase Storage.
        </p>
      </div>

      {statusMessage && (
        <div
          className={`p-3.5 rounded-2xl border text-xs flex items-center justify-between ${
            statusMessage.isError
              ? 'bg-red-950/80 border-red-500/40 text-red-200'
              : 'bg-mint/15 border-mint/30 text-mint'
          }`}
        >
          <span>{statusMessage.text}</span>
          <button onClick={() => setStatusMessage(null)} className="p-1 hover:opacity-75">✕</button>
        </div>
      )}

      {/* Resumen de Almacenamiento */}
      <div className="p-6 rounded-3xl bg-neon-surface border border-white/10 shadow-soft-elevation space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Proveedor Activo de Archivos
            </span>
            <div className="text-lg font-bold text-white flex items-center gap-2 mt-0.5">
              <span>{currentProvider.name}</span>
              {currentProvider.id !== 'local' && (
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-mint/20 text-mint font-bold border border-mint/30 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Conectado
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {currentProvider.getOpenLocationUrl() && (
              <a
                href={currentProvider.getOpenLocationUrl()!}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/10 text-slate-200 text-xs font-semibold transition-all interactive-tap"
              >
                <ExternalLink className="w-3.5 h-3.5 text-cyan" />
                <span>Abrir en {currentProvider.name}</span>
              </a>
            )}

            <button
              type="button"
              onClick={() => syncAllToCloud()}
              disabled={isLoading || currentProvider.id === 'local'}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan text-neon-canvas font-black text-xs shadow-glow-cyan hover:bg-cyan/90 transition-all disabled:opacity-50 interactive-tap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Sincronizar Nube</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-white/5 text-xs font-mono">
          <div className="p-3 rounded-2xl bg-white/[0.02]">
            <span className="text-[10px] text-slate-500 uppercase block">Espacio Utilizado</span>
            <strong className="text-white text-sm">{formatSize(storageSummary?.totalStorageBytes || 0)}</strong>
          </div>
          <div className="p-3 rounded-2xl bg-white/[0.02]">
            <span className="text-[10px] text-slate-500 uppercase block">Archivos .coreo &amp; Media</span>
            <strong className="text-cyan text-sm">{storageSummary?.totalFiles || 0}</strong>
          </div>
          <div className="p-3 rounded-2xl bg-white/[0.02]">
            <span className="text-[10px] text-slate-500 uppercase block">Fichas de Atletas</span>
            <strong className="text-white text-sm">{storageSummary?.totalAthletes || 0}</strong>
          </div>
          <div className="p-3 rounded-2xl bg-white/[0.02]">
            <span className="text-[10px] text-slate-500 uppercase block">Estado Red</span>
            <strong className={storageSummary?.isOnline ? 'text-mint text-sm' : 'text-amber-400 text-sm'}>
              {storageSummary?.isOnline ? 'Online' : 'Offline'}
            </strong>
          </div>
        </div>
      </div>

      {/* Proveedores de Almacenamiento */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">
          Opciones de Proveedor
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 1. Almacenamiento Local (IndexedDB / OPFS) */}
          <div className="p-5 rounded-3xl bg-neon-surface border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-cyan/15 text-cyan ring-1 ring-cyan/30">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">Almacenamiento Local (IndexedDB)</h4>
                  <p className="text-[11px] text-slate-400">100% Offline-First en este navegador y dispositivo.</p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-mint/20 text-mint border border-mint/30">
                Siempre Activo
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Tus atletas y coreografías se guardan siempre de manera inmediata y segura en el almacenamiento interno de tu navegador con cero latencia y sin conexión a internet.
            </p>

            <div className="pt-2 flex items-center justify-between border-t border-white/5">
              <span className="text-[11px] text-slate-400">
                Persistencia anti-evicción:{' '}
                <strong className={persistentActive ? 'text-mint' : 'text-amber-400'}>
                  {persistentActive ? 'Garantizada' : 'Estándar'}
                </strong>
              </span>

              {!persistentActive && (
                <button
                  type="button"
                  onClick={handleRequestPersistent}
                  className="px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/10 text-xs font-semibold text-cyan transition-all"
                >
                  Activar persistencia
                </button>
              )}
            </div>
          </div>

          {/* 2. Google Drive */}
          <div className="p-5 rounded-3xl bg-neon-surface border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/30">
                  <Cloud className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">Google Drive</h4>
                  <p className="text-[11px] text-slate-400">Alcance mínimo restringido (drive.file).</p>
                </div>
              </div>

              {storageManager.getProvider('google_drive').isConnected() ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-mint/20 text-mint border border-mint/30">
                  Conectado
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-slate-400">
                  Desconectado
                </span>
              )}
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Crea automáticamente la carpeta <code className="text-cyan font-mono">SkateCoreo/Entrenadores/</code> en tu unidad de Google Drive y sincroniza las fichas y coreografías.
            </p>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-white/5">
              {storageManager.getProvider('google_drive').isConnected() ? (
                <button
                  type="button"
                  onClick={() => handleDisconnectProvider('google_drive')}
                  className="px-3 py-1.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-300 text-xs font-semibold transition-all"
                >
                  Desconectar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleConnectProvider('google_drive')}
                  className="px-4 py-1.5 rounded-xl bg-amber-400 text-zinc-950 text-xs font-black hover:bg-amber-300 transition-all shadow-md interactive-tap"
                >
                  Conectar Google Drive
                </button>
              )}
            </div>
          </div>

          {/* 3. Microsoft OneDrive */}
          <div className="p-5 rounded-3xl bg-neon-surface border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30">
                  <Cloud className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">Microsoft OneDrive</h4>
                  <p className="text-[11px] text-slate-400">Microsoft Graph API v1.0.</p>
                </div>
              </div>

              {storageManager.getProvider('onedrive').isConnected() ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-mint/20 text-mint border border-mint/30">
                  Conectado
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-slate-400">
                  Desconectado
                </span>
              )}
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Sincroniza tus expedientes técnicos en la nube de Microsoft OneDrive en la carpeta personal de SkateCoreo.
            </p>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-white/5">
              {storageManager.getProvider('onedrive').isConnected() ? (
                <button
                  type="button"
                  onClick={() => handleDisconnectProvider('onedrive')}
                  className="px-3 py-1.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-300 text-xs font-semibold transition-all"
                >
                  Desconectar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleConnectProvider('onedrive')}
                  className="px-4 py-1.5 rounded-xl bg-blue-500 text-white text-xs font-bold hover:bg-blue-400 transition-all shadow-md interactive-tap"
                >
                  Conectar OneDrive
                </button>
              )}
            </div>
          </div>

          {/* 4. Dropbox */}
          <div className="p-5 rounded-3xl bg-neon-surface border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-indigo-500/15 text-indigo-400 ring-1 ring-indigo-500/30">
                  <Cloud className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">Dropbox</h4>
                  <p className="text-[11px] text-slate-400">Dropbox API v2.</p>
                </div>
              </div>

              {storageManager.getProvider('dropbox').isConnected() ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-mint/20 text-mint border border-mint/30">
                  Conectado
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-slate-400">
                  Desconectado
                </span>
              )}
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Guarda tus fichas deportivas en la carpeta <code className="text-cyan font-mono">/SkateCoreo</code> de tu cuenta Dropbox.
            </p>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-white/5">
              {storageManager.getProvider('dropbox').isConnected() ? (
                <button
                  type="button"
                  onClick={() => handleDisconnectProvider('dropbox')}
                  className="px-3 py-1.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-300 text-xs font-semibold transition-all"
                >
                  Desconectar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleConnectProvider('dropbox')}
                  className="px-4 py-1.5 rounded-xl bg-indigo-500 text-white text-xs font-bold hover:bg-indigo-400 transition-all shadow-md interactive-tap"
                >
                  Conectar Dropbox
                </button>
              )}
            </div>
          </div>
        </div>
      </div>


    </div>
  );
};
