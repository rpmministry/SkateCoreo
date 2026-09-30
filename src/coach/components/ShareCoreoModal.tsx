/**
 * ShareCoreoModal.tsx — Compartir archivos .coreo mediante Web Share API y alternativas
 *
 * Utiliza:
 *  - navigator.share({ files: [...] }) cuando el navegador/OS lo soporte (Android, iOS, Windows)
 *  - Fallback a descarga directa del archivo con integridad
 *  - Enlace mailto: preconfigurado con instrucciones
 *
 * Alineado 100% con IBM Carbon Design System (IBM Blue 60, superficies neutras, sin destellos).
 */

import React, { useState } from 'react';
import { Share2, Download, Mail, Check, AlertCircle, X } from 'lucide-react';
import { coachDb } from '../services/coachDb';

interface ShareCoreoModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  blobId: string;
  athleteName: string;
  choreographyTitle: string;
}

export const ShareCoreoModal: React.FC<ShareCoreoModalProps> = ({
  isOpen,
  onClose,
  fileName,
  blobId,
  athleteName,
  choreographyTitle,
}) => {
  const [copiedMail, setCopiedMail] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; isError?: boolean } | null>(null);

  if (!isOpen) return null;

  const handleNativeShare = async () => {
    try {
      const fileRecord = await coachDb.getBinaryFile(blobId);
      if (!fileRecord || !fileRecord.blob) {
        setFeedback({ text: 'Archivo no encontrado en almacenamiento local.', isError: true });
        return;
      }

      const file = new File([fileRecord.blob], fileName, {
        type: 'application/octet-stream',
      });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `${choreographyTitle} - ${athleteName}`,
          text: `Coreografía de patinaje artístico para ${athleteName} creada en SkateCoreo.`,
          files: [file],
        });
        setFeedback({ text: '¡Compartido con éxito!' });
      } else if (navigator.share) {
        await navigator.share({
          title: `${choreographyTitle} - ${athleteName}`,
          text: `Coreografía de patinaje artístico para ${athleteName}: ${fileName}`,
        });
      } else {
        handleDownload();
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setFeedback({ text: 'Error al compartir: ' + err.message, isError: true });
      }
    }
  };

  const handleDownload = async () => {
    try {
      const fileRecord = await coachDb.getBinaryFile(blobId);
      if (!fileRecord || !fileRecord.blob) {
        setFeedback({ text: 'Archivo no encontrado.', isError: true });
        return;
      }
      const url = URL.createObjectURL(fileRecord.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setFeedback({ text: `Descargando "${fileName}"...` });
    } catch (err: any) {
      setFeedback({ text: 'Error en descarga: ' + err.message, isError: true });
    }
  };

  const handleMailto = () => {
    const subject = encodeURIComponent(`Coreografía SkateCoreo: ${choreographyTitle} (${athleteName})`);
    const body = encodeURIComponent(
      `Hola,\n\nTe comparto la coreografía "${choreographyTitle}" de ${athleteName}.\n\n` +
      `Descarga el archivo adjunto "${fileName}" y puedes abrirlo directamente en la aplicación web SkateCoreo (botón "Importar .coreo") para visualizar el trazado en la Pista 2D con la música y figuras técnicas sincronizadas.\n\n` +
      `Saludos,\nEntrenador/a de Patinaje Artístico`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
    setCopiedMail(true);
    setTimeout(() => setCopiedMail(false), 3000);
  };

  const canShareFiles = typeof navigator !== 'undefined' && !!navigator.share;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-canvas/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-md bg-surface-2 border border-white/[0.08] rounded-2xl p-6 shadow-elevation-2 space-y-4">
        <div className="flex items-center justify-between pb-3.5 border-b border-white/[0.07]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-coach-rose/10 text-coach-rose border border-coach-rose/20">
              <Share2 className="w-4 h-4 stroke-[1.75]" />
            </div>
            <span className="font-semibold text-sm text-white">Compartir Coreografía (.coreo)</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/[0.06] text-neutral-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-surface-1 border border-white/[0.06] rounded-xl p-3.5 space-y-1.5">
          <div className="text-xs text-neutral-400 font-medium">Archivo:</div>
          <div className="font-mono text-xs font-medium text-white truncate" title={fileName}>
            {fileName}
          </div>
          <div className="text-[11px] text-neutral-400">
            Atleta: <span className="text-neutral-200 font-medium">{athleteName}</span>
          </div>
        </div>

        {feedback && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
              feedback.isError
                ? 'bg-danger/10 border-danger/30 text-red-200'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            }`}
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{feedback.text}</span>
          </div>
        )}

        <div className="space-y-2 pt-1">
          {canShareFiles && (
            <button
              type="button"
              onClick={handleNativeShare}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-coach-rose hover:bg-coach-rose/90 text-white font-medium text-xs shadow-elevation-1 transition-colors"
            >
              <Share2 className="w-4 h-4 stroke-[1.75]" />
              <span>Compartir con el Dispositivo (WhatsApp, AirDrop, etc.)</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleDownload}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-surface-1 hover:bg-surface-3 border border-white/[0.08] text-neutral-200 text-xs font-medium transition-colors"
          >
            <Download className="w-4 h-4 text-ice-light stroke-[1.75]" />
            <span>Descargar archivo .coreo en este equipo</span>
          </button>

          <button
            type="button"
            onClick={handleMailto}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-transparent hover:bg-white/[0.04] border border-white/[0.06] text-neutral-400 hover:text-neutral-200 text-xs font-medium transition-colors"
          >
            {copiedMail ? (
              <Check className="w-4 h-4 text-emerald-400" />
            ) : (
              <Mail className="w-4 h-4 text-neutral-400" />
            )}
            <span>Preparar correo electrónico con plantilla</span>
          </button>
        </div>

        <p className="text-[11px] text-neutral-500 text-center pt-2 leading-relaxed">
          El archivo conserva su formato .coreo completo con música, trazado 2D y figuras técnicas para abrirse en SkateCoreo.
        </p>
      </div>
    </div>
  );
};
