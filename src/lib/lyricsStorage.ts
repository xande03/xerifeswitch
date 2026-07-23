/**
 * Persistent local storage for lyrics + per-song sync offset.
 * - Lyrics cache: reused across sessions to avoid re-hitting the API when
 *   the user reopens the "Letra" tab.
 * - Offset: user-adjustable timing (in seconds) saved per song so the sync
 *   preference is remembered next time the same track plays.
 */

import type { LyricsResult } from "@/lib/lyrics";

const LYRICS_KEY = "xerife:lyrics-cache:v1";
const OFFSET_KEY = "xerife:lyrics-offset:v1";
const MAX_ENTRIES = 250;
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface StoredEntry {
  result: LyricsResult | null;
  savedAt: number;
}

type Store = Record<string, StoredEntry>;
type OffsetStore = Record<string, number>;

function readStore(): Store {
  try {
    const raw = localStorage.getItem(LYRICS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Store;
  } catch { return {}; }
}
function writeStore(s: Store) {
  try { localStorage.setItem(LYRICS_KEY, JSON.stringify(s)); } catch {}
}

function readOffsets(): OffsetStore {
  try {
    const raw = localStorage.getItem(OFFSET_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as OffsetStore;
  } catch { return {}; }
}
function writeOffsets(s: OffsetStore) {
  try { localStorage.setItem(OFFSET_KEY, JSON.stringify(s)); } catch {}
}

export function getStoredLyrics(key: string): LyricsResult | null | undefined {
  const store = readStore();
  const entry = store[key];
  if (!entry) return undefined;
  if (Date.now() - entry.savedAt > TTL_MS) {
    delete store[key];
    writeStore(store);
    return undefined;
  }
  return entry.result;
}

export function setStoredLyrics(key: string, result: LyricsResult | null): void {
  const store = readStore();
  store[key] = { result, savedAt: Date.now() };
  // Prune oldest if over capacity
  const keys = Object.keys(store);
  if (keys.length > MAX_ENTRIES) {
    keys
      .sort((a, b) => (store[a].savedAt || 0) - (store[b].savedAt || 0))
      .slice(0, keys.length - MAX_ENTRIES)
      .forEach((k) => delete store[k]);
  }
  writeStore(store);
}

export function removeStoredLyrics(key: string): void {
  const store = readStore();
  if (store[key]) {
    delete store[key];
    writeStore(store);
  }
}

/* Offset (seconds). Positive = adiantar a letra (mostra antes). */
export function getLyricsOffset(songId: string): number {
  if (!songId) return 0;
  const offsets = readOffsets();
  return typeof offsets[songId] === "number" ? offsets[songId] : 0;
}

export function setLyricsOffset(songId: string, offset: number): void {
  if (!songId) return;
  const offsets = readOffsets();
  if (!offset) {
    delete offsets[songId];
  } else {
    // clamp para faixa razoável (-15s .. +15s)
    offsets[songId] = Math.max(-15, Math.min(15, Math.round(offset * 10) / 10));
  }
  writeOffsets(offsets);
}
