/**
 * Native lock-screen / notification media controls via
 * `capacitor-music-controls-plugin`.
 *
 * - Android: registers a foreground Service with a persistent notification,
 *   which keeps the audio process alive when the screen is locked or the
 *   app goes to background (this is the only reliable way on modern Android).
 * - iOS: bridges into MPNowPlayingInfoCenter / Remote Command Center so the
 *   lock screen and Control Center expose play/pause/next/previous buttons.
 * - Web (Lovable preview, browser): becomes a no-op so it never breaks the
 *   browser build — the existing `navigator.mediaSession` path keeps working.
 */

import { Capacitor } from '@capacitor/core';

type ControlEvent =
  | 'music-controls-play'
  | 'music-controls-pause'
  | 'music-controls-stop'
  | 'music-controls-next'
  | 'music-controls-previous'
  | 'music-controls-seek-to'
  | 'music-controls-skip-forward'
  | 'music-controls-skip-backward'
  | 'music-controls-destroy'
  | 'music-controls-toggle-play-pause'
  | 'music-controls-headset-unplugged'
  | 'music-controls-headset-plugged';

export interface NativeControlsHandlers {
  onPlay?: () => void;
  onPause?: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  onSeek?: (time: number) => void;
  onSeekForward?: () => void;
  onSeekBackward?: () => void;
}

interface NativeTrack {
  title: string;
  artist: string;
  album?: string;
  cover?: string;
  duration?: number;
  elapsed?: number;
}

interface NativeControlsOptions {
  mediaType?: 'music' | 'video';
  isPlaying?: boolean;
}

let pluginPromise: Promise<any> | null = null;
let currentHandlers: NativeControlsHandlers = {};
let listenerAttached = false;
let documentListenerAttached = false;
let lastElapsed = 0;
let lastIsPlaying = false;

const isNative = () =>
  typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform?.();

async function getPlugin(): Promise<any | null> {
  if (!isNative()) return null;
  if (!pluginPromise) {
    pluginPromise = import('capacitor-music-controls-plugin')
      .then((mod) => (mod as any).CapacitorMusicControls ?? (mod as any).default)
      .catch((err) => {
        console.warn('[NativeMusicControls] plugin load failed:', err);
        return null;
      });
  }
  return pluginPromise;
}

async function ensureListener(plugin: any) {
  const normalizeControlAction = (
    input: unknown,
    fallbackMessage?: ControlEvent,
  ): { message?: ControlEvent; position?: number } => {
    if (typeof input === 'string') {
      try {
        return normalizeControlAction(JSON.parse(input), fallbackMessage);
      } catch {
        return { message: (input as ControlEvent) || fallbackMessage };
      }
    }

    if (input && typeof input === 'object') {
      const action = input as { message?: ControlEvent; position?: number | string };
      const numericPosition = Number(action.position);
      return {
        message: action.message ?? fallbackMessage,
        position: Number.isFinite(numericPosition) ? numericPosition : undefined,
      };
    }

    return { message: fallbackMessage };
  };

  const dispatchControlEvent = (action: { message?: ControlEvent; position?: number }) => {
    const msg = action?.message;
    switch (msg) {
      case 'music-controls-play':
        lastIsPlaying = true;
        currentHandlers.onPlay?.();
        break;
      case 'music-controls-pause':
      case 'music-controls-stop':
      case 'music-controls-headset-unplugged':
        lastIsPlaying = false;
        currentHandlers.onPause?.();
        break;
      case 'music-controls-toggle-play-pause':
        if (lastIsPlaying) {
          lastIsPlaying = false;
          currentHandlers.onPause?.();
        } else {
          lastIsPlaying = true;
          currentHandlers.onPlay?.();
        }
        break;
      case 'music-controls-next':
        currentHandlers.onNext?.();
        break;
      case 'music-controls-previous':
        currentHandlers.onPrevious?.();
        break;
      case 'music-controls-seek-to':
        if (Number.isFinite(action.position)) currentHandlers.onSeek?.(Number(action.position));
        break;
      case 'music-controls-skip-forward':
        currentHandlers.onSeekForward?.();
        break;
      case 'music-controls-skip-backward':
        currentHandlers.onSeekBackward?.();
        break;
      case 'music-controls-destroy':
      default:
        break;
    }
  };

  if (!listenerAttached && plugin?.addListener) {
    listenerAttached = true;
    try {
      plugin.addListener('controlsNotification', (event: unknown) => {
        dispatchControlEvent(normalizeControlAction(event));
      });
    } catch (err) {
      console.warn('[NativeMusicControls] listener attach failed:', err);
    }
  }

  // Android in this plugin emits document-level CustomEvents via triggerJSEvent
  // instead of Capacitor's addListener. Without this listener the lock-screen /
  // notification buttons appear but are effectively inactive.
  if (!documentListenerAttached && typeof document !== 'undefined') {
    documentListenerAttached = true;
    document.addEventListener('controlsNotification', (event) => {
      const customEvent = event as CustomEvent<string | { message?: ControlEvent; position?: number }>;
      const fallbackMessage = (event as Event & { message?: ControlEvent }).message;
      const detail = customEvent.detail ?? (event as Event & { detail?: string }).detail ?? fallbackMessage;
      dispatchControlEvent(normalizeControlAction(detail, fallbackMessage));
    });
  }
}

function sanitizeSeconds(value: number | undefined, fallback = 0): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.floor(numeric));
}

export async function showNativeControls(
  track: NativeTrack,
  handlers: NativeControlsHandlers,
  options: NativeControlsOptions = {},
): Promise<void> {
  const plugin = await getPlugin();
  if (!plugin) return;
  currentHandlers = handlers;
  lastElapsed = sanitizeSeconds(track.elapsed, 0);
  lastIsPlaying = options.isPlaying ?? true;
  await ensureListener(plugin);
  try {
    // Destroy any previous notification before creating a new one
    try { await plugin.destroy?.(); } catch { /* ignore */ }

    const isMusic = options.mediaType !== 'video';

    await plugin.create({
      track: track.title,
      artist: track.artist,
      album: track.album ?? '',
      cover: track.cover ?? '',
      duration: sanitizeSeconds(track.duration, 0),
      elapsed: lastElapsed,
      isPlaying: lastIsPlaying,
      // .mp3 / Xerife Music: previous + play/pause + next + scrubber.
      // .mp4 / Xerife Videos: seek ±10s + scrubber, no track-skip arrows.
      hasPrev: isMusic,
      hasNext: isMusic,
      hasSkipBackward: !isMusic,
      hasSkipForward: !isMusic,
      skipBackwardInterval: 10,
      skipForwardInterval: 10,
      hasClose: true,
      hasScrubbing: true,
      dismissable: false,
      // Android-only options
      playIcon: 'media_play',
      pauseIcon: 'media_pause',
      prevIcon: 'media_prev',
      nextIcon: 'media_next',
      closeIcon: 'media_close',
      notificationIcon: 'notification',
      ticker: track.title,
    });
  } catch (err) {
    console.warn('[NativeMusicControls] create failed:', err);
  }
}

export async function updateNativePlaybackState(isPlaying: boolean, elapsed = lastElapsed): Promise<void> {
  const plugin = await getPlugin();
  if (!plugin) return;
  try {
    lastElapsed = sanitizeSeconds(elapsed, lastElapsed);
    lastIsPlaying = isPlaying;
    await plugin.updateIsPlaying({ isPlaying, elapsed: lastElapsed });
  } catch (err) {
    console.warn('[NativeMusicControls] updateIsPlaying failed:', err);
  }
}

export async function updateNativePosition(elapsed: number, isPlaying = true): Promise<void> {
  const plugin = await getPlugin();
  if (!plugin) return;
  try {
    lastElapsed = sanitizeSeconds(elapsed, lastElapsed);
    lastIsPlaying = isPlaying;
    await plugin.updateElapsed?.({ elapsed: lastElapsed, isPlaying });
  } catch {
    // Some platforms don't support elapsed updates; ignore.
  }
}

export async function hideNativeControls(): Promise<void> {
  const plugin = await getPlugin();
  if (!plugin) return;
  try {
    await plugin.destroy?.();
  } catch (err) {
    console.warn('[NativeMusicControls] destroy failed:', err);
  }
}

export const nativeMusicControlsAvailable = () => isNative();
