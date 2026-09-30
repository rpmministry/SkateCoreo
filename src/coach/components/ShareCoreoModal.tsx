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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-surface-2 border border-white/[0.08] rounded-3xl p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2 text-[#78a9ff] font-bold text-sm">
            <Share2 className="w-4 h-4 text-[#78a9ff]" />
            <span>Compartir Coreografía (.coreo)</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-surface-1 border border-white/5 rounded-2xl p-4 space-y-2">
          <div className="text-xs text-slate-400">Archivo:</div>
          <div className="font-mono text-xs font-bold text-white truncate" title={fileName}>
            {fileName}
          </div>
          <div className="text-[11px] text-slate-400">
            Atleta: <span className="text-slate-200 font-semibold">{athleteName}</span>
          </div>
        </div>

        {feedback && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
              feedback.isError
                ? 'bg-[#da1e28]/15 border-[#da1e28]/40 text-[#fa4d56]'
                : 'bg-[#198038]/20 border-[#24a148]/30 text-[#42be65]'
            }`}
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{feedback.text}</span>
          </div>
        )}

        <div className="space-y-2.5 pt-1">
          {canShareFiles && (
            <button
              type="button"
              onClick={handleNativeShare}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#0f62fe] text-white font-bold text-xs shadow-sm hover:bg-[#0353e9] transition-all interactive-tap"
            >
              <Share2 className="w-4 h-4" />
              <span>Compartir con el Dispositivo (WhatsApp, AirDrop, etc.)</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleDownload}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-white/[0.06] hover:bg-white/10 border border-white/10 text-slate-200 text-xs font-bold transition-all interactive-tap"
          >
            <Download className="w-4 h-4 text-[#78a9ff]" />
            <span>Descargar archivo .coreo en este equipo</span>
          </button>

          <button
            type="button"
            onClick={handleMailto}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 text-slate-300 text-xs font-semibold transition-all interactive-tap"
          >
            {copiedMail ? <Check className="w-4 h-4 text-[#42be65]" /> : <Mail className="w-4 h-4 text-slate-400" />}
            <span>Preparar correo electrónico con plantilla</span>
          </button>
        </div>

        <p className="text-[10px] text-slate-500 text-center pt-2">
          El archivo conserva su formato .coreo completo con música, trazado 2D y figuras técnicas para abrirse en SkateCoreo.
        </p>
      </div>
    </div>
  );
};
