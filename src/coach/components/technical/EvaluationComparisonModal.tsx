/**
 * EvaluationComparisonModal.tsx — Modal Comparador Profesional entre Evaluaciones
 *
 * Permite seleccionar dos evaluaciones de la misma atleta y comparar
 * lado a lado la evolución real en puntuaciones oficiales (TES, PCS, Deducciones, TSS)
 * y la evolución pedagógica de metas técnicas.
 */

import React, { useState } from 'react';
import { X, TrendingUp, TrendingDown, ArrowRight, Award } from 'lucide-react';
import { CoachEvaluation } from '../../types';
import { EvaluationEngine } from '../../services/evaluationEngine';

interface EvaluationComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  evaluations: CoachEvaluation[];
  athleteName: string;
}

export const EvaluationComparisonModal: React.FC<EvaluationComparisonModalProps> = ({
  isOpen,
  onClose,
  evaluations,
  athleteName,
}) => {
  if (!isOpen) return null;

  // Si hay al menos 2 evaluaciones, seleccionamos por defecto la última y la penúltima
  const [firstId, setFirstId] = useState<string>(
    evaluations.length >= 2 ? evaluations[1].id : evaluations[0]?.id || ''
  );
  const [secondId, setSecondId] = useState<string>(evaluations[0]?.id || '');

  const evalA = evaluations.find((e) => e.id === firstId);
  const evalB = evaluations.find((e) => e.id === secondId);

  const comparison = evalA && evalB && evalA.id !== evalB.id
    ? EvaluationEngine.compareEvaluations(evalA, evalB)
    : null;

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-white">
        {/* Cabecera del Modal */}
        <div className="p-4 sm:p-6 border-b border-white/10 flex items-center justify-between shrink-0 bg-slate-950/60">
          <div>
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-[#78a9ff]" />
              <h2 className="text-lg font-black tracking-tight text-white">
                Comparativa de Evaluaciones · {athleteName}
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Análisis comparativo de evolución técnica y componentes dentro de SkateCoreo.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Selectores de Evaluaciones */}
        <div className="p-4 sm:p-6 border-b border-white/10 bg-slate-900/80 grid grid-cols-1 sm:grid-cols-2 gap-4 shrink-0">
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Evaluación Base (Anterior)
            </label>
            <select
              value={firstId}
              onChange={(e) => setFirstId(e.target.value)}
              className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-[#0f62fe]"
            >
              {evaluations.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {formatDate(ev.date)} — {ev.discipline} {ev.programSegment} (TSS: {ev.scoresSummary.totalScore.toFixed(2)})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Evaluación Objetivo (Reciente / Actual)
            </label>
            <select
              value={secondId}
              onChange={(e) => setSecondId(e.target.value)}
              className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-[#0f62fe]"
            >
              {evaluations.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {formatDate(ev.date)} — {ev.discipline} {ev.programSegment} (TSS: {ev.scoresSummary.totalScore.toFixed(2)})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Contenido Comparativo */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 scroll-touch">
          {evalA && evalB ? (
            <>
              {/* Tarjetas de Diferencial Global */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* TSS */}
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Total Score (TSS)</span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-xl font-black text-white font-mono">
                      {evalB.scoresSummary.totalScore.toFixed(2)}
                    </span>
                    {comparison && (
                      <span
                        className={`text-xs font-bold flex items-center ${
                          comparison.diffTotal >= 0 ? 'text-teal-400' : 'text-rose-400'
                        }`}
                      >
                        {comparison.diffTotal >= 0 ? (
                          <TrendingUp className="w-3.5 h-3.5 mr-0.5" />
                        ) : (
                          <TrendingDown className="w-3.5 h-3.5 mr-0.5" />
                        )}
                        {comparison.diffTotal >= 0 ? `+${comparison.diffTotal.toFixed(2)}` : comparison.diffTotal.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1">Base: {evalA.scoresSummary.totalScore.toFixed(2)}</span>
                </div>

                {/* TES */}
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Técnico (TES)</span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-xl font-black text-[#78a9ff] font-mono">
                      {evalB.scoresSummary.tes.toFixed(2)}
                    </span>
                    {comparison && (
                      <span
                        className={`text-xs font-bold flex items-center ${
                          comparison.diffTes >= 0 ? 'text-teal-400' : 'text-rose-400'
                        }`}
                      >
                        {comparison.diffTes >= 0 ? `+${comparison.diffTes.toFixed(2)}` : comparison.diffTes.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1">Base: {evalA.scoresSummary.tes.toFixed(2)}</span>
                </div>

                {/* PCS */}
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Artístico (PCS)</span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-xl font-black text-slate-200 font-mono">
                      {evalB.scoresSummary.pcs.toFixed(2)}
                    </span>
                    {comparison && (
                      <span
                        className={`text-xs font-bold flex items-center ${
                          comparison.diffPcs >= 0 ? 'text-teal-400' : 'text-rose-400'
                        }`}
                      >
                        {comparison.diffPcs >= 0 ? `+${comparison.diffPcs.toFixed(2)}` : comparison.diffPcs.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1">Base: {evalA.scoresSummary.pcs.toFixed(2)}</span>
                </div>

                {/* Deducciones */}
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Deducciones</span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-xl font-black text-rose-400 font-mono">
                      -{evalB.scoresSummary.deductions.toFixed(2)}
                    </span>
                    {comparison && (
                      <span className="text-xs font-bold text-slate-400">
                        {comparison.diffDeductions === 0 ? 'Sin cambio' : `${comparison.diffDeductions > 0 ? '+' : ''}${comparison.diffDeductions.toFixed(2)}`}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1">Base: -{evalA.scoresSummary.deductions.toFixed(2)}</span>
                </div>
              </div>

              {/* Comparativa Detallada de Componentes Artísticos */}
              {evalA.artisticComponents && evalB.artisticComponents && (
                <div className="p-4 rounded-2xl bg-slate-950/40 border border-white/10 space-y-3">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-300">
                    Evolución en Componentes Artísticos (PCS)
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    {[
                      {
                        name: 'Skating Skills',
                        vA: evalA.artisticComponents.skatingSkills,
                        vB: evalB.artisticComponents.skatingSkills,
                      },
                      {
                        name: 'Transitions',
                        vA: evalA.artisticComponents.transitions,
                        vB: evalB.artisticComponents.transitions,
                      },
                      {
                        name: 'Performance',
                        vA: evalA.artisticComponents.performance,
                        vB: evalB.artisticComponents.performance,
                      },
                      {
                        name: 'Choreography',
                        vA: evalA.artisticComponents.choreography,
                        vB: evalB.artisticComponents.choreography,
                      },
                    ].map((c) => {
                      const d = c.vB - c.vA;
                      return (
                        <div key={c.name} className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                          <span className="text-[10px] text-slate-400 font-bold">{c.name}</span>
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-slate-400">{c.vA.toFixed(2)}</span>
                            <ArrowRight className="w-3 h-3 text-slate-600" />
                            <span className="font-mono font-bold text-white">{c.vB.toFixed(2)}</span>
                          </div>
                          <div className={`text-[10px] font-bold text-right ${d >= 0 ? 'text-teal-400' : 'text-rose-400'}`}>
                            {d >= 0 ? `+${d.toFixed(2)}` : d.toFixed(2)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Comparación de Feedback Pedagógico */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Evaluación A */}
                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-white/5">
                    <span className="text-xs font-bold text-slate-300">Base ({formatDate(evalA.date)})</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-slate-400 font-mono">
                      {evalA.regulationTitle}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-teal-400 uppercase">Fortalezas:</span>
                    <p className="text-xs text-slate-300 mt-1">
                      {evalA.feedback.strengths.join(' • ') || 'Sin fortalezas registradas.'}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-rose-400 uppercase">Correcciones Clave:</span>
                    <ul className="text-xs text-slate-300 mt-1 space-y-1">
                      {evalA.feedback.technicalCorrections.map((c) => (
                        <li key={c.id}>• [{c.priority}] {c.item}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Evaluación B */}
                <div className="p-4 rounded-2xl bg-[#0f62fe]/10 border border-[#0f62fe]/30 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-[#0f62fe]/20">
                    <span className="text-xs font-bold text-[#78a9ff]">Actual ({formatDate(evalB.date)})</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#0f62fe]/20 text-[#78a9ff] font-mono">
                      {evalB.regulationTitle}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-teal-400 uppercase">Fortalezas:</span>
                    <p className="text-xs text-slate-300 mt-1">
                      {evalB.feedback.strengths.join(' • ') || 'Sin fortalezas registradas.'}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-rose-400 uppercase">Correcciones Clave:</span>
                    <ul className="text-xs text-slate-300 mt-1 space-y-1">
                      {evalB.feedback.technicalCorrections.map((c) => (
                        <li key={c.id}>• [{c.priority}] {c.item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-slate-400 text-xs">
              Selecciona dos evaluaciones diferentes para visualizar la comparación.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
