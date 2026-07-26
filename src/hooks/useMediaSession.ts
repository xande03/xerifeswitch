import { useEffect, useRef } from 'react';
import { Song } from '@/data/mockSongs';
import { track as trackMetric } from '@/lib/playbackMetrics';
import { hdThumbnail } from '@/lib/utils';
import {
  hideNativeControls,
  nativeMusicControlsAvailable,
  showNativeControls,
  updateNativePlaybackState,
  updateNativePosition,
} from '@/lib/nativeMusicControls';

interface UseMediaSessionProps {
  song: Song;
  isPlaying: boolean;
  duration: number;
  currentTime: number;
  onPlay: () => void;
  onPause: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  onSeek?: (time: number) => void;
  proxyAudioElement?: HTMLAudioElement | null;
  /**
   * Which OS lock-screen / notch controls to expose.
   * - "music": play/pause + previoustrack/nexttrack (seek buttons disabled)
   * - "video": play/pause + seekbackward/seekforward (10s), no track skip
   */
  mediaType?: "music" | "video";
}

const SEEK_STEP_SECONDS = 10;


export function useMediaSession({
  song,
  isPlaying,
  duration,
  currentTime,
  onPlay,
  onPause,
  onNext,
  onPrev,
  onSeek,
  proxyAudioElement,
  mediaType = "music",
}: UseMediaSessionProps) {
  const metadataSetRef = useRef(false);
  const lastSongIdRef = useRef(song.id);
  const proxyAudioRef = useRef<HTMLAudioElement | null>(proxyAudioElement || null);
  const onPlayRef = useRef(onPlay);
  const onPauseRef = useRef(onPause);
  const onNextRef = useRef(onNext);
  const onPrevRef = useRef(onPrev);
  const onSeekRef = useRef(onSeek);
  const currentTimeRef = useRef(currentTime);
  const durationRef = useRef(duration);
  const mediaTypeRef = useRef(mediaType);
  const isPlayingRef = useRef(isPlaying);
  const pauseActionTimestampRef = useRef(0);
  
  const nativeDurationKey = Math.floor(duration || 0);

  useEffect(() => {
    proxyAudioRef.current = proxyAudioElement || null;
  }, [proxyAudioElement]);

  useEffect(() => {
    onPlayRef.current = onPlay;
    onPauseRef.current = onPause;
    onNextRef.current = onNext;
    onPrevRef.current = onPrev;
    onSeekRef.current = onSeek;
    currentTimeRef.current = currentTime;
    durationRef.current = duration;
    mediaTypeRef.current = mediaType;
    isPlayingRef.current = isPlaying;
  }, [onPlay, onPause, onNext, onPrev, onSeek, currentTime, duration, mediaType, isPlaying]);

  const syncPlaybackState = (newState: MediaSessionPlaybackState) => {
    if (!('mediaSession' in navigator)) return;

    try {
      navigator.mediaSession.playbackState = newState;
      console.info('[MediaSession] Playback state synced to:', newState);
    } catch (error) {
      trackMetric('mediasession-error', 'playbackState', { msg: String(error) }); console.warn('Failed to update media session playback state:', error);
    }
  };

  const syncPositionState = (position = currentTimeRef.current) => {
    if (!('mediaSession' in navigator)) return;

    const d = durationRef.current;
    if (!Number.isFinite(d) || d <= 0) return;

    try {
      if ('setPositionState' in navigator.mediaSession) {
        navigator.mediaSession.setPositionState({
          duration: d,
          playbackRate: isPlayingRef.current ? 1.0 : 0,
          position: Math.max(0, Math.min(position, d)),
        });
      }
    } catch {
      // Ignore position state errors from partially implemented browsers.
    }
  };

  const clampTime = (time: number) => {
    const d = durationRef.current;
    const max = Number.isFinite(d) && d > 0 ? d : Number.POSITIVE_INFINITY;
    return Math.max(0, Math.min(max, Number.isFinite(time) ? time : 0));
  };

  // Flag para ignorar eventos play/pause do proxy que NÓS mesmos disparamos
  // (evita loop: sync effect pausa proxy → bridge pausa app → app pausa proxy…).
  const suppressProxyEventsRef = useRef(false);
  const clearSuppressTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const suppressProxyEvents = (ms = 600) => {
    suppressProxyEventsRef.current = true;
    if (clearSuppressTimerRef.current) clearTimeout(clearSuppressTimerRef.current);
    clearSuppressTimerRef.current = setTimeout(() => {
      suppressProxyEventsRef.current = false;
    }, ms);
  };

  const resumeAfterRemoteSeek = (target: number) => {
    currentTimeRef.current = target;
    syncPositionState(target);

    if (nativeMusicControlsAvailable()) {
      updateNativePosition(Math.floor(target), isPlayingRef.current);
    }

    if (!isPlayingRef.current) return;

    syncPlaybackState('playing');
    updateNativePlaybackState(true, Math.floor(target));
    onPlayRef.current?.();
    if (proxyAudioRef.current?.paused) {
      suppressProxyEvents();
      proxyAudioRef.current.play().catch(() => {});
    }
  };

  const seekFromRemoteControls = (time: number) => {
    const target = clampTime(time);
    onSeekRef.current?.(target);
    resumeAfterRemoteSeek(target);
  };

  useEffect(() => {
    const proxy = proxyAudioRef.current;
    if (!proxy) return;

    if (isPlaying && proxy.paused) {
      console.info('[MediaSession] Syncing proxy audio to PLAYING');
      suppressProxyEvents();
      proxy.play().catch(() => {});
    } else if (!isPlaying && !proxy.paused) {
      console.info('[MediaSession] Syncing proxy audio to PAUSED');
      suppressProxyEvents();
      proxy.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    if (lastSongIdRef.current === song.id && metadataSetRef.current) return;
    lastSongIdRef.current = song.id;

    try {
      const artwork = [
        {
          src: hdThumbnail(song.cover),
          sizes: '512x512',
          type: 'image/jpeg',
        },
      ];

      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title,
        artist: song.artist,
        album: song.album,
        artwork,
      });
      metadataSetRef.current = true;
      console.info('[MediaSession] Metadata updated for:', song.title);

      // Re-register action handlers after metadata swap. iOS/Safari (lock
      // screen + Dynamic Island) frequently drops prev/next handlers when the
      // MediaMetadata object is replaced during a track change and falls back
      // to the default ±10/15s seek buttons. Rebind immediately AND at
      // staggered intervals so the skip arrows persist between tracks even
      // when iOS asynchronously rebuilds the Now Playing UI after receiving
      // the new metadata.
      const rearmNow = () => {
        try { rearmMediaSessionRef.current?.(); } catch { /* ignore */ }
      };
      rearmNow();
      const t1 = setTimeout(rearmNow, 150);
      const t2 = setTimeout(rearmNow, 600);
      const t3 = setTimeout(rearmNow, 1500);
      // Cleanup handled by React when effect re-runs on next song change.
      (rearmMediaSessionRef as any)._pendingTimers?.forEach((id: any) => clearTimeout(id));
      (rearmMediaSessionRef as any)._pendingTimers = [t1, t2, t3];
    } catch (error) {
      trackMetric('mediasession-error', 'metadata', { msg: String(error) }); console.warn('Failed to set media session metadata:', error);
    }
  }, [song]);

  // Bridge to native (Capacitor) media controls — Android foreground service +
  // iOS lock-screen / Control Center. No-op on web.
  useEffect(() => {
    if (!nativeMusicControlsAvailable()) return;
    showNativeControls(
      {
        title: song.title,
        artist: song.artist,
        album: song.album,
        cover: hdThumbnail(song.cover),
        duration: nativeDurationKey,
        elapsed: currentTimeRef.current || 0,
      },
      {
        onPlay: () => onPlayRef.current?.(),
        onPause: () => onPauseRef.current?.(),
        // Only expose skip-track for music; video keeps seek-only.
        onNext: mediaType === "music" && onNextRef.current ? () => onNextRef.current?.() : undefined,
        onPrevious: mediaType === "music" && onPrevRef.current ? () => onPrevRef.current?.() : undefined,
        onSeek: seekFromRemoteControls,
        onSeekForward: mediaType === "video" ? () => {
          seekFromRemoteControls((currentTimeRef.current || 0) + SEEK_STEP_SECONDS);
        } : undefined,
        onSeekBackward: mediaType === "video" ? () => {
          seekFromRemoteControls((currentTimeRef.current || 0) - SEEK_STEP_SECONDS);
        } : undefined,
      },
      { mediaType, isPlaying: isPlayingRef.current },
    );
    return () => { hideNativeControls(); };
  }, [song.id, mediaType, nativeDurationKey]);

  useEffect(() => {
    if (nativeMusicControlsAvailable()) {
      updateNativePlaybackState(isPlaying, Math.floor(currentTimeRef.current || 0));
    }
  }, [isPlaying]);

  const positionBucket = Math.floor(currentTime / 5);
  useEffect(() => {
    if (nativeMusicControlsAvailable() && currentTime > 0) {
      updateNativePosition(Math.floor(currentTime), isPlayingRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionBucket]);

  // Media key fallback for browsers/PWAs that show controls but do not fully
  // wire the MediaSession action handlers while the page is backgrounded.
  useEffect(() => {
    const onMediaKey = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'MediaPlay':
          event.preventDefault();
          onPlayRef.current?.();
          break;
        case 'MediaPause':
        case 'MediaStop':
          event.preventDefault();
          onPauseRef.current?.();
          break;
        case 'MediaPlayPause':
          event.preventDefault();
          if (isPlayingRef.current) onPauseRef.current?.();
          else onPlayRef.current?.();
          break;
        case 'MediaTrackNext':
          event.preventDefault();
          if (mediaTypeRef.current === 'music') onNextRef.current?.();
          break;
        case 'MediaTrackPrevious':
          event.preventDefault();
          if (mediaTypeRef.current === 'music') onPrevRef.current?.();
          break;
        case 'MediaFastForward':
          if (mediaTypeRef.current === 'video') {
            event.preventDefault();
            seekFromRemoteControls((currentTimeRef.current || 0) + SEEK_STEP_SECONDS);
          }
          break;
        case 'MediaRewind':
          if (mediaTypeRef.current === 'video') {
            event.preventDefault();
            seekFromRemoteControls((currentTimeRef.current || 0) - SEEK_STEP_SECONDS);
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onMediaKey, { capture: true });
    return () => window.removeEventListener('keydown', onMediaKey, { capture: true });
  }, []);


  const rearmMediaSessionRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    const trySet = (
      action: MediaSessionAction,
      handler: MediaSessionActionHandler | null,
    ) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch (err) {
        trackMetric('mediasession-error', `set-${action}`, { msg: String(err) });
      }
    };

    const registerAll = () => {
      trySet('play', () => {
        // O comando de play vindo do OS (tela bloqueada / Control Center) é
        // sempre uma ação explícita do usuário: nunca deve ser suprimido.
        console.info('[MediaSession] Play action triggered by OS');
        pauseActionTimestampRef.current = 0;
        syncPlaybackState('playing');
        if (proxyAudioRef.current?.paused) {
          suppressProxyEvents();
          proxyAudioRef.current.play().catch(() => {});
        }
        onPlayRef.current();
        // Reforço: alguns iframes só retomam após a sessão de áudio reativar.
        setTimeout(() => {
          if (!isPlayingRef.current) onPlayRef.current();
        }, 250);
      });


      trySet('pause', () => {
        pauseActionTimestampRef.current = Date.now();
        console.info('[MediaSession] Pause action triggered by OS');
        syncPlaybackState('paused');
        onPauseRef.current();
        if (proxyAudioRef.current && !proxyAudioRef.current.paused) {
          suppressProxyEvents();
          proxyAudioRef.current.pause();
        }
      });

      trySet('stop', () => {
        pauseActionTimestampRef.current = Date.now();
        syncPlaybackState('paused');
        onPauseRef.current();
        if (proxyAudioRef.current && !proxyAudioRef.current.paused) {
          suppressProxyEvents();
          proxyAudioRef.current.pause();
        }
      });

      const isMusic = mediaTypeRef.current === 'music';

      if (isMusic) {
        trySet('nexttrack', () => {
          console.info('[MediaSession] Next track (music)');
          onNextRef.current?.();
        });
        trySet('previoustrack', () => {
          console.info('[MediaSession] Previous track (music)');
          onPrevRef.current?.();
        });
        trySet('seekbackward', null);
        trySet('seekforward', null);
      } else {
        trySet('nexttrack', null);
        trySet('previoustrack', null);
        trySet('seekbackward', (details) => {
          const step = Number.isFinite(details?.seekOffset as number)
            ? (details!.seekOffset as number)
            : SEEK_STEP_SECONDS;
          seekFromRemoteControls((currentTimeRef.current || 0) - step);
        });
        trySet('seekforward', (details) => {
          const step = Number.isFinite(details?.seekOffset as number)
            ? (details!.seekOffset as number)
            : SEEK_STEP_SECONDS;
          seekFromRemoteControls((currentTimeRef.current || 0) + step);
        });
      }

      trySet('seekto', (details) => {
        if (details.seekTime !== undefined && details.seekTime !== null) {
          console.info('[MediaSession] Seek to:', details.seekTime);
          seekFromRemoteControls(details.seekTime);
        }
      });

      // Re-sync so lock-screen shows current state after rebind.
      try {
        syncPlaybackState(isPlayingRef.current ? 'playing' : 'paused');
        syncPositionState(currentTimeRef.current);
      } catch { /* ignore */ }

      console.info('[MediaSession] Action handlers registered for', mediaTypeRef.current);
    };

    rearmMediaSessionRef.current = registerAll;
    registerAll();

    return () => {
      if (!('mediaSession' in navigator)) return;
      (['play','pause','stop','nexttrack','previoustrack','seekbackward','seekforward','seekto'] as MediaSessionAction[])
        .forEach((a) => trySet(a, null));
    };
  }, [mediaType]);

  // Auto-rebind fallback: when the tab becomes visible again, the window
  // regains focus, or the page is restored from bfcache, some browsers drop
  // MediaSession action handlers (controls appear greyed-out on lock screen /
  // Dynamic Island). Re-register handlers and re-sync state so buttons and
  // scrubber stay live.
  useEffect(() => {
    const rearm = () => {
      try {
        rearmMediaSessionRef.current?.();
        if (proxyAudioRef.current) {
          if (isPlayingRef.current && proxyAudioRef.current.paused) {
            suppressProxyEvents();
            proxyAudioRef.current.play().catch(() => {});
          }
        }
      } catch (err) {
        trackMetric('mediasession-error', 'rearm', { msg: String(err) });
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') rearm();
    };
    const onPageShow = () => rearm();
    const onFocus = () => rearm();

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // Bluetooth / headset play-pause on iOS Safari occasionally arrives as a
  // 'play'/'pause' event on the proxy <audio> without triggering the
  // MediaSession action handler. Bridge those events into our transport.
  // Bluetooth / headset play-pause bridge via proxy <audio>.
  // IMPORTANT: Este bridge SÓ é ativado em iOS PWA standalone (onde controles
  // de hardware chegam como eventos no elemento de áudio sem passar pelos
  // action handlers da MediaSession). Em navegadores web comuns (Chrome/Safari
  // mobile), o próprio browser pausa o proxy por políticas de autoplay,
  // buffering ou perda de foco de mídia, o que causava loop de pausas e
  // impedia a reprodução contínua. Nesses casos usamos apenas os
  // MediaSession action handlers (já registrados acima).
  useEffect(() => {
    const proxy = proxyAudioRef.current;
    if (!proxy) return;

    const ua = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
    const isApple = /iphone|ipad|ipod/.test(ua) ||
      (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isStandalone = typeof window !== 'undefined' && (
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    );
    // Só ativa o bridge no cenário onde ele é realmente necessário
    if (!(isApple && isStandalone)) return;

    const onProxyPlay = () => {
      if (suppressProxyEventsRef.current) return;
      if (!isPlayingRef.current) onPlayRef.current?.();
    };
    const onProxyPause = () => {
      if (suppressProxyEventsRef.current) return;
      if (document.visibilityState !== 'visible') return;
      if (isPlayingRef.current) onPauseRef.current?.();
    };
    proxy.addEventListener('play', onProxyPlay);
    proxy.addEventListener('pause', onProxyPause);
    return () => {
      proxy.removeEventListener('play', onProxyPlay);
      proxy.removeEventListener('pause', onProxyPause);
    };
  }, [proxyAudioElement]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    if (!metadataSetRef.current) return;

    if (isPlaying) {
      pauseActionTimestampRef.current = 0;
    }

    syncPlaybackState(isPlaying ? 'playing' : 'paused');
    syncPositionState(currentTimeRef.current);
  }, [isPlaying]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    if (!metadataSetRef.current) return;

    syncPositionState(currentTime);
  }, [currentTime, duration]);
}
