/**
 * Persistência de estado do player entre fullscreen ⇄ feed (e entre recargas).
 *
 * Guarda:
 *  - velocidade de reprodução (playbackRate)
 *  - mudo / desmudo (+ volume anterior ao mute)
 *  - posição de reprodução por vídeo (com validade de 24h)
 */

const RATE_KEY = "demus-playback-rate";
const MUTE_KEY = "demus-player-muted";
const PREMUTE_KEY = "demus-player-premute-volume";
const POS_KEY = "demus-player-positions";

const POSITION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_POSITIONS = 60;

export const SPEED_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

/* ── Velocidade ── */
export function getPlaybackRate(): number {
  try {
    const n = Number(localStorage.getItem(RATE_KEY));
    return Number.isFinite(n) && n >= 0.25 && n <= 2 ? n : 1;
  } catch {
    return 1;
  }
}

export function savePlaybackRate(rate: number): void {
  try { localStorage.setItem(RATE_KEY, String(rate)); } catch {}
}

/* ── Mudo ── */
export function getMuted(): boolean {
  try { return localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; }
}

export function saveMuted(muted: boolean): void {
  try { localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch {}
}

export function getPreMuteVolume(fallback = 80): number {
  try {
    const n = Number(localStorage.getItem(PREMUTE_KEY));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  } catch {
    return fallback;
  }
}

export function savePreMuteVolume(vol: number): void {
  try { localStorage.setItem(PREMUTE_KEY, String(vol)); } catch {}
}

/* ── Posição de reprodução ── */
type PositionMap = Record<string, { t: number; at: number }>;

function readPositions(): PositionMap {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as PositionMap) : {};
  } catch {
    return {};
  }
}

function writePositions(map: PositionMap): void {
  try {
    const entries = Object.entries(map)
      .filter(([, v]) => Date.now() - v.at < POSITION_TTL_MS)
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, MAX_POSITIONS);
    localStorage.setItem(POS_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {}
}

export function savePosition(videoId: string | null | undefined, seconds: number, duration?: number): void {
  if (!videoId || !Number.isFinite(seconds) || seconds < 5) return;
  // Perto do fim: não vale a pena retomar.
  if (duration && duration > 0 && seconds > duration - 15) {
    clearPosition(videoId);
    return;
  }
  const map = readPositions();
  map[videoId] = { t: Math.floor(seconds), at: Date.now() };
  writePositions(map);
}

export function getPosition(videoId: string | null | undefined): number | null {
  if (!videoId) return null;
  const entry = readPositions()[videoId];
  if (!entry) return null;
  if (Date.now() - entry.at > POSITION_TTL_MS) return null;
  return entry.t > 5 ? entry.t : null;
}

export function clearPosition(videoId: string | null | undefined): void {
  if (!videoId) return;
  const map = readPositions();
  delete map[videoId];
  writePositions(map);
}
