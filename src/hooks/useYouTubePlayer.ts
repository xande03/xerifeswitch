import { useEffect, useRef, useCallback, useState } from "react";
import { toast } from "sonner";
import { track as trackMetric } from "@/lib/playbackMetrics";
import { castYouTubeVideo, isCastSupported, loadCastSdk } from "@/lib/castService";
import { evaluateClipSync, CLIP_SYNC_DEFAULTS } from "@/lib/clipSyncGuard";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export interface YouTubePlayerState {
  isReady: boolean;
  isPlaying: boolean;
  isEnded: boolean;
  currentTime: number;
  duration: number;
  videoId: string | null;
  isFullscreen: boolean;
  captionsEnabled: boolean;
}

let apiLoaded = false;
let apiReady = false;
const readyCallbacks: (() => void)[] = [];

function loadYouTubeAPI(): Promise<void> {
  return new Promise((resolve) => {
    if (apiReady) { resolve(); return; }
    readyCallbacks.push(resolve);
    if (apiLoaded) return;
    apiLoaded = true;

    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);

    window.onYouTubeIframeAPIReady = () => {
      apiReady = true;
      readyCallbacks.forEach((cb) => cb());
      readyCallbacks.length = 0;
    };
  });
}

// Silent audio element to keep iOS/Android audio session alive in background/lock screen
let silentAudio: HTMLAudioElement | null = null;
// Proxy audio element for MediaSession controls (syncs with YouTube)
let proxyAudio: HTMLAudioElement | null = null;
let sharedSilentAudioUrl: string | null = null;
let audioContext: AudioContext | null = null;
let wakeLock: WakeLockSentinel | null = null;
const DEFAULT_PLAYER_VOLUME = 80;
const DEFAULT_AUTO_RESUME_GUARD_MS = 2500;
const IOS_AUTO_RESUME_GUARD_MS = 5000;
const IOS_BACKGROUND_CONTROL_PAUSE_MS = 600;

// ── Audio Focus Management (web equivalent of Android AudioFocus) ──
// Tracks whether our app "owns" the audio focus. When another tab or app
// takes audio focus we duck/pause; when we regain it we resume.
let hasAudioFocus = true;
let focusLossTime = 0;
const TRANSIENT_FOCUS_LOSS_MS = 3000; // treat short interruptions as transient

/**
 * Screen Wake Lock is intentionally DISABLED.
 * The app must respect the device's own screen-timeout / auto-lock settings,
 * exactly like the system standard. Audio (and background playback) keeps
 * running through the silent-audio + MediaSession path, but the screen is
 * free to turn off whenever the OS decides — playing or paused.
 */
async function requestWakeLock() {
  // No-op: never hold the screen awake. Also defensively release any legacy
  // sentinel that might still be held from a previous session/HMR.
  releaseWakeLock();
}


function releaseWakeLock() {
  try {
    wakeLock?.release().catch(() => {});
  } catch { /* ignore */ }
  wakeLock = null;
}


function normalizeVolume(vol: number): number {
  if (!Number.isFinite(vol)) return DEFAULT_PLAYER_VOLUME;
  return Math.max(0, Math.min(100, Math.round(vol)));
}

function getSharedSilentAudioUrl() {
  if (sharedSilentAudioUrl) return sharedSilentAudioUrl;

  // Longer buffer (10s) reduces loop-seam audio session drops on iOS standalone PWAs.
  const sampleRate = 44100;
  const durationSeconds = 10;
  const numSamples = sampleRate * durationSeconds;
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  sharedSilentAudioUrl = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
  return sharedSilentAudioUrl;
}

// Global set to track if a playlist is currently active to handle queuing
let currentPlaylistVideos: any[] = [];
let currentPlaylistIndex = -1;

export const setGlobalPlaylist = (videos: any[], startIndex = 0) => {
  currentPlaylistVideos = videos;
  currentPlaylistIndex = startIndex;
};

/**
 * iOS Safari/PWA keeps the audio session alive far more reliably when the
 * <audio> element is actually attached to the DOM. Hide it visually but
 * leave it in the tree.
 */
function attachAudioToDom(el: HTMLAudioElement) {
  if (el.isConnected) return;
  try {
    el.style.position = 'fixed';
    el.style.left = '-9999px';
    el.style.width = '1px';
    el.style.height = '1px';
    el.style.opacity = '0';
    el.style.pointerEvents = 'none';
    (document.body || document.documentElement).appendChild(el);
  } catch { /* ignore */ }
}

function isIOSStandalone(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  const isApple = /iphone|ipad|ipod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = (window.matchMedia?.('(display-mode: standalone)').matches) ||
    (navigator as any).standalone === true;
  return isApple && standalone;
}


/**
 * Detect browser engine for targeted workarounds
 */
function detectBrowser(): 'safari' | 'chrome' | 'firefox' | 'brave' | 'other' {
  const ua = navigator.userAgent.toLowerCase();
  // Brave exposes navigator.brave on some builds
  if ((navigator as any).brave?.isBrave) return 'brave';
  if (ua.includes('firefox')) return 'firefox';
  if (ua.includes('safari') && !ua.includes('chrome') && !ua.includes('chromium')) return 'safari';
  if (ua.includes('chrome') || ua.includes('chromium') || ua.includes('crios')) return 'chrome';
  return 'other';
}

/**
 * Creates a longer silent audio loop that keeps the browser audio
 * session alive when the page loses visibility.
 * Uses both <audio> and Web Audio API for maximum cross-browser compat.
 */


function ensureSilentAudio() {
  if (silentAudio) return silentAudio;

  silentAudio = new Audio(getSharedSilentAudioUrl());
  silentAudio.loop = true;
  // iOS aggressively kills audio elements with volume < 0.001 when backgrounded
  // (especially in installed PWA / standalone mode). Keep slightly audible to OS
  // while remaining inaudible to the user.
  silentAudio.volume = 0.005;
  silentAudio.muted = false; // explicit — muted=true breaks iOS audio session
  silentAudio.defaultMuted = false;
  silentAudio.autoplay = false;
  silentAudio.crossOrigin = 'anonymous';
  silentAudio.setAttribute("playsinline", "true");
  silentAudio.setAttribute("webkit-playsinline", "true");
  silentAudio.setAttribute("x-webkit-airplay", "allow");
  silentAudio.setAttribute("controlsList", "nodownload noremoteplayback");
  silentAudio.preload = "auto";
  attachAudioToDom(silentAudio);

  try {
    if (!audioContext) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (AC) {
        audioContext = new AC({ sampleRate: 44100, latencyHint: 'playback' as any });
        (window as any).__xerife_audio_ctx = audioContext;
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        gain.gain.value = 0.00001;
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.start();
      }
    }
  } catch { /* AudioContext not available */ }

  // iOS fallback: recreate on fatal media error / disconnection
  silentAudio.addEventListener('error', () => {
    console.warn('[SilentAudio] error — recreating');
    try { silentAudio?.remove(); } catch {}
    silentAudio = null;
    if (shouldBePlayingRefGlobal()) {
      ensureSilentAudio().play().catch(() => {});
    }
  });

  return silentAudio;
}

// Module-level flag set by the hook so module-level helpers know if we should
// auto-revive interrupted audio elements on iOS.
let _shouldBePlayingGlobal = false;
function shouldBePlayingRefGlobal() { return _shouldBePlayingGlobal; }
function setShouldBePlayingGlobal(v: boolean) { _shouldBePlayingGlobal = v; }

/**
 * Creates a proxy audio element that iOS can control via MediaSession.
 * This element's play/pause state is synced with the YouTube player.
 */
function ensureProxyAudio() {
  if (proxyAudio) return proxyAudio;

  proxyAudio = new Audio(getSharedSilentAudioUrl());
  proxyAudio.loop = true;
  // Keep slightly above 0 so iOS PWA (standalone) does not drop the audio
  // session and pause us when the screen locks or the user switches apps.
  proxyAudio.volume = 0.005;
  proxyAudio.muted = false;
  proxyAudio.defaultMuted = false;
  proxyAudio.autoplay = false;
  proxyAudio.crossOrigin = 'anonymous';
  proxyAudio.setAttribute("playsinline", "true");
  proxyAudio.setAttribute("webkit-playsinline", "true");
  proxyAudio.setAttribute("x-webkit-airplay", "allow");
  proxyAudio.setAttribute("controlsList", "nodownload noremoteplayback");
  proxyAudio.preload = "auto";
  proxyAudio.title = "Xerife Switch";
  attachAudioToDom(proxyAudio);

  proxyAudio.addEventListener('error', () => {
    console.warn('[ProxyAudio] error — recreating');
    try { proxyAudio?.remove(); } catch {}
    proxyAudio = null;
    if (shouldBePlayingRefGlobal()) {
      ensureProxyAudio().play().catch(() => {});
    }
  });

  console.info('[ProxyAudio] Created proxy audio element for iOS MediaSession', {
    iosStandalone: isIOSStandalone(),
  });

  return proxyAudio;
}


/** Resume AudioContext if suspended (required after user gesture on iOS/Chrome) */
function resumeAudioContext() {
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {});
  }
}

const CAPTIONS_PREF_KEY = "demus_captions_enabled";
function loadCaptionsPref(): boolean {
  try {
    const v = localStorage.getItem(CAPTIONS_PREF_KEY);
    if (v === null) return true;
    return v === "1" || v === "true";
  } catch { return true; }
}

const QUALITY_PREF_KEY = "demus_video_quality";
function loadQualityPref(): string {
  try {
    return localStorage.getItem(QUALITY_PREF_KEY) || "auto";
  } catch { return "auto"; }
}
function saveQualityPref(q: string) {
  try { localStorage.setItem(QUALITY_PREF_KEY, q); } catch {}
}
function dispatchQualityChanged(q: string) {
  // Preference changed (what the user selected — persisted).
  try { window.dispatchEvent(new CustomEvent("demus:quality-changed", { detail: q })); } catch {}
}
function dispatchQualityActive(q: string) {
  // Actual resolution currently being rendered by YouTube (may differ from the
  // preference, especially when preference is "auto").
  try { window.dispatchEvent(new CustomEvent("demus:quality-active", { detail: q })); } catch {}
}
function dispatchQualityLoading(loading: boolean) {
  try { window.dispatchEvent(new CustomEvent("demus:quality-loading", { detail: loading })); } catch {}
}

// ── Quality stability helpers ─────────────────────────────────────────────
// YouTube's ABR bounces between resolutions based on iframe pixel size and
// bandwidth. To keep the user-selected quality *stable* across the whole video
// (and across subsequent videos), we:
//   1. Re-apply `setPlaybackQualityRange(q, q)` continuously via
//      `enforceQualityCap` whenever YT reports a mismatched active quality.
//   2. On every `loadVideo`, resize the iframe once to the target resolution
//      + pass `suggestedQuality` so the *first frame* already comes at the
//      chosen level (no visible min→max ramp-up).
const QUALITY_PX_MAP: Record<string, { w: number; h: number }> = {
  hd2160: { w: 3840, h: 2160 },
  hd1440: { w: 2560, h: 1440 },
  hd1080: { w: 1920, h: 1080 },
  hd720:  { w: 1280, h: 720 },
  large:  { w: 854,  h: 480 },
  medium: { w: 640,  h: 360 },
  small:  { w: 426,  h: 240 },
  tiny:   { w: 256,  h: 144 },
};
// Ordered from lowest to highest — used to pick a safe fallback when the
// user-selected quality is not available for a given video.
const QUALITY_ORDER = ["tiny", "small", "medium", "large", "hd720", "hd1080", "hd1440", "hd2160"];

/**
 * Given the user's target quality and the list of qualities YT reports as
 * available for the current video, pick the best real level to apply:
 *   - target itself when supported
 *   - otherwise the highest available level ≤ target (graceful downgrade)
 *   - otherwise the highest available level (last resort — still stable)
 */
function pickAvailableQuality(target: string, available: string[] | null | undefined): string {
  if (!target || target === "auto") return "auto";
  const list = (available || []).filter((q) => q && q !== "auto");
  if (!list.length) return target;
  if (list.includes(target)) return target;
  const targetIdx = QUALITY_ORDER.indexOf(target);
  if (targetIdx < 0) return target;
  // Highest available ≤ target
  for (let i = targetIdx; i >= 0; i--) {
    if (list.includes(QUALITY_ORDER[i])) return QUALITY_ORDER[i];
  }
  // Otherwise the highest available overall
  for (let i = QUALITY_ORDER.length - 1; i >= 0; i--) {
    if (list.includes(QUALITY_ORDER[i])) return QUALITY_ORDER[i];
  }
  return target;
}

/**
 * Adaptive range for "auto" mode: prefer the highest resolution the current
 * network can sustain, and downgrade the ceiling when the connection is weak.
 * Uses the Network Information API when available (Chromium/Android). Falls
 * back to a high-aiming permissive range so YT ABR is still free to pick
 * 1080p+ on fast Wi-Fi.
 */
function getAdaptiveAutoRange(): { min: string; max: string } {
  try {
    const c: any = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    if (!c) return { min: "hd720", max: "hd2160" };
    if (c.saveData) return { min: "small", max: "medium" };
    const et: string = c.effectiveType || "";
    const dl: number = typeof c.downlink === "number" ? c.downlink : 0; // Mbps
    if (et === "slow-2g" || et === "2g") return { min: "tiny", max: "small" };
    if (et === "3g" || (dl > 0 && dl < 1.5)) return { min: "small", max: "medium" };
    if (dl >= 10) return { min: "hd1080", max: "hd2160" };
    if (dl >= 5 || et === "4g") return { min: "hd720", max: "hd1080" };
    return { min: "medium", max: "hd720" };
  } catch {
    return { min: "hd720", max: "hd2160" };
  }
}

/** Non-destructive: re-caps YT ABR to the exact user-locked resolution
 * (or the closest available fallback so playback stays stable and does
 * not oscillate between min↔max when the target level is unsupported).
 * When quality === "auto", picks an adaptive range based on the current
 * network conditions so we get the highest resolution the link can carry. */
function enforceQualityCap(p: any, quality: string) {
  if (!p || !quality) return;
  try {
    if (quality === "auto") {
      const { min, max } = getAdaptiveAutoRange();
      p.setPlaybackQualityRange?.(min, max);
      try { p.setPlaybackQuality?.(max); } catch {}
      return;
    }
    let effective = quality;
    try {
      const available: string[] = p.getAvailableQualityLevels?.() || [];
      effective = pickAvailableQuality(quality, available);
    } catch {}
    p.setPlaybackQualityRange?.(effective, effective);
    try { p.setPlaybackQuality?.(effective); } catch {}
  } catch {}
}



export function useYouTubePlayer(containerId: string) {
  const playerRef = useRef<any>(null);
  const [state, setState] = useState<YouTubePlayerState>(() => {
    try {
      const savedTime = localStorage.getItem('demus-current-time');
      const savedDur = localStorage.getItem('demus-current-duration');
      const savedVideoId = localStorage.getItem('demus-current-song-id'); // Reusing this from Index.tsx or generic
      
      return {
        isReady: false,
        isPlaying: false,
        isEnded: false,
        currentTime: savedTime ? parseFloat(savedTime) : 0,
        duration: savedDur ? parseFloat(savedDur) : 0,
        videoId: savedVideoId || null,
        isFullscreen: false,
        captionsEnabled: loadCaptionsPref(),
      };
    } catch {
      return {
        isReady: false,
        isPlaying: false,
        isEnded: false,
        currentTime: 0,
        duration: 0,
        videoId: null,
        isFullscreen: false,
        captionsEnabled: loadCaptionsPref(),
      };
    }
  });
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const userGestureRef = useRef(false);
  const userPausedRef = useRef(false);
  const shouldBePlayingRef = useRef(false);
  const pauseTimestampRef = useRef(0); // Track when user last paused to prevent race conditions
  const targetVolumeRef = useRef(DEFAULT_PLAYER_VOLUME);
  const browserRef = useRef(detectBrowser());
  // Track consecutive errors to avoid infinite retry loops
  const errorCountRef = useRef(0);
  const pseudoFullscreenRef = useRef<HTMLElement | null>(null);
  // ── Guard de alinhamento do clipe (pos-swap) ──────────────────────────────
  // Depois de loadVideoAt() o YouTube ancora em keyframe, nao no segundo pedido.
  // Guardamos o alvo e corrigimos com no maximo N seeks discretos dentro de uma
  // janela curta. Ver src/lib/clipSyncGuard.ts para a politica completa.
  const clipSyncRef = useRef<{
    targetSec: number | null;
    startedAt: number;
    corrections: number;
    userSeekedSince: boolean;
    timer?: ReturnType<typeof setInterval>;
  }>({ targetSec: null, startedAt: 0, corrections: 0, userSeekedSince: false });
  const bgIntervalRef = useRef<ReturnType<typeof setInterval>>();
  const hiddenSinceRef = useRef<number | null>(null);
  const [proxyAudioElement, setProxyAudioElement] = useState<HTMLAudioElement | null>(null);

  // ── Guard de alinhamento do clipe (pos-loadVideoAt) ───────────────────────
  const stopClipSyncWatch = useCallback(() => {
    const c = clipSyncRef.current;
    if (c?.timer) {
      clearInterval(c.timer);
      c.timer = undefined;
    }
  }, []);

  /**
   * Consulta o player, roda a decisao do guard e aplica um seek corretivo
   * discreto quando necessario. Politicas (tolerancia, janela, orçamento)
   * vivem em src/lib/clipSyncGuard.ts, puras e testadas unitariamente.
   */
  const runClipSyncCheck = useCallback(() => {
    const c = clipSyncRef.current;
    if (!c || c.targetSec == null) return false;
    const p = playerRef.current as {
      getCurrentTime?: () => number;
      getPlayerState?: () => number;
      seekTo?: (seconds: number, allowSeekAhead: boolean) => void;
    } | null;
    if (!p?.getCurrentTime) return false;

    let ytState: number | undefined;
    try { ytState = p.getPlayerState?.(); } catch { /* IFrame ainda nao pronto: seguimos sem estado */ }
    const buffering = ytState === window.YT?.PlayerState?.BUFFERING;
    const observed = Number(p.getCurrentTime?.() || 0);

    const verdict = evaluateClipSync({
      pendingTargetSec: c.targetSec,
      observedSec: observed,
      isBuffering: buffering,
      elapsedMs: Date.now() - c.startedAt,
      correctionsUsed: c.corrections,
      userSeekedSince: c.userSeekedSince,
    });

    if (verdict.action === "seek") {
      c.corrections += 1;
      const driftMs = Math.round(Math.abs(observed - c.targetSec) * 1000);
      try { p.seekTo?.(verdict.targetSec, true); } catch { /* seek indisponivel: o proximo tick reavalia */ }
      console.info('[YT clipSync] correcao aplicada', { reason: verdict.reason, driftMs, target: verdict.targetSec, attempt: c.corrections });
      trackMetric('clip-sync', 'seek', { reason: verdict.reason, driftMs, attempt: c.corrections });
      return true;
    }
    if (verdict.done) {
      if (verdict.reason === 'converged' && c.corrections > 0) {
        trackMetric('clip-sync', 'converged-after-correction', { corrections: c.corrections });
      }
      stopClipSyncWatch();
      c.targetSec = null;
    }
    return false;
  }, [stopClipSyncWatch]);

  /** Abre a janela de observacao (500ms) apos um load com alvo explicito. */
  const startClipSyncWatch = useCallback((targetSec: number) => {
    stopClipSyncWatch();
    const state = {
      targetSec: Number.isFinite(targetSec) ? Math.max(0, targetSec) : null,
      startedAt: Date.now(),
      corrections: 0,
      userSeekedSince: false,
      timer: undefined as ReturnType<typeof setInterval> | undefined,
    };
    clipSyncRef.current = state;
    if (state.targetSec == null) return;
    const timer = setInterval(() => {
      const cur = clipSyncRef.current;
      if (!cur || cur.targetSec == null) { clearInterval(timer); return; }
      runClipSyncCheck();
      // Rede de seguranca: nunca deixar o polling vivo alem da janela.
      if (Date.now() - cur.startedAt > CLIP_SYNC_DEFAULTS.windowMs + 2000) {
        stopClipSyncWatch();
        cur.targetSec = null;
      }
    }, 500);
    clipSyncRef.current.timer = timer;
  }, [runClipSyncCheck, stopClipSyncWatch]);


  // Helper functions for persistent pause flag
  const setUserPausedFlag = useCallback(() => {
    try {
      localStorage.setItem('__user_paused', 'true');
      console.log('[YT] User pause flag SET');
    } catch (e) {
      console.warn('[YT] Failed to set pause flag:', e);
    }
  }, []);

  const clearUserPausedFlag = useCallback(() => {
    try {
      localStorage.removeItem('__user_paused');
      console.log('[YT] User pause flag CLEARED');
    } catch (e) {
      console.warn('[YT] Failed to clear pause flag:', e);
    }
  }, []);

  const checkUserPausedFlag = useCallback((): boolean => {
    try {
      const flag = localStorage.getItem('__user_paused');
      return flag === 'true';
    } catch {
      return false;
    }
  }, []);

  // Initialize proxy audio element
  useEffect(() => {
    const proxy = ensureProxyAudio();
    setProxyAudioElement(proxy);
    
    // Setup proxy audio event listeners
    const handleProxyPlay = () => {
      console.info('[ProxyAudio] Play event - iOS wants to play');
    };
    
    const handleProxyPause = () => {
      console.info('[ProxyAudio] Pause event - iOS wants to pause');
    };
    
    proxy.addEventListener('play', handleProxyPlay);
    proxy.addEventListener('pause', handleProxyPause);
    
    return () => {
      proxy.removeEventListener('play', handleProxyPlay);
      proxy.removeEventListener('pause', handleProxyPause);
    };
  }, []);

  const markUserPausedIntent = useCallback(() => {
    console.info('[Player] markUserPausedIntent called', {
      wasUserPaused: userPausedRef.current,
      wasShouldBePlaying: shouldBePlayingRef.current,
    });
    userPausedRef.current = true;
    shouldBePlayingRef.current = false; setShouldBePlayingGlobal(false);
    pauseTimestampRef.current = Date.now();
    try { localStorage.removeItem('__was_playing'); } catch {}
    if (bgIntervalRef.current) {
      clearInterval(bgIntervalRef.current);
      bgIntervalRef.current = undefined;
    }
    silentAudio?.pause();
    releaseWakeLock();
    setState((s) => ({ ...s, isPlaying: false, isEnded: false }));
  }, []);

  const applyVolumeToPlayer = useCallback((vol: number) => {
    const normalized = normalizeVolume(vol);
    targetVolumeRef.current = normalized;
    try {
      playerRef.current?.setVolume?.(normalized);
    } catch {
      // no-op
    }
  }, []);

  const syncPlaybackStateFromPlayer = useCallback((reason: string) => {
    const player = playerRef.current;
    const ytState = player?.getPlayerState?.();
    const playerStates = window.YT?.PlayerState;
    const duration = player?.getDuration?.() || 0;
    const currentTime = player?.getCurrentTime?.() || 0;
    const persistedPaused = checkUserPausedFlag();
    const isPlaying = ytState === playerStates?.PLAYING;
    const isBuffering = ytState === playerStates?.BUFFERING;
    const isEnded = ytState === playerStates?.ENDED;

    console.info('[YT Sync]', {
      reason,
      ytState,
      persistedPaused,
      userPaused: userPausedRef.current,
      shouldBePlaying: shouldBePlayingRef.current,
    });

    if (persistedPaused || userPausedRef.current) {
      userPausedRef.current = true;
      shouldBePlayingRef.current = false; setShouldBePlayingGlobal(false);
      silentAudio?.pause();
      ensureProxyAudio().pause();
      player?.pauseVideo?.();
      releaseWakeLock();
      setState((s) => ({ ...s, currentTime, duration: duration || s.duration, isPlaying: false, isEnded: false }));
      return;
    }

    if (isPlaying || isBuffering) {
      shouldBePlayingRef.current = true; setShouldBePlayingGlobal(true);
      ensureSilentAudio().play().catch(() => {});
      ensureProxyAudio().play().catch(() => {});
      resumeAudioContext();
      requestWakeLock();
      setState((s) => ({ ...s, currentTime, duration: duration || s.duration, isPlaying: true, isEnded: isEnded }));
      return;
    }

    // Player parado sem que o usuário tenha pausado (suspensão do sistema em
    // background): retoma em vez de assumir estado pausado.
    if (shouldBePlayingRef.current && !isEnded) {
      ensureSilentAudio().play().catch(() => {});
      ensureProxyAudio().play().catch(() => {});
      resumeAudioContext();
      try { player?.playVideo?.(); } catch {}
      setState((s) => ({ ...s, currentTime, duration: duration || s.duration, isPlaying: true, isEnded: false }));
      return;
    }

    shouldBePlayingRef.current = false; setShouldBePlayingGlobal(false);
    silentAudio?.pause();
    ensureProxyAudio().pause();
    releaseWakeLock();
    setState((s) => ({ ...s, currentTime, duration: duration || s.duration, isPlaying: false, isEnded: isEnded }));
  }, [checkUserPausedFlag]);


  // Capture first user gesture for iOS audio unlock
  useEffect(() => {
    const captureGesture = () => {
      if (userGestureRef.current) return;
      userGestureRef.current = true;

      const audio = ensureSilentAudio();
      audio.play().catch(() => {});
      // Pre-warm proxy audio so iOS PWA keeps an active media session
      const proxy = ensureProxyAudio();
      proxy.play().then(() => proxy.pause()).catch(() => {});
      resumeAudioContext();

      document.removeEventListener("touchstart", captureGesture);
      document.removeEventListener("click", captureGesture);
      document.removeEventListener("pointerdown", captureGesture);
    };

    document.addEventListener("touchstart", captureGesture, { passive: true });
    document.addEventListener("click", captureGesture, { passive: true });
    // pointerdown covers Brave and other browsers that sometimes miss touchstart
    document.addEventListener("pointerdown", captureGesture, { passive: true });

    // iOS standalone PWA: pagehide/freeze fire when user switches apps or locks screen.
    // Re-kick the silent audio + AudioContext so the audio session stays alive in background.
    const keepSessionAlive = () => {
      if (!shouldBePlayingRef.current || userPausedRef.current) return;
      try { ensureSilentAudio().play().catch(() => {}); } catch {}
      try { ensureProxyAudio().play().catch(() => {}); } catch {}
      resumeAudioContext();
    };
    window.addEventListener('pagehide', keepSessionAlive);
    window.addEventListener('freeze', keepSessionAlive);
    window.addEventListener('resume', keepSessionAlive);

    return () => {
      document.removeEventListener("touchstart", captureGesture);
      document.removeEventListener("click", captureGesture);
      document.removeEventListener("pointerdown", captureGesture);
      window.removeEventListener('pagehide', keepSessionAlive);
      window.removeEventListener('freeze', keepSessionAlive);
      window.removeEventListener('resume', keepSessionAlive);
    };
  }, []);


  useEffect(() => {
    loadYouTubeAPI().then(() => {
      const el = document.getElementById(containerId);
      if (!el) return;

      playerRef.current = new window.YT.Player(containerId, {
        height: "100%",
        width: "100%",
        playerVars: {
          autoplay: 0, // Changed to 0 to prevent accidental autoplay on reload if not requested
          controls: 0,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          iv_load_policy: 3,
          cc_load_policy: 0,
          fs: 1,
          disablekb: 1,
          origin: window.location.origin,
          enablejsapi: 1,
        },
        events: {
          onReady: () => {
            const iframe = playerRef.current?.getIframe?.() as HTMLIFrameElement | null;
            if (iframe) {
              iframe.setAttribute('allowfullscreen', 'true');
              const allowTokens = new Set(
                (iframe.getAttribute('allow') || '')
                  .split(';')
                  .map((t) => t.trim())
                  .filter(Boolean)
              );
              ['autoplay', 'encrypted-media', 'picture-in-picture', 'fullscreen'].forEach((t) => allowTokens.add(t));
              iframe.setAttribute('allow', Array.from(allowTokens).join('; '));
            }
            applyVolumeToPlayer(targetVolumeRef.current);
            // Apply persisted captions preference
            try {
              const p: any = playerRef.current;
              const enabled = loadCaptionsPref();
              if (enabled) {
                p?.loadModule?.('captions');
                p?.loadModule?.('cc');
              } else {
                p?.unloadModule?.('captions');
                p?.unloadModule?.('cc');
              }
            } catch {}

            // Apply persisted quality preference & watch YT quality changes
            try {
              const p: any = playerRef.current;
              const savedQ = loadQualityPref();
              // Lock the range from the very start — this is what YT actually respects.
              enforceQualityCap(p, savedQ);
              dispatchQualityChanged(savedQ);
              // Report initial actual quality (if available) and keep it in sync as YT switches.
              try {
                const active = p?.getPlaybackQuality?.();
                if (active) dispatchQualityActive(active);
              } catch {}
              p?.addEventListener?.('onPlaybackQualityChange', (ev: any) => {
                const q = typeof ev === 'string' ? ev : ev?.data;
                if (!q) return;
                const pref = loadQualityPref();
                // If user has a locked preference and YT drifted to a different
                // level (ABR downgrade, video switch, etc.), re-cap immediately
                // without a destructive reload — this eliminates the
                // min↔max oscillation the user reported.
                if (pref !== "auto" && q !== pref) {
                  enforceQualityCap(playerRef.current, pref);
                  // Don't dispatch the transient mismatch to the UI — keeps the
                  // badge stable while we re-lock.
                  return;
                }
                dispatchQualityActive(q);
              });
            } catch {}

            // Re-apply adaptive cap when the network changes (Network Info API).
            // Only relevant while the user preference is "auto" — locked resolutions stay locked.
            try {
              const conn: any = (navigator as any).connection;
              if (conn && typeof conn.addEventListener === "function") {
                const onNet = () => {
                  if (loadQualityPref() === "auto" && playerRef.current) {
                    enforceQualityCap(playerRef.current, "auto");
                  }
                };
                conn.addEventListener("change", onNet);
              }
            } catch {}
            
            // Restore playback position on initial ready
            if (state.videoId) {
              try {
                const savedTime = localStorage.getItem('demus-current-time');
                const startSeconds = savedTime ? parseFloat(savedTime) : 0;
                
                // Cue or Load without autoplaying immediately unless it was already playing
                // (though usually we want to return to the frame, not necessarily play)
                playerRef.current.cueVideoById({
                  videoId: state.videoId,
                  startSeconds: startSeconds
                });
                console.log('[YT] Restored video pos:', state.videoId, '@', startSeconds);
              } catch (e) {
                console.warn('[YT] Failed to restore pos:', e);
              }
            }

            setState((s) => ({ ...s, isReady: true }));
          },
          onStateChange: (event: any) => {
            const playing = event.data === window.YT.PlayerState.PLAYING;
            const paused = event.data === window.YT.PlayerState.PAUSED;
            const ended = event.data === window.YT.PlayerState.ENDED;
            const buffering = event.data === window.YT.PlayerState.BUFFERING;
            const isHidden = document.visibilityState === 'hidden';

            // Handle playlist progression for Xerife Videos
            if (ended) {
              if (currentPlaylistVideos.length > 0 && currentPlaylistIndex < currentPlaylistVideos.length - 1) {
                const nextIndex = currentPlaylistIndex + 1;
                const nextVideo = currentPlaylistVideos[nextIndex];
                currentPlaylistIndex = nextIndex;
                
                console.info('[YT] Playlist auto-advance:', nextVideo.title);
                window.dispatchEvent(new CustomEvent('demus:playlist-next', { 
                  detail: { video: nextVideo, index: nextIndex } 
                }));
              }
            }

            // CRITICAL: Check persisted pause flag before allowing playback
            if (playing && checkUserPausedFlag()) {
              console.log('[YT] Play BLOCKED - persisted user pause flag found');
              playerRef.current?.pauseVideo?.();
              setState((s) => ({ ...s, isPlaying: false, isEnded: false }));
              return;
            }

            console.info('[YT onStateChange]', {
              state: playing ? 'PLAYING' : paused ? 'PAUSED' : ended ? 'ENDED' : buffering ? 'BUFFERING' : 'OTHER',
              isHidden,
              userPaused: userPausedRef.current,
              shouldBePlaying: shouldBePlayingRef.current,
            });

            // ── Handle PAUSED state ──
            if (paused) {
              const timeSincePause = Date.now() - pauseTimestampRef.current;

              // Página oculta (tela bloqueada / app em segundo plano):
              // se NÃO foi o usuário que pausou, o iOS/Android suspendeu a mídia.
              // Precisamos reanimar a sessão de áudio e retomar o player,
              // garantindo continuidade da reprodução.
              if (isHidden) {
                if (!userPausedRef.current && !checkUserPausedFlag() && shouldBePlayingRef.current) {
                  console.info('[YT] Pausa do sistema em background — retomando');
                  try { ensureSilentAudio().play().catch(() => {}); } catch {}
                  try { ensureProxyAudio().play().catch(() => {}); } catch {}
                  resumeAudioContext();
                  window.setTimeout(() => {
                    if (
                      shouldBePlayingRef.current &&
                      !userPausedRef.current &&
                      !checkUserPausedFlag()
                    ) {
                      try { playerRef.current?.playVideo?.(); } catch {}
                    }
                  }, 120);
                } else {
                  console.info('[YT] Pausa em background solicitada pelo usuário — mantendo pausado');
                }
                return;
              }

              // Página visível e acabamos de chamar pause() (dentro de 500ms): legítimo
              if (timeSincePause < 500 && userPausedRef.current) {
                console.info('[YT] Paused while visible - legitimate user pause');
                setState((s) => ({ ...s, isPlaying: false, isEnded: false }));
                return;
              }
            }

            // ── Handle PLAYING state ──
            if (playing) {
              // Só suprime se o usuário pausou há muito pouco tempo (proteção
              // contra o autoplay do iframe imediatamente após um pause).
              if (userPausedRef.current) {
                const timeSincePause = Date.now() - pauseTimestampRef.current;
                if (timeSincePause < 1200) {
                  console.info('[YT] Suppressing play - pause acabou de acontecer');
                  playerRef.current?.pauseVideo?.();
                  setState((s) => ({ ...s, isPlaying: false, isEnded: false, duration: playerRef.current?.getDuration?.() || s.duration }));
                  return;
                }
                console.info('[YT] Limpando flag de pausa antiga — play permitido');
                userPausedRef.current = false;
                clearUserPausedFlag();
              }

              shouldBePlayingRef.current = true; setShouldBePlayingGlobal(true);
              errorCountRef.current = 0;
              ensureSilentAudio().play().catch(() => {});
              ensureProxyAudio().play().catch(() => {});
              resumeAudioContext();
              applyVolumeToPlayer(targetVolumeRef.current);
              // Clipe trocado: verifica o pouso assim que ha reproducao real,
              // antes mesmo do proximo tick do polling de 500ms.
              runClipSyncCheck();
              // Notify listeners (quality-loading cleanup, etc.) that playback resumed.
              try { window.dispatchEvent(new CustomEvent('demus:playing')); } catch {}
            }


            // REMOVED: Auto-resume logic for system pauses
            // User must explicitly play if they want to resume

            if (ended) {
              shouldBePlayingRef.current = false; setShouldBePlayingGlobal(false);
            }

            setState((s) => ({
              ...s,
              isPlaying: playing || buffering,
              isEnded: ended,
              duration: playerRef.current?.getDuration?.() || 0,
            }));
          },
          onError: (event: any) => {
            console.warn("YouTube player error:", event.data);
            errorCountRef.current++;
            shouldBePlayingRef.current = false; setShouldBePlayingGlobal(false);
            // Only auto-advance if we haven't hit too many consecutive errors
            if (errorCountRef.current <= 3) {
              setState((s) => ({ ...s, isEnded: true, isPlaying: false }));
            } else {
              // Stop trying after 3 consecutive errors to avoid infinite loops
              setState((s) => ({ ...s, isPlaying: false, isEnded: false }));
            }
          },
        },
      });
    });

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      stopClipSyncWatch();
      playerRef.current?.destroy?.();
    };
  }, [containerId, applyVolumeToPlayer, runClipSyncCheck, stopClipSyncWatch]);


  // ── Audio Focus / Interruption handling (phone calls, other media apps) ──
  // Web equivalent of Android's AudioFocusRequest / iOS's AVAudioSession interruption
  useEffect(() => {
    const silentEl = ensureSilentAudio();

    // When silent audio is interrupted (phone call, Siri, other app),
    // the browser fires pause/play events on audio elements.
    const handleInterruption = () => {
      // Não tratamos interrupções de background como pausa do usuário.
      if (shouldBePlayingRef.current && !userPausedRef.current) {
        hasAudioFocus = false;
        focusLossTime = Date.now();
        console.info('[AudioFocus] Lost — reanimando sessão de áudio silenciosa');
        // Reanima o elemento silencioso para não perder a sessão de áudio
        // (do contrário o iOS encerra a reprodução em background).
        window.setTimeout(() => {
          if (shouldBePlayingRef.current && !userPausedRef.current) {
            try { ensureSilentAudio().play().catch(() => {}); } catch {}
            resumeAudioContext();
          }
        }, 150);
      }
    };


    const handleFocusRegain = () => {
      // CRITICAL: NEVER auto-resume, even if we think we should be playing
      // The user or MediaSession API will explicitly call play() if needed
      console.info('[AudioFocus] Regained - NOT auto-resuming (user must explicitly play)');
      hasAudioFocus = true;
      // Just mark that we have focus again, don't do anything else
    };

    silentEl.addEventListener('pause', handleInterruption);
    silentEl.addEventListener('play', handleFocusRegain);

    return () => {
      silentEl.removeEventListener('pause', handleInterruption);
      silentEl.removeEventListener('play', handleFocusRegain);
    };
  }, [applyVolumeToPlayer]);

  // ── Keep audio session alive when page goes to background (lock screen / app switch) ──
  useEffect(() => {
    const handleVisibility = () => {
      const vs = document.visibilityState;
      if (vs === 'hidden') {
        hiddenSinceRef.current ??= Date.now();
      } else {
        hiddenSinceRef.current = null;
      }
      trackMetric('visibility', 'player', {
        state: vs,
        shouldBePlaying: shouldBePlayingRef.current,
        userPaused: userPausedRef.current,
        hiddenSince: hiddenSinceRef.current,
      });


      if (document.visibilityState === 'hidden' && shouldBePlayingRef.current && !userPausedRef.current) {
        // Mantém a sessão de áudio viva E garante que o player continue tocando.
        const audio = ensureSilentAudio();
        audio.play().catch(() => {});
        ensureProxyAudio().play().catch(() => {});
        resumeAudioContext();

        // O iOS/Android costuma suspender o iframe ao sair do app: reanimamos
        // o player logo após a transição para background.
        window.setTimeout(() => {
          if (!shouldBePlayingRef.current || userPausedRef.current || checkUserPausedFlag()) return;
          try { playerRef.current?.playVideo?.(); } catch {}
        }, 250);

        try {
          navigator.serviceWorker?.controller?.postMessage({
            type: 'MEDIA_PLAYBACK_STATE',
            playing: true,
          });
        } catch {}

        // Heartbeat: mantém áudio silencioso vivo e retoma o player se o
        // sistema o tiver pausado sem ação do usuário.
        if (!bgIntervalRef.current) {
          const heartbeatInterval = browserRef.current === 'safari' ? 2000 : 3000;
          bgIntervalRef.current = setInterval(() => {
            if (userPausedRef.current || !shouldBePlayingRef.current || checkUserPausedFlag()) {
              clearInterval(bgIntervalRef.current);
              bgIntervalRef.current = undefined;
              return;
            }
            const sa = ensureSilentAudio();
            if (sa.paused) sa.play().catch(() => {});
            const pa = ensureProxyAudio();
            if (pa.paused) pa.play().catch(() => {});
            resumeAudioContext();
            // Se o player não está tocando, mas deveria, retoma.
            try {
              const st = playerRef.current?.getPlayerState?.();
              const YTStates = window.YT?.PlayerState;
              if (
                YTStates &&
                st !== YTStates.PLAYING &&
                st !== YTStates.BUFFERING &&
                st !== YTStates.ENDED
              ) {
                playerRef.current?.playVideo?.();
              }
            } catch {}
            try {
              navigator.serviceWorker?.controller?.postMessage({ type: 'HEARTBEAT' });
              localStorage.setItem('__bg_ts', Date.now().toString());
            } catch {}
          }, heartbeatInterval);
        }
      } else if (document.visibilityState === 'visible') {

        if (bgIntervalRef.current) {
          clearInterval(bgIntervalRef.current);
          bgIntervalRef.current = undefined;
        }
        hasAudioFocus = true;
        syncPlaybackStateFromPlayer('visibility-visible');
        window.setTimeout(() => syncPlaybackStateFromPlayer('visibility-visible-settled'), 300);
        console.info('[Visibility] App became visible - state synchronized without auto-resume');
        
        try {
          navigator.serviceWorker?.controller?.postMessage({
            type: 'MEDIA_PLAYBACK_STATE',
            playing: shouldBePlayingRef.current,
          });
        } catch {}
      }
    };

    // Freeze/resume events (iOS Safari aggressive background throttle)
    const handleFreeze = () => {
      if (shouldBePlayingRef.current && !userPausedRef.current) {
        try { localStorage.setItem('__was_playing', '1'); } catch {}
      }
    };
    const handleResume = () => {
      const wasPlaying = (() => {
        try { return localStorage.getItem('__was_playing') === '1'; } catch { return false; }
      })();
      const iosLike = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      // iOS fallback: when the OS resumes the page after a freeze/lock, the audio
      // session may have been suspended. Recreate silent/proxy audio and resume.
      if (iosLike && !userPausedRef.current && (shouldBePlayingRef.current || wasPlaying)) {
        try { ensureSilentAudio().play().catch(() => {}); } catch {}
        try { ensureProxyAudio().play().catch(() => {}); } catch {}
        resumeAudioContext();
        try { playerRef.current?.playVideo?.(); } catch {}
        shouldBePlayingRef.current = true; setShouldBePlayingGlobal(true);
        setShouldBePlayingGlobal(true);
        console.info('[Resume] iOS auto-resume triggered');
      }
      syncPlaybackStateFromPlayer('page-resume');
      window.setTimeout(() => syncPlaybackStateFromPlayer('page-resume-settled'), 300);
      try { localStorage.removeItem('__was_playing'); } catch {}
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);
    window.addEventListener('pageshow', handleResume);
    window.addEventListener('pagehide', handleFreeze);
    document.addEventListener('freeze', handleFreeze);
    document.addEventListener('resume', handleResume);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
      window.removeEventListener('pageshow', handleResume);
      window.removeEventListener('pagehide', handleFreeze);
      document.removeEventListener('freeze', handleFreeze);
      document.removeEventListener('resume', handleResume);
      if (bgIntervalRef.current) {
        clearInterval(bgIntervalRef.current);
        bgIntervalRef.current = undefined;
      }
    };
  }, [applyVolumeToPlayer, syncPlaybackStateFromPlayer]);

  // Track progress and persist state
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      const ct = playerRef.current?.getCurrentTime?.() || 0;
      const dur = playerRef.current?.getDuration?.() || 0;
      
      // Update local state
      setState((s) => ({ ...s, currentTime: ct, duration: dur }));
      
      // Persist to localStorage for app recovery
      if (ct > 0) {
        localStorage.setItem('demus-current-time', ct.toString());
        localStorage.setItem('demus-current-duration', dur.toString());
      }
    }, 1000); // 1s interval is sufficient for persistence

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []); // Run always to track position even if paused (but player API only returns ct if ready)

  const loadVideo = useCallback((videoId: string) => {
    // Troca de faixa invalida qualquer alvo de alinhamento da faixa anterior.
    stopClipSyncWatch();
    clipSyncRef.current = { ...clipSyncRef.current, targetSec: null, corrections: 0, userSeekedSince: false };
    if (playerRef.current?.loadVideoById) {
      clearUserPausedFlag(); // Clear persistent flag when loading new video
      userPausedRef.current = false;
      shouldBePlayingRef.current = true; setShouldBePlayingGlobal(true);
      errorCountRef.current = 0;
      ensureSilentAudio().play().catch(() => {});
      resumeAudioContext();

      // ── Padroniza a qualidade para TODOS os vídeos ─────────────────────
      // Sem esta etapa, YT escolhe uma resolução com base no tamanho atual
      // do iframe e só depois o hint é aplicado — provocando a alternância
      // visível entre a mínima (small/tiny) e a máxima. Aqui:
      //  1) Aplicamos a trava de faixa (setPlaybackQualityRange) ANTES do
      //     load — YT respeita o cap desde o primeiro frame.
      //  2) Redimensionamos o iframe brevemente para a resolução alvo
      //     (mesmo truque usado no seletor manual) para induzir a ABR.
      //  3) Passamos `suggestedQuality` no próprio loadVideoById.
      const p: any = playerRef.current;
      const savedQ = loadQualityPref();
      enforceQualityCap(p, savedQ);

      const iframe = p.getIframe?.() as HTMLIFrameElement | null;
      let restoreIframe: { w: string; h: string } | null = null;
      if (iframe && savedQ !== "auto" && QUALITY_PX_MAP[savedQ]) {
        restoreIframe = { w: iframe.style.width, h: iframe.style.height };
        const { w, h } = QUALITY_PX_MAP[savedQ];
        iframe.style.width = `${w}px`;
        iframe.style.height = `${h}px`;
        iframe.setAttribute("width", String(w));
        iframe.setAttribute("height", String(h));
      }

      if (savedQ && savedQ !== "auto") {
        try { p.loadVideoById({ videoId, suggestedQuality: savedQ }); }
        catch { p.loadVideoById(videoId); }
      } else {
        p.loadVideoById(videoId);
      }

      applyVolumeToPlayer(targetVolumeRef.current);
      setTimeout(() => applyVolumeToPlayer(targetVolumeRef.current), 200);

      // Reforça a trava após o load (YT reseta parâmetros internos ao trocar
      // de vídeo) e devolve o iframe ao tamanho visual normal.
      setTimeout(() => {
        enforceQualityCap(playerRef.current, loadQualityPref());
        if (iframe && restoreIframe) {
          iframe.style.width = restoreIframe.w || "100%";
          iframe.style.height = restoreIframe.h || "100%";
          iframe.setAttribute("width", "100%");
          iframe.setAttribute("height", "100%");
        }
      }, 1200);

      setState((s) => ({ ...s, videoId, currentTime: 0, isEnded: false }));
      console.log('[YT] Loading new video:', videoId, 'quality-lock:', savedQ);
    }
  }, [applyVolumeToPlayer, clearUserPausedFlag]);

  /**
   * Xerife Music — troca o clipe do modo Vídeo preservando o instante de
   * reprodução do áudio, com crossfade curto (~180ms) para evitar estalos.
   * `startSeconds` deve ser `audioTime + clipOffsetSeconds`.
   */
  const loadVideoAt = useCallback((videoId: string, startSeconds: number, opts?: { crossfade?: boolean }) => {
    const p: any = playerRef.current;
    if (!p?.loadVideoById) return;
    clearUserPausedFlag();
    userPausedRef.current = false;
    shouldBePlayingRef.current = true; setShouldBePlayingGlobal(true);
    errorCountRef.current = 0;
    ensureSilentAudio().play().catch(() => {});
    resumeAudioContext();

    const savedQ = loadQualityPref();
    enforceQualityCap(p, savedQ);

    const prefersReduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const doFade = opts?.crossfade !== false && !prefersReduced;
    const originalVol = targetVolumeRef.current;

    const applyLoad = () => {
      try {
        const payload: any = { videoId, startSeconds: Math.max(0, startSeconds || 0) };
        if (savedQ && savedQ !== "auto") payload.suggestedQuality = savedQ;
        p.loadVideoById(payload);
      } catch {
        try { p.loadVideoById(videoId); } catch {}
      }
      setState((s) => ({ ...s, videoId, currentTime: Math.max(0, startSeconds || 0), isEnded: false }));
      // Re-enforce cap + volume shortly after
      setTimeout(() => enforceQualityCap(playerRef.current, loadQualityPref()), 1200);
      // O YouTube ancora em keyframe, nao no segundo pedido: abre a janela de
      // observacao para corrigir o pouso com no maximo 2 seeks discretos.
      startClipSyncWatch(Math.max(0, startSeconds || 0));
    };

    if (doFade) {
      try { p.setVolume?.(Math.max(0, Math.min(100, Math.round(originalVol * 0.15)))); } catch {}
      // Small delay so YT applies the mute before the reload cutover
      setTimeout(() => {
        applyLoad();
        // Fade back in once YT starts producing frames
        setTimeout(() => applyVolumeToPlayer(originalVol), 220);
        setTimeout(() => applyVolumeToPlayer(originalVol), 600);
      }, 90);
    } else {
      applyLoad();
      applyVolumeToPlayer(originalVol);
    }
  }, [applyVolumeToPlayer, clearUserPausedFlag, startClipSyncWatch]);

  /**
   * Pré-carrega o clipe oficial em um iframe oculto para aquecer o cache do
   * YouTube/CDN — a primeira frame no modo Vídeo aparece muito mais rápido.
   * Auto-remove em 60s.
   */
  const preloadClip = useCallback((videoId: string) => {
    if (!videoId || typeof document === "undefined") return;
    const id = `xerife-preload-${videoId}`;
    if (document.getElementById(id)) return;
    try {
      const f = document.createElement("iframe");
      f.id = id;
      f.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=0&mute=1&controls=0&modestbranding=1&rel=0&iv_load_policy=3`;
      f.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;border:0;";
      f.setAttribute("aria-hidden", "true");
      f.setAttribute("tabindex", "-1");
      (f as any).loading = "eager";
      document.body.appendChild(f);
      setTimeout(() => { try { f.remove(); } catch {} }, 60_000);
    } catch {}
  }, []);


  const play = useCallback(() => {
    trackMetric('play', 'player', { hidden: document.visibilityState === 'hidden' });
    console.info('[Player] play() called - clearing user pause flag');
    clearUserPausedFlag(); // Clear persistent flag
    userPausedRef.current = false;
    shouldBePlayingRef.current = true; setShouldBePlayingGlobal(true);
    pauseTimestampRef.current = 0; // Reset pause timestamp
    try { localStorage.removeItem('__was_playing'); } catch {}
    setState((s) => ({ ...s, isPlaying: true, isEnded: false }));
    ensureSilentAudio().play().catch((e) => trackMetric('error', 'silent-audio-play', { msg: String(e) }));
    ensureProxyAudio().play().catch((e) => trackMetric('error', 'proxy-audio-play', { msg: String(e) }));
    resumeAudioContext();
    requestWakeLock();
    playerRef.current?.playVideo?.();
    applyVolumeToPlayer(targetVolumeRef.current);

    // Em segundo plano / tela bloqueada o iframe pode ignorar o primeiro
    // playVideo() (sessão de áudio ainda reativando). Tentamos novamente.
    if (document.visibilityState === 'hidden') {
      [200, 600, 1200].forEach((delay) => {
        window.setTimeout(() => {
          if (!shouldBePlayingRef.current || userPausedRef.current) return;
          try {
            const st = playerRef.current?.getPlayerState?.();
            const YTStates = window.YT?.PlayerState;
            if (!YTStates || (st !== YTStates.PLAYING && st !== YTStates.BUFFERING)) {
              ensureSilentAudio().play().catch(() => {});
              ensureProxyAudio().play().catch(() => {});
              resumeAudioContext();
              playerRef.current?.playVideo?.();
              applyVolumeToPlayer(targetVolumeRef.current);
            }
          } catch {}
        }, delay);
      });
    }
  }, [applyVolumeToPlayer, clearUserPausedFlag]);


  const pause = useCallback(() => {
    trackMetric('pause', 'player', { hidden: document.visibilityState === 'hidden' });
    console.info('[Player] pause() called - marking user pause intent');
    setUserPausedFlag(); // Set persistent flag
    markUserPausedIntent();
    ensureProxyAudio().pause(); // Pause proxy for iOS MediaSession
    playerRef.current?.pauseVideo?.();
  }, [markUserPausedIntent, setUserPausedFlag]);

  const seekTo = useCallback((seconds: number) => {
    const player = playerRef.current;
    if (!player?.seekTo) return;

    // Intencao manual do usuario: derruba qualquer correcao pendente do guard
    // (o seek do guard chama player.seekTo direto, nunca este wrapper).
    if (clipSyncRef.current?.targetSec != null) {
      clipSyncRef.current.userSeekedSince = true;
      stopClipSyncWatch();
      clipSyncRef.current.targetSec = null;
    }

    const duration = player.getDuration?.() || 0;
    const safeSeconds = Number.isFinite(seconds)
      ? Math.max(0, duration > 0 ? Math.min(seconds, duration) : seconds)
      : 0;

    setState((s) => ({
      ...s,
      currentTime: safeSeconds,
      duration: duration || s.duration,
      isEnded: false,
    }));

    player.seekTo(safeSeconds, true);
    applyVolumeToPlayer(targetVolumeRef.current);

    if (shouldBePlayingRef.current && !userPausedRef.current) {
      ensureSilentAudio().play().catch(() => {});
      resumeAudioContext();
      player.playVideo?.();
    }

    setTimeout(() => {
      const confirmedTime = playerRef.current?.getCurrentTime?.() || 0;
      if (Math.abs(confirmedTime - safeSeconds) > 1.5) {
        playerRef.current?.seekTo?.(safeSeconds, true);
        if (shouldBePlayingRef.current && !userPausedRef.current) {
          playerRef.current?.playVideo?.();
        }
      }
    }, 250);
  }, [applyVolumeToPlayer]);

  const setVolume = useCallback((vol: number) => {
    applyVolumeToPlayer(vol);
  }, [applyVolumeToPlayer]);

  const pipBusyRef = useRef(false);
  const togglePiP = useCallback(async (): Promise<'native' | 'fallback' | 'failed'> => {
    if (pipBusyRef.current) {
      trackMetric('pip', 'toggle-skipped-busy');
      return 'fallback';
    }
    pipBusyRef.current = true;
    trackMetric('pip', 'toggle-start');
    try {
      const iframe = playerRef.current?.getIframe?.() as HTMLIFrameElement | null;
      if (!iframe) { pipBusyRef.current = false; return 'fallback'; }

      if (!iframe.allow?.includes('picture-in-picture')) {
        iframe.allow = (iframe.allow || '') + '; picture-in-picture';
      }

      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          const video = iframeDoc.querySelector('video');
          if (video) {
            if ((video as any).webkitSetPresentationMode) {
              const currentMode = (video as any).webkitPresentationMode;
              (video as any).webkitSetPresentationMode(
                currentMode === 'picture-in-picture' ? 'inline' : 'picture-in-picture'
              );
              return 'native';
            }
            if (video.requestPictureInPicture) {
              if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
              } else {
                await video.requestPictureInPicture();
              }
              return 'native';
            }
          }
        }
      } catch {
        // Cross-origin — expected for YouTube embeds
      }

      if ('documentPictureInPicture' in window) {
        try {
          const docPiP = (window as any).documentPictureInPicture;
          if (docPiP.window) {
            docPiP.window.close();
            return 'native';
          }
          const pipWindow = await docPiP.requestWindow({ width: 320, height: 180 });
          const pipIframe = pipWindow.document.createElement('iframe');
          const videoId = state.videoId;
          if (videoId) {
            pipIframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1&controls=1`;
            pipIframe.style.cssText = 'width:100%;height:100%;border:none;';
            pipIframe.allow = 'autoplay; encrypted-media; picture-in-picture';
            pipWindow.document.body.style.margin = '0';
            pipWindow.document.body.style.overflow = 'hidden';
            pipWindow.document.body.appendChild(pipIframe);
          }
          return 'native';
        } catch {
          // Document PiP denied
        }
      }

      pipBusyRef.current = false;
      return 'fallback';
    } catch (err) {
      console.warn('PiP not available:', err);
      trackMetric('error', 'pip-toggle', { msg: String(err) });
      pipBusyRef.current = false;
      return 'fallback';
    } finally {
      // Release lock shortly after to allow native transition events to settle.
      setTimeout(() => { pipBusyRef.current = false; }, 400);
    }
  }, [state.videoId]);

  const requestFullscreen = useCallback(async (preferredTarget?: HTMLElement | null) => {
    const videoContainer = document.getElementById('yt-fullscreen-container') as HTMLElement | null;
    const offlinePlayer = document.getElementById('offline-player') as HTMLVideoElement | null;

    const isOfflinePlayerVisible =
      !!offlinePlayer &&
      !offlinePlayer.classList.contains('hidden') &&
      offlinePlayer.getBoundingClientRect().width > 0 &&
      offlinePlayer.getBoundingClientRect().height > 0;

    // Always prefer the yt-fullscreen-container (it holds the YouTube iframe + FullscreenOverlay),
    // even if it's currently off-screen — it will be repositioned via the isFullscreen class.
    const target =
      preferredTarget ||
      (isOfflinePlayerVisible ? offlinePlayer : null) ||
      videoContainer ||
      playerRef.current?.getIframe?.()?.parentElement;

    if (!target) return;

    const enterPseudoFullscreen = () => {
      pseudoFullscreenRef.current = target;
      target.classList.add('pseudo-fullscreen');
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      trackMetric('fullscreen', 'enter-pseudo');
      setState((s) => (s.isFullscreen ? s : { ...s, isFullscreen: true }));
    };
    trackMetric('fullscreen', 'request');

    try {
      const targetAny = target as any;
      let usedLegacyVideoFullscreen = false;

      if (target.requestFullscreen) {
        await target.requestFullscreen();
      } else if (targetAny.webkitRequestFullscreen) {
        targetAny.webkitRequestFullscreen();
      } else if (typeof targetAny.webkitEnterFullscreen === 'function') {
        usedLegacyVideoFullscreen = true;
        targetAny.webkitEnterFullscreen();
        setState((s) => ({ ...s, isFullscreen: true }));
      } else {
        enterPseudoFullscreen();
      }

      if (!usedLegacyVideoFullscreen) {
        await new Promise((resolve) => window.setTimeout(resolve, 120));
        const nativeActive = !!document.fullscreenElement || !!(document as any).webkitFullscreenElement;
        if (!nativeActive) {
          enterPseudoFullscreen();
        }
      }

      // Sem screen.orientation.lock(): a orientação segue a configuração
      // (bloqueio de rotação) do próprio dispositivo.

    } catch (err) {
      console.warn("Fullscreen request failed:", err);
      enterPseudoFullscreen();
    }
  }, []);

  const exitFullscreen = useCallback(async () => {
    const clearPseudo = () => {
      if (pseudoFullscreenRef.current) {
        pseudoFullscreenRef.current.classList.remove('pseudo-fullscreen');
      }
      pseudoFullscreenRef.current = null;
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };

    try {
      const offlinePlayer = document.getElementById('offline-player') as HTMLVideoElement | null;

      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if ((document as any).webkitFullscreenElement && (document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      } else if (offlinePlayer && (offlinePlayer as any).webkitDisplayingFullscreen && typeof (offlinePlayer as any).webkitExitFullscreen === 'function') {
        (offlinePlayer as any).webkitExitFullscreen();
      }
    } catch (err) {
      console.warn("Exit fullscreen failed:", err);
    }

    clearPseudo();
    setState((s) => ({ ...s, isFullscreen: false }));
  }, []);


  // Track fullscreen state
  useEffect(() => {
    const handleFsChange = () => {
      const isFs =
        !!document.fullscreenElement ||
        !!(document as any).webkitFullscreenElement ||
        !!pseudoFullscreenRef.current;

      if (!isFs) {
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
        if (pseudoFullscreenRef.current) {
          pseudoFullscreenRef.current.classList.remove('pseudo-fullscreen');
        }
        pseudoFullscreenRef.current = null;
      }

      trackMetric('fullscreen', 'change', { isFs });
      // Idempotent update — avoid re-rendering (and remounting overlay) when value is unchanged.
      setState((s) => (s.isFullscreen === isFs ? s : { ...s, isFullscreen: isFs }));
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    document.addEventListener("webkitfullscreenchange", handleFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFsChange);
      document.removeEventListener("webkitfullscreenchange", handleFsChange);
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      if (pseudoFullscreenRef.current) {
        pseudoFullscreenRef.current.classList.remove('pseudo-fullscreen');
      }
      pseudoFullscreenRef.current = null;
    };
  }, []);

  const requestAirPlay = useCallback(async (mode: 'audio' | 'video') => {
    try {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

      // Chromium (desktop + Android): prefer Google Cast device picker.
      if (!isIOS && isCastSupported()) {
        const ok = await loadCastSdk();
        if (ok) {
          const vid = state.videoId;
          if (vid) {
            const casted = await castYouTubeVideo({
              videoId: vid,
              title: (document.title || "Xerife Videos"),
              thumbnail: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
            });
            if (casted) return;
          }
        }
      }

      // iOS: prefer native AirPlay picker via the iframe's Remote Playback API.
      if (mode === 'video') {
        const iframe = playerRef.current?.getIframe?.() as HTMLIFrameElement | null;
        if (iframe && 'remote' in iframe) {
          await (iframe as any).remote.prompt();
          return;
        }
      }

      const audio = ensureSilentAudio();

      if ((audio as any).webkitShowPlaybackTargetPicker) {
        (audio as any).webkitShowPlaybackTargetPicker();
        return;
      }

      if ('remote' in audio) {
        await (audio as any).remote.prompt();
        return;
      }

      console.warn('AirPlay/Cast not supported on this browser');
    } catch (err) {
      console.warn('AirPlay/Cast error:', err);
    }
  }, [state.videoId]);

  const setPlaybackRate = useCallback((rate: number) => {
    try {
      playerRef.current?.setPlaybackRate?.(rate);
    } catch (e) {
      console.warn('setPlaybackRate error:', e);
    }
  }, []);

  // Listen to global quality-change requests dispatched from UI (VideoInfoBar quality selector).
  //
  // NOTE: YouTube IFrame API's `setPlaybackQuality` has been effectively deprecated
  // for years — the player auto-picks quality based on iframe size and ignores the hint.
  // To force a real visible resolution change we must reload the current video with
  // `suggestedQuality` via `loadVideoById(...)` at the exact playhead position, which
  // is the only supported way to influence quality selection today.
  useEffect(() => {
    // Debounce + in-flight guard
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let loadingTimer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let inFlight = false;
    let pending: string | null = null;
    const DEBOUNCE_MS = 350;
    const LOADING_MAX_MS = 4000;

    // Pixel dimensions per YT quality label — used to briefly resize the iframe
    // so YouTube's ABR picks the resolution we asked for (it decides based on
    // iframe.clientWidth at load time; small iframe = low quality no matter what).
    const QUALITY_PX: Record<string, { w: number; h: number }> = {
      hd2160: { w: 3840, h: 2160 },
      hd1440: { w: 2560, h: 1440 },
      hd1080: { w: 1920, h: 1080 },
      hd720:  { w: 1280, h: 720 },
      large:  { w: 854,  h: 480 },
      medium: { w: 640,  h: 360 },
      small:  { w: 426,  h: 240 },
      tiny:   { w: 256,  h: 144 },
    };

    const publishAvailable = () => {
      try {
        const p: any = playerRef.current;
        const list: string[] = p?.getAvailableQualityLevels?.() || [];
        if (list && list.length) {
          window.dispatchEvent(new CustomEvent('demus:quality-available', { detail: list }));
        }
      } catch {}
    };

    const startActivePolling = (targetQ: string) => {
      if (pollTimer) clearInterval(pollTimer);
      const started = Date.now();
      pollTimer = setInterval(() => {
        try {
          const p: any = playerRef.current;
          const active = p?.getPlaybackQuality?.();
          if (active && active !== 'unknown') {
            dispatchQualityActive(active);
          }
          publishAvailable();
          // Stop polling once the target is reached OR after 6s
          if ((targetQ !== 'auto' && active === targetQ) || Date.now() - started > 6000) {
            if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
          }
        } catch {}
      }, 500);
    };

    const QUALITY_LABEL: Record<string, string> = {
      auto: "Automática",
      hd2160: "2160p (4K)",
      hd1440: "1440p (2K)",
      hd1080: "1080p (HD)",
      hd720: "720p (HD)",
      large: "480p",
      medium: "360p",
      small: "240p",
      tiny: "144p",
    };
    const labelOf = (q: string) => QUALITY_LABEL[q] || q;

    const MAX_RETRIES = 2;
    let verifyTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleVerification = (targetQ: string, attempt: number) => {
      if (verifyTimer) clearTimeout(verifyTimer);
      // Give YT 1.6s to commit the new quality after playback resumes.
      verifyTimer = setTimeout(() => {
        try {
          const p: any = playerRef.current;
          if (!p) return;
          const active: string = p.getPlaybackQuality?.() || "unknown";
          const available: string[] = p.getAvailableQualityLevels?.() || [];

          // Auto mode: never treat as mismatch — just confirm what YT chose.
          if (targetQ === "auto") {
            if (active && active !== "unknown") {
              toast.success(`Aplicado: ${labelOf(active)} (auto)`, { id: "quality-verify", duration: 2200 });
              dispatchQualityActive(active);
            }
            return;
          }

          // Unavailable quality for this video → apply nearest fallback but
          // KEEP the user preference intact so the next video can honor it.
          if (available.length && !available.includes(targetQ)) {
            const fallback = pickAvailableQuality(targetQ, available);
            enforceQualityCap(p, targetQ); // will pick the fallback internally
            if (fallback && fallback !== targetQ) {
              toast.info(`${labelOf(targetQ)} indisponível — usando ${labelOf(fallback)}`, {
                id: "quality-verify",
                description: "Sua preferência foi mantida para os próximos vídeos.",
                duration: 3500,
              });
              dispatchQualityActive(fallback);
            }
            return;
          }

          if (active === targetQ) {
            toast.success(`Aplicado: ${labelOf(active)}`, { id: "quality-verify", duration: 2000 });
            dispatchQualityActive(active);
            return;
          }

          // Mismatch → re-cap SEM recarregar o vídeo (evita alternância visível
          // entre resoluções). Só depois de todas as tentativas de cap sem
          // sucesso é que exibimos o erro.
          if (attempt < MAX_RETRIES) {
            enforceQualityCap(p, targetQ);
            scheduleVerification(targetQ, attempt + 1);
          } else {
            // Last resort — still keep the preference; just reflect reality.
            const effective = pickAvailableQuality(targetQ, available);
            if (effective && effective !== targetQ) {
              dispatchQualityActive(effective);
            } else if (active && active !== "unknown") {
              dispatchQualityActive(active);
            }
          }

        } catch (err) {
          console.warn("[quality] verification failed:", err);
        }
      }, 1600);
    };

    const performQualityChange = (quality: string, attempt = 0) => {
      try {
        saveQualityPref(quality);
        dispatchQualityChanged(quality);
        const p: any = playerRef.current;
        if (!p) return;

        const videoId: string | undefined = p.getVideoData?.()?.video_id;
        const startSeconds = Math.max(0, Math.floor(p.getCurrentTime?.() || 0));
        const wasPlaying = p.getPlayerState?.() === window.YT?.PlayerState?.PLAYING;
        if (!videoId) return;

        inFlight = true;
        dispatchQualityLoading(true);

        const iframe = p.getIframe?.() as HTMLIFrameElement | null;

        // === Trick #1: Resize iframe to target resolution so YT ABR serves it ===
        let prevStyle: { w: string; h: string } | null = null;
        if (iframe && quality !== 'auto' && QUALITY_PX[quality]) {
          prevStyle = { w: iframe.style.width, h: iframe.style.height };
          const { w, h } = QUALITY_PX[quality];
          iframe.style.width = `${w}px`;
          iframe.style.height = `${h}px`;
          iframe.setAttribute('width', String(w));
          iframe.setAttribute('height', String(h));
        }

        // === Trick #2: Undocumented setPlaybackQualityRange ===
        try {
          if (quality === 'auto') {
            p.setPlaybackQualityRange?.('small', 'hd2160');
          } else {
            p.setPlaybackQualityRange?.(quality, quality);
          }
        } catch {}
        try { p.setPlaybackQuality?.(quality); } catch {}

        // === Trick #3: Reload the video at same position with the hint ===
        if (quality === 'auto') {
          p.loadVideoById?.({ videoId, startSeconds });
        } else {
          p.loadVideoById?.({ videoId, startSeconds, suggestedQuality: quality });
        }

        setTimeout(() => {
          try {
            try { p.setPlaybackQualityRange?.(quality === 'auto' ? 'small' : quality, quality === 'auto' ? 'hd2160' : quality); } catch {}
            try { p.setPlaybackQuality?.(quality); } catch {}
            if (wasPlaying) p.playVideo?.(); else p.pauseVideo?.();
          } catch {}
          if (iframe && prevStyle) {
            setTimeout(() => {
              iframe.style.width = prevStyle!.w || '100%';
              iframe.style.height = prevStyle!.h || '100%';
              iframe.setAttribute('width', '100%');
              iframe.setAttribute('height', '100%');
            }, 2500);
          }
        }, 400);

        startActivePolling(quality);
        // Schedule the post-change verification (with retry).
        scheduleVerification(quality, attempt);

        if (loadingTimer) clearTimeout(loadingTimer);
        loadingTimer = setTimeout(() => {
          inFlight = false;
          dispatchQualityLoading(false);
          if (pending && pending !== quality) {
            const next = pending; pending = null;
            performQualityChange(next, 0);
          }
        }, LOADING_MAX_MS);
      } catch (err) {
        console.warn('quality change error:', err);
        inFlight = false;
        dispatchQualityLoading(false);
      }
    };

    const onSetQuality = (e: Event) => {
      const quality = (e as CustomEvent<string>).detail;
      if (!quality) return;
      if (inFlight) {
        pending = quality;
        saveQualityPref(quality);
        dispatchQualityChanged(quality);
        return;
      }
      pending = quality;
      saveQualityPref(quality);
      dispatchQualityChanged(quality);
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const next = pending; pending = null;
        if (next) performQualityChange(next);
      }, DEBOUNCE_MS);
    };

    const onPlaying = () => {
      publishAvailable();
      if (!inFlight) return;
      inFlight = false;
      if (loadingTimer) { clearTimeout(loadingTimer); loadingTimer = null; }
      dispatchQualityLoading(false);
      if (pending) {
        const next = pending; pending = null;
        performQualityChange(next);
      }
    };

    // Request from UI to publish available list (menu open).
    const onRequestAvailable = () => publishAvailable();

    window.addEventListener('demus:set-quality', onSetQuality as EventListener);
    window.addEventListener('demus:playing', onPlaying as EventListener);
    window.addEventListener('demus:request-quality-available', onRequestAvailable);
    return () => {
      window.removeEventListener('demus:set-quality', onSetQuality as EventListener);
      window.removeEventListener('demus:playing', onPlaying as EventListener);
      window.removeEventListener('demus:request-quality-available', onRequestAvailable);
      if (debounceTimer) clearTimeout(debounceTimer);
      if (loadingTimer) clearTimeout(loadingTimer);
      if (pollTimer) clearInterval(pollTimer);
      if (verifyTimer) clearTimeout(verifyTimer);
    };
  }, []);


  const applyCaptionsState = useCallback((enabled: boolean) => {
    try {
      const p: any = playerRef.current;
      if (!p) return;
      if (enabled) {
        p.loadModule?.('captions');
        p.loadModule?.('cc');
        try { p.setOption?.('captions', 'reload', true); } catch {}
      } else {
        p.unloadModule?.('captions');
        p.unloadModule?.('cc');
        try { p.setOption?.('captions', 'track', {}); } catch {}
        try { p.setOption?.('cc', 'track', {}); } catch {}
      }
    } catch (e) {
      console.warn('applyCaptionsState error:', e);
    }
  }, []);

  const toggleCaptions = useCallback(() => {
    setState((s) => {
      const next = !s.captionsEnabled;
      applyCaptionsState(next);
      try { localStorage.setItem(CAPTIONS_PREF_KEY, next ? "1" : "0"); } catch {}
      return { ...s, captionsEnabled: next };
    });
  }, [applyCaptionsState]);

  // Cross-tab sync: react to captions preference changes in other tabs
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== CAPTIONS_PREF_KEY) return;
      const next = e.newValue === "1" || e.newValue === "true";
      setState((s) => (s.captionsEnabled === next ? s : { ...s, captionsEnabled: next }));
      applyCaptionsState(next);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [applyCaptionsState]);

  // Live current time direto do IFrame (evita drift do state React em iOS/Windows).
  const getCurrentTime = useCallback(() => {
    try { return Number(playerRef.current?.getCurrentTime?.() || 0); } catch { return 0; }
  }, []);
  return { state, loadVideo, loadVideoAt, preloadClip, play, pause, seekTo, setVolume, togglePiP, requestAirPlay, requestFullscreen, exitFullscreen, setPlaybackRate, toggleCaptions, proxyAudioElement, getCurrentTime };
}
