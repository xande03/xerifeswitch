import { useEffect, useRef, useState } from "react";
import type { Song } from "@/data/mockSongs";
import { getHistory, getSearchHistory } from "@/lib/localStorage";
import { searchYouTubeMusic } from "@/lib/youtubeSearch";

const CACHE_KEY = "demus_personalized_destaques_v1";
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2h

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
    return c;
  } catch { return null; }
}
function writeCache(c: Cached): void {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch {}
}

/**
 * Build up to N seed queries from the user's listening + search history.
 * Prefer most-played artists, then recent search queries.
 */
function buildSeeds(): { seeds: string[]; sig: string } {
  const history = getHistory().filter(h =>
    h && h.type !== "video" && h.type !== "podcast" && !h.songId?.startsWith("yt-")
  );
  const artistCount = new Map<string, number>();
  for (const h of history) {
    const a = (h.artist || "").replace(/\s*-\s*Topic$/i, "").trim();
    if (!a || a === "Desconhecido") continue;
    artistCount.set(a, (artistCount.get(a) || 0) + 1);
  }
  const topArtists = [...artistCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([a]) => a);

  const recentSearches = getSearchHistory()
    .slice(0, 5)
    .map(e => e.q)
    .filter(q => q && !topArtists.some(a => a.toLowerCase() === q.toLowerCase()))
    .slice(0, 2);

  const seeds = [...topArtists, ...recentSearches].slice(0, 4);
  const sig = seeds.join("|").toLowerCase();
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
  const fetchingRef = useRef(false);

  useEffect(() => {
    const { seeds, sig } = buildSeeds();
    if (seeds.length === 0) return;

    const cached = readCache();
    if (cached && cached.seedSig === sig) {
      setSongs(cached.songs);
      return;
    }

    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setIsLoading(true);

    (async () => {
      try {
        const results = await Promise.all(
          seeds.map(q => searchYouTubeMusic(q, "songs").catch(() => [] as Song[]))
        );
        const merged: Song[] = [];
        const seen = new Set<string>();
        // Interleave a bit so different seeds get representation up top.
        const maxLen = Math.max(...results.map(r => r.length), 0);
        for (let i = 0; i < maxLen; i++) {
          for (const list of results) {
            const s = list[i];
            if (!s) continue;
            const key = s.youtubeId || s.id;
            if (!key || seen.has(key)) continue;
            seen.add(key);
            merged.push(s);
          }
        }
        if (merged.length > 0) {
          writeCache({ songs: merged, ts: Date.now(), seedSig: sig });
          setSongs(merged);
        }
      } finally {
        fetchingRef.current = false;
        setIsLoading(false);
      }
    })();
  }, []);

  const filtered = songs.filter(s => {
    const k = s.youtubeId || s.id;
    return k && !excludeIds.has(k);
  });

  return { songs: filtered, isLoading };
}
