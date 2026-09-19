export interface MediaSessionHandlers {
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onSeekBackward: (offsetSec: number) => void;
  onSeekForward: (offsetSec: number) => void;
  onSeekTo: (positionSec: number) => void;
}

export class MediaSessionManager {
  private handlers: MediaSessionHandlers | null = null;
  private isSupported: boolean;

  constructor() {
    this.isSupported = typeof navigator !== 'undefined' && 'mediaSession' in navigator;
  }

  public init(handlers: MediaSessionHandlers) {
    this.handlers = handlers;
    if (!this.isSupported) return;

    try {
      navigator.mediaSession.setActionHandler('play', () => {
        this.handlers?.onPlay();
      });

      navigator.mediaSession.setActionHandler('pause', () => {
        this.handlers?.onPause();
      });

      navigator.mediaSession.setActionHandler('stop', () => {
        this.handlers?.onStop();
      });

      // -10s backward seek for coaches to quickly re-run technical elements
      navigator.mediaSession.setActionHandler('seekbackward', (details) => {
        const skipSec = details.seekOffset || 10;
        this.handlers?.onSeekBackward(skipSec);
      });

      // +10s forward seek
      navigator.mediaSession.setActionHandler('seekforward', (details) => {
        const skipSec = details.seekOffset || 10;
        this.handlers?.onSeekForward(skipSec);
      });

      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined) {
          this.handlers?.onSeekTo(details.seekTime);
        }
      });
    } catch (err) {
      console.warn('[MediaSessionManager] Error configurando action handlers:', err);
    }
  }

  public updateMetadata(title: string, artist: string = 'Patinadora', album: string = 'SkateArt RollArt') {
    if (!this.isSupported) return;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title,
        artist,
        album,
        artwork: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      });
    } catch (err) {
      console.warn('[MediaSessionManager] Error actualizando metadata:', err);
    }
  }

  public updatePlaybackState(isPlaying: boolean) {
    if (!this.isSupported) return;
    try {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    } catch (err) {}
  }

  public updatePositionState(durationSec: number, positionSec: number, playbackRate: number = 1.0) {
    if (!this.isSupported || !('setPositionState' in navigator.mediaSession)) return;
    if (durationSec <= 0) return;

    try {
      navigator.mediaSession.setPositionState({
        duration: Math.max(0, durationSec),
        playbackRate: Math.max(0.5, playbackRate),
        position: Math.max(0, Math.min(positionSec, durationSec))
      });
    } catch (err) {}
  }
}

