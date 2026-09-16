// Estatísticas de escuta persistentes (estilo "Wrapped"), 100% local.
//
// Armazena agregados por dia (fuso local) em localStorage:
//   demus_listen_stats_v1 = { version, days: { "YYYY-MM-DD": DayBucket } }
// Cada DayBucket acumula segundos ouvidos por faixa e por artista. Buckets com
// mais de `MAX_DAYS` dias de idade são podados a cada escrita.

export type StatsMediaType = "music" | "video" | "podcast";
export type StatsRange = "today" | "7d" | "30d" | "all";

export interface TrackRef {
  id: string;
  title: string;
  artist: string;
  cover?: string;
  duration?: number;
  type?: StatsMediaType;
}

interface TrackDayEntry {
  sec: number;
  title: string;
  artist: string;
  cover: string;
  duration: number;
  type: StatsMediaType;
}

interface ArtistDayEntry {
  sec: number;
  type: StatsMediaType;
}

interface DayBucket {
  total: number;
  tracks: Record<string, TrackDayEntry>;
  artists: Record<string, ArtistDayEntry>;
}

interface StatsStore {
  version: 1;
  days: Record<string, DayBucket>;
}

const STORE_KEY = "demus_listen_stats_v1";
const MAX_DAYS = 400;
export const LISTEN_STATS_EVENT = "demus:listen-stats-updated";

/** Chave do dia no fuso local: YYYY-MM-DD */
export function dayKey(ts: number = Date.now()): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function readStore(): StatsStore {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (raw && typeof raw === "object" && raw.days && typeof raw.days === "object") {
      return { version: 1, days: raw.days };
    }
  } catch { /* corrupt → fresh */ }
  return { version: 1, days: {} };
}

function writeStore(store: StatsStore): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
    window.dispatchEvent(new CustomEvent(LISTEN_STATS_EVENT));
  } catch { /* quota cheia → ignora */ }
}

function prune(store: StatsStore): void {
  const keys = Object.keys(store.days).sort();
  if (keys.length > MAX_DAYS) {
    for (const k of keys.slice(0, keys.length - MAX_DAYS)) delete store.days[k];
  }
}

/**
 * Acumula `seconds` (delta real de reprodução) para a faixa informada no dia
 * de hoje. Valores absurdos (> 600s por chamada) são descartados — o flush
 * do tracker opera em janelas de ~15s.
 */
export function recordListenSeconds(track: TrackRef, seconds: number, ts: number = Date.now()): void {
  if (!track?.id || !Number.isFinite(seconds) || seconds < 1 || seconds > 600) return;
  const type: StatsMediaType = track.type === "video" || track.type === "podcast" ? track.type : "music";
  const store = readStore();
  const key = dayKey(ts);
  const bucket: DayBucket = store.days[key] ??= { total: 0, tracks: {}, artists: {} };

  const sec = Math.round(seconds);
  bucket.total += sec;

  const t = bucket.tracks[track.id] ??= {
    sec: 0,
    title: track.title || "Sem título",
    artist: track.artist || "Desconhecido",
    cover: track.cover || "",
    duration: Number.isFinite(track.duration) ? Math.round(track.duration!) : 0,
    type,
  };
  t.sec += sec;
  // Atualiza metadados (capa/título podem melhorar entre sessões)
  if (track.cover) t.cover = track.cover;
  if (track.title) t.title = track.title;
  if (track.artist) t.artist = track.artist;

  const artistName = (track.artist || "Desconhecido").trim() || "Desconhecido";
  const a = bucket.artists[artistName] ??= { sec: 0, type };
  a.sec += sec;

  prune(store);
  writeStore(store);
}

export function clearListeningStats(): void {
  try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent(LISTEN_STATS_EVENT)); } catch { /* ignore */ }
}

/* ------------------------------ Consultas ------------------------------ */

/** Conjunto de dayKeys inclusos no range (null = todos os dias). */
function rangeKeys(range: StatsRange, now: number = Date.now()): Set<string> | null {
  if (range === "all") return null;
  const nDays = range === "today" ? 1 : range === "7d" ? 7 : 30;
  const keys = new Set<string>();
  for (let i = 0; i < nDays; i++) {
    keys.add(dayKey(now - i * 86_400_000));
  }
  return keys;
}

function eachBucket(range: StatsRange, fn: (b: DayBucket) => void, now: number = Date.now()): void {
  const keys = rangeKeys(range, now);
  const store = readStore();
  for (const [k, bucket] of Object.entries(store.days)) {
    if (keys && !keys.has(k)) continue;
    fn(bucket);
  }
}

export interface StatsSummary {
  totalSec: number;
  uniqueTracks: number;
  uniqueArtists: number;
}

export function getStatsSummary(range: StatsRange, type?: StatsMediaType): StatsSummary {
  let totalSec = 0;
  const tracks = new Set<string>();
  const artists = new Set<string>();
  eachBucket(range, (b) => {
    if (!type) {
      totalSec += b.total;
      Object.keys(b.tracks).forEach((t) => tracks.add(t));
      Object.keys(b.artists).forEach((a) => artists.add(a));
    } else {
      for (const [id, t] of Object.entries(b.tracks)) {
        if (t.type === type) { totalSec += t.sec; tracks.add(id); }
      }
      for (const [name, a] of Object.entries(b.artists)) {
        if (a.type === type) artists.add(name);
      }
    }
  });
  return { totalSec, uniqueTracks: tracks.size, uniqueArtists: artists.size };
}

export interface TopTrack extends TrackDayEntry {
  id: string;
}

export function getTopTracks(range: StatsRange, type?: StatsMediaType, limit = 10): TopTrack[] {
  const acc = new Map<string, TopTrack>();
  eachBucket(range, (b) => {
    for (const [id, t] of Object.entries(b.tracks)) {
      if (type && t.type !== type) continue;
      const cur = acc.get(id);
      if (cur) cur.sec += t.sec;
      else acc.set(id, { id, ...t });
    }
  });
  return [...acc.values()].sort((x, y) => y.sec - x.sec).slice(0, limit);
}

export interface TopArtist {
  artist: string;
  sec: number;
  type: StatsMediaType;
}

export function getTopArtists(range: StatsRange, type?: StatsMediaType, limit = 10): TopArtist[] {
  const acc = new Map<string, TopArtist>();
  eachBucket(range, (b) => {
    for (const [name, a] of Object.entries(b.artists)) {
      if (type && a.type !== type) continue;
      const cur = acc.get(name);
      if (cur) cur.sec += a.sec;
      else acc.set(name, { artist: name, sec: a.sec, type: a.type });
    }
  });
  return [...acc.values()].sort((x, y) => y.sec - x.sec).slice(0, limit);
}

/** Quantidade de faixas diferentes ouvidas no range (usado no tile da Biblioteca). */
export function getUniqueTrackCount(range: StatsRange, type?: StatsMediaType): number {
  return getStatsSummary(range, type).uniqueTracks;
}

/** Formata segundos como "42 min" ou "3 h 12 min" (ou "45 s"). */
export function formatListenTime(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest > 0 ? `${h} h ${rest} min` : `${h} h`;
}
