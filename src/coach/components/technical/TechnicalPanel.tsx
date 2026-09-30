/**
 * TechnicalPanel.tsx — Panel Técnico Profesional de Evaluación de Rutinas y Coreografías
 *
 * Módulo oficial para entrenadores de Patinaje Artístico sobre 4 Ruedas.
 * Permite realizar evaluaciones técnicas de entrenamiento basadas rigurosamente
 * en World Skate RollArt 2026, Reglamento Nacional FEP 2026 y Sistema White.
 */

import React, { useState, useEffect } from 'react';
import {
  Award,
  Layers,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Save,
  Send,
  FileText,
  Sliders,
  Plus,
  Trash2,
  User,
  Compass,
} from 'lucide-react';
import {
  CoachAthlete,
  CoachEvaluation,
  RegulationSystemId,
  EvaluationDiscipline,
  EvaluationSegment,
  EvaluationElementRecord,
  TechnicalCorrectionItem,
} from '../../types';
import { useCoachStore } from '../../store/useCoachStore';
import { EvaluationEngine } from '../../services/evaluationEngine';
import {
  ROLLART_ALL_ELEMENTS_2026,
  ROLLART_JUMPS_2026,
  ROLLART_SPINS_2026,
  ROLLART_STEPS_2026,
  ROLLART_DANCE_2026,
  ROLLART_STANDARD_DEDUCTIONS,
} from '../../../constants/regulations/rollartCatalog2026';
import {
  FEP_EFFICIENCY_RULES_2026,
} from '../../../constants/regulations/fepCatalog2026';
import {
  WHITE_FIGURE_CRITERIA,
  WHITE_FIGURE_DEDUCTIONS,
} from '../../../constants/regulations/figuresWhiteCatalog2026';
import { EvaluationPdfService } from '../../services/evaluationPdfService';

export const TechnicalPanel: React.FC = () => {
  const {
    athletes,
    selectedAthlete,
    evaluationTargetAthlete,
    evaluationTargetChoreography,
    athleteChoreographies,
    saveEvaluation,
    profile,
    setActiveCoachTab,
    selectAthlete,
  } = useCoachStore();

  // Atleta seleccionada para la evaluación
  const [currentAthlete, setCurrentAthlete] = useState<CoachAthlete | null>(
    evaluationTargetAthlete || selectedAthlete || (athletes.length > 0 ? athletes[0] : null)
  );

  // Parámetros de la Evaluación
  const [regulationId, setRegulationId] = useState<RegulationSystemId>('WORLD_SKATE_ROLLART_2026');
  const [discipline, setDiscipline] = useState<EvaluationDiscipline>('Libre');
  const [programSegment, setProgramSegment] = useState<EvaluationSegment>('Largo');
  const [selectedChoreoId, setSelectedChoreoId] = useState<string>(
    evaluationTargetChoreography?.id || (athleteChoreographies.length > 0 ? athleteChoreographies[0].id : '')
  );

  // Lista de Elementos Técnicos Llamados
  const [elements, setElements] = useState<EvaluationElementRecord[]>([]);

  // Elemento en edición / constructor de llamada
  const [selectedElementCategory, setSelectedElementCategory] = useState<'Jump' | 'Spin' | 'Step' | 'Dance' | 'NJ'>('Jump');
  const [elementCode, setElementCode] = useState<string>('1A');
  const [rotationsCount, setRotationsCount] = useState<number>(1.5);
  const [deductionCode, setDeductionCode] = useState<'<' | '<<' | '<<<' | null>(null);
  const [edgeIndicator, setEdgeIndicator] = useState<'Outside' | 'Inside' | 'Flat' | 'e' | null>(null);
  const [qoeScore, setQoeScore] = useState<number>(0);
  const [isTimeBonus, setIsTimeBonus] = useState<boolean>(false);
  const [elementNotes, setElementNotes] = useState<string>('');

  // Componentes Artísticos (PCS)
  const [artisticComponents, setArtisticComponents] = useState({
    skatingSkills: 5.5,
    transitions: 5.25,
    performance: 5.5,
    choreography: 5.5,
  });

  // Marcas de Figuras Obligatorias (White System)
  const [figureMarks, setFigureMarks] = useState({
    tracing: 6.0,
    movement: 6.0,
    carriage: 6.0,
  });
  const [selectedFigureGroup, setSelectedFigureGroup] = useState<string>('Grupo 1');

  // Deducciones
  const [fallsCount, setFallsCount] = useState<number>(0);
  const [timeViolationSeconds, setTimeViolationSeconds] = useState<number>(0);
  const [costumeViolation, setCostumeViolation] = useState<boolean>(false);
  const [musicViolation, setMusicViolation] = useState<boolean>(false);

  // Feedback Pedagógico del Entrenador (Evaluación Interna)
  const [strengths, setStrengths] = useState<string[]>([]);
  const [newStrength, setNewStrength] = useState<string>('');
  const [corrections, setCorrections] = useState<TechnicalCorrectionItem[]>([]);
  const [newCorrection, setNewCorrection] = useState<string>('');
  const [newCorrectionPriority, setNewCorrectionPriority] = useState<'urgente' | 'importante' | 'recomendacion'>('importante');
  const [spatialDistribution, setSpatialDistribution] = useState<string>('');
  const [musicalityNotes, setMusicalityNotes] = useState<string>('');
  const [nextGoals, setNextGoals] = useState<string[]>([]);
  const [newGoal, setNewGoal] = useState<string>('');
  const [generalObservations, setGeneralObservations] = useState<string>('');

  // Estado de Guardado
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccessMessage, setSavedSuccessMessage] = useState<string | null>(null);

  // Sincronizar si cambia evaluationTargetAthlete
  useEffect(() => {
    if (evaluationTargetAthlete) {
      setCurrentAthlete(evaluationTargetAthlete);
    }
  }, [evaluationTargetAthlete]);

  // Si cambia la disciplina a Figuras, ajustar el reglamento correspondiente
  useEffect(() => {
    if (discipline === 'Figuras') {
      setRegulationId('WHITE_FIGURES_2026');
      setProgramSegment('Figuras');
    } else if (regulationId === 'WHITE_FIGURES_2026') {
      setRegulationId('WORLD_SKATE_ROLLART_2026');
      setProgramSegment('Largo');
    }
  }, [discipline]);

  // Si cambia el código de elemento, inicializar rotaciones estándar
  useEffect(() => {
    const def = ROLLART_ALL_ELEMENTS_2026[elementCode];
    if (def) {
      if (def.type === 'Jump') {
        setRotationsCount(def.rotations ?? 1);
      } else if (def.type === 'Spin') {
        setRotationsCount(3); // Mínimo reglamentario
      }
      if (def.requiresEdge) {
        setEdgeIndicator(def.requiresEdge);
      } else {
        setEdgeIndicator(null);
      }
    }
    setDeductionCode(null);
    setQoeScore(0);
  }, [elementCode]);

  // Cálculo en tiempo real de puntuaciones
  const categoryName = currentAthlete?.category || 'CADET';
  const isShortProgram = programSegment === 'Corto';

  const calculatedPcs = React.useMemo(() => {
    return EvaluationEngine.calculatePCS(artisticComponents, categoryName, isShortProgram);
  }, [artisticComponents, categoryName, isShortProgram]);

  const calculatedFigureScore = React.useMemo(() => {
    const ded = (fallsCount > 0 ? WHITE_FIGURE_DEDUCTIONS.FALL_OR_STOP * fallsCount : 0) +
      (costumeViolation ? WHITE_FIGURE_DEDUCTIONS.DRESS_CODE_VIOLATION : 0);
    return EvaluationEngine.calculateWhiteFigures(figureMarks, ded);
  }, [figureMarks, fallsCount, costumeViolation]);

  const deductionsSummary = React.useMemo(() => {
    const catUpper = String(categoryName).toUpperCase();
    const isChild = catUpper === 'TOTS' || catUpper === 'TOT' || catUpper === 'MINIS' || catUpper === 'MINI' || catUpper === 'ESPOIR' || discipline === 'Solo Danza';
    const fallVal = isChild
      ? ROLLART_STANDARD_DEDUCTIONS.FALL_ESPOIR_MINIS_TOTS
      : ROLLART_STANDARD_DEDUCTIONS.FALL_SENIOR_JUNIOR_CADET;

    const fallsDeduction = fallsCount * fallVal;
    const timeBlocks = Math.ceil(timeViolationSeconds / 10);
    const timeDeduction = timeBlocks * ROLLART_STANDARD_DEDUCTIONS.TIME_VIOLATION_PER_10S;
    const costumeDeduction = costumeViolation ? ROLLART_STANDARD_DEDUCTIONS.COSTUME_ACCESSORY_DROP : 0;
    const musicViolationDeduction = musicViolation ? ROLLART_STANDARD_DEDUCTIONS.MUSIC_LYRICS_VIOLATION : 0;

    const totalDeductions = fallsDeduction + timeDeduction + costumeDeduction + musicViolationDeduction;

    return {
      fallsCount,
      fallsDeduction,
      timeViolationSeconds,
      timeDeduction,
      costumeDeduction,
      musicViolationDeduction,
      otherDeductions: 0,
      totalDeductions,
    };
  }, [fallsCount, timeViolationSeconds, costumeViolation, musicViolation, categoryName, discipline]);

  const scoresSummary = React.useMemo(() => {
    if (discipline === 'Figuras') {
      return {
        tes: 0,
        pcs: calculatedFigureScore.marks.average,
        deductions: deductionsSummary.totalDeductions,
        totalScore: calculatedFigureScore.totalScore,
        elementsCount: 1,
        bonusTCount: 0,
      };
    }

    return EvaluationEngine.calculateTotalSegmentScore({
      elements,
      artisticComponents: calculatedPcs,
      deductions: deductionsSummary,
    });
  }, [elements, calculatedPcs, deductionsSummary, discipline, calculatedFigureScore]);

  // Validación de advertencia según eficiencias FEP
  const fepWarning = React.useMemo(() => {
    if (regulationId !== 'FEP_ECUADOR_2026' || !currentAthlete?.eficiencia) return null;
    const eff = currentAthlete.eficiencia;
    const rules = FEP_EFFICIENCY_RULES_2026[eff];
    if (!rules) return null;

    // Verificar si algún elemento llamado está prohibido en esta eficiencia
    for (const el of elements) {
      if (rules.prohibitedJumps.includes(el.code)) {
        return `El elemento "${el.code}" está PROHIBIDO en la eficiencia ${eff} según el Reglamento FEP 2026.`;
      }
    }
    return null;
  }, [regulationId, currentAthlete, elements]);

  // Agregar elemento a la rutina evaluada
  const handleAddElement = () => {
    const computed = EvaluationEngine.calculateElement({
      code: elementCode,
      executionTimestampMs: 0,
      halfTimeMs: isTimeBonus ? 0 : 999999, // Si el usuario marcó Bono T, forzar halfTime
      rotationsCount,
      deductionCode,
      edgeIndicator,
      qoeScore,
      customName: elementNotes || undefined,
    });

    setElements([...elements, computed]);
    setElementNotes('');
  };

  const handleRemoveElement = (id: string) => {
    setElements(elements.filter((e) => e.id !== id));
  };

  // Agregar fortalezas, correcciones y objetivos
  const handleAddStrength = () => {
    if (!newStrength.trim()) return;
    setStrengths([...strengths, newStrength.trim()]);
    setNewStrength('');
  };

  const handleAddCorrection = () => {
    if (!newCorrection.trim()) return;
    setCorrections([
      ...corrections,
      {
        id: `corr_${Date.now()}`,
        item: newCorrection.trim(),
        priority: newCorrectionPriority,
      },
    ]);
    setNewCorrection('');
  };

  const handleAddGoal = () => {
    if (!newGoal.trim()) return;
    setNextGoals([...nextGoals, newGoal.trim()]);
    setNewGoal('');
  };

  // Guardar y enviar evaluación a la ficha de la atleta
  const handleSaveAndSend = async (sendToAthleteDossier: boolean = true) => {
    if (!currentAthlete) {
      alert('Por favor selecciona una atleta para asociar la evaluación.');
      return;
    }

    setIsSaving(true);
    setSavedSuccessMessage(null);

    try {
      const choreo = athleteChoreographies.find((c) => c.id === selectedChoreoId);
      const regTitles: Record<RegulationSystemId, string> = {
        WORLD_SKATE_ROLLART_2026: 'World Skate RollArt 2026',
        FEP_ECUADOR_2026: 'Reglamento Nacional FEP Ecuador 2026',
        WHITE_FIGURES_2026: 'World Skate / FEP Sistema White 2026 (Figuras)',
      };

      const evalRecord: CoachEvaluation = {
        id: `eval_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        athleteId: currentAthlete.id,
        athleteName: currentAthlete.name,
        choreographyId: choreo?.id,
        choreographyTitle: choreo?.title || 'Rutina de Entrenamiento',
        choreographyVersionNumber: choreo?.currentVersion || 1,
        trainerId: profile?.trainerId || 'trainer_default',
        trainerName: profile?.name || 'Entrenador SkateCoreo',
        date: new Date().toISOString(),
        regulationId,
        regulationTitle: regTitles[regulationId],
        season: '2026',
        discipline,
        programSegment,
        category: currentAthlete.category,
        eficiencia: currentAthlete.eficiencia,
        elements,
        artisticComponents: discipline !== 'Figuras' ? calculatedPcs : undefined,
        figureMarks: discipline === 'Figuras' ? calculatedFigureScore.marks : undefined,
        deductions: deductionsSummary,
        scoresSummary,
        feedback: {
          strengths,
          technicalCorrections: corrections,
          choreographicSuggestions: {
            spatialDistribution,
            musicality: musicalityNotes,
          },
          nextGoals,
          generalObservations,
        },
        isSentToAthlete: sendToAthleteDossier,
        sentAt: sendToAthleteDossier ? Date.now() : undefined,
        updated_at: Date.now(),
        syncState: 'local',
      };

      await saveEvaluation(evalRecord);
      setSavedSuccessMessage(
        sendToAthleteDossier
          ? `¡Evaluación guardada y vinculada al expediente de ${currentAthlete.name}!`
          : '¡Evaluación guardada con éxito!'
      );

      // Si se envía al dossier, seleccionar a la atleta en el store
      if (sendToAthleteDossier) {
        await selectAthlete(currentAthlete);
      }
    } catch (e: any) {
      alert('Error al guardar la evaluación: ' + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadPdfInstant = () => {
    if (!currentAthlete) return;
    const choreo = athleteChoreographies.find((c) => c.id === selectedChoreoId);
    const regTitles: Record<RegulationSystemId, string> = {
      WORLD_SKATE_ROLLART_2026: 'World Skate RollArt 2026',
      FEP_ECUADOR_2026: 'Reglamento Nacional FEP Ecuador 2026',
      WHITE_FIGURES_2026: 'World Skate / FEP Sistema White 2026 (Figuras)',
    };

    const tempEval: CoachEvaluation = {
      id: `eval_preview_${Date.now()}`,
      athleteId: currentAthlete.id,
      athleteName: currentAthlete.name,
      choreographyId: choreo?.id,
      choreographyTitle: choreo?.title || 'Rutina de Entrenamiento',
      trainerId: profile?.trainerId || 'trainer',
      trainerName: profile?.name || 'Entrenador SkateCoreo',
      date: new Date().toISOString(),
      regulationId,
      regulationTitle: regTitles[regulationId],
      season: '2026',
      discipline,
      programSegment,
      category: currentAthlete.category,
      eficiencia: currentAthlete.eficiencia,
      elements,
      artisticComponents: discipline !== 'Figuras' ? calculatedPcs : undefined,
      figureMarks: discipline === 'Figuras' ? calculatedFigureScore.marks : undefined,
      deductions: deductionsSummary,
      scoresSummary,
      feedback: {
        strengths,
        technicalCorrections: corrections,
        choreographicSuggestions: { spatialDistribution, musicality: musicalityNotes },
        nextGoals,
        generalObservations,
      },
      isSentToAthlete: true,
      updated_at: Date.now(),
      syncState: 'local',
    };

    const doc = EvaluationPdfService.generateSingleEvaluationPdf(tempEval, currentAthlete, profile);
    doc.save(`Evaluacion_${currentAthlete.name.replace(/\s+/g, '_')}.pdf`);
  };

  return (
    <div className="space-y-6 animate-fade-in text-white pb-16">
      {/* ═══ BANNER NORMATIVO OBLIGATORIO ═══ */}
      <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-surface-2 via-surface-2 to-[#0f62fe]/10 border border-[#0f62fe]/30 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-2xl bg-[#0f62fe]/15 text-[#78a9ff] border border-[#0f62fe]/30 shrink-0">
            <Award className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold tracking-tight uppercase text-[#78a9ff]">
                Panel Técnico Profesional · Temporada 2026
              </span>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-white/10 text-white font-mono">
                OFICIAL
              </span>
            </div>
            <h2 className="text-lg font-black text-white tracking-tight mt-0.5">
              Evaluación de entrenamiento basada en criterios del reglamento{' '}
              <span className="text-[#78a9ff]">
                {regulationId === 'WORLD_SKATE_ROLLART_2026'
                  ? 'World Skate RollArt (Temporada 2026)'
                  : regulationId === 'FEP_ECUADOR_2026'
                  ? 'Federación Ecuatoriana de Patinaje (FEP 2026)'
                  : 'Sistema White Oficial (Figuras 2026)'}
              </span>
            </h2>
            <p className="text-[11px] text-slate-300 mt-1 max-w-2xl leading-relaxed">
              Herramienta de precisión técnica para entrenadores. Las puntuaciones simuladas aplican las tablas
              y degradaciones reglamentarias de competencia, garantizando retroalimentación objetiva sin sustituir al acta oficial de jueces.
            </p>
          </div>
        </div>

        {/* Botón rápido a Ficha de Atleta */}
        {currentAthlete && (
          <button
            type="button"
            onClick={() => {
              void selectAthlete(currentAthlete);
              setActiveCoachTab('dossier');
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 text-xs font-bold transition-all interactive-tap border border-white/10 shrink-0"
          >
            <User className="w-3.5 h-3.5 text-[#78a9ff]" />
            <span>Ver Ficha de {currentAthlete.firstName}</span>
          </button>
        )}
      </div>

      {/* Alerta de Éxito al Guardar */}
      {savedSuccessMessage && (
        <div className="p-4 rounded-2xl bg-teal-500/15 border border-teal-500/30 text-teal-300 text-xs flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
            <span className="font-bold">{savedSuccessMessage}</span>
          </div>
          <button
            onClick={() => setSavedSuccessMessage(null)}
            className="text-xs text-teal-400 hover:text-white ml-2 underline"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Alerta de Advertencia FEP */}
      {fepWarning && (
        <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2 animate-fade-in">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="font-semibold">{fepWarning}</span>
        </div>
      )}

      {/* ═══ BARRA FLOTANTE DE PUNTUACIONES RESUMEN (TSS / TES / PCS / DED) ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sticky top-2 z-20">
        <div className="p-4 rounded-2xl bg-surface-2/95 backdrop-blur-md border border-[#0f62fe]/30 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            {discipline === 'Figuras' ? 'Trazado' : 'Puntaje Técnico (TES)'}
          </span>
          <div className="text-2xl font-black text-[#78a9ff] font-mono mt-0.5">
            {discipline === 'Figuras' ? figureMarks.tracing.toFixed(2) : scoresSummary.tes.toFixed(2)}
          </div>
          <span className="text-[10px] text-slate-400">
            {discipline === 'Figuras' ? 'Base White 0-10' : `${scoresSummary.elementsCount} elem. llamados`}
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-surface-2/95 backdrop-blur-md border border-white/10 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            {discipline === 'Figuras' ? 'Movimiento y Porte' : 'Componentes (PCS)'}
          </span>
          <div className="text-2xl font-black text-slate-200 font-mono mt-0.5">
            {discipline === 'Figuras' ? ((figureMarks.movement + figureMarks.carriage) / 2).toFixed(2) : scoresSummary.pcs.toFixed(2)}
          </div>
          <span className="text-[10px] text-slate-400">
            {discipline === 'Figuras' ? 'Promedio postural' : `Factor ${calculatedPcs.factor.toFixed(1)}x`}
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-surface-2/95 backdrop-blur-md border border-white/10 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Deducciones</span>
          <div className="text-2xl font-black text-rose-400 font-mono mt-0.5">
            -{scoresSummary.deductions.toFixed(2)}
          </div>
          <span className="text-[10px] text-slate-400">{deductionsSummary.fallsCount} caídas oficiales</span>
        </div>

        <div className="p-4 rounded-2xl bg-gradient-to-br from-[#0f62fe]/20 to-surface-1 backdrop-blur-md border border-[#0f62fe]/40 shadow-sm">
          <span className="text-[10px] font-bold text-[#78a9ff] uppercase tracking-wider">
            TOTAL PROGRAMA ({discipline === 'Figuras' ? 'WHITE' : 'TSS'})
          </span>
          <div className="text-2xl font-black text-white font-mono mt-0.5">
            {scoresSummary.totalScore.toFixed(2)}
          </div>
          <span className="text-[10px] text-slate-300 font-bold">Simulación oficial</span>
        </div>
      </div>

      {/* ═══ SECCIÓN 1: CONFIGURACIÓN Y CONTEXTO DEL ATLETA ═══ */}
      <div className="p-5 rounded-3xl bg-surface-2 border border-white/10 space-y-4">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-[#78a9ff]" />
          <span>1. Selección de Atleta, Modalidad y Reglamento</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          {/* Atleta */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Atleta Evaluada
            </label>
            <select
              value={currentAthlete?.id || ''}
              onChange={(e) => {
                const ath = athletes.find((a) => a.id === e.target.value);
                if (ath) {
                  setCurrentAthlete(ath);
                  void useCoachStore.getState().loadChoreographiesForAthlete(ath.id);
                }
              }}
              className="w-full bg-surface-1 border border-white/10 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-[#0f62fe] focus:ring-1 focus:ring-[#0f62fe]/40"
            >
              {athletes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.category} - {a.eficiencia || 'Básica'})
                </option>
              ))}
            </select>
          </div>

          {/* Rutina / Coreografía */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Rutina / Coreo
            </label>
            <select
              value={selectedChoreoId}
              onChange={(e) => setSelectedChoreoId(e.target.value)}
              className="w-full bg-surface-1 border border-white/10 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-[#0f62fe] focus:ring-1 focus:ring-[#0f62fe]/40"
            >
              <option value="">Entrenamiento General</option>
              {athleteChoreographies.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.title} (v{ch.currentVersion})
                </option>
              ))}
            </select>
          </div>

          {/* Modalidad */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Modalidad Oficial
            </label>
            <select
              value={discipline}
              onChange={(e) => setDiscipline(e.target.value as EvaluationDiscipline)}
              className="w-full bg-surface-1 border border-white/10 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-[#0f62fe] focus:ring-1 focus:ring-[#0f62fe]/40"
            >
              <option value="Libre">Libre Individual (Free Skating)</option>
              <option value="Solo Danza">Solo Danza (Solo Dance)</option>
              <option value="Figuras">Figuras Obligatorias (Compulsory Figures)</option>
              <option value="Parejas">Parejas de Libre (Pairs)</option>
              <option value="Show">Grupos Show & Precisión</option>
            </select>
          </div>

          {/* Segmento / Rutina */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Segmento de Programa
            </label>
            <select
              value={programSegment}
              onChange={(e) => setProgramSegment(e.target.value as EvaluationSegment)}
              className="w-full bg-surface-1 border border-white/10 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-[#0f62fe] focus:ring-1 focus:ring-[#0f62fe]/40"
            >
              {discipline === 'Libre' && (
                <>
                  <option value="Largo">Programa Largo (Long Program)</option>
                  <option value="Corto">Programa Corto (Short Program)</option>
                  <option value="Único">Programa Único (Promocional)</option>
                </>
              )}
              {discipline === 'Solo Danza' && (
                <>
                  <option value="Free Dance">Danza Libre (Free Dance)</option>
                  <option value="Style Dance">Style Dance</option>
                  <option value="Danza Obligatoria">Danza Obligatoria (Pattern Dance)</option>
                </>
              )}
              {discipline === 'Figuras' && <option value="Figuras">Figuras Obligatorias</option>}
              {discipline === 'Parejas' && <option value="Largo">Programa de Pareja</option>}
              {discipline === 'Show' && <option value="Único">Presentación Grupal</option>}
            </select>
          </div>

          {/* Reglamento Aplicable */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Reglamento / Temporada
            </label>
            <select
              value={regulationId}
              onChange={(e) => setRegulationId(e.target.value as RegulationSystemId)}
              className="w-full bg-surface-1 border border-white/10 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-[#0f62fe] focus:ring-1 focus:ring-[#0f62fe]/40"
            >
              <option value="WORLD_SKATE_ROLLART_2026">World Skate RollArt 2026</option>
              <option value="FEP_ECUADOR_2026">Reglamento Nacional FEP 2026</option>
              <option value="WHITE_FIGURES_2026">Sistema White (Figuras 2026)</option>
            </select>
          </div>
        </div>
      </div>

      {/* ═══ SECCIÓN 2: EVALUACIÓN TÉCNICA (TES / ROLLART O FIGURAS) ═══ */}
      {discipline === 'Figuras' ? (
        /* Modo Figuras Obligatorias */
        <div className="p-5 rounded-3xl bg-surface-2 border border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-[#78a9ff]" />
              <span>2. Calificación de Figuras Obligatorias (Sistema White 0 a 10)</span>
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400 font-bold">Grupo:</span>
              <select
                value={selectedFigureGroup}
                onChange={(e) => setSelectedFigureGroup(e.target.value)}
                className="bg-surface-1 border border-white/10 rounded-xl px-2.5 py-1 text-xs font-semibold text-white focus:outline-none focus:border-[#0f62fe] focus:ring-1 focus:ring-[#0f62fe]/40"
              >
                <option value="Grupo 1">Grupo 1 (Reglamento Oficial)</option>
                <option value="Grupo 2">Grupo 2 (Reglamento Oficial)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {WHITE_FIGURE_CRITERIA.map((crit) => (
              <div key={crit.id} className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">{crit.name}</span>
                  <span className="text-xs font-black text-[#78a9ff] font-mono">
                    {figureMarks[crit.id].toFixed(2)}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-snug">{crit.description}</p>
                <input
                  type="range"
                  min="0"
                  max="10"
                  step="0.25"
                  value={figureMarks[crit.id]}
                  onChange={(e) =>
                    setFigureMarks({
                      ...figureMarks,
                      [crit.id]: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-[#0f62fe] cursor-pointer"
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Modo RollArt Oficial: Llamada de Elementos Técnicos */
        <div className="p-5 rounded-3xl bg-surface-2 border border-white/10 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-[#78a9ff]" />
              <span>2. Llamada de Elementos Técnicos (TES RollArt 2026)</span>
            </h3>
            <span className="text-[11px] text-slate-400 font-mono">
              Total Elementos: {elements.length} | TES: {scoresSummary.tes.toFixed(2)} pts
            </span>
          </div>

          {/* Constructor de Llamada de Elemento */}
          <div className="p-4 rounded-2xl bg-surface-1 border border-white/10 space-y-4">
            {/* Categorías de Elementos (Tabs rápidas) */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 scroll-touch">
              {[
                { id: 'Jump', label: 'Saltos (Jumps)' },
                { id: 'Spin', label: 'Trompos (Spins)' },
                { id: 'Step', label: 'Pasos & Coreo' },
                { id: 'Dance', label: 'Solo Danza' },
                { id: 'NJ', label: 'Conector (NJ)' },
              ].map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setSelectedElementCategory(cat.id as any);
                    if (cat.id === 'Jump') setElementCode('1A');
                    if (cat.id === 'Spin') setElementCode('USp1');
                    if (cat.id === 'Step') setElementCode('StSq1');
                    if (cat.id === 'Dance') setElementCode('TrSq1');
                    if (cat.id === 'NJ') setElementCode('NJ');
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                    selectedElementCategory === cat.id
                      ? 'bg-[#0f62fe] text-white border border-[#78a9ff]/40 shadow-sm ring-1 ring-[#0f62fe]/30'
                      : 'bg-surface-2 text-slate-300 hover:text-white hover:bg-white/10 border border-white/5'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Selector de Elemento */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                  Elemento
                </label>
                <select
                  value={elementCode}
                  onChange={(e) => setElementCode(e.target.value)}
                  className="w-full bg-surface-2 border border-white/10 rounded-xl px-2.5 py-1.5 font-mono text-white focus:outline-none focus:border-[#0f62fe] focus:ring-1 focus:ring-[#0f62fe]/40"
                >
                  {selectedElementCategory === 'Jump' &&
                    Object.values(ROLLART_JUMPS_2026).map((j) => (
                      <option key={j.code} value={j.code}>
                        {j.code} — {j.name} (BV: {j.baseValue.toFixed(2)})
                      </option>
                    ))}
                  {selectedElementCategory === 'Spin' &&
                    Object.values(ROLLART_SPINS_2026).map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.code} — {s.name} (BV: {s.baseValue.toFixed(2)})
                      </option>
                    ))}
                  {selectedElementCategory === 'Step' &&
                    Object.values(ROLLART_STEPS_2026).map((st) => (
                      <option key={st.code} value={st.code}>
                        {st.code} — {st.name} (BV: {st.baseValue.toFixed(2)})
                      </option>
                    ))}
                  {selectedElementCategory === 'Dance' &&
                    Object.values(ROLLART_DANCE_2026).map((d) => (
                      <option key={d.code} value={d.code}>
                        {d.code} — {d.name} (BV: {d.baseValue.toFixed(2)})
                      </option>
                    ))}
                  {selectedElementCategory === 'NJ' && (
                    <option value="NJ">NJ — No Jump (Conector en Combo)</option>
                  )}
                </select>
              </div>

              {/* Degradación de Rotación */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                  Rotación (Deducción)
                </label>
                <select
                  value={deductionCode || ''}
                  onChange={(e) => setDeductionCode((e.target.value as any) || null)}
                  disabled={selectedElementCategory !== 'Jump' || elementCode === 'NJ'}
                  className="w-full bg-surface-2 border border-white/10 rounded-xl px-2.5 py-1.5 text-white disabled:opacity-30 focus:outline-none focus:border-[#0f62fe] focus:ring-1 focus:ring-[#0f62fe]/40"
                >
                  <option value="">Limpio (Sin penalización)</option>
                  <option value="<">&lt; Under-rotated (-30% / -20%)</option>
                  <option value="<<">&lt;&lt; Half-rotated (-50% / -40%)</option>
                  <option value="<<<">&lt;&lt;&lt; Downgraded (1 rot. menos)</option>
                </select>
              </div>

              {/* Filo / Borde */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                  Filo de Entrada
                </label>
                <select
                  value={edgeIndicator || ''}
                  onChange={(e) => setEdgeIndicator((e.target.value as any) || null)}
                  disabled={selectedElementCategory !== 'Jump'}
                  className="w-full bg-surface-2 border border-white/10 rounded-xl px-2.5 py-1.5 text-white disabled:opacity-30 focus:outline-none focus:border-[#0f62fe] focus:ring-1 focus:ring-[#0f62fe]/40"
                >
                  <option value="">Normal</option>
                  <option value="Outside">Outside (Correcto Lutz)</option>
                  <option value="Inside">Inside (Correcto Flip)</option>
                  <option value="Flat">Flat (Plano)</option>
                  <option value="e">e (Filo incorrecto -20%)</option>
                </select>
              </div>

              {/* Vueltas (Trompos) */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                  Revoluciones en Posición
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="10"
                  value={rotationsCount}
                  onChange={(e) => setRotationsCount(parseFloat(e.target.value) || 0)}
                  disabled={selectedElementCategory !== 'Spin'}
                  className="w-full bg-surface-2 border border-white/10 rounded-xl px-2.5 py-1.5 text-white disabled:opacity-30 focus:outline-none focus:border-[#0f62fe] focus:ring-1 focus:ring-[#0f62fe]/40"
                />
              </div>
            </div>

            {/* QOE (-3 a +3) y Bono T */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-white/5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase">QOE:</span>
                <div className="flex items-center gap-1">
                  {[-3, -2, -1, 0, 1, 2, 3].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setQoeScore(val)}
                      className={`w-7 h-7 rounded-lg text-xs font-black transition-all ${
                        qoeScore === val
                          ? val > 0
                            ? 'bg-teal-500 text-slate-950 shadow-md'
                            : val < 0
                            ? 'bg-rose-500 text-white shadow-md'
                            : 'bg-white text-slate-950'
                          : 'bg-white/5 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      {val > 0 ? `+${val}` : val}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isTimeBonus}
                    onChange={(e) => setIsTimeBonus(e.target.checked)}
                    className="accent-[#0f62fe] rounded"
                  />
                  <span>Bono 'T' (2da mitad +10%)</span>
                </label>

                <button
                  type="button"
                  onClick={handleAddElement}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0f62fe] text-white font-bold text-xs hover:bg-[#0353e9] transition-all shadow-sm ring-1 ring-[#0f62fe]/30 interactive-tap"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>Llamar Elemento</span>
                </button>
              </div>
            </div>
          </div>

          {/* Tabla de Elementos Llamados */}
          {elements.length > 0 && (
            <div className="overflow-x-auto rounded-2xl border border-white/10">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 font-bold uppercase text-[10px] border-b border-white/10">
                  <tr>
                    <th className="py-2.5 px-3">#</th>
                    <th className="py-2.5 px-3">Elemento</th>
                    <th className="py-2.5 px-3">Código</th>
                    <th className="py-2.5 px-3 text-right">Base V.</th>
                    <th className="py-2.5 px-3 text-center">Degr.</th>
                    <th className="py-2.5 px-3 text-center">QOE</th>
                    <th className="py-2.5 px-3 text-center">Bono T</th>
                    <th className="py-2.5 px-3 text-right">Puntos</th>
                    <th className="py-2.5 px-3 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 bg-slate-900/40">
                  {elements.map((el, idx) => (
                    <tr key={el.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-2.5 px-3 font-mono text-slate-400">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-semibold text-white">{el.name}</td>
                      <td className="py-2.5 px-3 font-mono text-[#78a9ff] font-bold">{el.code}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                        {el.baseValue.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono text-amber-400">
                        {el.deductionCode || '-'}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono font-bold">
                        <span className={el.qoeScore > 0 ? 'text-teal-400' : el.qoeScore < 0 ? 'text-rose-400' : 'text-slate-400'}>
                          {el.qoeScore > 0 ? `+${el.qoeScore}` : el.qoeScore}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center text-teal-400 font-mono">
                        {el.isTimeBonusApplied ? '+10%' : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-black text-white">
                        {el.isValid ? (
                          el.finalValue.toFixed(2)
                        ) : (
                          <span className="text-rose-400" title={el.validationError}>
                            0.00 (Inv.)
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveElement(el.id)}
                          className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          title="Eliminar elemento"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══ SECCIÓN 3: COMPONENTES DEL PROGRAMA (PCS) ═══ */}
      {discipline !== 'Figuras' && (
        <div className="p-5 rounded-3xl bg-surface-2 border border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-[#78a9ff]" />
              <span>3. Componentes del Programa (PCS)</span>
            </h3>
            <span className="text-xs text-slate-300 font-mono font-bold">
              Factor {calculatedPcs.factor.toFixed(1)}x  |  Total PCS: {calculatedPcs.totalPcs.toFixed(2)} pts
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { id: 'skatingSkills', label: 'Skating Skills', desc: 'Calidad de filo, fluidez, potencia y postura.' },
              { id: 'transitions', label: 'Transitions', desc: 'Pasos de conexión, variedad y complejidad.' },
              { id: 'performance', label: 'Performance', desc: 'Expresión emocional, proyección y energía.' },
              { id: 'choreography', label: 'Choreography', desc: 'Composición espacial, musicalidad y diseño.' },
            ].map((comp) => (
              <div key={comp.id} className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">{comp.label}</span>
                  <span className="text-xs font-black text-[#78a9ff] font-mono">
                    {artisticComponents[comp.id as keyof typeof artisticComponents].toFixed(2)}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-snug">{comp.desc}</p>
                <input
                  type="range"
                  min="0.25"
                  max="10.0"
                  step="0.25"
                  value={artisticComponents[comp.id as keyof typeof artisticComponents]}
                  onChange={(e) =>
                    setArtisticComponents({
                      ...artisticComponents,
                      [comp.id]: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-[#0f62fe] cursor-pointer"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ SECCIÓN 4: DEDUCCIONES REGLAMENTARIAS ═══ */}
      <div className="p-5 rounded-3xl bg-surface-2 border border-white/10 space-y-4">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
          <span>4. Deducciones Reglamentarias Oficiales</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          {/* Caídas */}
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Caídas (Falls)</span>
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setFallsCount(Math.max(0, fallsCount - 1))}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-white font-bold"
              >
                -
              </button>
              <span className="text-xl font-black font-mono text-rose-400">{fallsCount}</span>
              <button
                type="button"
                onClick={() => setFallsCount(fallsCount + 1)}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-white font-bold"
              >
                +
              </button>
            </div>
            <span className="text-[10px] text-slate-500 block text-center">
              Deducción: -{deductionsSummary.fallsDeduction.toFixed(2)} pts
            </span>
          </div>

          {/* Violación de Tiempo */}
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Segundos fuera de límite</span>
            <input
              type="number"
              step="5"
              min="0"
              value={timeViolationSeconds}
              onChange={(e) => setTimeViolationSeconds(parseInt(e.target.value) || 0)}
              className="w-full bg-surface-1 border border-white/10 rounded-xl px-3 py-2 text-white font-mono text-center font-bold focus:outline-none focus:border-[#0f62fe]"
            />
            <span className="text-[10px] text-slate-500 block text-center">
              Deducción: -{deductionsSummary.timeDeduction.toFixed(2)} pts
            </span>
          </div>

          {/* Vestuario */}
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Vestuario / Accesorios</span>
            <label className="flex items-center gap-2 cursor-pointer mt-2">
              <input
                type="checkbox"
                checked={costumeViolation}
                onChange={(e) => setCostumeViolation(e.target.checked)}
                className="accent-rose-500 rounded"
              />
              <span className="text-slate-300">Caída de accesorio (-1.0)</span>
            </label>
            <span className="text-[10px] text-slate-500 block mt-2">
              Deducción: -{deductionsSummary.costumeDeduction.toFixed(2)} pts
            </span>
          </div>

          {/* Música */}
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Música / Letra Inapropiada</span>
            <label className="flex items-center gap-2 cursor-pointer mt-2">
              <input
                type="checkbox"
                checked={musicViolation}
                onChange={(e) => setMusicViolation(e.target.checked)}
                className="accent-rose-500 rounded"
              />
              <span className="text-slate-300">Lenguaje no apto (-1.0)</span>
            </label>
            <span className="text-[10px] text-slate-500 block mt-2">
              Deducción: -{deductionsSummary.musicViolationDeduction.toFixed(2)} pts
            </span>
          </div>
        </div>
      </div>

      {/* ═══ SECCIÓN 5: FEEDBACK PEDAGÓGICO DEL ENTRENADOR (EVALUACIÓN INTERNA) ═══ */}
      <div className="p-5 rounded-3xl bg-surface-2 border border-white/10 space-y-4">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-teal-400" />
          <span>5. Observaciones, Sugerencias Coreográficas y Metas Pedagógicas</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* Fortalezas */}
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
            <span className="text-[10px] font-bold text-teal-400 uppercase">Fortalezas de la Ejecución</span>
            <div className="flex gap-2">
              <input
                type="text"
                value={newStrength}
                onChange={(e) => setNewStrength(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddStrength()}
                placeholder="Ej. Buena altura en el Axel, excelente filo..."
                className="flex-1 bg-surface-1 border border-white/10 rounded-xl px-3 py-1.5 text-white focus:outline-none focus:border-[#0f62fe] focus:ring-1 focus:ring-[#0f62fe]/40 text-xs"
              />
              <button
                type="button"
                onClick={handleAddStrength}
                className="px-3 py-1.5 bg-teal-500/20 text-teal-300 rounded-xl font-bold hover:bg-teal-500/30"
              >
                Añadir
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {strengths.map((s, idx) => (
                <span
                  key={idx}
                  className="px-2.5 py-1 rounded-full bg-teal-500/10 text-teal-300 border border-teal-500/20 text-[11px] flex items-center gap-1"
                >
                  <span>{s}</span>
                  <button
                    onClick={() => setStrengths(strengths.filter((_, i) => i !== idx))}
                    className="hover:text-white"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Correcciones Técnicas con Prioridad */}
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
            <span className="text-[10px] font-bold text-rose-400 uppercase">Correcciones Técnicas Prioritarias</span>
            <div className="flex gap-2">
              <input
                type="text"
                value={newCorrection}
                onChange={(e) => setNewCorrection(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCorrection()}
                placeholder="Ej. Mantener eje en el trompo..."
                className="flex-1 bg-surface-1 border border-white/10 rounded-xl px-3 py-1.5 text-white focus:outline-none focus:border-[#0f62fe] focus:ring-1 focus:ring-[#0f62fe]/40 text-xs"
              />
              <select
                value={newCorrectionPriority}
                onChange={(e) => setNewCorrectionPriority(e.target.value as any)}
                className="bg-surface-1 border border-white/10 rounded-xl px-2 py-1.5 text-[11px] text-white focus:outline-none focus:border-[#0f62fe]"
              >
                <option value="urgente">Urgente</option>
                <option value="importante">Importante</option>
                <option value="recomendacion">Recomendación</option>
              </select>
              <button
                type="button"
                onClick={handleAddCorrection}
                className="px-3 py-1.5 bg-rose-500/20 text-rose-300 rounded-xl font-bold hover:bg-rose-500/30"
              >
                Añadir
              </button>
            </div>
            <div className="space-y-1 pt-1">
              {corrections.map((c) => (
                <div
                  key={c.id}
                  className="p-1.5 rounded-lg bg-white/[0.03] flex items-center justify-between text-[11px]"
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                        c.priority === 'urgente'
                          ? 'bg-rose-500/20 text-rose-300'
                          : c.priority === 'importante'
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-[#0f62fe]/20 text-[#78a9ff]'
                      }`}
                    >
                      {c.priority}
                    </span>
                    <span>{c.item}</span>
                  </span>
                  <button
                    onClick={() => setCorrections(corrections.filter((x) => x.id !== c.id))}
                    className="text-slate-500 hover:text-rose-400"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Sugerencias Coreográficas (Pista 2D) */}
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
            <span className="text-[10px] font-bold text-[#78a9ff] uppercase">Sugerencias Coreográficas (Pista 2D)</span>
            <textarea
              rows={2}
              value={spatialDistribution}
              onChange={(e) => setSpatialDistribution(e.target.value)}
              placeholder="Ocupación de cabeceras, simetría en curvas Bézier, distribución espacial..."
              className="w-full bg-surface-1 border border-white/10 rounded-xl p-2.5 text-white focus:outline-none focus:border-[#0f62fe] focus:ring-1 focus:ring-[#0f62fe]/40 text-xs"
            />
          </div>

          {/* Interpretación & Musicalidad */}
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
            <span className="text-[10px] font-bold text-purple-400 uppercase">Interpretación & Musicalidad</span>
            <textarea
              rows={2}
              value={musicalityNotes}
              onChange={(e) => setMusicalityNotes(e.target.value)}
              placeholder="Acentos musicales, transiciones, tempo, matices emotivos y cadencia coreográfica..."
              className="w-full bg-surface-1 border border-white/10 rounded-xl p-2.5 text-white focus:outline-none focus:border-[#0f62fe] focus:ring-1 focus:ring-[#0f62fe]/40 text-xs"
            />
          </div>

          {/* Objetivos Siguiente Ciclo */}
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
            <span className="text-[10px] font-bold text-amber-400 uppercase">Objetivos para Siguiente Evaluación</span>
            <div className="flex gap-2">
              <input
                type="text"
                value={newGoal}
                onChange={(e) => setNewGoal(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddGoal()}
                placeholder="Ej. Consolidar Doble Axel con aterrizaje limpio..."
                className="flex-1 bg-surface-1 border border-white/10 rounded-xl px-3 py-1.5 text-white focus:outline-none focus:border-[#0f62fe] focus:ring-1 focus:ring-[#0f62fe]/40 text-xs"
              />
              <button
                type="button"
                onClick={handleAddGoal}
                className="px-3 py-1.5 bg-amber-500/20 text-amber-300 rounded-xl font-bold hover:bg-amber-500/30"
              >
                Añadir
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {nextGoals.map((g, idx) => (
                <span
                  key={idx}
                  className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[11px] flex items-center gap-1"
                >
                  <span>{g}</span>
                  <button
                    onClick={() => setNextGoals(nextGoals.filter((_, i) => i !== idx))}
                    className="hover:text-white"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Observaciones Generales */}
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
            Observaciones Generales del Entrenador
          </label>
          <textarea
            rows={2}
            value={generalObservations}
            onChange={(e) => setGeneralObservations(e.target.value)}
            placeholder="Comentarios adicionales para el registro deportivo o comunicación con la atleta..."
            className="w-full bg-surface-1 border border-white/10 rounded-xl p-2.5 text-white focus:outline-none focus:border-[#0f62fe] focus:ring-1 focus:ring-[#0f62fe]/40 text-xs"
          />
        </div>
      </div>

      {/* ═══ ACCIONES FINALES DE GUARDADO Y ENVÍO ═══ */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-5 rounded-3xl bg-surface-2 border border-white/10 shadow-sm">
        <div className="text-xs text-slate-400">
          <span className="text-white font-bold">{currentAthlete?.name}</span> · {currentAthlete?.category} ({currentAthlete?.eficiencia || 'Básica'})
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadPdfInstant}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs font-bold transition-all interactive-tap border border-white/10"
            title="Descarga la ficha oficial A4 de esta evaluación"
          >
            <FileText className="w-3.5 h-3.5 text-[#78a9ff]" />
            <span>Descargar Ficha PDF A4</span>
          </button>

          <button
            type="button"
            onClick={() => handleSaveAndSend(false)}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition-all interactive-tap disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>Guardar Borrador</span>
          </button>

          <button
            type="button"
            onClick={() => handleSaveAndSend(true)}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#0f62fe] text-white font-bold text-xs shadow-sm ring-1 ring-[#0f62fe]/30 hover:bg-[#0353e9] transition-all interactive-tap disabled:opacity-50"
          >
            <Send className="w-4 h-4 stroke-[2.5]" />
            <span>{isSaving ? 'Guardando...' : 'Guardar y Enviar a Ficha de Atleta'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
