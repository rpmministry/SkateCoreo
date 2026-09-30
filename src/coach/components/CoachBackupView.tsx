/**
 * CoachBackupView.tsx — Copias de Seguridad y Restauración Universal
 *
 * Exporta y restaura paquetes portables .zip completos:
 *  - Atletas, fichas, categorías, observaciones
 *  - Coreografías completas con archivos .coreo y pistas de música
 *  - Fotografías/avatares y metadatos
 *
 * Permite descargar al equipo o guardar directamente en la nube conectada.
 */

import React, { useState, useRef } from 'react';
import {
  Archive,
  Download,
  CloudUpload,
  Upload,
  CheckCircle2,
  Clock,
  FileArchive,
} from 'lucide-react';
import { useCoachStore } from '../store/useCoachStore';
import { coachBackupService } from '../services/coachBackupService';
import { storageManager } from '../services/storage/StorageManager';
import { Button } from '../../components/ui';

export const CoachBackupView: React.FC = () => {
  const { profile, loadInitialData } = useCoachStore();

  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; isError?: boolean } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleExportZip = async () => {
    setIsExporting(true);
    setFeedback(null);
    try {
      const res = await coachBackupService.exportBackupToDisk();
      setFeedback({
        text: `¡Copia de seguridad "${res.fileName}" generada y descargada! (${res.athletesCount} atletas, ${res.choreosCount} coreografías).`,
      });
      await loadInitialData();
    } catch (e: any) {
      setFeedback({ text: 'Error al exportar copia: ' + e.message, isError: true });
    } finally {
      setIsExporting(false);
    }
  };

  const handleSaveToCloud = async () => {
    const provider = storageManager.getActiveProvider();
    if (provider.id === 'local') {
      setFeedback({ text: 'Primero conecta Google Drive, OneDrive o Dropbox en la pestaña Mi Almacenamiento.', isError: true });
      return;
    }

    setIsExporting(true);
    setFeedback(null);
    try {
      const res = await coachBackupService.saveBackupToCloud();
      setFeedback({ text: res.message, isError: !res.success });
      await loadInitialData();
    } catch (e: any) {
      setFeedback({ text: 'Error al guardar en la nube: ' + e.message, isError: true });
    } finally {
      setIsExporting(false);
    }
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm('¿Deseas restaurar esta copia de seguridad? Se integrarán los atletas y archivos contenidos en el paquete ZIP.')) {
      e.target.value = '';
      return;
    }

    setIsRestoring(true);
    setFeedback(null);
    try {
      const res = await coachBackupService.restoreBackup(file);
      setFeedback({ text: res.message, isError: !res.success });
      await loadInitialData();
    } catch (e: any) {
      setFeedback({ text: 'Error al restaurar archivo: ' + e.message, isError: true });
    } finally {
      setIsRestoring(false);
      e.target.value = '';
    }
  };

  const activeProvider = storageManager.getActiveProvider();

  return (
    <div className="space-y-6 animate-fade-in text-white pb-12">
      <div>
        <h2 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
          <Archive className="w-6 h-6 text-coral" />
          Copias de Seguridad (Backup &amp; Restauración)
        </h2>
        <p className="text-xs text-slate-400">
          Crea paquetes portables .zip completos con todos tus atletas, fichas, notas y archivos .coreo para llevarlos a otro dispositivo o conservarlos como respaldo seguro.
        </p>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-2xl border text-xs flex items-center justify-between ${
            feedback.isError
              ? 'bg-red-950/80 border-red-500/40 text-red-200'
              : 'bg-mint/15 border-mint/30 text-mint'
          }`}
        >
          <span>{feedback.text}</span>
          <button onClick={() => setFeedback(null)} className="p-1 hover:opacity-75">✕</button>
        </div>
      )}

      {/* Tarjeta de Respaldo Actual */}
      <div className="p-6 rounded-2xl bg-surface-2 border border-white/[0.08] shadow-elevation-1 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Estado de Respaldo
            </span>
            <div className="text-sm font-bold text-white mt-1 flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#78a9ff]" />
              <span>
                Última copia:{' '}
                {profile?.lastBackupDate
                  ? new Date(profile.lastBackupDate).toLocaleString('es-ES', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'Sin copias registradas'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="cobalt"
              size="md"
              onClick={handleExportZip}
              disabled={isExporting}
              icon={<Download className={`w-4 h-4 ${isExporting ? 'animate-bounce' : ''}`} />}
            >
              {isExporting ? 'Empaquetando...' : 'Descargar Backup (.zip)'}
            </Button>

            {activeProvider.id !== 'local' && (
              <Button
                variant="secondary"
                size="md"
                onClick={handleSaveToCloud}
                disabled={isExporting}
                icon={<CloudUpload className="w-4 h-4 text-[#78a9ff]" />}
              >
                Guardar en {activeProvider.name}
              </Button>
            )}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-surface-1 border border-white/5 text-xs space-y-2">
          <div className="font-bold text-slate-300">Contenido que incluye el archivo de respaldo:</div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-400 text-[11px]">
            <li className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-mint" /> Todas las fichas de atletas y datos deportivos
            </li>
            <li className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-mint" /> Archivos .coreo con música y trazados 2D
            </li>
            <li className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-mint" /> Categorías oficiales y observaciones técnicas
            </li>
            <li className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-mint" /> Fotografías y avatares de los atletas
            </li>
          </ul>
        </div>
      </div>

      {/* Restauración de Copia de Seguridad */}
      <div className="p-6 rounded-2xl bg-surface-2 border border-white/[0.08] space-y-4 shadow-elevation-1">
        <div className="flex items-center gap-2">
          <FileArchive className="w-5 h-5 text-mint" />
          <h3 className="text-base font-bold text-white tracking-tight">
            Restaurar Copia de Seguridad
          </h3>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
          Si te encuentras en otro equipo, navegador o reinstalaste la aplicación, selecciona un archivo{' '}
          <code className="text-[#78a9ff] font-mono">SkateCoreo_Backup_*.zip</code> para reconstruir inmediatamente todas tus fichas y coreografías.
        </p>

        <div className="pt-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            onChange={handleRestoreFile}
            className="hidden"
          />

          <Button
            variant="secondary"
            size="md"
            onClick={() => fileInputRef.current?.click()}
            disabled={isRestoring}
            icon={<Upload className={`w-4 h-4 ${isRestoring ? 'animate-spin' : ''}`} />}
          >
            {isRestoring ? 'Restaurando datos...' : 'Seleccionar Archivo de Respaldo (.zip)'}
          </Button>
        </div>
      </div>
    </div>
  );
};
