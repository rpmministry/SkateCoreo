import React, { useState, useEffect, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Play, 
  Pause, 
  Square, 
  RotateCcw, 
  Upload, 
  Sparkles, 
  Volume2, 
  Gauge, 
  AlertCircle,
  Scissors,
  Layers,
  Download,
  Check,
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  FileAudio,
  Radio,
  Headphones,
  Mic,
  Timer,
  Volume1,
  Cloud,
  Package,
  Activity
} from 'lucide-react';
import { audioEngine } from '../core/audio/AudioEngine';
import { Program, ElementLog, AudioEngineState } from '../types';
import { GOOGLE_TTS_VOICES } from '../core/audio/VoiceCueEngine';
import { TTSEngineType } from '../types/audio';
import { InteractiveWaveform } from './InteractiveWaveform';
import { useChoreographyStore } from '../store/useChoreographyStore';
import { exportCoreoProject, importCoreoProject } from '../services/coreoPackage';
import { BpmDetectionResult } from '../core/audio/BpmDetector';

interface AudioStudioProps {
  currentProgram: Program | null;
  onProgramUpdated: (updated: Program) => void;
  elements: ElementLog[];
}

interface TrackQueueItem {
  id: string;
  name: string;
  buffer: AudioBuffer;
  durationMs: number;
}

export const AudioStudio: React.FC<AudioStudioProps> = ({
  currentProgram,
  onProgramUpdated,
  elements
}) => {
  const { t, i18n } = useTranslation();

  const [studioTab, setStudioTab] = useState<'coaching' | 'editing'>('coaching');
  const [audioState, setAudioState] = useState<AudioEngineState>(audioEngine.getState());
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(0);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Metronome State
  const [metronomeEnabled, setMetronomeEnabled] = useState(audioEngine.metronome.getConfig().enabled);
  const [bpm, setBpm] = useState(audioEngine.metronome.getConfig().bpm);
  const [beatsPerMeasure, setBeatsPerMeasure] = useState<1 | 2 | 3 | 4 | 6>(audioEngine.metronome.getConfig().beatsPerMeasure);
  const [accentFirstBeat, setAccentFirstBeat] = useState(audioEngine.metronome.getConfig().accentFirstBeat);
  const [metronomeVolume, setMetronomeVolume] = useState(audioEngine.metronome.getConfig().volume);

  // Voice Cue & Google Cloud TTS State
  const [voiceCueEnabled, setVoiceCueEnabled] = useState(audioEngine.voiceCueEngine.getConfig().enabled);
  const [introDelaySec, setIntroDelaySec] = useState(audioEngine.voiceCueEngine.getConfig().introDelaySec);
  const [warningLeadTimeSec, setWarningLeadTimeSec] = useState(audioEngine.voiceCueEngine.getConfig().warningLeadTimeSec);
  const [voiceVolume, setVoiceVolume] = useState(audioEngine.voiceCueEngine.getConfig().volume);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string | null>(audioEngine.voiceCueEngine.getConfig().selectedVoiceURI || null);
  const [voicePitch, setVoicePitch] = useState<number>(audioEngine.voiceCueEngine.getConfig().voicePitch || 1.0);
  const [voiceSpeed, setVoiceSpeed] = useState<number>(audioEngine.voiceCueEngine.getConfig().voiceSpeed || 1.05);

  const [ttsEngine, setTtsEngine] = useState<TTSEngineType>(
    () => audioEngine.voiceCueEngine.getConfig().ttsEngine || 'browser'
  );
  const [googleVoiceName, setGoogleVoiceName] = useState<string>(
    () => audioEngine.voiceCueEngine.getConfig().googleVoiceName || 'es-ES-Neural2-A'
  );
  const [isTestingVoice, setIsTestingVoice] = useState(false);

  // Trimming State
  const [trimStartMs, setTrimStartMs] = useState<number>(0);
  const [trimEndMs, setTrimEndMs] = useState<number>(0);

  // Fade In / Out State
  const [fadeInSec, setFadeInSec] = useState<number>(2.0);
  const [fadeOutSec, setFadeOutSec] = useState<number>(3.0);

  // Track Merger State
  const [trackQueue, setTrackQueue] = useState<TrackQueueItem[]>([]);
  const [crossfadeSec, setCrossfadeSec] = useState<number>(0.5);

  const fileInputId = useId();
  const multiFileInputId = useId();
  const coreoFileInputId = useId();

  // Export & Packaging State
  const [isExportingMixdown, setIsExportingMixdown] = useState(false);
  const [isExportingCoreo, setIsExportingCoreo] = useState(false);
  const [dspBpmResult, setDspBpmResult] = useState<BpmDetectionResult | null>(null);
  const [isDetectingBpm, setIsDetectingBpm] = useState(false);

  // Keep program elements synced to voice cue engine for automated announcements
  useEffect(() => {
    if (elements && elements.length > 0) {
      audioEngine.setProgramElementsForCues(elements);
    }
  }, [elements]);

  // Sync language with VoiceCueEngine
  useEffect(() => {
    const lang = (i18n.language.startsWith('en') ? 'en' : 'es') as 'es' | 'en';
    audioEngine.voiceCueEngine.setLanguage(lang);
  }, [i18n.language]);

  // Load and refresh available speech synthesis voices
  useEffect(() => {
    const refreshVoices = () => {
      const list = audioEngine.voiceCueEngine.getAvailableVoices();
      setAvailableVoices([...list]);
      const currentURI = audioEngine.voiceCueEngine.getConfig().selectedVoiceURI;
      if (currentURI) {
        setSelectedVoiceURI(currentURI);
      }
    };

    refreshVoices();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = refreshVoices;
    }
  }, []);

  // Initialize trim end when audio loads
  useEffect(() => {
    if (audioState.durationMs > 0 && trimEndMs === 0) {
      setTrimEndMs(audioState.durationMs);
    }
  }, [audioState.durationMs, trimEndMs]);

  // Subscribe to audio engine events
  useEffect(() => {
    const unsubState = audioEngine.onStateChange((state) => {
      setAudioState(state);
    });

    const unsubTime = audioEngine.onTimeUpdate((time) => {
      setCurrentTimeMs(time);
    });

    return () => {
      unsubState();
      unsubTime();
    };
  }, []);

  // Upload Single File
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoadingAudio(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const buffer = await audioEngine.loadAudioFile(file);
      setTrimStartMs(0);
      setTrimEndMs(Math.round(buffer.duration * 1000));
      setSuccessMessage(`Pista cargada con éxito: "${file.name}" (${(buffer.duration).toFixed(1)}s)`);

      if (currentProgram) {
        onProgramUpdated({
          ...currentProgram,
          duration_ms: Math.round(buffer.duration * 1000),
          half_time_ms: Math.round((buffer.duration * 1000) / 2),
          audio_name: file.name
        });
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al cargar el archivo de audio.');
    } finally {
      setIsLoadingAudio(false);
      e.target.value = '';
    }
  };

  // Generate Demo Track
  const handleGenerateDemo = async () => {
    setIsLoadingAudio(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const buffer = await audioEngine.generateDemoTrack();
      setTrimStartMs(0);
      setTrimEndMs(Math.round(buffer.duration * 1000));
      setSuccessMessage('Pista de prueba oficial ("Musica de Coreo prueba.wav", 133.7s) cargada con éxito.');

      if (currentProgram) {
        onProgramUpdated({
          ...currentProgram,
          duration_ms: Math.round(buffer.duration * 1000),
          half_time_ms: Math.round((buffer.duration * 1000) / 2),
          audio_name: 'Musica de Coreo prueba.wav'
        });
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al generar audio demo.');
    } finally {
      setIsLoadingAudio(false);
    }
  };

  // Execute Audio Trimming
  const handleTrimAudio = () => {
    if (!audioState.hasAudioLoaded) return;
    try {
      const trimmed = audioEngine.trimAudio(trimStartMs, trimEndMs);
      const newDurMs = Math.round(trimmed.duration * 1000);
      setTrimStartMs(0);
      setTrimEndMs(newDurMs);
      setSuccessMessage(`Pista recortada con éxito a ${(trimmed.duration).toFixed(1)}s`);

      if (currentProgram) {
        onProgramUpdated({
          ...currentProgram,
          duration_ms: newDurMs,
          half_time_ms: Math.round(newDurMs / 2)
        });
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al recortar audio');
    }
  };

  // Apply Fades
  const handleApplyFades = () => {
    if (!audioState.hasAudioLoaded) return;
    try {
      audioEngine.applyFades(fadeInSec, fadeOutSec);
      setSuccessMessage(`Fundidos aplicados: Fade In (${fadeInSec}s) y Fade Out (${fadeOutSec}s).`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al aplicar fundidos');
    }
  };

  // Add Track to Queue
  const handleAddTrackToQueue = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsLoadingAudio(true);
    try {
      const newItems: TrackQueueItem[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const arrayBuffer = await file.arrayBuffer();
        const dummyCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const buffer = await dummyCtx.decodeAudioData(arrayBuffer);
        dummyCtx.close();

        newItems.push({
          id: `track-${Date.now()}-${i}`,
          name: file.name,
          buffer,
          durationMs: Math.round(buffer.duration * 1000)
        });
      }
      setTrackQueue(prev => [...prev, ...newItems]);
      setSuccessMessage(`${newItems.length} pista(s) añadida(s) a la cola de unión.`);
    } catch (err: any) {
      setErrorMessage('Error al decodificar una o más pistas para la cola.');
    } finally {
      setIsLoadingAudio(false);
      e.target.value = '';
    }
  };

  // Move Track in Queue
  const handleMoveQueueItem = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= trackQueue.length) return;

    const updated = [...trackQueue];
    const [moved] = updated.splice(index, 1);
    updated.splice(newIndex, 0, moved);
    setTrackQueue(updated);
  };

  // Remove Track from Queue
  const handleRemoveQueueItem = (id: string) => {
    setTrackQueue(prev => prev.filter(t => t.id !== id));
  };

  // Execute Merge Tracks
  const handleMergeTracks = () => {
    if (trackQueue.length === 0) {
      setErrorMessage('Añade al menos una pista a la lista para unir.');
      return;
    }

    try {
      const merged = audioEngine.concatenateAudioTracks(trackQueue.map(t => t.buffer), crossfadeSec);
      const newDurMs = Math.round(merged.duration * 1000);
      setTrimStartMs(0);
      setTrimEndMs(newDurMs);
      setSuccessMessage(`Se han unido ${trackQueue.length} pistas en un Programa Maestro de ${(merged.duration).toFixed(1)}s.`);

      if (currentProgram) {
        onProgramUpdated({
          ...currentProgram,
          duration_ms: newDurMs,
          half_time_ms: Math.round(newDurMs / 2),
          audio_name: 'Pista_Maestra_Unida.wav'
        });
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al unir las pistas');
    }
  };

  // Export to WAV
  const handleExportWav = () => {
    if (!audioState.hasAudioLoaded) return;
    try {
      const blob = audioEngine.exportBufferToWav();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (audioState.fileName?.replace(/\.[^/.]+$/, '') || 'programa_skateart') + '.wav';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setSuccessMessage('Archivo WAV exportado y descargado exitosamente.');
    } catch (err: any) {
      setErrorMessage('Error al generar archivo WAV descargable.');
    }
  };

  // Exportar mezcla estéreo L/R (L: Coach y Metrónomo | R: Música)
  const handleExportStereoMixdown = async () => {
    if (!audioState.hasAudioLoaded) return;
    setIsExportingMixdown(true);
    setErrorMessage(null);
    try {
      const points = useChoreographyStore.getState().points;
      const blob = await audioEngine.exportStereoMixdown(points);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (audioState.fileName?.replace(/\.[^/.]+$/, '') || 'programa_skateart') + '_mezcla_LR_coach.wav';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setSuccessMessage('Mezcla Estéreo L/R (L: Coach y Metrónomo | R: Música) exportada y descargada exitosamente.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al exportar la mezcla estéreo');
    } finally {
      setIsExportingMixdown(false);
    }
  };

  // Exportar paquete completo .coreo (Offline)
  const handleExportCoreo = async () => {
    setIsExportingCoreo(true);
    setErrorMessage(null);
    try {
      const store = useChoreographyStore.getState();
      const rawBlob = audioEngine.getRawAudioBlob() || (audioState.hasAudioLoaded ? audioEngine.exportBufferToWav() : null);
      const blob = await exportCoreoProject(
        currentProgram?.title || 'Programa Coreográfico SkateArt',
        'RollArt Standard',
        store.skaterGender,
        store.points,
        rawBlob,
        audioState.fileName,
        bpm,
        beatsPerMeasure,
        audioState.playbackRate
      );

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (currentProgram?.title || audioState.fileName?.replace(/\.[^/.]+$/, '') || 'programa_skateart') + '.coreo';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setSuccessMessage('Paquete .coreo exportado exitosamente con pistas, figuras y voces offline.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al empaquetar archivo .coreo');
    } finally {
      setIsExportingCoreo(false);
    }
  };

  // Importar paquete completo .coreo (Offline)
  const handleImportCoreo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoadingAudio(true);
    setErrorMessage(null);
    try {
      const imported = await importCoreoProject(file);
      const store = useChoreographyStore.getState();

      // Cargar nodos coreográficos
      store.loadProgramPoints(imported.points);
      if (imported.manifest.program.skaterGender === 'male' || imported.manifest.program.skaterGender === 'female') {
        store.setSkaterGender(imported.manifest.program.skaterGender);
      }

      // Cargar audio
      if (imported.audioBlob) {
        await audioEngine.loadAudioFile(imported.audioBlob, imported.manifest.audioMeta.fileName);
      }

      // Restaurar metrónomo y tempo
      if (imported.manifest.audioMeta.bpm) {
        handleUpdateMetronome({
          bpm: imported.manifest.audioMeta.bpm,
          beatsPerMeasure: (imported.manifest.audioMeta.beatsPerMeasure as any) || 4
        });
      }

      if (imported.manifest.audioMeta.playbackRate) {
        audioEngine.setPlaybackRate(imported.manifest.audioMeta.playbackRate);
      }

      setSuccessMessage(`Proyecto .coreo "${imported.manifest.program.title}" cargado con éxito (${imported.points.length} figuras, ${imported.ttsCachedCount} voces offline sincronizadas).`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al importar paquete .coreo');
    } finally {
      setIsLoadingAudio(false);
      e.target.value = '';
    }
  };

  // Detección de BPM por DSP
  const handleDetectDspBpm = () => {
    if (!audioState.hasAudioLoaded) return;
    setIsDetectingBpm(true);
    try {
      const result = audioEngine.detectBpm();
      setDspBpmResult(result);
      if (result.confidence >= 0.25) {
        handleUpdateMetronome({ bpm: result.bpm });
        setSuccessMessage(`Tempo detectado por DSP: ${result.bpm} BPM (Confianza: ${Math.round(result.confidence * 100)}%)`);
      } else {
        setErrorMessage(`Tempo estimado: ${result.bpm} BPM con baja confianza (${Math.round(result.confidence * 100)}%). Verifique manualmente.`);
      }
    } catch (e: any) {
      setErrorMessage('No se pudo analizar el BPM del audio.');
    } finally {
      setIsDetectingBpm(false);
    }
  };

  // Sincronizar velocidad de la música al BPM del metrónomo (Time-Stretching)
  const handleSyncMusicToMetronome = () => {
    if (!audioState.hasAudioLoaded) return;
    try {
      const appliedRate = audioEngine.syncTrackToBpm(bpm);
      setSuccessMessage(`Pista sincronizada a ${bpm} BPM (playbackRate: ${appliedRate.toFixed(3)}x)`);
    } catch (e: any) {
      setErrorMessage('Error al sincronizar velocidad de la pista.');
    }
  };

  // Update Metronome Configuration
  const handleUpdateMetronome = (updates: Partial<{ enabled: boolean; bpm: number; beatsPerMeasure: 1 | 2 | 3 | 4 | 6; accentFirstBeat: boolean; volume: number }>) => {
    if (updates.enabled !== undefined) {
      setMetronomeEnabled(updates.enabled);
      audioEngine.metronome.setEnabled(updates.enabled);
    }
    if (updates.bpm !== undefined) {
      setBpm(updates.bpm);
      audioEngine.metronome.setBpm(updates.bpm);
    }
    if (updates.beatsPerMeasure !== undefined) {
      setBeatsPerMeasure(updates.beatsPerMeasure);
      audioEngine.metronome.setBeatsPerMeasure(updates.beatsPerMeasure);
    }
    if (updates.accentFirstBeat !== undefined) {
      setAccentFirstBeat(updates.accentFirstBeat);
      audioEngine.metronome.setConfig({ accentFirstBeat: updates.accentFirstBeat });
    }
    if (updates.volume !== undefined) {
      setMetronomeVolume(updates.volume);
      audioEngine.metronome.setVolume(updates.volume);
    }
  };

  // Update Voice Cue Configuration
  const handleUpdateVoiceCue = (updates: Partial<{
    enabled: boolean;
    introDelaySec: number;
    warningLeadTimeSec: number;
    volume: number;
    selectedVoiceURI: string | null;
    voicePitch: number;
    voiceSpeed: number;
    ttsEngine: TTSEngineType;
    googleApiKey: string | null;
    googleVoiceName: string;
  }>) => {
    if (updates.enabled !== undefined) {
      setVoiceCueEnabled(updates.enabled);
      audioEngine.voiceCueEngine.setConfig({ enabled: updates.enabled });
    }
    if (updates.introDelaySec !== undefined) {
      setIntroDelaySec(updates.introDelaySec);
      audioEngine.voiceCueEngine.setIntroDelay(updates.introDelaySec);
    }
    if (updates.warningLeadTimeSec !== undefined) {
      setWarningLeadTimeSec(updates.warningLeadTimeSec);
      audioEngine.voiceCueEngine.setLeadTime(updates.warningLeadTimeSec);
    }
    if (updates.volume !== undefined) {
      setVoiceVolume(updates.volume);
      audioEngine.voiceCueEngine.setVolume(updates.volume);
    }
    if (updates.selectedVoiceURI !== undefined) {
      setSelectedVoiceURI(updates.selectedVoiceURI);
      audioEngine.voiceCueEngine.setSelectedVoice(updates.selectedVoiceURI);
    }
    if (updates.voicePitch !== undefined) {
      setVoicePitch(updates.voicePitch);
      audioEngine.voiceCueEngine.setVoicePitch(updates.voicePitch);
    }
    if (updates.voiceSpeed !== undefined) {
      setVoiceSpeed(updates.voiceSpeed);
      audioEngine.voiceCueEngine.setVoiceSpeed(updates.voiceSpeed);
    }
    if (updates.ttsEngine !== undefined) {
      setTtsEngine(updates.ttsEngine);
      audioEngine.voiceCueEngine.setTtsEngine(updates.ttsEngine);
    }
    if (updates.googleVoiceName !== undefined) {
      setGoogleVoiceName(updates.googleVoiceName);
      audioEngine.voiceCueEngine.setGoogleVoiceName(updates.googleVoiceName);
    }
  };

  const handleTestVoice = () => {
    setIsTestingVoice(true);
    audioEngine.voiceCueEngine.testVoice();
    setTimeout(() => setIsTestingVoice(false), 1500);
  };

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">

      {/* PRE-ROLL COUNTDOWN OVERLAY / BANNER */}
      {audioState.isPreRollActive && (
        <div className="rounded-2xl bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-500 p-4 text-slate-950 shadow-2xl flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-3">
            <Timer className="w-8 h-8 flex-shrink-0 animate-spin" />
            <div>
              <h3 className="text-base font-black uppercase tracking-wider">
                {t('voice_cues.countdown_active', '¡En posición! La música inicia en...')}
              </h3>
              <p className="text-xs font-semibold opacity-90 flex items-center gap-2 flex-wrap">
                <span>La patinadora tiene {introDelaySec}s para tomar su pose inicial en la pista.</span>
                <span className="bg-slate-950/30 px-2 py-0.5 rounded text-[11px] font-bold border border-slate-950/20 shadow-sm">
                  ♩ Sincronizado al metrónomo ({bpm} BPM)
                </span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-5xl font-black font-mono tracking-tighter bg-slate-950 text-amber-400 px-5 py-2 rounded-xl shadow-inner border border-amber-300/40">
              {audioState.preRollCountdown > 0 ? audioState.preRollCountdown : '¡YA!'}
            </span>
            <button
              onClick={() => audioEngine.pause()}
              className="px-3 py-1.5 bg-slate-950/80 hover:bg-slate-950 text-white font-bold text-xs rounded-lg transition-all"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Main Waveform Player Card */}
      <div className="bg-skate-panel border border-skate-border rounded-2xl p-6 shadow-xl space-y-4">
        
        {/* Top Header & Track Info */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-sky-900/50 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <FileAudio className="w-5 h-5 text-sky-400" />
              <h2 className="text-base font-bold text-sky-400 tracking-wide">
                {audioState.fileName || 'Ninguna pista cargada'}
              </h2>
            </div>
            <p className="text-xs text-sky-300/80 font-mono flex items-center gap-3">
              <span>Duración: <strong className="text-white">{formatTime(audioState.durationMs)}</strong></span>
              <span>Tiempo Actual: <strong className="text-sky-300 font-bold">{formatTime(currentTimeMs)}</strong></span>
              <span>Compás Actual: <strong className="text-sky-400 font-bold">{bpm} BPM ({beatsPerMeasure === 1 ? '1/1' : beatsPerMeasure === 6 ? '6/8' : `${beatsPerMeasure}/4`})</strong></span>
            </p>
          </div>

          {/* Action Buttons: Upload & Demo */}
          <div className="flex items-center gap-2">
            <input
              type="file"
              id={fileInputId}
              accept="audio/*"
              className="hidden"
              onChange={handleFileUpload}
              disabled={isLoadingAudio}
            />
            <label
              htmlFor={fileInputId}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-950/70 hover:bg-amber-400 hover:text-zinc-950 border border-sky-800 text-sky-300 text-xs font-bold cursor-pointer transition-all touch-target shadow-sm ${
                isLoadingAudio ? 'opacity-50 pointer-events-none' : ''
              }`}
            >
              <Upload className="w-4 h-4" />
              <span>{t('audio.load_track', 'Cargar Pista')}</span>
            </label>

            <button
              onClick={handleGenerateDemo}
              disabled={isLoadingAudio}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-950/70 hover:bg-amber-400 hover:text-zinc-950 border border-sky-800 text-sky-300 text-xs font-bold transition-all touch-target shadow-sm"
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>{t('audio.load_demo', 'Pista Demo')}</span>
            </button>

            {/* Importar Proyecto .coreo */}
            <input
              type="file"
              id={coreoFileInputId}
              accept=".coreo"
              className="hidden"
              onChange={handleImportCoreo}
              disabled={isLoadingAudio}
            />
            <label
              htmlFor={coreoFileInputId}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-950/70 hover:bg-amber-400 hover:text-zinc-950 border border-sky-800 text-sky-300 text-xs font-bold cursor-pointer transition-all touch-target shadow-sm ${
                isLoadingAudio ? 'opacity-50 pointer-events-none' : ''
              }`}
              title="Abrir un paquete .coreo con figuras, música y voces sincronizadas offline"
            >
              <Package className="w-4 h-4 text-amber-400" />
              <span>Abrir .coreo</span>
            </label>

            {/* Exportar Proyecto .coreo */}
            <button
              onClick={handleExportCoreo}
              disabled={isExportingCoreo}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-950/70 hover:bg-amber-400 hover:text-zinc-950 border border-sky-800 text-sky-300 text-xs font-bold transition-all touch-target shadow-sm ${
                isExportingCoreo ? 'opacity-50 pointer-events-none' : ''
              }`}
              title="Empaquetar proyecto .coreo completo con voces offline para compartir"
            >
              <Package className="w-4 h-4 text-emerald-400" />
              <span>{isExportingCoreo ? 'Empaquetando...' : 'Exportar .coreo'}</span>
            </button>

            {audioState.hasAudioLoaded && (
              <>
                {/* Mezcla Estéreo L/R para entrenamiento */}
                <button
                  onClick={handleExportStereoMixdown}
                  disabled={isExportingMixdown}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-950/70 hover:bg-amber-400 hover:text-zinc-950 border border-sky-800 text-sky-300 text-xs font-bold transition-all touch-target shadow-sm ${
                    isExportingMixdown ? 'opacity-50 pointer-events-none' : ''
                  }`}
                  title="Exportar archivo WAV estéreo con aislamiento estricto: L = Coach (Metrónomo y Voz) | R = Música limpia"
                >
                  <Headphones className="w-4 h-4 text-amber-400" />
                  <span>{isExportingMixdown ? 'Renderizando...' : 'Mezcla L/R Coach'}</span>
                </button>

                <button
                  onClick={handleExportWav}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-950/70 hover:bg-amber-400 hover:text-zinc-950 border border-sky-800 text-sky-300 text-xs font-bold transition-all touch-target shadow-sm"
                  title="Descargar audio resultante en formato WAV 16-bit"
                >
                  <Download className="w-4 h-4 text-sky-400" />
                  <span>WAV</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Alerts for Status */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-500/50 text-rose-200 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-white font-bold ml-2">×</button>
          </div>
        )}

        {successMessage && (
          <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-500/50 text-emerald-200 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>{successMessage}</span>
            </div>
            <button onClick={() => setSuccessMessage(null)} className="text-emerald-400 hover:text-white font-bold ml-2">×</button>
          </div>
        )}

        {audioState.bluetoothLatencyWarning && (
          <div className="p-3 rounded-xl bg-amber-950/70 border border-amber-500/50 text-amber-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>{t('audio.bluetooth_warning', audioState.bluetoothLatencyWarning)}</span>
          </div>
        )}

        {/* Mirrored Interactive Waveform (Exact Single Source of Truth) */}
        <InteractiveWaveform
          currentTimeMs={currentTimeMs}
          durationMs={audioState.durationMs}
          isPlaying={audioState.isPlaying || audioState.isPreRollActive}
          onSeek={(target) => audioEngine.seek(target)}
          fileName={audioState.fileName}
        />

        {/* Primary Transport Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (audioState.isPlaying || audioState.isPreRollActive) audioEngine.pause();
                else audioEngine.play();
              }}
              disabled={!audioState.hasAudioLoaded && !audioState.isPreRollActive}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl disabled:opacity-40 font-black text-sm shadow-lg transition-all touch-target ${
                (audioState.isPlaying || audioState.isPreRollActive)
                  ? 'bg-amber-400 text-zinc-950 hover:bg-amber-300 border border-amber-300 shadow-amber-400/25'
                  : 'bg-sky-600 hover:bg-amber-400 hover:text-zinc-950 text-white border border-sky-500 shadow-sky-500/30'
              }`}
            >
              {(audioState.isPlaying || audioState.isPreRollActive) ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
              <span>{(audioState.isPlaying || audioState.isPreRollActive) ? t('audio.transport_pause', 'Pausar') : t('audio.transport_play', 'Reproducir')}</span>
            </button>

            <button
              onClick={() => audioEngine.stop()}
              disabled={!audioState.hasAudioLoaded && !audioState.isPreRollActive && !audioState.isPlaying}
              className="p-2.5 rounded-xl bg-sky-950/70 hover:bg-amber-400 hover:text-zinc-950 disabled:opacity-40 text-sky-300 border border-sky-800 transition-all touch-target"
              title={t('audio.transport_stop', 'Detener')}
            >
              <Square className="w-4 h-4" />
            </button>

            {/* Quick Seek Back -10s (Coaching Repeat Gesture) */}
            <button
              onClick={() => audioEngine.seek(Math.max(0, currentTimeMs - 10000))}
              disabled={!audioState.hasAudioLoaded}
              className="px-3 py-2 rounded-xl bg-sky-950/70 hover:bg-amber-400 hover:text-zinc-950 disabled:opacity-40 text-sky-300 border border-sky-800 text-xs font-mono font-bold transition-all touch-target"
              title={t('audio.transport_seek_back', 'Retroceder 10s')}
            >
              -10s
            </button>

            {/* Quick Seek Forward +10s */}
            <button
              onClick={() => audioEngine.seek(Math.min(audioState.durationMs, currentTimeMs + 10000))}
              disabled={!audioState.hasAudioLoaded}
              className="px-3 py-2 rounded-xl bg-sky-950/70 hover:bg-amber-400 hover:text-zinc-950 disabled:opacity-40 text-sky-300 border border-sky-800 text-xs font-mono font-bold transition-all touch-target"
              title={t('audio.transport_seek_forward', 'Avanzar 10s')}
            >
              +10s
            </button>

            <button
              onClick={() => audioEngine.seek(0)}
              disabled={!audioState.hasAudioLoaded}
              className="p-2.5 rounded-xl bg-sky-950/70 hover:bg-amber-400 hover:text-zinc-950 disabled:opacity-40 text-sky-300 border border-sky-800 transition-all touch-target"
              title="Reiniciar a 00:00"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          {/* Speed / Rate control */}
          <div className="flex items-center gap-3 bg-sky-950/50 px-3 py-1.5 rounded-xl border border-sky-800/80">
            <Gauge className="w-4 h-4 text-sky-400" />
            <span className="text-xs font-medium text-sky-300">Velocidad:</span>
            {[0.8, 1.0, 1.2].map((rate) => (
              <button
                key={rate}
                onClick={() => audioEngine.setPlaybackRate(rate)}
                className={`px-2 py-0.5 rounded text-xs font-mono font-bold transition-all ${
                  audioState.playbackRate === rate
                    ? 'bg-amber-400 text-zinc-950 font-black border border-amber-300'
                    : 'text-sky-300 hover:text-white'
                }`}
              >
                {rate}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Progressive Disclosure: Selector de Módulos Impeccable */}
      <div className="flex items-center gap-2 border-b border-sky-900/50 pb-3">
        <button
          onClick={() => setStudioTab('coaching')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            studioTab === 'coaching'
              ? 'bg-amber-400 text-zinc-950 shadow-md shadow-amber-400/25 border border-amber-300 font-black'
              : 'bg-sky-950/70 text-sky-300 border border-sky-800 hover:bg-sky-900'
          }`}
        >
          <Headphones className="w-4 h-4" />
          <span>{t('audio.tab_coaching', 'Modo Ensayo & Guías')}</span>
        </button>

        <button
          onClick={() => setStudioTab('editing')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            studioTab === 'editing'
              ? 'bg-amber-400 text-zinc-950 shadow-md shadow-amber-400/25 border border-amber-300 font-black'
              : 'bg-sky-950/70 text-sky-300 border border-sky-800 hover:bg-sky-900'
          }`}
        >
          <Scissors className="w-4 h-4" />
          <span>{t('audio.tab_editing', 'Edición & Montaje')}</span>
        </button>
      </div>

      {studioTab === 'coaching' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* 1. ENRUTAMIENTO ESTRICTO MULTITRACK L/R */}
        <div className="bg-zinc-950 border border-sky-900/50 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-sky-900/50 pb-3">
            <h3 className="text-xs font-bold text-sky-400 uppercase tracking-wider flex items-center gap-2">
              <Headphones className="w-4 h-4 text-sky-400" />
              {t('audio.routing_title', 'Enrutamiento L/R Estricto')}
            </h3>
            <span className="text-[10px] font-mono text-sky-300 bg-sky-950 px-2 py-0.5 rounded border border-sky-800">
              {t('audio.isolation_status', '100% Aislamiento')}
            </span>
          </div>

          <p className="text-xs text-sky-300/80">
            Separa la <strong>Música oficial</strong> (Canal Izquierdo para altavoces de pista) del <strong>Metrónomo y Guías</strong> (Canal Derecho para el auricular de la entrenadora).
          </p>

          {/* Mode Selector Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => audioEngine.setChannelMode('split-coach')}
              className={`py-2.5 px-2 rounded-xl text-xs font-bold transition-all text-center ${
                audioState.channelMode === 'split-coach'
                  ? 'bg-amber-400 text-zinc-950 font-black border border-amber-300 shadow-md shadow-amber-400/25'
                  : 'bg-sky-950/70 text-sky-300 border border-sky-800 hover:bg-sky-900'
              }`}
            >
              🎧 Pista + Coach (Split)
            </button>

            <button
              onClick={() => audioEngine.setChannelMode('stereo')}
              className={`py-2.5 px-2 rounded-xl text-xs font-bold transition-all text-center ${
                audioState.channelMode === 'stereo'
                  ? 'bg-amber-400 text-zinc-950 font-black border border-amber-300 shadow-md shadow-amber-400/25'
                  : 'bg-sky-950/70 text-sky-300 border border-sky-800 hover:bg-sky-900'
              }`}
            >
              🔊 Todo Estéreo
            </button>

            <button
              onClick={() => audioEngine.setChannelMode('solo-music')}
              className={`py-2 px-2 rounded-xl text-xs font-bold transition-all text-center ${
                audioState.channelMode === 'solo-music'
                  ? 'bg-amber-400 text-zinc-950 font-black border border-amber-300 shadow-md shadow-amber-400/25'
                  : 'bg-sky-950/70 text-sky-300 border border-sky-800 hover:bg-sky-900'
              }`}
            >
              🎵 Solo Música
            </button>

            <button
              onClick={() => audioEngine.setChannelMode('solo-coach')}
              className={`py-2 px-2 rounded-xl text-xs font-bold transition-all text-center ${
                audioState.channelMode === 'solo-coach'
                  ? 'bg-amber-400 text-zinc-950 font-black border border-amber-300 shadow-md shadow-amber-400/25'
                  : 'bg-sky-950/70 text-sky-300 border border-sky-800 hover:bg-sky-900'
              }`}
            >
              ⏱️ Solo Coach
            </button>
          </div>

          {/* Volume Matrix Controls */}
          <div className="space-y-3 pt-1">
            <div className="bg-sky-950/40 p-3 rounded-xl border border-sky-800/80 space-y-1.5">
              <div className="flex justify-between text-xs text-sky-300">
                <span className="font-semibold flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-sky-400" />
                  {t('audio.music_volume', 'Volumen Música (Canal L)')}
                </span>
                <span className="font-mono font-bold text-amber-400">{Math.round(audioState.musicVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={audioState.musicVolume}
                onChange={(e) => audioEngine.setMusicVolume(parseFloat(e.target.value))}
                className="w-full accent-amber-400 cursor-pointer"
              />
            </div>

            <div className="bg-sky-950/40 p-3 rounded-xl border border-sky-800/80 space-y-1.5">
              <div className="flex justify-between text-xs text-sky-300">
                <span className="font-semibold flex items-center gap-1.5">
                  <Mic className="w-3.5 h-3.5 text-sky-400" />
                  {t('audio.coach_volume', 'Volumen Guías & Clicks (Canal R)')}
                </span>
                <span className="font-mono font-bold text-amber-400">{Math.round(audioState.coachVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={audioState.coachVolume}
                onChange={(e) => audioEngine.setCoachVolume(parseFloat(e.target.value))}
                className="w-full accent-amber-400 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* 2. METRÓNOMO & GUÍAS DE VOZ ROLLART */}
        <div className="bg-zinc-950 border border-sky-900/50 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-sky-900/50 pb-3">
            <h3 className="text-xs font-bold text-sky-400 uppercase tracking-wider flex items-center gap-2">
              <Timer className="w-4 h-4 text-sky-400" />
              {t('metronome.title', 'Metrónomo & Guías RollArt')}
            </h3>
            <span className="text-[10px] font-mono text-sky-300 bg-sky-950 px-2 py-0.5 rounded border border-sky-800">
              Lookahead Sync
            </span>
          </div>

          {/* Metronome Settings */}
          <div className="bg-sky-950/40 p-3 rounded-xl border border-sky-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-sky-300 flex items-center gap-2">
                <Radio className="w-4 h-4 text-amber-400" />
                Clicks del Metrónomo
              </span>
              <button
                onClick={() => handleUpdateMetronome({ enabled: !metronomeEnabled })}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  metronomeEnabled ? 'bg-amber-400 text-zinc-950 font-black border border-amber-300 shadow-sm' : 'bg-sky-950/70 text-sky-400 border border-sky-800'
                }`}
              >
                {metronomeEnabled ? 'Activado' : 'Silenciado'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-sky-300/80 block mb-1">Tempo (BPM):</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="40"
                    max="240"
                    value={bpm}
                    onChange={(e) => handleUpdateMetronome({ bpm: parseInt(e.target.value, 10) || 120 })}
                    className="w-16 bg-zinc-950 border border-sky-800 rounded-lg px-2 py-1 text-amber-300 font-mono font-bold"
                  />
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleUpdateMetronome({ bpm: Math.max(40, bpm - 5) })}
                      className="px-2 py-1 bg-sky-950/70 hover:bg-amber-400 hover:text-zinc-950 text-sky-300 border border-sky-800 rounded font-mono font-bold"
                    >
                      -5
                    </button>
                    <button
                      onClick={() => handleUpdateMetronome({ bpm: Math.min(240, bpm + 5) })}
                      className="px-2 py-1 bg-sky-950/70 hover:bg-amber-400 hover:text-zinc-950 text-sky-300 border border-sky-800 rounded font-mono font-bold"
                    >
                      +5
                    </button>
                    {audioState.hasAudioLoaded && (
                      <button
                        type="button"
                        onClick={handleDetectDspBpm}
                        disabled={isDetectingBpm}
                        title="Analizar audio mediante autocorrelación de energía para detectar el tempo exacto (DSP)"
                        className="flex items-center gap-1 px-2.5 py-1 bg-sky-900/60 hover:bg-amber-400 hover:text-zinc-950 text-amber-300 border border-amber-500/50 rounded text-xs font-bold transition-all"
                      >
                        <Activity className="w-3.5 h-3.5" />
                        <span>{isDetectingBpm ? 'Analizando...' : 'Detectar BPM'}</span>
                      </button>
                    )}
                    {audioState.hasAudioLoaded && (
                      <button
                        type="button"
                        onClick={handleSyncMusicToMetronome}
                        title="Ajustar la velocidad de reproducción de la música para coincidir con los beats del metrónomo"
                        className="flex items-center gap-1 px-2.5 py-1 bg-emerald-950/70 hover:bg-emerald-400 hover:text-zinc-950 text-emerald-300 border border-emerald-500/50 rounded text-xs font-bold transition-all"
                      >
                        <Gauge className="w-3.5 h-3.5" />
                        <span>Ajustar Pista</span>
                      </button>
                    )}
                  </div>
                </div>
                {dspBpmResult && (
                  <p className="text-[10px] text-amber-300/80 mt-1 font-mono">
                    DSP: {dspBpmResult.bpm} BPM (Confianza: {Math.round(dspBpmResult.confidence * 100)}% | Desfase: {dspBpmResult.phaseOffsetSec}s)
                  </p>
                )}
              </div>

              <div>
                <label className="text-sky-300/80 block mb-1">Compás RollArt:</label>
                <div className="flex flex-wrap gap-1">
                  {[
                    { sig: 1, label: '1/1', desc: 'Pulso continuo' },
                    { sig: 2, label: '2/4', desc: 'Marcha / Polka (2 tiempos)' },
                    { sig: 3, label: '3/4', desc: 'Vals RollArt (3 tiempos)' },
                    { sig: 4, label: '4/4', desc: 'Estándar (4 tiempos)' },
                    { sig: 6, label: '6/8', desc: 'Ternario compuesto' }
                  ].map(({ sig, label, desc }) => (
                    <button
                      key={sig}
                      type="button"
                      title={desc}
                      onClick={() => handleUpdateMetronome({ beatsPerMeasure: sig as 1 | 2 | 3 | 4 | 6 })}
                      className={`px-2 py-1 rounded text-xs font-mono font-bold transition-all ${
                        beatsPerMeasure === sig ? 'bg-amber-400 text-zinc-950 font-black border border-amber-300 shadow-md' : 'bg-sky-950/70 text-sky-300 border border-sky-800/80 hover:bg-sky-900'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-sky-900/40">
              <label className="text-sky-300 text-xs flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={accentFirstBeat}
                  onChange={(e) => handleUpdateMetronome({ accentFirstBeat: e.target.checked })}
                  className="rounded text-amber-500 focus:ring-amber-500"
                />
                <span>Acentuar tiempo 1</span>
              </label>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-sky-300/80">Vol:</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={metronomeVolume}
                  onChange={(e) => handleUpdateMetronome({ volume: parseFloat(e.target.value) })}
                  className="w-20 accent-amber-400 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Voice Cues & Pre-roll Settings */}
          <div className="bg-sky-950/40 p-3 rounded-xl border border-sky-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-sky-300 flex items-center gap-2">
                <Mic className="w-4 h-4 text-sky-400" />
                Guías Vocales & Pre-roll
              </span>
              <button
                onClick={() => handleUpdateVoiceCue({ enabled: !voiceCueEnabled })}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  voiceCueEnabled ? 'bg-amber-400 text-zinc-950 font-black border border-amber-300 shadow-sm' : 'bg-sky-950/70 text-sky-400 border border-sky-800'
                }`}
              >
                {voiceCueEnabled ? 'Activadas' : 'Desactivadas'}
              </button>
            </div>

            {/* Pre-roll delay selector */}
            <div className="text-xs space-y-1.5">
              <label className="text-sky-300/80 flex justify-between">
                <span>Espera Pre-roll (Entrada a pista):</span>
                <span className="font-mono text-amber-400 font-bold">{introDelaySec}s</span>
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {[0, 3, 5, 10].map((sec) => (
                  <button
                    key={sec}
                    onClick={() => handleUpdateVoiceCue({ introDelaySec: sec })}
                    className={`py-1.5 rounded-lg text-xs font-mono font-semibold transition-all ${
                      introDelaySec === sec ? 'bg-amber-400 text-zinc-950 font-black border border-amber-300' : 'bg-sky-950/70 text-sky-300 border border-sky-800/80 hover:bg-sky-900'
                    }`}
                  >
                    {sec === 0 ? 'Sin espera' : `${sec}s`}
                  </button>
                ))}
              </div>
            </div>

            {/* Element Warning Lead Time */}
            <div className="text-xs space-y-1.5">
              <label className="text-sky-300/80 flex justify-between">
                <span>Aviso previo al elemento:</span>
                <span className="font-mono text-amber-400 font-bold">{warningLeadTimeSec}s antes</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[2, 3].map((sec) => (
                  <button
                    key={sec}
                    onClick={() => handleUpdateVoiceCue({ warningLeadTimeSec: sec })}
                    className={`py-1.5 rounded-lg text-xs font-mono font-semibold transition-all ${
                      warningLeadTimeSec === sec ? 'bg-amber-400 text-zinc-950 font-black border border-amber-300' : 'bg-sky-950/70 text-sky-300 border border-sky-800/80 hover:bg-sky-900'
                    }`}
                  >
                    {sec}s de anticipación
                  </button>
                ))}
              </div>
            </div>

            {/* Engine Selector: Browser vs Google Cloud TTS */}
            <div className="text-xs space-y-1.5 pt-2 border-t border-sky-900/40">
              <label className="text-sky-300/80 font-medium">Motor de Síntesis Vocal:</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleUpdateVoiceCue({ ttsEngine: 'browser' })}
                  className={`py-2 px-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                    ttsEngine === 'browser'
                      ? 'bg-amber-400 text-zinc-950 shadow-md font-black border border-amber-300'
                      : 'bg-sky-950/70 text-sky-300 border border-sky-800 hover:bg-sky-900'
                  }`}
                >
                  <span>Navegador Local</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleUpdateVoiceCue({ ttsEngine: 'google-cloud' })}
                  className={`py-2 px-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                    ttsEngine === 'google-cloud'
                      ? 'bg-amber-400 text-zinc-950 shadow-md font-black border border-amber-300'
                      : 'bg-sky-950/70 text-sky-300 border border-sky-800 hover:bg-sky-900'
                  }`}
                >
                  <Cloud className="w-3.5 h-3.5" />
                  <span>Google Cloud TTS</span>
                </button>
              </div>
            </div>

            {/* If Google Cloud TTS Engine */}
            {ttsEngine === 'google-cloud' ? (
              <div className="space-y-3 p-3 rounded-xl bg-purple-950/40 border border-purple-500/30 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-purple-200 flex items-center gap-1.5">
                    <Cloud className="w-3.5 h-3.5 text-purple-400" />
                    Google Cloud Text-to-Speech (Neural2 / Journey)
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/40">
                    ✓ Integrada
                  </span>
                </div>

                <p className="text-[11px] text-slate-400 leading-tight">
                  Voces neuronales de alta fidelidad idénticas en cualquier dispositivo o navegador, decodificadas a Web Audio y cacheadas para latencia 0ms.
                </p>

                {/* Google Voice Selector */}
                <div className="space-y-1 pt-1 border-t border-purple-500/20">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-300 font-medium">Voz Neuronal / Género:</label>
                    <button
                      type="button"
                      onClick={handleTestVoice}
                      disabled={isTestingVoice}
                      className="flex items-center gap-1 px-2 py-0.5 bg-purple-500/20 hover:bg-purple-500/40 text-purple-200 border border-purple-500/40 rounded text-[11px] font-semibold transition-all disabled:opacity-40 active:scale-95"
                      title="Escuchar una muestra con la voz seleccionada"
                    >
                      <Volume2 className="w-3 h-3" />
                      <span>{isTestingVoice ? 'Probando...' : 'Probar Voz'}</span>
                    </button>
                  </div>

                  <select
                    value={googleVoiceName}
                    onChange={(e) => handleUpdateVoiceCue({ googleVoiceName: e.target.value })}
                    className="w-full bg-slate-950 border border-skate-border rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-purple-500 focus:outline-none"
                  >
                    {GOOGLE_TTS_VOICES.map((v) => (
                      <option key={v.name} value={v.name}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              /* Browser Web Speech API Voice Selection */
              <div className="text-xs space-y-2 pt-2 border-t border-skate-border/50">
                <div className="flex items-center justify-between">
                  <label className="text-slate-400 font-medium">Voz del Navegador:</label>
                  <button
                    type="button"
                    onClick={handleTestVoice}
                    className="flex items-center gap-1 px-2 py-0.5 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 rounded text-[11px] font-semibold transition-all active:scale-95"
                    title="Escuchar una muestra con la voz del navegador"
                  >
                    <Volume2 className="w-3 h-3" />
                    <span>{isTestingVoice ? 'Probando...' : 'Probar Voz'}</span>
                  </button>
                </div>
                <select
                  value={selectedVoiceURI || ''}
                  onChange={(e) => handleUpdateVoiceCue({ selectedVoiceURI: e.target.value || null })}
                  className="w-full bg-slate-900 border border-skate-border rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-sky-500 focus:outline-none truncate"
                >
                  <option value="">Predeterminada del sistema ({i18n.language.toUpperCase()})</option>
                  {availableVoices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name} ({v.lang}){v.default ? ' ★' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Pitch & Speed Sliders */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                  <span>Tono (Pitch):</span>
                  <span className="font-mono text-sky-400">{voicePitch.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.6"
                  max="1.5"
                  step="0.05"
                  value={voicePitch}
                  onChange={(e) => handleUpdateVoiceCue({ voicePitch: parseFloat(e.target.value) })}
                  className="w-full accent-sky-500 cursor-pointer"
                />
              </div>
              <div>
                <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                  <span>Velocidad:</span>
                  <span className="font-mono text-sky-400">{voiceSpeed.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.8"
                  max="1.6"
                  step="0.05"
                  value={voiceSpeed}
                  onChange={(e) => handleUpdateVoiceCue({ voiceSpeed: parseFloat(e.target.value) })}
                  className="w-full accent-sky-500 cursor-pointer"
                />
              </div>
            </div>

            {/* Voice Volume */}
            <div className="flex items-center justify-between text-xs pt-2 border-t border-skate-border/50">
              <span className="text-slate-400">Volumen Voz:</span>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={voiceVolume}
                  onChange={(e) => handleUpdateVoiceCue({ volume: parseFloat(e.target.value) })}
                  className="w-24 accent-sky-500 cursor-pointer"
                />
                <span className="font-mono text-sky-400 text-xs w-8">{Math.round(voiceVolume * 100)}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* 3. CORTAR PISTA (Audio Trimming) & FUNDIDOS (Fade In / Fade Out) */}
        <div className="bg-skate-panel border border-skate-border rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-skate-border pb-3">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Scissors className="w-4 h-4 text-rose-400" />
              {t('audio.trim_section', 'Cortar Pista & Fundidos')}
            </h3>
            <span className="text-[10px] font-mono text-rose-400 bg-rose-950 px-2 py-0.5 rounded border border-rose-800">
              Edición RAM
            </span>
          </div>

          {/* Range selection inputs */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-skate-card p-2.5 rounded-xl border border-skate-border space-y-1.5">
              <div className="flex justify-between text-slate-300">
                <span className="font-bold text-sky-400">Punto Inicio (In):</span>
                <span className="font-mono">{(trimStartMs / 1000).toFixed(1)}s</span>
              </div>
              <input
                type="number"
                step="0.5"
                min="0"
                max={(audioState.durationMs / 1000) || 120}
                value={Number((trimStartMs / 1000).toFixed(1))}
                onChange={(e) => setTrimStartMs(Math.max(0, parseFloat(e.target.value) * 1000 || 0))}
                className="w-full bg-skate-bg border border-skate-border rounded-lg px-2 py-1 text-white font-mono text-xs"
              />
              <button
                onClick={() => setTrimStartMs(currentTimeMs)}
                className="w-full py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-semibold"
              >
                Fijar en tiempo actual ({formatTime(currentTimeMs)})
              </button>
            </div>

            <div className="bg-skate-card p-2.5 rounded-xl border border-skate-border space-y-1.5">
              <div className="flex justify-between text-slate-300">
                <span className="font-bold text-rose-400">Punto Fin (Out):</span>
                <span className="font-mono">{(trimEndMs / 1000).toFixed(1)}s</span>
              </div>
              <input
                type="number"
                step="0.5"
                min="0"
                max={(audioState.durationMs / 1000) || 120}
                value={Number((trimEndMs / 1000).toFixed(1))}
                onChange={(e) => setTrimEndMs(Math.max(0, parseFloat(e.target.value) * 1000 || 0))}
                className="w-full bg-skate-bg border border-skate-border rounded-lg px-2 py-1 text-white font-mono text-xs"
              />
              <button
                onClick={() => setTrimEndMs(currentTimeMs)}
                className="w-full py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-semibold"
              >
                Fijar en tiempo actual ({formatTime(currentTimeMs)})
              </button>
            </div>
          </div>

          {/* Action buttons for trimming */}
          <div className="flex gap-2">
            <button
              onClick={() => audioEngine.seek(trimStartMs)}
              disabled={!audioState.hasAudioLoaded}
              className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-semibold transition-all"
            >
              Previsualizar Selección
            </button>
            <button
              onClick={handleTrimAudio}
              disabled={!audioState.hasAudioLoaded || trimEndMs <= trimStartMs}
              className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1.5"
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>{t('audio.trim_btn', 'Cortar Pista')}</span>
            </button>
          </div>

          {/* Fade In / Out Controls */}
          <div className="bg-skate-card p-3 rounded-xl border border-skate-border space-y-3">
            <div className="flex justify-between items-center text-xs text-slate-300">
              <span className="font-bold flex items-center gap-1.5">
                <Volume1 className="w-4 h-4 text-emerald-400" />
                {t('audio.fades_section', 'Fundidos de Volumen')}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">{t('audio.fade_in', 'Fade In (s)')}:</label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  step="0.5"
                  value={fadeInSec}
                  onChange={(e) => setFadeInSec(parseFloat(e.target.value) || 0)}
                  className="w-full bg-skate-bg border border-skate-border rounded-lg px-2 py-1 text-white font-mono"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">{t('audio.fade_out', 'Fade Out (s)')}:</label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  step="0.5"
                  value={fadeOutSec}
                  onChange={(e) => setFadeOutSec(parseFloat(e.target.value) || 0)}
                  className="w-full bg-skate-bg border border-skate-border rounded-lg px-2 py-1 text-white font-mono"
                />
              </div>
            </div>

            <button
              onClick={handleApplyFades}
              disabled={!audioState.hasAudioLoaded}
              className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-xs shadow-md transition-all"
            >
              {t('audio.apply_fades', 'Aplicar Fundidos')}
            </button>
          </div>
        </div>

        {/* 4. UNIR MÚLTIPLES PISTAS (Audio Track Concatenation / Merger) */}
      <div className="bg-skate-panel border border-skate-border rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-skate-border pb-3">
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-sky-400" />
              {t('audio.merge_section', 'Unir Múltiples Pistas (Audio Concatenation)')}
            </h3>
            <p className="text-xs text-slate-400">
              Carga varias canciones (ej. Entrada + Pieza Principal + Cierre) y únelas en una sola pista continua.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="file"
              id={multiFileInputId}
              accept="audio/*"
              multiple
              className="hidden"
              onChange={handleAddTrackToQueue}
              disabled={isLoadingAudio}
            />
            <label
              htmlFor={multiFileInputId}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold cursor-pointer transition-all touch-target"
            >
              <Plus className="w-4 h-4" />
              <span>{t('audio.add_track', 'Añadir Pistas')}</span>
            </label>

            <div className="flex items-center gap-1.5 bg-skate-card px-2.5 py-1 rounded-xl border border-skate-border text-xs text-slate-300">
              <span className="text-slate-400">Crossfade:</span>
              <input
                type="number"
                min="0"
                max="3"
                step="0.1"
                value={crossfadeSec}
                onChange={(e) => setCrossfadeSec(parseFloat(e.target.value) || 0)}
                className="w-12 bg-skate-bg border border-skate-border rounded px-1.5 py-0.5 text-white font-mono text-center"
              />
              <span className="text-slate-500 text-[10px]">s</span>
            </div>

            {trackQueue.length > 0 && (
              <button
                onClick={handleMergeTracks}
                className="flex items-center gap-1 px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold shadow-md transition-all touch-target"
              >
                <Layers className="w-4 h-4" />
                <span>{t('audio.merge_tracks', 'Unir en Pista Maestra')}</span>
              </button>
            )}
          </div>
        </div>

        {trackQueue.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-xs border border-dashed border-skate-border rounded-xl">
            No hay pistas en la cola de unión. Pulsa en <strong>"Añadir Pistas"</strong> para seleccionar 2 o más archivos de audio.
          </div>
        ) : (
          <div className="space-y-2">
            {trackQueue.map((item, idx) => (
              <div
                key={item.id}
                className="bg-skate-card p-3 rounded-xl border border-skate-border flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-lg bg-slate-800 text-sky-400 font-mono font-bold flex items-center justify-center text-xs">
                    {idx + 1}
                  </span>
                  <span className="font-semibold text-white">{item.name}</span>
                  <span className="text-slate-400 font-mono">({formatTime(item.durationMs)})</span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleMoveQueueItem(idx, 'up')}
                    disabled={idx === 0}
                    className="p-1 rounded hover:bg-slate-700 disabled:opacity-30 text-slate-300"
                    title="Mover arriba"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleMoveQueueItem(idx, 'down')}
                    disabled={idx === trackQueue.length - 1}
                    className="p-1 rounded hover:bg-slate-700 disabled:opacity-30 text-slate-300"
                    title="Mover abajo"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleRemoveQueueItem(item.id)}
                    className="p-1 rounded hover:bg-red-950 text-red-400"
                    title="Eliminar de la cola"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    )}
  </div>
);
};
