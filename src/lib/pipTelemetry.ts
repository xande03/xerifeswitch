/**
 * PiP telemetry — records the full Picture-in-Picture lifecycle so we can
 * measure iOS success/denial rates and diagnose failures on real devices.
 *
 * Events are also mirrored to the shared playback metrics buffer (visible via
 * `window.__xerifeMetrics`) AND persisted to localStorage so a session that
 * navigates away or gets suspended in background still has its history when
 * the user reopens the app for debugging.
 */

import { track as trackPlaybackMetric } from "./playbackMetrics";

export type PipEventKind =
  | "request"        // user tapped the PiP button
  | "enter-native"   // native PiP successfully attached (video/webkit/documentPiP)
  | "enter-armed"    // iOS/mobile fallback: fullscreen requested, waiting for OS auto-PiP
  | "enter-fallback" // in-app floating mini player shown (desktop / denied)
  | "active"         // OS confirmed PiP is now visible (enterpictureinpicture event)
  | "leave"          // OS reported PiP closed
  | "denied"         // user or platform rejected the request
  | "timeout"        // 30s armed window elapsed without OS PiP
  | "close-tap";     // user tapped active PiP button to close

export interface PipEvent {
  t: number;
  kind: PipEventKind;
  platform: "ios" | "android" | "web" | "ssr";
  videoId?: string;
  isLive?: boolean;
  standalone?: boolean;
  reason?: string;
  sessionId: string;
}

const STORAGE_KEY = "xerife-pip-telemetry";
const MAX_EVENTS = 300;
let sessionId = "";

function getPlatform(): PipEvent["platform"] {
  if (typeof navigator === "undefined") return "ssr";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "web";
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as any)?.standalone === true
  );
}

function getSessionId(): string {
  if (sessionId) return sessionId;
  try {
    sessionId = sessionStorage.getItem("xerife-pip-session") || "";
  } catch {}
  if (!sessionId) {
    sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    try { sessionStorage.setItem("xerife-pip-session", sessionId); } catch {}
  }
  return sessionId;
}

function loadEvents(): PipEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(-MAX_EVENTS) : [];
  } catch {
    return [];
  }
}

function saveEvents(events: PipEvent[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
  } catch {}
}

export function trackPip(
  kind: PipEventKind,
  extra?: { videoId?: string; isLive?: boolean; reason?: string }
): PipEvent {
  const evt: PipEvent = {
    t: Date.now(),
    kind,
    platform: getPlatform(),
    standalone: isStandalone(),
    sessionId: getSessionId(),
    ...extra,
  };
  const events = loadEvents();
  events.push(evt);
  saveEvents(events);
  // Mirror into shared metrics + console for remote Safari Web Inspector.
  trackPlaybackMetric("pip", kind, {
    videoId: extra?.videoId,
    isLive: extra?.isLive,
    reason: extra?.reason,
    platform: evt.platform,
    standalone: evt.standalone,
  });
  return evt;
}

export interface PipStats {
  total: number;
  perPlatform: Record<string, number>;
  requests: number;
  enterNative: number;
  enterArmed: number;
  enterFallback: number;
  active: number;
  denied: number;
  timeout: number;
  leave: number;
  successRate: number; // active / requests
  iosArmedToActiveRate: number; // ios (armed → active)
  denialRate: number;
}

export function getPipStats(): PipStats {
  const events = loadEvents();
  const stats: PipStats = {
    total: events.length,
    perPlatform: {},
    requests: 0,
    enterNative: 0,
    enterArmed: 0,
    enterFallback: 0,
    active: 0,
    denied: 0,
    timeout: 0,
    leave: 0,
    successRate: 0,
    iosArmedToActiveRate: 0,
    denialRate: 0,
  };
  let iosArmed = 0;
  let iosArmedToActive = 0;
  // Walk sequentially so we can correlate armed→active per session
  const armedBySession = new Map<string, number>();
  for (const e of events) {
    stats.perPlatform[e.platform] = (stats.perPlatform[e.platform] || 0) + 1;
    switch (e.kind) {
      case "request": stats.requests++; break;
      case "enter-native": stats.enterNative++; break;
      case "enter-armed":
        stats.enterArmed++;
        if (e.platform === "ios") {
          iosArmed++;
          armedBySession.set(e.sessionId, (armedBySession.get(e.sessionId) || 0) + 1);
        }
        break;
      case "enter-fallback": stats.enterFallback++; break;
      case "active":
        stats.active++;
        if (e.platform === "ios" && (armedBySession.get(e.sessionId) || 0) > 0) {
          iosArmedToActive++;
          armedBySession.set(e.sessionId, armedBySession.get(e.sessionId)! - 1);
        }
        break;
      case "denied": stats.denied++; break;
      case "timeout": stats.timeout++; break;
      case "leave": stats.leave++; break;
    }
  }
  stats.successRate = stats.requests > 0 ? stats.active / stats.requests : 0;
  stats.iosArmedToActiveRate = iosArmed > 0 ? iosArmedToActive / iosArmed : 0;
  stats.denialRate = stats.requests > 0 ? (stats.denied + stats.timeout) / stats.requests : 0;
  return stats;
}

export function getPipEvents(limit = 50): PipEvent[] {
  return loadEvents().slice(-limit).reverse();
}

export function clearPipTelemetry() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

// Expose a debug handle for Safari Web Inspector on real iOS devices.
if (typeof window !== "undefined") {
  (window as any).__xerifePipTelemetry = {
    stats: getPipStats,
    events: getPipEvents,
    clear: clearPipTelemetry,
    track: trackPip,
  };
}
