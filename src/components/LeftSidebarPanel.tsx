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
} from 'lucide-react';
import { useAudioEngine } from '../hooks/useAudioEngine';
import { useChoreographyStore } from '../store/useChoreographyStore';
import { useAuthStore } from '../store/useAuthStore';
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
}) => {
  const audio = useAudioEngine();

  const skaterGender = useChoreographyStore((s) => s.skaterGender);
  const setSkaterGender = useChoreographyStore((s) => s.setSkaterGender);
  const showControlHandles = useChoreographyStore((s) => s.showControlHandles);
  const setShowControlHandles = useChoreographyStore((s) => s.setShowControlHandles);
  const showRinkGrid = useChoreographyStore((s) => s.showRinkGrid);
  const setShowRinkGrid = useChoreographyStore((s) => s.setShowRinkGrid);
  const history = useChoreographyStore((s) => s.history);

  // Reglamento 2026
  const edad = useChoreographyStore((s) => s.edad);
  const categoria = useChoreographyStore((s) => s.categoria);
  const eficiencia = useChoreographyStore((s) => s.eficiencia);
  const setEdad = useChoreographyStore((s) => s.setEdad);
  const setEficiencia = useChoreographyStore((s) => s.setEficiencia);

  // SaaS Auth state
  const { user, subscription_plan, logout } = useAuthStore();

  return (
    <div className="flex flex-col h-full w-full bg-neon-surface text-white select-none">
      {/* ── Panel header ── */}
      <div className="flex-none flex items-center px-4 py-3 border-b border-white/5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Preparación &amp; Audio
        </p>
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto overscroll-contain divide-y divide-white/5">

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
              <div className="flex-1 px-3 py-1.5 rounded-xl bg-neon-card border border-white/5 flex items-center justify-between">
                <span className="text-[10px] text-slate-400 font-semibold">Categoría:</span>
                <span className="text-xs font-black text-mint tracking-wide">{categoria}</span>
              </div>
            </div>
          </div>

          {/* Selector de Eficiencia */}
          <div className="space-y-1.5">
            <label className="text-[11px] text-slate-400 font-medium flex items-center justify-between">
              <span>Nivel de Eficiencia</span>
              <span className="text-[10px] text-cyan font-mono font-bold">{eficiencia}</span>
            </label>
            <div className="grid grid-cols-3 gap-1">
              {EFICIENCIAS_DISPONIBLES.map((eff) => (
                <button
                  key={eff}
                  type="button"
                  onClick={() => setEficiencia(eff)}
                  className={[
                    'py-2 px-1 rounded-xl text-[10px] font-bold interactive-tap transition-all truncate text-center',
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
          <h3 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            <Music className="w-3.5 h-3.5 text-cyan" />
            Mezclador de Audio
          </h3>

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
                  onClick={() => audio.setVoiceGender(gender)}
                  className={[
                    'flex-1 py-2 rounded-xl text-xs font-bold interactive-tap transition-all',
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
          <div className="flex gap-1.5">
            <ToggleButton
              icon={<Eye className="w-3 h-3" />}
              label="Tiradores"
              active={showControlHandles}
              onClick={() => setShowControlHandles(!showControlHandles)}
              title="Mostrar u ocultar tiradores Bézier"
            />
            <ToggleButton
              icon={<Layers className="w-3 h-3" />}
              label="Cuadrícula"
              active={showRinkGrid}
              onClick={() => setShowRinkGrid(!showRinkGrid)}
              title="Mostrar u ocultar cuadrícula World Skate"
            />
          </div>
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
              {subscription_plan === 'club' ? 'Licencia Club' : 'Individual'}
            </span>
          </div>

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
      </div>
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
        'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold interactive-tap transition-all',
        active
          ? 'bg-cyan text-neon-canvas shadow-glow-cyan font-black'
          : 'bg-neon-card text-slate-400 hover:text-white hover:bg-neon-hover shadow-soft-elevation',
      ].join(' ')}
    >
      {icon}
      {label}
    </button>
  );
}
