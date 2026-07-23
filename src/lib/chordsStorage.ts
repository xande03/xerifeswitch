/**
 * Cache persistente de cifras. Espelha lyricsStorage.ts (30 dias, LRU básico).
 */

import type { ChordsResult } from "@/lib/chords";

const KEY = "xerife:chords-cache:v1";
const MAX_ENTRIES = 200;
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface StoredEntry {
  result: ChordsResult | null;
  savedAt: number;
}

type Store = Record<string, StoredEntry>;

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

function write(s: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}

export function getStoredChords(key: string): ChordsResult | null | undefined {
  const s = read();
  const e = s[key];
  if (!e) return undefined;
  if (Date.now() - e.savedAt > TTL_MS) {
    delete s[key];
    write(s);
    return undefined;
  }
  return e.result;
}

export function setStoredChords(key: string, result: ChordsResult | null): void {
  const s = read();
  s[key] = { result, savedAt: Date.now() };
  const keys = Object.keys(s);
  if (keys.length > MAX_ENTRIES) {
    keys
      .sort((a, b) => (s[a].savedAt || 0) - (s[b].savedAt || 0))
      .slice(0, keys.length - MAX_ENTRIES)
      .forEach((k) => delete s[k]);
  }
  write(s);
}

export function removeStoredChords(key: string): void {
  const s = read();
  if (s[key]) {
    delete s[key];
    write(s);
  }
}
