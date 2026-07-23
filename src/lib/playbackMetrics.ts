/**
 * Lightweight in-memory metrics + structured logger for playback events.
 *
 * Tracks visibility changes, play/pause calls, MediaSession failures and
 * PiP/Fullscreen lifecycle. Exposed via `window.__xerifeMetrics` for live
 * inspection on Android/iOS (remote debugging via chrome://inspect or Safari
 * Web Inspector). Capped at 200 events to avoid memory growth in background.
 */

export type MetricEvent = {
  t: number;             // timestamp (ms)
  kind: string;          // category: visibility | play | pause | mediasession | pip | fullscreen | error
  source: string;        // which subsystem
  data?: Record<string, unknown>;
};

const MAX_EVENTS = 200;
const buffer: MetricEvent[] = [];
const counters: Record<string, number> = Object.create(null);

function getPlatform(): string {
  if (typeof navigator === "undefined") return "ssr";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "web";
}

export function track(kind: string, source: string, data?: Record<string, unknown>) {
  const evt: MetricEvent = { t: Date.now(), kind, source, data };
  buffer.push(evt);
  if (buffer.length > MAX_EVENTS) buffer.splice(0, buffer.length - MAX_EVENTS);
  const key = `${kind}:${source}`;
  counters[key] = (counters[key] || 0) + 1;

  // Mirror to console so remote DevTools (Android chrome://inspect, iOS Safari
  // Web Inspector) capture it during background sessions.
  const tag = `[metrics ${getPlatform()}] ${kind}/${source}`;
  if (kind === "error" || kind === "mediasession-error") {
    console.warn(tag, data || "");
  } else {
    console.info(tag, data || "");
  }
}

export function getMetricsSnapshot() {
  return {
    platform: getPlatform(),
    events: buffer.slice(-MAX_EVENTS),
    counters: { ...counters },
    visibility: typeof document !== "undefined" ? document.visibilityState : "unknown",
    standalone:
      typeof window !== "undefined" &&
      (window.matchMedia?.("(display-mode: standalone)").matches ||
        (window.navigator as any)?.standalone === true),
  };
}

export function clearMetrics() {
  buffer.length = 0;
  for (const k of Object.keys(counters)) delete counters[k];
}

// Expose a debug handle so the user can inspect from any DevTools console.
if (typeof window !== "undefined") {
  (window as any).__xerifeMetrics = {
    snapshot: getMetricsSnapshot,
    clear: clearMetrics,
    track,
  };
}
