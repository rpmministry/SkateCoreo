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
  Key,
  Database,
} from 'lucide-react';
import { useCoachStore } from '../store/useCoachStore';
import { storageManager } from '../services/storage/StorageManager';
import { CloudProviderId } from '../types';
import { dbService } from '../../services/db';
import { Button } from '../../components/ui';

export const CoachStorageView: React.FC = () => {
  const {
    storageSummary,
    connectCloudProvider,
    disconnectCloudProvider,
    syncAllToCloud,
    profile,
    updateProfile,
    isLoading,
  } = useCoachStore();

  const [persistentActive, setPersistentActive] = useState<boolean | null>(null);
  const [googleClientId, setGoogleClientId] = useState(
    profile?.storageConfig?.googleDrive?.clientId || ''
  );
  const [oneDriveClientId, setOneDriveClientId] = useState(
    profile?.storageConfig?.oneDrive?.clientId || ''
  );
  const [dropboxClientId, setDropboxClientId] = useState(
    profile?.storageConfig?.dropbox?.clientId || ''
  );
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

  const handleSaveClientIds = async () => {
    await updateProfile({
      storageConfig: {
        googleDrive: { ...profile?.storageConfig?.googleDrive, clientId: googleClientId, connected: Boolean(profile?.storageConfig?.googleDrive?.connected) },
        oneDrive: { ...profile?.storageConfig?.oneDrive, clientId: oneDriveClientId, connected: Boolean(profile?.storageConfig?.oneDrive?.connected) },
        dropbox: { ...profile?.storageConfig?.dropbox, clientId: dropboxClientId, connected: Boolean(profile?.storageConfig?.dropbox?.connected) },
      },
    });
    setStatusMessage({ text: 'Configuración de credenciales de cliente guardada.' });
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
        <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2.5">
          <HardDrive className="w-5 h-5 text-coach-rose stroke-[1.75]" />
          Mi Almacenamiento &amp; Nube Personal
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Tus archivos .coreo y fichas deportivas residen en tu dispositivo y en la nube personal que elijas, con privacidad total y sin repositorio en Supabase Storage.
        </p>
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

      {/* Resumen de Almacenamiento */}
      <div className="p-6 rounded-2xl bg-surface-1 border border-white/[0.07] shadow-subtle space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Proveedor Activo de Archivos
            </span>
            <div className="text-lg font-bold text-white flex items-center gap-2 mt-0.5">
              <span>{currentProvider.name}</span>
              {currentProvider.id !== 'local' && (
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 font-medium border border-emerald-500/20 flex items-center gap-1">
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
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-2 hover:bg-surface-3 border border-white/[0.08] text-slate-300 hover:text-white text-xs font-medium transition-all"
              >
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                <span>Abrir en {currentProvider.name}</span>
              </a>
            )}

            <Button
              variant="coach"
              size="sm"
              onClick={() => syncAllToCloud()}
              disabled={isLoading || currentProvider.id === 'local'}
              icon={<RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />}
            >
              Sincronizar Nube
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-white/[0.06] text-xs font-mono">
          <div className="p-3 rounded-xl bg-surface-2/60 border border-white/[0.05]">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Espacio Utilizado</span>
            <strong className="text-white text-sm font-semibold">{formatSize(storageSummary?.totalStorageBytes || 0)}</strong>
          </div>
          <div className="p-3 rounded-xl bg-surface-2/60 border border-white/[0.05]">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Archivos .coreo &amp; Media</span>
            <strong className="text-coach-rose text-sm font-semibold">{storageSummary?.totalFiles || 0}</strong>
          </div>
          <div className="p-3 rounded-xl bg-surface-2/60 border border-white/[0.05]">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Fichas de Atletas</span>
            <strong className="text-white text-sm font-semibold">{storageSummary?.totalAthletes || 0}</strong>
          </div>
          <div className="p-3 rounded-xl bg-surface-2/60 border border-white/[0.05]">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Estado Red</span>
            <strong className={storageSummary?.isOnline ? 'text-emerald-400 text-sm font-semibold' : 'text-amber-400 text-sm font-semibold'}>
              {storageSummary?.isOnline ? 'Online' : 'Offline'}
            </strong>
          </div>
        </div>
      </div>

      {/* Proveedores de Almacenamiento */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          Opciones de Proveedor
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 1. Almacenamiento Local (IndexedDB / OPFS) */}
          <div className="p-5 rounded-2xl bg-surface-1 border border-white/[0.07] hover:border-white/[0.12] space-y-3.5 shadow-subtle transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-coach-rose/10 text-coach-rose border border-coach-rose/20">
                  <Database className="w-5 h-5 stroke-[1.75]" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">Almacenamiento Local (IndexedDB)</h4>
                  <p className="text-[11px] text-slate-400">100% Offline-First en este navegador y dispositivo.</p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Siempre Activo
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Tus atletas y coreografías se guardan siempre de manera inmediata y segura en el almacenamiento interno de tu navegador con cero latencia y sin conexión a internet.
            </p>

            <div className="pt-2 flex items-center justify-between border-t border-white/[0.06]">
              <span className="text-[11px] text-slate-400">
                Persistencia anti-evicción:{' '}
                <strong className={persistentActive ? 'text-emerald-400 font-medium' : 'text-amber-400 font-medium'}>
                  {persistentActive ? 'Garantizada' : 'Estándar'}
                </strong>
              </span>

              {!persistentActive && (
                <button
                  type="button"
                  onClick={handleRequestPersistent}
                  className="px-3 py-1.5 rounded-xl bg-surface-2 border border-white/[0.08] hover:border-white/[0.15] text-xs font-medium text-slate-200 hover:text-white transition-all"
                >
                  Activar persistencia
                </button>
              )}
            </div>
          </div>

          {/* 2. Google Drive */}
          <div className="p-5 rounded-2xl bg-surface-1 border border-white/[0.07] hover:border-white/[0.12] space-y-3.5 shadow-subtle transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-400/10 text-amber-300 border border-amber-400/20">
                  <Cloud className="w-5 h-5 stroke-[1.75]" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">Google Drive</h4>
                  <p className="text-[11px] text-slate-400">Alcance mínimo restringido (drive.file).</p>
                </div>
              </div>

              {storageManager.getProvider('google_drive').isConnected() ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Conectado
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-surface-2 text-slate-400 border border-white/[0.06]">
                  Desconectado
                </span>
              )}
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Crea automáticamente la carpeta <code className="text-coach-rose font-mono">SkateCoreo/Entrenadores/</code> en tu unidad de Google Drive y sincroniza las fichas y coreografías.
            </p>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-white/[0.06]">
              {storageManager.getProvider('google_drive').isConnected() ? (
                <button
                  type="button"
                  onClick={() => handleDisconnectProvider('google_drive')}
                  className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 text-xs font-medium transition-all"
                >
                  Desconectar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleConnectProvider('google_drive')}
                  className="px-4 py-1.5 rounded-xl bg-surface-2 hover:bg-surface-3 border border-white/[0.1] text-white text-xs font-medium transition-all"
                >
                  Conectar Google Drive
                </button>
              )}
            </div>
          </div>

          {/* 3. Microsoft OneDrive */}
          <div className="p-5 rounded-2xl bg-surface-1 border border-white/[0.07] hover:border-white/[0.12] space-y-3.5 shadow-subtle transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <Cloud className="w-5 h-5 stroke-[1.75]" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">Microsoft OneDrive</h4>
                  <p className="text-[11px] text-slate-400">Microsoft Graph API v1.0.</p>
                </div>
              </div>

              {storageManager.getProvider('onedrive').isConnected() ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Conectado
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-surface-2 text-slate-400 border border-white/[0.06]">
                  Desconectado
                </span>
              )}
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Sincroniza tus expedientes técnicos en la nube de Microsoft OneDrive en la carpeta personal de SkateCoreo.
            </p>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-white/[0.06]">
              {storageManager.getProvider('onedrive').isConnected() ? (
                <button
                  type="button"
                  onClick={() => handleDisconnectProvider('onedrive')}
                  className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 text-xs font-medium transition-all"
                >
                  Desconectar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleConnectProvider('onedrive')}
                  className="px-4 py-1.5 rounded-xl bg-surface-2 hover:bg-surface-3 border border-white/[0.1] text-white text-xs font-medium transition-all"
                >
                  Conectar OneDrive
                </button>
              )}
            </div>
          </div>

          {/* 4. Dropbox */}
          <div className="p-5 rounded-2xl bg-surface-1 border border-white/[0.07] hover:border-white/[0.12] space-y-3.5 shadow-subtle transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <Cloud className="w-5 h-5 stroke-[1.75]" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">Dropbox</h4>
                  <p className="text-[11px] text-slate-400">Dropbox API v2.</p>
                </div>
              </div>

              {storageManager.getProvider('dropbox').isConnected() ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Conectado
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-surface-2 text-slate-400 border border-white/[0.06]">
                  Desconectado
                </span>
              )}
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Guarda tus fichas deportivas en la carpeta <code className="text-coach-rose font-mono">/SkateCoreo</code> de tu cuenta Dropbox.
            </p>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-white/[0.06]">
              {storageManager.getProvider('dropbox').isConnected() ? (
                <button
                  type="button"
                  onClick={() => handleDisconnectProvider('dropbox')}
                  className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 text-xs font-medium transition-all"
                >
                  Desconectar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleConnectProvider('dropbox')}
                  className="px-4 py-1.5 rounded-xl bg-surface-2 hover:bg-surface-3 border border-white/[0.1] text-white text-xs font-medium transition-all"
                >
                  Conectar Dropbox
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Configuración de Client IDs opcionales */}
      <div className="p-6 rounded-2xl bg-surface-1 border border-white/[0.07] space-y-4 shadow-subtle">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-coach-rose stroke-[1.75]" />
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Credenciales de Aplicación OAuth (Opcional para clubes/entrenadores avanzados)
          </h3>
        </div>

        <p className="text-xs text-slate-400">
          Si dispones de tus propias claves OAuth de Google Cloud Console o Azure AD para tu club, puedes introducirlas aquí:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="block text-slate-400 font-medium mb-1">Google Client ID:</label>
            <input
              type="text"
              placeholder="xxxx.apps.googleusercontent.com"
              value={googleClientId}
              onChange={(e) => setGoogleClientId(e.target.value)}
              className="w-full bg-surface-2 border border-white/[0.08] rounded-xl px-3 py-2 text-white outline-none focus:border-coach-rose/50 text-xs font-mono"
            />
          </div>

          <div>
            <label className="block text-slate-400 font-medium mb-1">OneDrive Client ID:</label>
            <input
              type="text"
              placeholder="Application (client) ID de Azure"
              value={oneDriveClientId}
              onChange={(e) => setOneDriveClientId(e.target.value)}
              className="w-full bg-surface-2 border border-white/[0.08] rounded-xl px-3 py-2 text-white outline-none focus:border-coach-rose/50 text-xs font-mono"
            />
          </div>

          <div>
            <label className="block text-slate-400 font-medium mb-1">Dropbox App Key:</label>
            <input
              type="text"
              placeholder="App Key de Dropbox Developer Console"
              value={dropboxClientId}
              onChange={(e) => setDropboxClientId(e.target.value)}
              className="w-full bg-surface-2 border border-white/[0.08] rounded-xl px-3 py-2 text-white outline-none focus:border-coach-rose/50 text-xs font-mono"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSaveClientIds}
          >
            Guardar Claves de Cliente
          </Button>
        </div>
      </div>
    </div>
  );
};
