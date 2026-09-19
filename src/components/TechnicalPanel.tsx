import React, { useState, useEffect } from 'react';
import { 
  Zap, 
  AlertCircle, 
  Trash2, 
  FileText, 
  Music, 
  Activity,
  Sliders,
  Printer,
  ShieldAlert,
  Sparkles
} from 'lucide-react';
import { 
  Program, 
  ElementLog, 
  DeductionCode, 
  EdgeIndicator, 
  ArtisticComponents, 
  Skater,
  ElementType
} from '../types';
import { RollArtEngine, JUMP_DEFINITIONS, SPIN_DEFINITIONS } from '../services/rollartEngine';
import { audioEngine } from '../services/audioEngine';

interface TechnicalPanelProps {
  currentSkater: Skater | null;
  currentProgram: Program | null;
  elements: ElementLog[];
  onAddElement: (element: ElementLog) => void;
  onDeleteElement: (id: string) => void;
  onClearElements: () => void;
}

export const TechnicalPanel: React.FC<TechnicalPanelProps> = ({
  currentSkater,
  currentProgram,
  elements,
  onAddElement,
  onDeleteElement,
  onClearElements
}) => {
  const [currentTimeMs, setCurrentTimeMs] = useState(0);

  // Active Draft Element State
  const [selectedCategory, setSelectedCategory] = useState<'Jump' | 'Spin' | 'Dance'>('Jump');
  const [selectedJumpCode, setSelectedJumpCode] = useState<string>('3Lo');
  const [selectedSpinCode, setSelectedSpinCode] = useState<string>('SSp1');
  const [spinRotations, setSpinRotations] = useState<number>(3); // Default 3 (min for validation)
  const [selectedDeduction, setSelectedDeduction] = useState<DeductionCode>(null);
  const [selectedEdge, setSelectedEdge] = useState<EdgeIndicator>('Outside');
  const [qoeScore, setQoeScore] = useState<number>(0);

  // Pre-check State for Lutz
  const [isPreCheckActive, setIsPreCheckActive] = useState<boolean>(false);

  // Artistic Impression Components (PCS)
  const [artistic, setArtistic] = useState<ArtisticComponents>({
    skatingSkills: 0,
    transitions: 0,
    performance: 0,
    choreography: 0
  });

  // Report Card Modal
  const [showReportCard, setShowReportCard] = useState<boolean>(false);

  // Audio Time Sync
  useEffect(() => {
    const unsubTime = audioEngine.onTimeUpdate((time) => {
      setCurrentTimeMs(time);
    });
    return () => {
      unsubTime();
    };
  }, []);

  // Update Pre-check trigger when Lutz is selected
  useEffect(() => {
    if (selectedCategory === 'Jump' && selectedJumpCode.includes('Lz')) {
      setIsPreCheckActive(true);
      setSelectedEdge('Outside');
    } else {
      setIsPreCheckActive(false);
    }
  }, [selectedCategory, selectedJumpCode]);

  const halfTimeMs = currentProgram?.half_time_ms || 120000;
  const isSecondHalf = currentTimeMs >= halfTimeMs;

  // Spin validation status
  const isSpinValid = spinRotations >= 3;

  // Haptic feedback trigger
  const triggerHaptic = () => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(40);
      } catch (e) {}
    }
  };

  // Register Element Handler
  const handleRegisterElement = (overrideCode?: string) => {
    if (!currentProgram) return;

    const baseCode = overrideCode || (selectedCategory === 'Jump' ? selectedJumpCode : selectedCategory === 'Spin' ? selectedSpinCode : 'StSq1');
    let elemType: ElementType = selectedCategory;

    if (baseCode === 'NJ') {
      elemType = 'NJ';
    }

    // Spin check
    if (elemType === 'Spin' && spinRotations < 3) {
      return; // Locked
    }

    const calcResult = RollArtEngine.calculateElementScore({
      baseCode,
      executionTimestamp: currentTimeMs,
      halfTimeMs,
      deductionCode: selectedDeduction,
      rotationsCount: elemType === 'Spin' ? spinRotations : 0,
      edgeIndicator: selectedEdge,
      qoeScore
    });

    const def = RollArtEngine.getElementDef(baseCode);

    const newElement: ElementLog = {
      id: `el-${Date.now()}`,
      program_id: currentProgram.id,
      element_type: elemType,
      base_code: calcResult.adjustedCode,
      name: def?.name || baseCode,
      execution_timestamp: currentTimeMs,
      deduction_code: selectedDeduction,
      is_time_bonus_applied: calcResult.isTimeBonusApplied,
      rotations_count: spinRotations,
      edge_indicator: selectedEdge,
      qoe_score: qoeScore,
      base_value: calcResult.baseValue,
      final_value: calcResult.finalValue,
      is_valid: calcResult.isValid,
      validation_error: calcResult.validationError
    };

    onAddElement(newElement);
    triggerHaptic();

    // Reset deduction and QOE for next element
    setSelectedDeduction(null);
    setQoeScore(0);
  };

  // Dedicated NJ (No Jump) connector button
  const handleRegisterNJ = () => {
    handleRegisterElement('NJ');
  };

  // Dedicated Carlos Tango Tap Down
  const handleRegisterCarlosTangoTap = () => {
    handleRegisterElement('CT_R3');
  };

  // Calculate Scores
  const scoreSummary = RollArtEngine.calculateTotalSegmentScore({
    elements,
    artisticComponents: artistic,
    categoryFactor: currentSkater?.category === 'Senior' ? 1.0 : 0.8
  });

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    const ms100 = Math.floor((ms % 1000) / 10);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms100.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      
      {/* Live Scoring Header & Time Factor Banner */}
      <div className="bg-zinc-950 border border-sky-900/50 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-sky-950/80 border border-sky-800 rounded-xl text-sky-400">
            <Activity className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-sky-400 font-bold uppercase tracking-wider">Puntuación en Vivo (TSS)</span>
              {isSecondHalf && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/50 font-bold animate-timebonus">
                  ⚡ FACTOR T ACTIVO (+10%)
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-4 mt-0.5">
              <span className="text-3xl sm:text-4xl font-black font-mono text-sky-300 tracking-tight">
                {scoreSummary.totalScore.toFixed(2)}
              </span>
              <div className="flex items-center gap-3 text-xs font-mono text-sky-400/80">
                <span>TES: <strong className="text-sky-400">{scoreSummary.tes.toFixed(2)}</strong></span>
                <span>PCS: <strong className="text-purple-400">{scoreSummary.pcs.toFixed(2)}</strong></span>
                <span>Elem: <strong className="text-emerald-400">{scoreSummary.elementsCount}</strong></span>
              </div>
            </div>
          </div>
        </div>

        {/* Audio Sync Timer & Report Card trigger */}
        <div className="flex items-center gap-3">
          <div className="text-right font-mono">
            <span className="text-xs text-sky-400/80 block">Tiempo del Programa</span>
            <span className="text-xl font-bold text-sky-400">{formatTime(currentTimeMs)}</span>
          </div>

          <button
            onClick={() => setShowReportCard(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-950/70 hover:bg-amber-400 hover:text-zinc-950 text-sky-300 border border-sky-800 text-xs font-bold shadow-lg transition-all touch-target"
          >
            <FileText className="w-4 h-4 text-amber-400" />
            <span>Ficha Oficial</span>
          </button>
        </div>
      </div>

      {/* Lutz Pre-check Alert Banner (Critical UX Requirement from Research Report) */}
      {isPreCheckActive && (
        <div className="p-4 rounded-xl bg-amber-950/80 border-2 border-amber-500 animate-precheck flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xl">
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-6 h-6 text-amber-400 flex-shrink-0 animate-bounce" />
            <div>
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-amber-300">
                PRE-CHECK ACTIVO: ENFOQUE EN BORDE Y TOBILLO (LUTZ)
              </h4>
              <p className="text-xs text-amber-100/90">
                Observe atentamente el filo antes del despegue (stab): debe ser claramente exterior (Outside).
              </p>
            </div>
          </div>

          {/* Quick Edge Selector */}
          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            <button
              onClick={() => setSelectedEdge('Outside')}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                selectedEdge === 'Outside'
                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Outside (Limpio)
            </button>
            <button
              onClick={() => setSelectedEdge('Inside')}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                selectedEdge === 'Inside'
                  ? 'bg-red-500 text-white shadow-md'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Inside (Flutz / Error)
            </button>
            <button
              onClick={() => setSelectedEdge('Flat')}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                selectedEdge === 'Flat'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Flat (Plano)
            </button>
          </div>
        </div>
      )}

      {/* Main Touch-Console Keyboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Columns: Fast Touch Selector */}
        <div className="lg:col-span-2 bg-zinc-950 border border-sky-900/50 rounded-2xl p-4 sm:p-5 shadow-xl space-y-5">
          
          {/* Category Tabs */}
          <div className="flex items-center justify-between border-b border-sky-900/50 pb-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedCategory('Jump')}
                className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all touch-target ${
                  selectedCategory === 'Jump'
                    ? 'bg-amber-400 text-zinc-950 shadow-md shadow-amber-400/25 border border-amber-300 font-black'
                    : 'text-sky-300 hover:text-white bg-sky-950/70 border border-sky-800'
                }`}
              >
                Saltos (Jumps)
              </button>

              <button
                onClick={() => setSelectedCategory('Spin')}
                className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all touch-target ${
                  selectedCategory === 'Spin'
                    ? 'bg-amber-400 text-zinc-950 shadow-md shadow-amber-400/25 border border-amber-300 font-black'
                    : 'text-sky-300 hover:text-white bg-sky-950/70 border border-sky-800'
                }`}
              >
                Trompos (Spins)
              </button>

              <button
                onClick={() => setSelectedCategory('Dance')}
                className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all touch-target ${
                  selectedCategory === 'Dance'
                    ? 'bg-amber-400 text-zinc-950 shadow-md shadow-amber-400/25 border border-amber-300 font-black'
                    : 'text-sky-300 hover:text-white bg-sky-950/70 border border-sky-800'
                }`}
              >
                Danza / Pasos
              </button>
            </div>

            {/* Dedicated NJ Button (PRD Requirement) */}
            <button
              onClick={handleRegisterNJ}
              className="px-3.5 py-2 rounded-xl bg-sky-950/70 hover:bg-amber-400 hover:text-zinc-950 border border-sky-800 text-sky-300 text-xs font-black font-mono shadow-sm transition-all touch-target flex items-center gap-1.5"
              title="Registrar No Jump conector (0.00 pts) en secuencias combinadas"
            >
              <span>+ NJ (Conector)</span>
            </button>
          </div>

          {/* 1. JUMP SELECTOR GRID */}
          {selectedCategory === 'Jump' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                {['Lo', 'F', 'Lz', 'A', 'T', 'S'].map(type => {
                  const typeNames: Record<string, string> = {
                    'Lo': 'Loop', 'F': 'Flip', 'Lz': 'Lutz', 'A': 'Axel', 'T': 'Toe Loop', 'S': 'Salchow'
                  };
                  return (
                    <div key={type} className="bg-skate-card/60 p-2 rounded-xl border border-skate-border space-y-1.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block text-center">
                        {typeNames[type]}
                      </span>
                      <div className="grid grid-cols-1 gap-1">
                        {[1, 2, 3, 4].map(rot => {
                          const code = `${rot}${type}`;
                          if (!JUMP_DEFINITIONS[code]) return null;
                          const isSelected = selectedJumpCode === code;
                          return (
                            <button
                              key={code}
                              onClick={() => setSelectedJumpCode(code)}
                              className={`py-2 px-1 rounded-lg font-mono text-xs font-black transition-all touch-target ${
                                isSelected
                                  ? 'bg-sky-400 text-slate-950 shadow-md shadow-sky-400/40 scale-[1.02]'
                                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-200'
                              }`}
                            >
                              {code}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Deductions One-Tap Buttons (<, <<, <<<) */}
              <div className="bg-skate-card p-3 rounded-xl border border-skate-border space-y-2">
                <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
                  Deducción de Rotación (One-Tap)
                </span>
                <div className="grid grid-cols-4 gap-2">
                  <button
                    onClick={() => setSelectedDeduction(null)}
                    className={`py-2.5 rounded-xl text-xs font-bold transition-all touch-target ${
                      selectedDeduction === null
                        ? 'bg-emerald-500 text-slate-950 shadow-md'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    Limpio
                  </button>

                  <button
                    onClick={() => setSelectedDeduction('<')}
                    className={`py-2.5 rounded-xl text-xs font-mono font-black transition-all touch-target ${
                      selectedDeduction === '<'
                        ? 'bg-amber-500 text-slate-950 shadow-md'
                        : 'bg-slate-800 text-amber-300 hover:bg-slate-700'
                    }`}
                  >
                    &lt; Under (-20%/-30%)
                  </button>

                  <button
                    onClick={() => setSelectedDeduction('<<')}
                    className={`py-2.5 rounded-xl text-xs font-mono font-black transition-all touch-target ${
                      selectedDeduction === '<<'
                        ? 'bg-orange-500 text-white shadow-md'
                        : 'bg-slate-800 text-orange-400 hover:bg-slate-700'
                    }`}
                  >
                    &lt;&lt; Half (-40%/-50%)
                  </button>

                  <button
                    onClick={() => setSelectedDeduction('<<<')}
                    className={`py-2.5 rounded-xl text-xs font-mono font-black transition-all touch-target ${
                      selectedDeduction === '<<<'
                        ? 'bg-red-500 text-white shadow-md'
                        : 'bg-slate-800 text-red-400 hover:bg-slate-700'
                    }`}
                  >
                    &lt;&lt;&lt; Down (-1 Rot)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 2. SPIN SELECTOR & STRICT 3-ROTATION VALIDATOR */}
          {selectedCategory === 'Spin' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.values(SPIN_DEFINITIONS).map(spin => (
                  <button
                    key={spin.code}
                    onClick={() => setSelectedSpinCode(spin.code)}
                    className={`p-3 rounded-xl text-left border transition-all touch-target ${
                      selectedSpinCode === spin.code
                        ? 'bg-purple-600/30 border-purple-500 text-white shadow-lg'
                        : 'bg-skate-card border-skate-border text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <span className="font-mono text-xs font-bold text-purple-400 block">{spin.code}</span>
                    <span className="text-[11px] font-medium text-slate-300 truncate block">{spin.name}</span>
                    <span className="text-[10px] text-slate-500">Base: {spin.baseValue.toFixed(2)}</span>
                  </button>
                ))}
              </div>

              {/* Strict Spin Rotation Stepper */}
              <div className="bg-skate-card p-4 rounded-xl border border-skate-border space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Conteo de Vueltas / Rotaciones (Mínimo 3)
                  </span>
                  <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                    isSpinValid ? 'bg-emerald-950 text-emerald-400' : 'bg-red-950 text-red-400'
                  }`}>
                    {spinRotations} Rotaciones
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSpinRotations(Math.max(0, spinRotations - 1))}
                    className="w-12 h-12 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-lg flex items-center justify-center touch-target"
                  >
                    -
                  </button>

                  <div className="flex-1 text-center bg-skate-bg py-2.5 rounded-xl border border-skate-border font-mono text-2xl font-black text-white">
                    {spinRotations}
                  </div>

                  <button
                    onClick={() => setSpinRotations(spinRotations + 1)}
                    className="w-12 h-12 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-lg flex items-center justify-center touch-target"
                  >
                    +
                  </button>
                </div>

                {/* Hard validation warning if < 3 */}
                {!isSpinValid && (
                  <div className="p-3 rounded-lg bg-red-950/80 border border-red-500/60 text-red-200 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <span className="font-semibold">Requiere 3 vueltas completas para validación</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 3. DANCE & STEP SEQUENCES */}
          {selectedCategory === 'Dance' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={handleRegisterCarlosTangoTap}
                  className="p-4 rounded-xl bg-gradient-to-r from-emerald-950 to-slate-900 border border-emerald-500/50 hover:border-emerald-400 text-left transition-all touch-target shadow-lg"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-emerald-400">CT_R3</span>
                    <Music className="w-4 h-4 text-emerald-400" />
                  </div>
                  <h4 className="text-sm font-bold text-white mt-1">Carlos Tango - Tap Down (Beat 3)</h4>
                  <p className="text-xs text-slate-400 mt-1">Validación de ritmo r3 y borde sin retraso de audio.</p>
                </button>

                <button
                  onClick={() => handleRegisterElement('StSq1')}
                  className="p-4 rounded-xl bg-skate-card border border-skate-border hover:bg-slate-700 text-left transition-all touch-target"
                >
                  <span className="font-mono text-xs font-bold text-sky-400">StSq1</span>
                  <h4 className="text-sm font-bold text-white mt-1">Secuencia de Pasos Nivel 1</h4>
                  <p className="text-xs text-slate-400 mt-1">Cobertura de pista con giros y cambios de filo.</p>
                </button>
              </div>
            </div>
          )}

          {/* Quality of Element (QOE) Slider (-3 to +3) */}
          <div className="bg-skate-card p-3.5 rounded-xl border border-skate-border space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-300 uppercase tracking-wider">Quality of Element (QOE)</span>
              <span className={`font-mono font-bold px-2 py-0.5 rounded ${
                qoeScore > 0 ? 'text-emerald-400 bg-emerald-950' : qoeScore < 0 ? 'text-red-400 bg-red-950' : 'text-slate-300 bg-slate-800'
              }`}>
                {qoeScore > 0 ? `+${qoeScore}` : qoeScore}
              </span>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {[-3, -2, -1, 0, 1, 2, 3].map(val => (
                <button
                  key={val}
                  onClick={() => setQoeScore(val)}
                  className={`py-2 rounded-lg font-mono text-xs font-bold transition-all touch-target ${
                    qoeScore === val
                      ? val > 0 
                        ? 'bg-emerald-500 text-slate-950 shadow-md' 
                        : val < 0 
                          ? 'bg-red-500 text-white shadow-md' 
                          : 'bg-sky-400 text-slate-950'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {val > 0 ? `+${val}` : val}
                </button>
              ))}
            </div>
          </div>

          {/* Big Action Submit Button (One-Tap Register) */}
          <div>
            <button
              onClick={() => handleRegisterElement()}
              disabled={selectedCategory === 'Spin' && !isSpinValid}
              className={`w-full py-4 rounded-xl font-extrabold text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl transition-all touch-target ${
                selectedCategory === 'Spin' && !isSpinValid
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                  : 'bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-slate-950 shadow-sky-500/25 scale-[1.01]'
              }`}
            >
              <Zap className="w-5 h-5 fill-current" />
              <span>
                {selectedCategory === 'Spin' && !isSpinValid 
                  ? 'Bloqueado (Requiere 3 rotaciones)' 
                  : `Registrar ${selectedCategory === 'Jump' ? selectedJumpCode : selectedCategory === 'Spin' ? selectedSpinCode : 'Elemento'} (${formatTime(currentTimeMs)})`}
              </span>
            </button>
          </div>

        </div>

        {/* Right Column: Live Elements Execution Table */}
        <div className="bg-skate-panel border border-skate-border rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-skate-border pb-3">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-4 h-4 text-sky-400" />
                Elementos Ejecutados ({elements.length})
              </h3>

              {elements.length > 0 && (
                <button
                  onClick={onClearElements}
                  className="text-[11px] text-red-400 hover:text-red-300 flex items-center gap-1 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Limpiar</span>
                </button>
              )}
            </div>

            {/* Elements List */}
            <div className="max-h-[380px] overflow-y-auto space-y-2 pr-1">
              {elements.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-xs">
                  <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  Esperando ejecución del elemento...
                </div>
              ) : (
                elements.map((el, index) => (
                  <div
                    key={el.id}
                    className="p-2.5 rounded-xl bg-skate-card border border-skate-border flex items-center justify-between text-xs transition-all hover:border-slate-500"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-[11px] text-slate-500 w-4">{index + 1}.</span>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-white">{el.base_code}</span>
                          {el.deduction_code && (
                            <span className="font-mono text-[10px] px-1 rounded bg-amber-500/20 text-amber-300 font-bold">
                              {el.deduction_code}
                            </span>
                          )}
                          {el.is_time_bonus_applied && (
                            <span className="text-[9px] font-mono px-1 rounded bg-yellow-500/20 text-yellow-300 font-bold">
                              T
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">
                          {formatTime(el.execution_timestamp)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="font-mono font-bold text-sky-400 block">{el.final_value.toFixed(2)}</span>
                        <span className="text-[10px] font-mono text-slate-500">QOE: {el.qoe_score > 0 ? `+${el.qoe_score}` : el.qoe_score}</span>
                      </div>

                      <button
                        onClick={() => onDeleteElement(el.id)}
                        className="text-slate-500 hover:text-red-400 p-1"
                        title="Eliminar elemento"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Artistic Impression (PCS Sliders) Compact */}
          <div className="border-t border-skate-border pt-3 space-y-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-purple-400" />
              Artistic Impression (PCS)
            </span>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <div className="flex justify-between text-slate-400">
                  <span>Skating Skills</span>
                  <span className="font-mono font-bold text-white">{artistic.skatingSkills}</span>
                </div>
                <input
                  type="range"
                  min="-3"
                  max="3"
                  value={artistic.skatingSkills}
                  onChange={(e) => setArtistic({ ...artistic, skatingSkills: parseInt(e.target.value, 10) })}
                  className="w-full accent-purple-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-400">
                  <span>Transitions</span>
                  <span className="font-mono font-bold text-white">{artistic.transitions}</span>
                </div>
                <input
                  type="range"
                  min="-3"
                  max="3"
                  value={artistic.transitions}
                  onChange={(e) => setArtistic({ ...artistic, transitions: parseInt(e.target.value, 10) })}
                  className="w-full accent-purple-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-400">
                  <span>Performance</span>
                  <span className="font-mono font-bold text-white">{artistic.performance}</span>
                </div>
                <input
                  type="range"
                  min="-3"
                  max="3"
                  value={artistic.performance}
                  onChange={(e) => setArtistic({ ...artistic, performance: parseInt(e.target.value, 10) })}
                  className="w-full accent-purple-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-400">
                  <span>Choreography</span>
                  <span className="font-mono font-bold text-white">{artistic.choreography}</span>
                </div>
                <input
                  type="range"
                  min="-3"
                  max="3"
                  value={artistic.choreography}
                  onChange={(e) => setArtistic({ ...artistic, choreography: parseInt(e.target.value, 10) })}
                  className="w-full accent-purple-500"
                />
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* Official RollArt Report Card Modal */}
      {showReportCard && (
        <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4 backdrop-blur-sm overflow-y-auto">
          <div className="bg-skate-panel border border-skate-border rounded-2xl max-w-3xl w-full p-6 space-y-6 shadow-2xl my-8">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-skate-border pb-4">
              <div>
                <h3 className="text-lg font-black text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-skate-gold" />
                  Ficha Técnica Oficial (Report Card)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Atleta: <strong className="text-white">{currentSkater?.name || 'Atleta No Asignado'}</strong> | Categoría: <strong className="text-sky-400">{currentSkater?.category || 'Senior'}</strong>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-200 border border-skate-border transition-all"
                  title="Imprimir Ficha"
                >
                  <Printer className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowReportCard(false)}
                  className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs rounded-xl transition-all"
                >
                  Cerrar
                </button>
              </div>
            </div>

            {/* Score Summary Banner */}
            <div className="grid grid-cols-4 gap-3 text-center">
              <div className="p-3 rounded-xl bg-skate-card border border-skate-border">
                <span className="text-[10px] font-mono text-slate-400 block uppercase">Total Technical (TES)</span>
                <span className="text-xl font-black font-mono text-sky-400">{scoreSummary.tes.toFixed(2)}</span>
              </div>
              <div className="p-3 rounded-xl bg-skate-card border border-skate-border">
                <span className="text-[10px] font-mono text-slate-400 block uppercase">Components (PCS)</span>
                <span className="text-xl font-black font-mono text-purple-400">{scoreSummary.pcs.toFixed(2)}</span>
              </div>
              <div className="p-3 rounded-xl bg-skate-card border border-skate-border">
                <span className="text-[10px] font-mono text-slate-400 block uppercase">Deducciones</span>
                <span className="text-xl font-black font-mono text-red-400">{scoreSummary.deductions.toFixed(2)}</span>
              </div>
              <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/40">
                <span className="text-[10px] font-mono text-sky-400 block uppercase font-bold">Total Segment Score</span>
                <span className="text-2xl font-black font-mono text-white">{scoreSummary.totalScore.toFixed(2)}</span>
              </div>
            </div>

            {/* Elements Table */}
            <div className="border border-skate-border rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-skate-card text-slate-400 border-b border-skate-border">
                  <tr>
                    <th className="p-2.5">#</th>
                    <th className="p-2.5">Elemento</th>
                    <th className="p-2.5">Tiempo</th>
                    <th className="p-2.5 text-center">Rot/Ded</th>
                    <th className="p-2.5 text-center">Bono T</th>
                    <th className="p-2.5 text-right">Valor Base</th>
                    <th className="p-2.5 text-center">QOE</th>
                    <th className="p-2.5 text-right">Puntaje</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-skate-border">
                  {elements.map((el, i) => (
                    <tr key={el.id} className="hover:bg-slate-800/40">
                      <td className="p-2.5 text-slate-500">{i + 1}</td>
                      <td className="p-2.5 font-bold text-white">{el.base_code}</td>
                      <td className="p-2.5 text-slate-400">{formatTime(el.execution_timestamp)}</td>
                      <td className="p-2.5 text-center">
                        {el.deduction_code ? <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">{el.deduction_code}</span> : '-'}
                      </td>
                      <td className="p-2.5 text-center">
                        {el.is_time_bonus_applied ? <span className="text-yellow-400 font-bold">10%</span> : '-'}
                      </td>
                      <td className="p-2.5 text-right text-slate-300">{el.base_value.toFixed(2)}</td>
                      <td className="p-2.5 text-center font-bold">
                        <span className={el.qoe_score > 0 ? 'text-emerald-400' : el.qoe_score < 0 ? 'text-red-400' : 'text-slate-400'}>
                          {el.qoe_score > 0 ? `+${el.qoe_score}` : el.qoe_score}
                        </span>
                      </td>
                      <td className="p-2.5 text-right font-black text-sky-400">{el.final_value.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
