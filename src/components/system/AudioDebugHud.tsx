import React, { useCallback, useEffect, useState } from 'react';
import { audioEngine } from '../../services/audioEngine';
import {
  audioDebugEnabled,
  getAudioDiagnosticSnapshot,
} from '../../core/audio/audioDiagnostics';

/**
 * HUD de diagnóstico de audio — SOLO aparece con `?audioDebug=1` (o el flag en
 * localStorage / modo desarrollo). Permite verificar en un móvil o tablet REAL,
 * sin herramientas de escritorio, que se cumple el invariante de fuente única:
 *
 *   instancias = 1 · schedulers armados = 0/1 · contexto = 1
 *
 * Si alguna vez aparece "instancias = 2" o "schedulers = 1" con el metrónomo
 * apagado en la UI, el contador `duplicados` dirá exactamente cuándo y con qué
 * evento (`METRONOME_DUPLICATE_KILLED`) se destruyó la fuente intrusa.
 */
export const AudioDebugHud: React.FC = () => {
  const [enabled] = useState(() => audioDebugEnabled());
  const [open, setOpen] = useState(true);
  const [health, setHealth] = useState(() => audioEngine.getAudioHealth());
  const [diag, setDiag] = useState(() => getAudioDiagnosticSnapshot());

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      setHealth(audioEngine.getAudioHealth());
      setDiag(getAudioDiagnosticSnapshot());
    }, 1000);
    return () => window.clearInterval(id);
  }, [enabled]);

  const copyReport = useCallback(() => {
    const report = JSON.stringify(
      { health: audioEngine.getAudioHealth(), diagnostics: getAudioDiagnosticSnapshot() },
      null,
      2
    );
    void navigator.clipboard?.writeText(report).catch(() => {});
  }, []);

  const disable = useCallback(() => {
    try {
      window.localStorage?.removeItem('skatecoreo_audio_debug');
    } catch {
      /* modo privado */
    }
    setOpen(false);
  }, []);

  if (!enabled || !open) return null;

  const ok =
    health.metronomeInstances === 1 &&
    health.armedSchedulers <= 1 &&
    diag.audioContextsCreated <= 1;

  const ownership = audioEngine.getAudioOwnershipSnapshot();
  const activeByKind = health.sources.activeByKind;
  const activeSourcesText =
    Object.entries(activeByKind)
      .map(([kind, count]) => `${kind}=${count}`)
      .join(' ') || 'ninguna';

  return (
    <div className="fixed bottom-2 left-2 z-[9999] max-w-[280px] rounded-xl border border-white/20 bg-black/85 px-3 py-2 font-mono text-[10px] leading-tight text-slate-200 shadow-2xl backdrop-blur">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className={ok ? 'font-bold text-emerald-400' : 'font-bold text-rose-400'}>
          AUDIO {ok ? 'OK' : 'REVISAR'}
        </span>
        <span className="text-slate-400">
          {diag.platform} · {diag.activeView} · {diag.build}
        </span>
      </div>
      <div>
        tab: {ownership.tabId} · owner: {String(ownership.isOwner)}
        {ownership.ownerId !== null ? ` (#${ownership.ownerId})` : ''}
      </div>
      <div>
        otra pestaña: play={String(ownership.otherTabPlaying)} metro=
        {String(ownership.otherTabMetronomeOn)}
      </div>
      <div>
        sesión: {health.sessionId} · gen {health.generation} · fase {health.phase}
      </div>
      <div>ctx creados: {diag.audioContextsCreated} ({health.ctxState})</div>
      <div>
        fuentes activas: {health.sources.activeCount} [{activeSourcesText}]
      </div>
      <div>
        metrónomos: {health.metronomeInstances} · id #{health.metronomeInstanceId} · duplicados destruidos:{' '}
        {health.duplicateKills}
      </div>
      <div>
        schedulers armados: {health.armedSchedulers}
        {health.schedulerOwnerId !== null ? ` (#${health.schedulerOwnerId})` : ''}
      </div>
      <div>
        metro enabled/muted: {String(health.metronomeEnabled)}/{String(health.metronomeMuted)} · nodos:{' '}
        {health.metronomeActiveNodes}
      </div>
      <div>
        clicks: {health.clicksCreated} · play:{String(health.isPlaying)} · preroll:
        {String(health.isPreRollActive)}
      </div>
      <div className="mt-1 flex gap-2">
        <button type="button" onClick={copyReport} className="rounded bg-white/10 px-2 py-0.5">
          Copiar
        </button>
        <button type="button" onClick={disable} className="rounded bg-white/10 px-2 py-0.5">
          Ocultar
        </button>
      </div>
      <div className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap text-[9px] text-slate-400">
        {diag.events.slice(-6).map((e, i) => (
          <div key={`${e.t}-${i}`}>
            {e.event}
            {e.details ? ` ${e.details}` : ''}
          </div>
        ))}
      </div>
    </div>
  );
};
