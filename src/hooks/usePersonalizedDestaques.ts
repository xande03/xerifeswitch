import { useEffect, useRef, useState } from "react";
import type { Song } from "@/data/mockSongs";
import { getHistory, getSearchHistory, type HistoryEntry } from "@/lib/localStorage";
import { searchYouTubeMusic } from "@/lib/youtubeSearch";
import { CYCLE_MS, getCycleId } from "@/lib/refreshCycle";

const CACHE_KEY = "demus_personalized_destaques_v3";
// As sugestões ficam estáveis dentro da janela de 5 dias (ciclo de atualização).
const CACHE_TTL_MS = CYCLE_MS;

interface Cached {
  songs: Song[];
  ts: number;
  seedSig: string;
}

function readCache(): Cached | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c: Cached = JSON.parse(raw);
    if (!c?.songs?.length) return null;
    if (Date.now() - c.ts > CACHE_TTL_MS) return null;
    if (getCycleId(c.ts) !== getCycleId()) return null; // virou o ciclo de 5 dias
    return c;
  } catch { return null; }
}
function writeCache(c: Cached): void {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch {}
}

function cleanArtist(a: string): string {
  return (a || "").replace(/\s*-\s*Topic$/i, "").trim();
}

/**
 * Build weighted seeds from listening + search history.
 * Recency-weighted score per artist + top played song titles + recent searches.
 * Also injects "mix"/"similar" query variants for better discovery breadth.
 */
function buildSeeds(): { seeds: string[]; sig: string } {
  const now = Date.now();
  const history = getHistory().filter(
    (h): h is HistoryEntry =>
      !!h && h.type !== "video" && h.type !== "podcast" && !h.songId?.startsWith("yt-")
  );

  // Weighted artist score: recent plays weigh more (half-life ~14 days).
  const HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000;
  const artistScore = new Map<string, number>();
  const songScore = new Map<string, { title: string; artist: string; score: number }>();

  for (const h of history) {
    const a = cleanArtist(h.artist);
    if (!a || a.toLowerCase() === "desconhecido") continue;
    const age = Math.max(0, now - (h.playedAt || now));
    const w = Math.pow(0.5, age / HALF_LIFE_MS); // 1.0 recent -> ~0 old
    artistScore.set(a, (artistScore.get(a) || 0) + w);

    const t = (h.title || "").trim();
    if (t) {
      const key = `${t}::${a}`.toLowerCase();
      const prev = songScore.get(key);
      songScore.set(key, {
        title: t,
        artist: a,
        score: (prev?.score || 0) + w,
      });
    }
  }

  const topArtists = [...artistScore.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([a]) => a);

  const topSongs = [...songScore.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  // Buscas feitas no módulo "Explorar" (localStorage) — fonte PRINCIPAL das
  // categorias exibidas no Início. Também com peso por recência.
  const searchScore = new Map<string, number>();
  for (const e of getSearchHistory()) {
    const q = (e.q || "").trim();
    if (q.length < 2) continue;
    const age = Math.max(0, now - (e.ts || now));
    const w = Math.pow(0.5, age / HALF_LIFE_MS);
    const k = q.toLowerCase();
    searchScore.set(k, (searchScore.get(k) || 0) + w);
  }
  const topSearches = [...searchScore.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([q]) => q);

  // Compose diverse queries: buscas do Explorar primeiro, depois artistas ouvidos.
  const queries: string[] = [];
  topSearches.forEach((q, i) => {
    queries.push(q);
    if (i < 2) queries.push(`${q} mix`);
  });
  topArtists.forEach((a, i) => {
    queries.push(a);
    if (i < 1) queries.push(`${a} mix`);
  });
  topSongs.forEach(s => {
    queries.push(`${s.artist} ${s.title}`);
  });

  // Dedup, cap.
  const seen = new Set<string>();
  const seeds: string[] = [];
  for (const q of queries) {
    const k = q.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    seeds.push(q);
    if (seeds.length >= 8) break;
  }

  // O ciclo de 5 dias entra na assinatura: ao virar o ciclo, tudo é recarregado.
  const sig = `${getCycleId()}::${seeds.join("|").toLowerCase()}`;
  return { seeds, sig };
}

/**
 * Personalized "Destaques" tracks based on the user's listening + search history.
 * Excludes anything currently on the Top 10 (passed via excludeIds) to avoid duplication.
 */
export function usePersonalizedDestaques(excludeIds: Set<string>): {
  songs: Song[];
  isLoading: boolean;
} {
  const [songs, setSongs] = useState<Song[]>(() => readCache()?.songs || []);
  const [isLoading, setIsLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const fetchingRef = useRef(false);
  const lastSigRef = useRef<string>("");

  // Refresh when the user listens to new stuff or searches something new.
  useEffect(() => {
    const bump = () => setTick(t => t + 1);
    window.addEventListener("demus:history-updated", bump);
    window.addEventListener("demus:search-history-updated", bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener("demus:history-updated", bump);
      window.removeEventListener("demus:search-history-updated", bump);
      window.removeEventListener("storage", bump);
    };
  }, []);

  useEffect(() => {
    const { seeds, sig } = buildSeeds();
    if (seeds.length === 0) return;
    if (sig === lastSigRef.current && songs.length > 0) return;

    const cached = readCache();
    if (cached && cached.seedSig === sig) {
      lastSigRef.current = sig;
      setSongs(cached.songs);
      return;
    }

    if (fetchingRef.current) return;
    fetchingRef.current = true;

    let cancelled = false;
    setIsLoading(true);

    (async () => {
      try {
        const results = await Promise.all(
          seeds.map(q =>
            searchYouTubeMusic(q, "songs").catch(() => [] as Song[])
          )
        );
        if (cancelled) return;
        const merged: Song[] = [];
        const seen = new Set<string>();
        const maxLen = Math.max(...results.map(r => r.length), 0);
        for (let i = 0; i < maxLen; i++) {
          for (const list of results) {
            const s = list[i];
            if (!s) continue;
            const key = s.youtubeId || s.id;
            if (!key || seen.has(key)) continue;
            seen.add(key);
            merged.push(s);
            if (merged.length >= 40) break;
          }
          if (merged.length >= 40) break;
        }
        if (cancelled) return;
        if (merged.length > 0) {
          writeCache({ songs: merged, ts: Date.now(), seedSig: sig });
          lastSigRef.current = sig;
          setSongs(merged);
        }
      } catch {
        // swallow — never propagate as unhandled rejection
      } finally {
        fetchingRef.current = false;
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      fetchingRef.current = false;
    };
  }, [tick]);


  const filtered = songs.filter(s => {
    const k = s.youtubeId || s.id;
    return k && !excludeIds.has(k);
  });

  return { songs: filtered, isLoading };
}
