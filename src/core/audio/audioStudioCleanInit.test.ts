/**
 * Tests de regresión crítica:
 * 1. El Estudio de Audio arranca 100% limpio (0 pistas con audio, 0 clips, 0s duración, play disabled).
 * 2. El Metrónomo arranca APAGADO (enabled: false, muted: true) por defecto.
 * 3. La Guía Vocal arranca APAGADA (enabled: false) por defecto.
 * 4. AudioEngine.play() aborta y no crea osciladores ni scheduler si no hay buffer cargado.
 * 5. Mute y Volumen controlan la misma fuente real.
 * 6. Aislamiento absoluto entre Pista 2D y Estudio de Audio.
 */

import { audioEngine } from './AudioEngine';
import { useAudioStudioStore, hasAudioInStudio } from '../../store/useAudioStudioStore';

let total = 0;
function assert(condition: boolean, msg: string) {
  total++;
  if (!condition) {
    console.error(`FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`PASSED: ${msg}`);
}

class MockGainNode {
  public gain = {
    value: 1,
    setValueAtTime: (val: number) => {
      this.gain.value = val;
    },
    cancelScheduledValues: () => {},
    exponentialRampToValueAtTime: () => {},
  };
  public connect() {}
  public disconnect() {}
}

class MockAudioContext {
  public currentTime = 0;
  public state = 'running';
  public createGain() {
    return new MockGainNode();
  }
  public createOscillator() {
    return {
      type: 'sine',
      frequency: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
      gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
      connect: () => {},
      disconnect: () => {},
      start: () => {},
      stop: () => {},
      onended: null,
    };
  }
  public createBufferSource() {
    return {
      buffer: null,
      playbackRate: { value: 1.0 },
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      connect: () => {},
      disconnect: () => {},
      start: () => {},
      stop: () => {},
      onended: null,
    };
  }
  public createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer {
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      duration: length / sampleRate,
      getChannelData: () => new Float32Array(length),
      copyFromChannel: () => {},
      copyToChannel: () => {},
    } as unknown as AudioBuffer;
  }
  public createChannelSplitter(outputs = 2) {
    return {
      numberOfOutputs: outputs,
      connect: () => {},
      disconnect: () => {},
    };
  }
  public createChannelMerger(inputs = 2) {
    return {
      numberOfInputs: inputs,
      connect: () => {},
      disconnect: () => {},
    };
  }
  public resume() {
    return Promise.resolve();
  }
}

// Configurar mocks globales si no existen
if (typeof globalThis.AudioContext === 'undefined') {
  (globalThis as any).AudioContext = MockAudioContext;
  (globalThis as any).webkitAudioContext = MockAudioContext;
}

console.log('\n--- PRUEBAS DE ESTADO LIMPIO Y FUENTES DE AUDIO SKATECORE ---');

// 1. AudioStudioStore: Estado inicial
const studioState = useAudioStudioStore.getState();
assert(studioState.totalDurationSec === 0, `Estudio nuevo: totalDurationSec es 0s (obtenido: ${studioState.totalDurationSec})`);
assert(studioState.currentTimeSec === 0, 'Estudio nuevo: currentTimeSec es 0s');
assert(studioState.isPlaying === false, 'Estudio nuevo: isPlaying es false');
assert(!studioState.tracks.music.buffer, 'Estudio nuevo: Pista Master no tiene buffer');
assert(studioState.tracks.music.clips.length === 0, 'Estudio nuevo: Pista Master tiene 0 clips');
assert(!studioState.tracks.recording.buffer, 'Estudio nuevo: Pista Grabación no tiene buffer');
assert(studioState.tracks.recording.clips.length === 0, 'Estudio nuevo: Pista Grabación tiene 0 clips');
assert(studioState.additionalTracks.length === 0, 'Estudio nuevo: additionalTracks está vacío (0 pistas)');
assert(studioState.audioNodes.length === 0, 'Estudio nuevo: audioNodes está vacío (0 marcadores)');
assert(hasAudioInStudio(studioState) === false, 'hasAudioInStudio devuelve false en sesión nueva');

// 2. Metrónomo y Voz Guía: APAGADOS por defecto
assert(studioState.globalControls.metronome.enabled === false, 'Estudio nuevo: metrónomo global enabled === false');
assert(studioState.metronomeConfig.enabled === false, 'Estudio nuevo: metronomeConfig.enabled === false');
assert(studioState.globalControls.voiceGuide.enabled === false, 'Estudio nuevo: voiceGuide.enabled === false');

// 3. AudioEngine: Inicialización limpia y segura
audioEngine.resetAudioSession();
const engineState = audioEngine.getState();
assert(engineState.hasAudioLoaded === false, 'AudioEngine: hasAudioLoaded es false');
assert(engineState.isPlaying === false, 'AudioEngine: isPlaying es false');
assert(engineState.durationMs === 0, 'AudioEngine: durationMs es 0ms');
assert(audioEngine.metronome.getConfig().enabled === false, 'AudioEngine: metrónomo está apagado por defecto');
assert(audioEngine.isMetronomeMuted() === true, 'AudioEngine: metrónomo está silenciado por defecto');
assert(audioEngine.metronome.hasActiveScheduler() === false, 'AudioEngine: no hay scheduler de metrónomo activo');
assert(audioEngine.voiceCueEngine.getCueTicksEnabled() === false, 'AudioEngine: cueTicksEnabled es false');

// 4. Intentar reproducir sin audio cargado NO debe arrancar reproducción ni metrónomo
audioEngine.setPlaybackDomain('studio');
audioEngine.play();
assert(audioEngine.getState().isPlaying === false, 'audioEngine.play() sin audio en estudio no arranca isPlaying');
assert(audioEngine.metronome.hasActiveScheduler() === false, 'audioEngine.play() sin audio no arranca metrónomo');

audioEngine.setPlaybackDomain('rink');
audioEngine.play();
assert(audioEngine.getState().isPlaying === false, 'audioEngine.play() sin audio en rink no arranca isPlaying');
assert(audioEngine.metronome.hasActiveScheduler() === false, 'audioEngine.play() sin audio en rink no arranca metrónomo');

// 5. Metrónomo: ciclo de vida explícito sin fuentes fantasma
audioEngine.setMetronomeAudible(true);
assert(audioEngine.metronome.getConfig().enabled === true, 'setMetronomeAudible(true) activa el metrónomo');
assert(audioEngine.isMetronomeMuted() === false, 'setMetronomeAudible(true) quita el mute');
assert(audioEngine.voiceCueEngine.getCueTicksEnabled() === false, 'Activar metrónomo NUNCA activa cue ticks');

audioEngine.setMetronomeAudible(false);
assert(audioEngine.metronome.getConfig().enabled === false, 'setMetronomeAudible(false) apaga el metrónomo');
assert(audioEngine.isMetronomeMuted() === true, 'setMetronomeAudible(false) silencia el metrónomo');
assert(audioEngine.metronome.hasActiveScheduler() === false, 'setMetronomeAudible(false) destruye el scheduler');

// 6. Volumen del metrónomo controla la misma fuente real
audioEngine.setMetronomeVolume(0.45);
assert(Math.abs(audioEngine.getMetronomeVolume() - 0.45) < 0.001, 'setMetronomeVolume fija el volumen del motor');
assert(Math.abs(audioEngine.metronome.getConfig().volume - 0.45) < 0.001, 'setMetronomeVolume sincroniza el volumen del metrónomo');

// 7. Aislamiento estricto: audio en Rink NO contamina Estudio automáticamente
const mockCtx = new MockAudioContext();
const fakeBuffer = mockCtx.createBuffer(2, 44100 * 3, 44100);
audioEngine.setPlaybackDomain('rink');
audioEngine.setAudioBuffer(fakeBuffer, 'cancion_rink.mp3', false, 'file');

// En el dominio studio, no debe existir audio hasta que se transfiera explícitamente
audioEngine.setPlaybackDomain('studio');
assert(audioEngine.getAudioBuffer('studio') === null, 'Estudio no tiene buffer heredado automáticamente de Rink');
assert(hasAudioInStudio(useAudioStudioStore.getState()) === false, 'Store del Estudio sigue sin audio');

// Reset de sesión limpia todo
audioEngine.resetAudioSession();
assert(audioEngine.getAudioBuffer('rink') === null, 'resetAudioSession limpia buffer de Rink');
assert(audioEngine.getAudioBuffer('studio') === null, 'resetAudioSession limpia buffer de Estudio');
assert(audioEngine.metronome.getConfig().enabled === false, 'resetAudioSession deja metrónomo en OFF');

// 8. Pre-roll voice intro está habilitado y audible en Pista 2D
assert(audioEngine.isVoiceGuideMuted() === false, 'AudioEngine: la voz guía NO está silenciada por defecto (audible para el pre-roll)');
assert(audioEngine.voiceCueEngine.getConfig().enabled === true, 'VoiceCueEngine: habilitado por defecto para el conteo de entrada a pista');

// 9. Concordancia de los iconos y estado del metrónomo en el Estudio de Audio
const freshState = useAudioStudioStore.getState();
const isMetroActiveInitial = freshState.globalControls.metronome.enabled && !freshState.globalControls.metronome.muted;
assert(isMetroActiveInitial === false, 'Estudio nuevo: metrónomo inactivo por defecto (campana apagada)');
assert(freshState.globalControls.metronome.muted === true, 'Estudio nuevo: globalControls.metronome.muted === true');
assert(freshState.tracks.metronome.muted === true, 'Estudio nuevo: tracks.metronome.muted === true');

useAudioStudioStore.getState().toggleMetronomeMute();
const activeAfterToggle = useAudioStudioStore.getState().globalControls.metronome.enabled && !useAudioStudioStore.getState().globalControls.metronome.muted;
assert(activeAfterToggle === true, 'Alternar metrónomo en el estudio: pasa a activo (campana encendida)');
assert(useAudioStudioStore.getState().tracks.metronome.muted === false, 'Alternar metrónomo: tracks.metronome se desmutea');

useAudioStudioStore.getState().toggleMetronomeMute();
const activeAfterSecondToggle = useAudioStudioStore.getState().globalControls.metronome.enabled && !useAudioStudioStore.getState().globalControls.metronome.muted;
assert(activeAfterSecondToggle === false, 'Segundo clic en campana: metrónomo vuelve a inactivo (campana apagada)');
assert(useAudioStudioStore.getState().tracks.metronome.muted === true, 'Segundo clic: tracks.metronome vuelve a muted');

console.log(`\nTODAS LAS PRUEBAS DE ESTADO LIMPIO Y FUENTES DE AUDIO PASARON: ${total}/${total}`);

