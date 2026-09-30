/**
 * AthleteEvaluationsList.tsx — Historial y Evolución de Evaluaciones de la Atleta
 *
 * Muestra el registro cronológico completo de evaluaciones técnicas realizadas a la atleta:
 *  - Indicadores de evolución (tendencia de puntajes y mejoras)
 *  - Botones para descargar Ficha Individual PDF A4, Historial PDF y .coreo completo
 *  - Modal comparador de evaluaciones
 *  - Acceso directo a iniciar una Nueva Evaluación técnica
 */

import React, { useState } from 'react';
import {
  Award,
  Plus,
  FileText,
  Download,
  Trash2,
  Calendar,
  ArrowRightLeft,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { CoachAthlete, CoachEvaluation } from '../../types';
import { useCoachStore } from '../../store/useCoachStore';
import { EvaluationPdfService } from '../../services/evaluationPdfService';
import { EvaluationComparisonModal } from './EvaluationComparisonModal';
import { exportCoreoProject } from '../../../services/coreoPackage';
import { coachDb } from '../../services/coachDb';
import { Card, Button } from '../../../components/ui';

interface AthleteEvaluationsListProps {
  athlete: CoachAthlete;
  onStartNewEvaluation: () => void;
}

export const AthleteEvaluationsList: React.FC<AthleteEvaluationsListProps> = ({
  athlete,
  onStartNewEvaluation,
}) => {
  const {
    athleteEvaluations,
    deleteEvaluation,
    athleteChoreographies,
    profile,
  } = useCoachStore();

  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [isExportingCoreo, setIsExportingCoreo] = useState(false);

  // Ordenadas por fecha descendente (más reciente primero)
  const sortedEvals = React.useMemo(() => {
    return [...athleteEvaluations].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [athleteEvaluations]);

  // Métricas acumuladas reales
  const stats = React.useMemo(() => {
    if (sortedEvals.length === 0) return null;
    const scores = sortedEvals.map((e) => e.scoresSummary.totalScore);
    const maxScore = Math.max(...scores);
    const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    return {
      total: sortedEvals.length,
      max: maxScore.toFixed(2),
      avg: avgScore.toFixed(2),
      latest: sortedEvals[0].scoresSummary.totalScore.toFixed(2),
    };
  }, [sortedEvals]);

  const handleDownloadSinglePdf = (evaluation: CoachEvaluation) => {
    setDownloadingId(evaluation.id);
    try {
      const doc = EvaluationPdfService.generateSingleEvaluationPdf(evaluation, athlete, profile);
      const safeName = athlete.name.replace(/\s+/g, '_');
      const dStr = new Date(evaluation.date).toISOString().slice(0, 10);
      doc.save(`Evaluacion_${safeName}_${dStr}.pdf`);
    } catch (e: any) {
      alert('Error al generar la ficha PDF: ' + e.message);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDownloadHistoryPdf = () => {
    if (sortedEvals.length === 0) return;
    try {
      const doc = EvaluationPdfService.generateAthleteHistoryPdf(sortedEvals, athlete, profile);
      const safeName = athlete.name.replace(/\s+/g, '_');
      doc.save(`Historial_Evaluaciones_${safeName}.pdf`);
    } catch (e: any) {
      alert('Error al generar el historial PDF: ' + e.message);
    }
  };

  const handleDownloadCompleteCoreo = async () => {
    setIsExportingCoreo(true);
    try {
      // Buscar la coreografía más reciente o la primera de la atleta
      let points: any[] = [];
      let audioBlob: Blob | null = null;
      let choreoTitle = `${athlete.name} - Entrenamiento Completo`;

      if (athleteChoreographies.length > 0) {
        const choreo = athleteChoreographies[0];
        choreoTitle = choreo.title;
        if (choreo.versions.length > 0) {
          const v = choreo.versions[choreo.versions.length - 1];
          if (v.coreoBlobId) {
            const fileRec = await coachDb.getBinaryFile(v.coreoBlobId);
            if (fileRec && fileRec.blob) {
              // Desempaquetar temporalmente para extraer audio y puntos
              const JSZip = (await import('jszip')).default;
              const zip = await JSZip.loadAsync(fileRec.blob);
              const nodesFile = zip.file('nodes.json');
              if (nodesFile) {
                points = JSON.parse(await nodesFile.async('string'));
              }
              const audioFile = zip.file('audio.bin');
              if (audioFile) {
                audioBlob = new Blob([await audioFile.async('arraybuffer')], { type: 'audio/wav' });
              }
            }
          }
        }
      }

      // Exportar paquete .coreo con el historial de evaluaciones integrado
      const coreoBlob = await exportCoreoProject(
        choreoTitle,
        athlete.category,
        athlete.gender || 'female',
        points,
        audioBlob,
        'audio.wav',
        120,
        4,
        1.0,
        1,
        sortedEvals
      );

      const url = URL.createObjectURL(coreoBlob);
      const a = document.createElement('a');
      a.href = url;
      const safeName = athlete.name.replace(/\s+/g, '_');
      a.download = `${safeName}_Entrenamiento_Completo_2026.coreo`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert('Error al exportar entrenamiento completo: ' + e.message);
    } finally {
      setIsExportingCoreo(false);
    }
  };

  const handleDelete = async (id: string, dateStr: string) => {
    if (window.confirm(`¿Estás seguro de eliminar la evaluación del ${dateStr}?`)) {
      await deleteEvaluation(id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Barra de Acciones y Resumen Superior */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5 rounded-2xl bg-surface-2 border border-white/[0.08] shadow-elevation-1">
        <div>
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-[#78a9ff]" />
            <h3 className="text-base font-black text-white tracking-tight">
              Puntajes y Evaluaciones de Entrenamiento
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Simulaciones reglamentarias basadas en World Skate RollArt 2026, FEP Nacional y Sistema White.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {sortedEvals.length >= 2 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsCompareModalOpen(true)}
              icon={<ArrowRightLeft className="w-3.5 h-3.5 text-[#78a9ff]" />}
            >
              Comparar
            </Button>
          )}

          {sortedEvals.length > 0 && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDownloadHistoryPdf}
                icon={<FileText className="w-3.5 h-3.5 text-amber-400" />}
                title="Descarga documento A4 con el historial técnico consolidado"
              >
                Historial PDF
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={handleDownloadCompleteCoreo}
                disabled={isExportingCoreo}
                icon={<Download className={`w-3.5 h-3.5 ${isExportingCoreo ? 'animate-bounce' : ''}`} />}
                title="Descarga el archivo .coreo completo con música, pista 2D y evaluaciones integradas"
              >
                {isExportingCoreo ? 'Exportando...' : 'Descargar .coreo'}
              </Button>
            </>
          )}

          <Button
            variant="cobalt"
            size="sm"
            onClick={onStartNewEvaluation}
            icon={<Plus className="w-4 h-4 stroke-[2.5]" />}
          >
            Nueva Evaluación
          </Button>
        </div>
      </div>

      {/* Tarjetas KPI de Desempeño */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card surface={2} className="p-4 space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Evaluaciones</span>
            <div className="text-2xl font-black text-white font-mono">{stats.total}</div>
          </Card>
          <Card surface={2} className="p-4 space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Última Puntuación</span>
            <div className="text-2xl font-black text-cobalt-400 font-mono">{stats.latest}</div>
          </Card>
          <Card surface={2} className="p-4 space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Puntuación Promedio</span>
            <div className="text-2xl font-black text-slate-200 font-mono">{stats.avg}</div>
          </Card>
          <Card surface={2} className="p-4 space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mejor Registro (TSS)</span>
            <div className="text-2xl font-black text-mint-400 font-mono">{stats.max}</div>
          </Card>
        </div>
      )}

      {/* Lista Cronológica de Evaluaciones */}
      {sortedEvals.length === 0 ? (
        <div className="text-center py-16 px-4 rounded-2xl bg-surface-2 border border-white/[0.08] space-y-3 shadow-elevation-1">
          <Award className="w-10 h-10 text-slate-600 mx-auto" />
          <h4 className="text-sm font-bold text-slate-300">Aún no hay evaluaciones registradas</h4>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Inicia una evaluación técnica para calificar los elementos de la rutina, registrar componentes y entregar feedback estructurado.
          </p>
          <Button
            variant="cobalt"
            size="sm"
            onClick={onStartNewEvaluation}
            icon={<Plus className="w-4 h-4" />}
          >
            Iniciar Primera Evaluación
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedEvals.map((ev, idx) => {
            const prevEval = sortedEvals[idx + 1];
            const diff = prevEval
              ? Math.round((ev.scoresSummary.totalScore - prevEval.scoresSummary.totalScore) * 100) / 100
              : null;

            const dateStr = new Date(ev.date).toLocaleDateString('es-ES', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div
                key={ev.id}
                className="p-4 sm:p-5 rounded-2xl bg-surface-2 border border-white/[0.08] hover:border-[#0f62fe]/40 shadow-elevation-1 transition-all space-y-4"
              >
                {/* Cabecera de la Tarjeta */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/5">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full bg-[#0f62fe]/15 text-[#78a9ff] border border-[#0f62fe]/30 text-[10px] font-bold uppercase">
                      {ev.discipline} · {ev.programSegment}
                    </span>
                    <span className="text-xs text-slate-300 font-semibold">{ev.choreographyTitle || 'Rutina'}</span>
                    <span className="text-[10px] text-slate-500 font-mono">({ev.regulationTitle})</span>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <div className="flex items-center gap-1 text-slate-400 text-[11px]">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{dateStr}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDownloadSinglePdf(ev)}
                      disabled={downloadingId === ev.id}
                      className="p-1.5 rounded-lg bg-surface-1 hover:bg-white/10 text-slate-300 hover:text-white transition-all text-xs border border-white/5"
                      title="Descargar Ficha PDF A4 Oficial"
                    >
                      <FileText className="w-4 h-4 text-[#78a9ff]" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(ev.id, dateStr)}
                      className="p-1.5 rounded-lg bg-surface-1 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-all text-xs border border-white/5"
                      title="Eliminar evaluación"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Grid de Puntuaciones */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-surface-1 border border-white/5">
                    <span className="text-[9px] text-slate-400 font-bold uppercase">TES (Técnico)</span>
                    <div className="text-base font-black text-[#78a9ff] font-mono">{ev.scoresSummary.tes.toFixed(2)}</div>
                    <span className="text-[9px] text-slate-500">{ev.scoresSummary.elementsCount} elem. válidos</span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-surface-1 border border-white/5">
                    <span className="text-[9px] text-slate-400 font-bold uppercase">PCS (Artístico)</span>
                    <div className="text-base font-black text-slate-200 font-mono">{ev.scoresSummary.pcs.toFixed(2)}</div>
                    <span className="text-[9px] text-slate-500">
                      Factor {ev.artisticComponents?.factor.toFixed(1) || '1.0'}x
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-surface-1 border border-white/5">
                    <span className="text-[9px] text-slate-400 font-bold uppercase">Deducciones</span>
                    <div className="text-base font-black text-rose-400 font-mono">
                      -{ev.scoresSummary.deductions.toFixed(2)}
                    </div>
                    <span className="text-[9px] text-slate-500">{ev.deductions.fallsCount} caídas</span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-[#0f62fe]/10 border border-[#0f62fe]/30">
                    <span className="text-[9px] text-[#78a9ff] font-bold uppercase">TOTAL (TSS)</span>
                    <div className="flex items-baseline justify-between">
                      <span className="text-base font-black text-white font-mono">
                        {ev.scoresSummary.totalScore.toFixed(2)}
                      </span>
                      {diff !== null && (
                        <span
                          className={`text-[10px] font-bold flex items-center ${
                            diff >= 0 ? 'text-teal-400' : 'text-rose-400'
                          }`}
                        >
                          {diff >= 0 ? '+' : ''}{diff.toFixed(2)}
                        </span>
                      )}
                    </div>
                    <span className="text-[9px] text-slate-400">Puntaje oficial</span>
                  </div>
                </div>

                {/* Aspectos Pedagógicos Destacados */}
                <div className="space-y-1.5 pt-1 text-xs">
                  {ev.feedback.strengths.length > 0 && (
                    <div className="flex items-start gap-1.5 text-slate-300">
                      <Sparkles className="w-3.5 h-3.5 text-teal-400 shrink-0 mt-0.5" />
                      <span className="text-slate-400 font-bold shrink-0">Fortalezas:</span>
                      <span className="truncate">{ev.feedback.strengths.join(' • ')}</span>
                    </div>
                  )}

                  {ev.feedback.technicalCorrections.length > 0 && (
                    <div className="flex items-start gap-1.5 text-slate-300">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <span className="text-slate-400 font-bold shrink-0">Corrección prioritaria:</span>
                      <span className="truncate">
                        [{ev.feedback.technicalCorrections[0].priority.toUpperCase()}]{' '}
                        {ev.feedback.technicalCorrections[0].item}
                      </span>
                    </div>
                  )}

                  {ev.feedback.nextGoals.length > 0 && (
                    <div className="flex items-start gap-1.5 text-slate-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#78a9ff] shrink-0 mt-0.5" />
                      <span className="text-slate-400 font-bold shrink-0">Objetivo próximo:</span>
                      <span className="truncate">{ev.feedback.nextGoals.join(' • ')}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Comparador */}
      <EvaluationComparisonModal
        isOpen={isCompareModalOpen}
        onClose={() => setIsCompareModalOpen(false)}
        evaluations={sortedEvals}
        athleteName={athlete.name}
      />
    </div>
  );
};
