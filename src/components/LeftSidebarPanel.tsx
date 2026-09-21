import React from 'react';
import {
  Music,
  Clock,
  Mic,
  Headphones,
  Timer,
  Layers,
  Eye,
  SkipBack,
  Sparkles,
  Undo2,
  Trash2,
  BookOpen,
  LogOut,
  ShieldCheck,
  Smartphone,
  Compass,
  CircleDot,
  Camera,
  FileDown,
  PenTool,
  CheckCircle2,
} from 'lucide-react';
import { RinkContextTools } from './rink/RinkContextTools';
import { audioEngine } from '../services/audioEngine';
import { GOOGLE_TTS_VOICES, DEFAULT_LATIN_FEMALE_VOICE } from '../core/audio/VoiceCueEngine';
import { detectGoogleVoiceGender } from '../core/audio/voiceGender';
import { hasBuiltInGoogleTtsApiKey } from '../core/audio/googleTtsKey';
import { useAudioEngine } from '../hooks/useAudioEngine';
import { useChoreographyStore } from '../store/useChoreographyStore';
import { useAuthStore } from '../store/useAuthStore';
import { DeviceSecurityModal } from './DeviceSecurityModal';
import { PdfTemplateGenerator } from '../services/pdfTemplateGenerator';
import { PaperToDigitalModal } from './PaperToDigital/PaperToDigitalModal';
import { 
  EFICIENCIAS_DISPONIBLES, 
  getDescripcionCategoria 
} from '../constants/reglamento';

interface LeftSidebarPanelProps {
  preRollSec: number;
  onPreRollSecChange: (sec: number) => void;
  onUndo: () => void;
  onResetDemo: () => void;
  onClearRink?: () => void;
  onOpenAudioStudio?: () => void;
  showHeader?: boolean;
  isMobileModal?: boolean;
}


/**
 * Left sidebar panel — Dark Mode Neon aesthetic.
 * Uses soft surfaces, cyan electric active states and mint indicators.
 */
export const LeftSidebarPanel: React.FC<LeftSidebarPanelProps> = ({
  preRollSec,
  onPreRollSecChange,
  onUndo,
  onResetDemo,
  onClearRink,
  onOpenAudioStudio,
  showHeader = true,
  isMobileModal = false,
}) => {
  const audio = useAudioEngine();

  const skaterGender = useChoreographyStore((s) => s.skaterGender);
  const setSkaterGender = useChoreographyStore((s) => s.setSkaterGender);
  const showRinkGrid = useChoreographyStore((s) => s.showRinkGrid);
  const setShowRinkGrid = useChoreographyStore((s) => s.setShowRinkGrid);
  const showReglamentaryGuides = useChoreographyStore((s) => s.showReglamentaryGuides);
  const setShowReglamentaryGuides = useChoreographyStore((s) => s.setShowReglamentaryGuides);
  const showCompulsoryFigures = useChoreographyStore((s) => s.showCompulsoryFigures);
  const setShowCompulsoryFigures = useChoreographyStore((s) => s.setShowCompulsoryFigures);
  const paperTraceOverlay = useChoreographyStore((s) => s.paperTraceOverlay);
  const clearPaperTraceOverlay = useChoreographyStore((s) => s.clearPaperTraceOverlay);
  const history = useChoreographyStore((s) => s.history);

  // Reglamento 2026
  const edad = useChoreographyStore((s) => s.edad);
  const categoria = useChoreographyStore((s) => s.categoria);
  const eficiencia = useChoreographyStore((s) => s.eficiencia);
  const setEdad = useChoreographyStore((s) => s.setEdad);
  const setEficiencia = useChoreographyStore((s) => s.setEficiencia);

  // SaaS Auth state
  const { user, role, subscription_plan, logout } = useAuthStore();
  const [showDeviceModal, setShowDeviceModal] = React.useState(false);
  const [showPaperModal, setShowPaperModal] = React.useState(false);

  // Modelo de Voz Guía (Google Cloud TTS). Solo se ofrecen voces LATINAS.
  const LATIN_VOICES = React.useMemo(
    () => GOOGLE_TTS_VOICES.filter((v) => v.lang === 'es-US'),
    []
  );
  const [googleVoiceName, setGoogleVoiceName] = React.useState<string>(
    () => audioEngine.voiceCueEngine.getConfig().googleVoiceName || DEFAULT_LATIN_FEMALE_VOICE
  );

  // Motor de Voz Guía (Google Cloud = voces naturales | Navegador = offline)
  const [ttsEngine, setTtsEngine] = React.useState(
    () => audioEngine.voiceCueEngine.getConfig().ttsEngine
  );
  const [googleApiKey, setGoogleApiKey] = React.useState<string>(
    () => audioEngine.voiceCueEngine.getConfig().googleApiKey || ''
  );
  const [apiKeyVisible, setApiKeyVisible] = React.useState(false);
  // Si la app ya trae la credencial, no se pide nada al usuario.
  const hasBuiltInKey = React.useMemo(() => hasBuiltInGoogleTtsApiKey(), []);

  const handleVoiceModelChange = (voiceName: string) => {
    audioEngine.voiceCueEngine.setGoogleVoiceName(voiceName);
    setGoogleVoiceName(voiceName);

    // Mantener coherencia: si la voz elegida es de otro género, se actualiza el
    // selector de género para que la UI no contradiga a la voz real.
    const detected = detectGoogleVoiceGender(voiceName);
    if (detected && detected !== audio.voiceGender) {
      audio.setVoiceGender(detected);
      setGoogleVoiceName(audioEngine.voiceCueEngine.getConfig().googleVoiceName);
    }
  };

  const handleTtsEngineChange = (engine: 'browser' | 'google-cloud') => {
    setTtsEngine(engine);
    audioEngine.voiceCueEngine.setTtsEngine(engine);
  };

  const handleApiKeySave = () => {
    audioEngine.voiceCueEngine.setGoogleApiKey(googleApiKey.trim() || null);
  };

  /**
   * Cambio de género coherente: el motor re-selecciona la voz latina del mismo
   * motor (Neural2/Wavenet/Journey) y aquí se refleja en el selector.
   */
  const handleVoiceGenderChange = (gender: 'female' | 'male') => {
    audio.setVoiceGender(gender);
    setGoogleVoiceName(audioEngine.voiceCueEngine.getConfig().googleVoiceName);
  };

  const content = (
    <>
      {/* ═══ 0. Reglamento & Categoría 2026 ═══════════════ */}
        <section className="px-4 py-3.5 space-y-3 bg-white/[0.02]">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-cyan">
              <BookOpen className="w-3.5 h-3.5 text-cyan" />
              Reglamento 2026
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-cyan/15 text-cyan border border-cyan/30 tracking-wider">
              {categoria}
            </span>
          </div>

          {/* Input Edad y Categoría Calculada */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400 font-medium">Edad del Atleta</span>
              <span className="text-[10px] font-mono text-slate-500">
                {getDescripcionCategoria(categoria)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={3}
                max={99}
                value={edad}
                onChange={(e) => setEdad(parseInt(e.target.value) || 0)}
                className="w-20 px-3 py-1.5 rounded-xl bg-neon-card border border-white/10 text-white font-mono font-bold text-xs focus:outline-none focus:border-cyan transition-all text-center"
              />
              <div className="flex-1 min-w-0 px-3 py-1.5 rounded-xl bg-neon-card border border-white/5 flex items-center justify-between gap-1">
                <span className="text-[10px] text-slate-400 font-semibold truncate-safe">Categoría:</span>
                <span className="text-xs font-black text-mint tracking-wide truncate-safe">{categoria}</span>
              </div>
            </div>
          </div>

          {/* Selector de Eficiencia */}
          <div className="space-y-1.5">
            <label className="text-[11px] text-slate-400 font-medium flex items-center justify-between">
              <span className="truncate-safe">Nivel de Eficiencia</span>
              <span className="text-[10px] text-cyan font-mono font-bold shrink-0">{eficiencia}</span>
            </label>
            <div className="grid grid-cols-3 gap-1">
              {EFICIENCIAS_DISPONIBLES.map((eff) => (
                <button
                  key={eff}
                  type="button"
                  onClick={() => setEficiencia(eff)}
                  className={[
                    'press min-w-0 min-h-touch overflow-hidden rounded-xl px-1 py-1.5 text-center text-[9px] font-bold leading-[1.15] wrap-anywhere',
                    eficiencia === eff
                      ? 'bg-cyan text-neon-canvas shadow-glow-cyan font-black'
                      : 'bg-neon-card text-slate-400 hover:text-white hover:bg-neon-hover shadow-soft-elevation',
                  ].join(' ')}
                  title={`Eficiencia ${eff}`}
                >
                  {eff}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ 0b. Modo de Trazado (controles únicos de edición de pista) ═══ */}
        <section className="px-4 py-3.5 space-y-2">
          <h3 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            <PenTool className="w-3.5 h-3.5 text-cyan" />
            Modo de Trazado
          </h3>
          <RinkContextTools layout="panel" showActions={false} onClear={() => onClearRink?.()} />
        </section>

        {/* ═══ 1. Intro countdown ═══════════════════════════ */}
        <section className="px-4 py-3.5 space-y-2.5">
          <h3 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            <Timer className="w-3.5 h-3.5 text-cyan" />
            Intro &amp; Pre-Inicio
          </h3>

          <div className="flex gap-1.5">
            {[0, 3, 5, 8].map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => onPreRollSecChange(val)}
                className={[
                  'flex-1 py-2 rounded-xl text-xs font-bold interactive-tap transition-all',
                  preRollSec === val
                    ? 'bg-cyan text-neon-canvas shadow-glow-cyan font-black'
                    : 'bg-neon-card text-slate-400 hover:text-white hover:bg-neon-hover shadow-soft-elevation',
                ].join(' ')}
              >
                {val === 0 ? 'Off' : `${val}s`}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            {preRollSec === 0
              ? 'Sin cuenta atrás — inicio inmediato.'
              : `"3, 2, 1, ¡Ya!" — ${preRollSec}s de aviso previo.`}
          </p>
        </section>

        {/* ═══ 2. Audio mixer ═══════════════════════════════ */}
        <section className="px-4 py-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              <Music className="w-3.5 h-3.5 text-cyan" />
              Mezclador de Audio
            </h3>
            <span className="text-[10px] text-slate-500 font-mono">3 canales</span>
          </div>

          {onOpenAudioStudio && (
            <button
              type="button"
              onClick={onOpenAudioStudio}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-cyan/15 hover:bg-cyan/25 text-cyan border border-cyan/30 text-xs font-bold transition-all interactive-tap shadow-soft-elevation"
            >
              <span>🎛️ Abrir Estudio de Audio (DAW)</span>
            </button>
          )}

          {/* Channel routing */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
              <Headphones className="w-3 h-3" />
              Modo de Salida
            </label>
            <div className="flex gap-1.5">
              {(
                [
                  { mode: 'stereo', label: 'Estéreo' },
                  { mode: 'split-coach', label: 'Split L/R' },
                ] as const
              ).map(({ mode, label }) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={audio.channelMode === mode}
                  onClick={() => audio.setChannelMode(mode)}
                  className={[
                    'flex-1 py-2 rounded-xl text-xs font-bold interactive-tap transition-all',
                    audio.channelMode === mode
                      ? 'bg-cyan text-neon-canvas shadow-glow-cyan font-black'
                      : 'bg-neon-card text-slate-400 hover:text-white hover:bg-neon-hover shadow-soft-elevation',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-500">
              {audio.channelMode === 'split-coach'
                ? 'L: Música · R: Metrónomo/Voz'
                : 'L+R: Mezcla balanceada'}
            </p>
          </div>

          {/* Music Volume */}
          <VolumeSlider
            icon={<Music className="w-3 h-3 text-slate-400" />}
            label="Música"
            value={audio.musicVolume}
            onChange={(v) => audio.setMusicVolume(v)}
          />

          {/* Metronome Volume */}
          <VolumeSlider
            icon={<Clock className="w-3 h-3 text-slate-400" />}
            label="Metrónomo"
            value={audio.metronome.volume}
            onChange={(v) => audio.metronome.setVolume(v)}
          />

          {/* Metronome Controls */}
          <div className="bg-neon-card shadow-soft-elevation rounded-2xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">
                Metrónomo
              </span>
              <button
                type="button"
                onClick={() => audio.metronome.toggle()}
                className={[
                  'px-3 py-1 rounded-lg text-xs font-extrabold interactive-tap transition-all',
                  audio.metronome.enabled
                    ? 'bg-mint text-neon-canvas shadow-glow-mint'
                    : 'bg-neon-surface text-slate-500',
                ].join(' ')}
              >
                {audio.metronome.enabled ? 'ON' : 'OFF'}
              </button>
            </div>

            {audio.metronome.enabled && (
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
                <div>
                  <label className="text-[10px] font-semibold text-slate-400 block mb-1">
                    BPM ({audio.metronome.bpm})
                  </label>
                  <input
                    type="range"
                    min={40}
                    max={240}
                    value={audio.metronome.bpm}
                    onChange={(e) => audio.metronome.setBpm(parseInt(e.target.value, 10))}
                    className="w-full h-1.5 accent-mint bg-neon-surface rounded-full cursor-pointer"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-400 block mb-1">
                    Compás ({audio.metronome.beatsPerMeasure}/4)
                  </label>
                  <div className="flex gap-1">
                    {([2, 3, 4, 6] as const).map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => audio.metronome.setBeats(b)}
                        className={[
                          'flex-1 py-1 text-[11px] font-bold rounded-lg interactive-tap transition-all',
                          audio.metronome.beatsPerMeasure === b
                            ? 'bg-mint text-neon-canvas shadow-glow-mint font-black'
                            : 'bg-neon-surface text-slate-400',
                        ].join(' ')}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Coach Voice Volume */}
          <VolumeSlider
            icon={<Mic className="w-3 h-3 text-slate-400" />}
            label="Voz del Coach"
            value={audio.coachVolume}
            onChange={(v) => audio.setCoachVolume(v)}
          />

          {/* Voice Gender */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
              <Mic className="w-3 h-3" />
              Tono de Guía Vocal
            </label>
            <div className="flex gap-1.5">
              {(
                [
                  { gender: 'female', label: 'Femenina' },
                  { gender: 'male', label: 'Masculina' },
                ] as const
              ).map(({ gender, label }) => (
                <button
                  key={gender}
                  type="button"
                  onClick={() => handleVoiceGenderChange(gender)}
                  className={[
                    'press min-h-touch flex-1 rounded-xl px-1 py-2 text-xs font-bold',
                    audio.voiceGender === gender
                      ? 'bg-cyan text-neon-canvas shadow-glow-cyan font-black'
                      : 'bg-neon-card text-slate-400 hover:text-white hover:bg-neon-hover shadow-soft-elevation',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Motor de Voz Guía: Google Cloud (natural) vs Navegador (offline) */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1 text-[10px] font-semibold text-slate-500">
              <Sparkles className="w-3 h-3" />
              Motor de Voz Guía
            </label>
            <select
              value={ttsEngine}
              onChange={(e) => handleTtsEngineChange(e.target.value as 'browser' | 'google-cloud')}
              className="w-full rounded-xl border border-white/10 bg-neon-card px-2.5 py-2 text-[11px] font-semibold text-slate-200 outline-none focus:border-cyan/60"
              title="Google Cloud ofrece voces Neural2/Wavenet naturales; el navegador funciona sin conexión"
            >
              <option value="google-cloud">
                Google Cloud TTS · Voz natural{hasBuiltInKey ? ' (incluida)' : ''}
              </option>
              <option value="browser">Voz del navegador · Offline</option>
            </select>

            {/* La credencial viaja con la app: el usuario NO configura nada. */}
            {hasBuiltInKey ? (
              <p className="flex items-start gap-1.5 rounded-xl border border-mint/25 bg-mint/10 p-2 text-[10px] leading-snug text-mint">
                <CheckCircle2 className="mt-[1px] h-3 w-3 shrink-0" />
                <span>
                  Voz natural activada de fábrica. La credencial de Google Cloud TTS ya
                  viene incluida en la app: no tienes que configurar nada.
                </span>
              </p>
            ) : (
              ttsEngine === 'google-cloud' && (
                <div className="space-y-1.5 rounded-xl border border-white/10 bg-black/25 p-2">
                  <label className="flex items-center justify-between text-[10px] font-semibold text-slate-400">
                    <span className="flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-cyan" />
                      API Key de Google Cloud (opcional)
                    </span>
                    <button
                      type="button"
                      onClick={() => setApiKeyVisible((v) => !v)}
                      className="text-[10px] font-bold text-cyan hover:underline"
                    >
                      {apiKeyVisible ? 'Ocultar' : 'Mostrar'}
                    </button>
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type={apiKeyVisible ? 'text' : 'password'}
                      value={googleApiKey}
                      onChange={(e) => setGoogleApiKey(e.target.value)}
                      onBlur={handleApiKeySave}
                      placeholder="AIza…"
                      autoComplete="off"
                      spellCheck={false}
                      className="min-w-0 flex-1 rounded-lg border border-white/10 bg-neon-surface px-2 py-1.5 font-mono text-[11px] text-slate-200 outline-none focus:border-cyan/60"
                    />
                    <button
                      type="button"
                      onClick={handleApiKeySave}
                      className="press min-h-touch shrink-0 rounded-lg border border-cyan/30 bg-cyan/15 px-2.5 text-[10px] font-bold text-cyan hover:bg-cyan/25"
                    >
                      Guardar
                    </button>
                  </div>
                  <p className="text-[10px] leading-snug text-slate-500">
                    Esta compilación no incluye credencial propia. Puedes pegar una
                    clave de Google Cloud TTS o usar la voz del navegador.
                  </p>
                </div>
              )
            )}
          </div>

          {/* Modelo de Voz Guía (voces latinas Neural2 / Wavenet) */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1 text-[10px] font-semibold text-slate-500">
              <Mic className="w-3 h-3" />
              Modelo de Voz Latina
            </label>
            <select
              value={googleVoiceName}
              onChange={(e) => handleVoiceModelChange(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-neon-card px-2.5 py-2 text-[11px] font-semibold text-slate-200 outline-none focus:border-cyan/60"
              title="Voces latinas (es-US) Neural2 y Wavenet, femeninas y masculinas"
            >
              {LATIN_VOICES.map((voice) => (
                <option key={voice.name} value={voice.name}>
                  {voice.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => audioEngine.voiceCueEngine.testVoice()}
              className="press flex min-h-touch w-full items-center justify-center gap-1.5 rounded-xl border border-cyan/30 bg-cyan/15 px-3 py-2 text-[11px] font-bold text-cyan hover:bg-cyan/25"
            >
              <Mic className="h-3.5 w-3.5" />
              Probar Voz Guía
            </button>
          </div>
        </section>

        {/* ═══ 3. Skater avatar ═════════════════════════════ */}
        <section className="px-4 py-3.5 space-y-2.5">
          <h3 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            <Layers className="w-3.5 h-3.5 text-cyan" />
            Avatar Cinemático
          </h3>
          <div className="flex gap-1.5">
            {(
              [
                { gender: 'female', label: 'Patinadora' },
                { gender: 'male', label: 'Patinador' },
              ] as const
            ).map(({ gender, label }) => (
              <button
                key={gender}
                type="button"
                onClick={() => setSkaterGender(gender)}
                className={[
                  'flex-1 py-2 rounded-xl text-xs font-bold interactive-tap transition-all',
                  skaterGender === gender
                    ? 'bg-cyan text-neon-canvas shadow-glow-cyan font-black'
                    : 'bg-neon-card text-slate-400 hover:text-white hover:bg-neon-hover shadow-soft-elevation',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {/* ═══ 4. Rink view toggles ═════════════════════════ */}
        <section className="px-4 py-3.5 space-y-2">
          <h3 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            <Eye className="w-3.5 h-3.5 text-cyan" />
            Superposiciones de Pista
          </h3>
          <div className="grid grid-cols-3 gap-1.5">
            <ToggleButton
              icon={<Layers className="w-3 h-3" />}
              label="Cuadrícula"
              active={showRinkGrid}
              onClick={() => setShowRinkGrid(!showRinkGrid)}
              title="Mostrar u ocultar cuadrícula World Skate"
            />
            <ToggleButton
              icon={<Compass className="w-3 h-3" />}
              label="Guías 3/4"
              active={showReglamentaryGuides}
              onClick={() => setShowReglamentaryGuides(!showReglamentaryGuides)}
              title="Ejes y marcas de 3/4 para Skating Skills y Tijeras"
            />
            <ToggleButton
              icon={<CircleDot className="w-3 h-3" />}
              label="Figuras"
              active={showCompulsoryFigures}
              onClick={() => setShowCompulsoryFigures(!showCompulsoryFigures)}
              title="Círculos oficiales de Figuras Obligatorias (World Skate)"
            />
          </div>
        </section>

        {/* ═══ Paper-to-Digital Ecosystem ═══════════════════ */}
        <section className="px-4 py-3.5 space-y-2 bg-gradient-to-b from-white/[0.03] to-transparent">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-cyan">
              <Camera className="w-3.5 h-3.5 text-cyan" />
              Paper-to-Digital
            </h3>
            <span className="text-[9px] font-black text-mint px-1.5 py-0.5 rounded bg-mint/10 border border-mint/20">
              World Skate
            </span>
          </div>
          <p className="text-[11px] text-slate-400 leading-snug">
            Imprime la plantilla oficial, dibuja a mano alzada y digitaliza al instante.
          </p>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={() => PdfTemplateGenerator.downloadTemplate()}
              className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-neon-card hover:bg-neon-hover text-slate-300 hover:text-white border border-white/5 text-xs font-bold transition-all interactive-tap shadow-soft-elevation"
              title="Descargar plantilla A4 para imprimir"
            >
              <FileDown className="w-3.5 h-3.5 text-cyan" />
              <span>Plantilla A4</span>
            </button>
            <button
              type="button"
              onClick={() => setShowPaperModal(true)}
              className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-cyan/15 hover:bg-cyan/25 text-cyan border border-cyan/30 text-xs font-bold transition-all interactive-tap shadow-soft-elevation"
              title="Tomar foto o subir dibujo en papel"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Digitalizar</span>
            </button>
          </div>

          {paperTraceOverlay && (
            <button
              type="button"
              onClick={() => clearPaperTraceOverlay()}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30 text-xs font-bold transition-all interactive-tap mt-1.5"
              title="Descartar calco de la plantilla de papel"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
              <span>Descartar Plantilla / Calco</span>
            </button>
          )}
        </section>

        {/* ═══ 5. Secondary actions ═════════════════════════ */}
        <section className="px-4 py-3.5 space-y-2">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Herramientas
          </h3>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={onUndo}
              disabled={history.length === 0}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold bg-neon-card hover:bg-neon-hover text-slate-300 hover:text-white shadow-soft-elevation interactive-tap disabled:opacity-30 disabled:pointer-events-none"
            >
              <Undo2 className="w-3.5 h-3.5 text-coral" />
              Deshacer
            </button>
            <button
              type="button"
              onClick={onResetDemo}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold bg-neon-card hover:bg-neon-hover text-slate-300 hover:text-white shadow-soft-elevation interactive-tap"
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan" />
              Demo
            </button>
          </div>
          <button
            type="button"
            onClick={() => { audio.pause(); audio.seek(0); }}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold bg-neon-card hover:bg-neon-hover text-slate-300 hover:text-white shadow-soft-elevation interactive-tap"
          >
            <SkipBack className="w-3.5 h-3.5 text-slate-400" />
            Volver al Inicio (00:00)
          </button>

          {/* Botón de Limpiar Toda la Pista 2D en un solo toque */}
          <button
            type="button"
            onClick={onClearRink}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold bg-coral/15 hover:bg-coral text-coral hover:text-white shadow-soft-elevation interactive-tap transition-all mt-1"
            title="Borrar todos los nodos y reiniciar la pista 2D vacía"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Limpiar Toda la Pista 2D
          </button>
        </section>

        {/* ═══ SaaS / Sesión AlsizTech ═══════════════════════ */}
        <section className="px-4 py-3 bg-white/[0.02] border-t border-white/5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Cuenta AlsizTech
            </span>
            <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-mint/15 text-mint border border-mint/20">
              <ShieldCheck className="w-2.5 h-2.5" />
              {role === 'tester' ? 'Beta Tester' : role === 'superadmin' ? 'Admin' : subscription_plan === 'club' ? 'Licencia Club' : 'Individual'}
            </span>
          </div>

          {/* Botón Mis Dispositivos (Anti-Sharing) */}
          {user && (
            <button
              type="button"
              onClick={() => setShowDeviceModal(true)}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-white/5 text-[11px] font-medium text-slate-300 hover:text-white transition-all interactive-tap"
            >
              <span className="flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5 text-cyan" />
                <span>Mis Dispositivos &amp; Clave</span>
              </span>
              <span className="text-[10px] text-cyan font-bold">Ver &gt;</span>
            </button>
          )}

          <div className="flex items-center justify-between text-xs text-slate-300">
            <span className="truncate max-w-[170px] text-slate-400 text-[11px]" title={user?.email || 'Usuario'}>
              {user?.email || 'Sesión Activa'}
            </span>
            <button
              type="button"
              onClick={logout}
              className="flex items-center gap-1 text-[11px] font-semibold text-coral/80 hover:text-coral transition-colors py-1 px-2 rounded-lg hover:bg-coral/10 interactive-tap"
              title="Cerrar sesión de forma segura"
            >
              <LogOut className="w-3 h-3" />
              Salir
            </button>
          </div>
        </section>

        {/* ═══ Footer Attribution (Carbon Design System) ═════════════════════════ */}
        <section className="px-4 py-3 bg-white/[0.01] border-t border-white/5 text-center">
          <p className="text-xs text-gray-500 font-normal leading-relaxed">
            Desarrollado por Mauricio Andrade Luna | Diseñada por:{' '}
            <a
              href="http://www.alsitech.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline hover:text-blue-400 transition-colors font-medium"
            >
              AlsizTech
            </a>
          </p>
        </section>
    </>
  );

  if (isMobileModal) {
    return (
      <div
        className="w-full text-white select-none"
        style={{
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
          touchAction: 'pan-y',
        }}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerMove={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
      >
        {showHeader && (
          <div className="flex-none flex items-center px-4 py-3 border-b border-white/5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Preparación &amp; Audio
            </p>
          </div>
        )}
        <div className="divide-y divide-white/5">
          {content}
        </div>
        <DeviceSecurityModal
          isOpen={showDeviceModal}
          onClose={() => setShowDeviceModal(false)}
        />
        <PaperToDigitalModal
          isOpen={showPaperModal}
          onClose={() => setShowPaperModal(false)}
        />
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full w-full bg-neon-surface text-white select-none"
      style={{
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain',
        touchAction: 'pan-y',
      }}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      {/* ── Panel header ── */}
      {showHeader && (
        <div className="flex-none flex items-center px-4 py-3 border-b border-white/5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Preparación &amp; Audio
          </p>
        </div>
      )}

      {/* ── Scrollable body ── */}
      <div
        className="flex-1 overflow-y-auto overscroll-contain divide-y divide-white/5"
        style={{
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
          touchAction: 'pan-y',
        }}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerMove={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
      >
        {content}
      </div>

      <DeviceSecurityModal
        isOpen={showDeviceModal}
        onClose={() => setShowDeviceModal(false)}
      />
      <PaperToDigitalModal
        isOpen={showPaperModal}
        onClose={() => setShowPaperModal(false)}
      />
    </div>
  );
};


/* ─── Reusable Subcomponents ─────────────────────────── */

function VolumeSlider({
  icon,
  label,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="flex items-center gap-1.5 text-slate-300 font-medium">
          {icon}
          {label}
        </span>
        <span className="font-mono text-cyan font-bold text-[11px]">
          {Math.round(value * 100)}%
        </span>
      </div>
      <input
        type="range" min={0} max={1} step={0.01}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 accent-cyan bg-neon-surface rounded-full cursor-pointer"
      />
    </div>
  );
}

function ToggleButton({
  icon,
  label,
  active,
  onClick,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      title={title}
      className={[
        // Columna icono + etiqueta: la etiqueta dispone de todo el ancho del
        // cajón y puede partirse en dos líneas sin desbordar ni solaparse.
        'press flex w-full min-w-0 min-h-touch flex-col items-center justify-center gap-1 overflow-hidden rounded-xl px-1 py-1.5 text-center',
        active
          ? 'bg-cyan text-neon-canvas shadow-glow-cyan font-black'
          : 'bg-neon-card text-slate-400 hover:text-white hover:bg-neon-hover shadow-soft-elevation',
      ].join(' ')}
    >
      <span className="shrink-0 leading-none">{icon}</span>
      <span
        className="wrap-anywhere block w-full text-[10px] font-bold leading-[1.15]"
        style={{ overflowWrap: 'anywhere', wordBreak: 'break-word', hyphens: 'auto' }}
      >
        {label}
      </span>
    </button>
  );
}
