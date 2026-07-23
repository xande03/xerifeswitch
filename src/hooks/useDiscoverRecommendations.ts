import { useEffect, useRef, useState } from "react";
import type { Song } from "@/data/mockSongs";
import { searchYouTubeMusic } from "@/lib/youtubeSearch";

const CACHE_KEY = "demus_discover_recos_v1";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

interface Cached {
  songs: Song[];
  ts: number;
  seedSig: string;
}

// Pool amplo e diverso de gêneros/estilos/moods — a ideia é EXPLORAR,
// portanto nada aqui depende do que o usuário ouviu.
const DISCOVERY_POOL: string[] = [
  "novidades mpb 2026",
  "sertanejo lançamentos",
  "pagode novo",
  "funk brasil hits",
  "rock nacional clássicos",
  "indie brasil",
  "pop internacional 2026",
  "k-pop hits",
  "reggaeton latino",
  "hip hop br",
  "rap internacional",
  "eletrônica dance hits",
  "lofi chill beats",
  "jazz essentials",
  "bossa nova classics",
  "samba raiz",
  "forró pé de serra",
  "gospel novidades",
  "reggae roots",
  "soul r&b classics",
  "afrobeats hits",
  "rock alternativo",
  "metal essentials",
  "clássica piano",
];

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

// Sorteia N sementes distintas do pool, rotacionando por dia para variar.
function pickSeeds(n: number): { seeds: string[]; sig: string } {
  const dayBucket = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  // Fisher-Yates determinístico por bucket para dar rotação diária
  const arr = [...DISCOVERY_POOL];
  let seed = dayBucket * 9301 + 49297;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  const seeds = arr.slice(0, n);
  return { seeds, sig: `${dayBucket}:${seeds.join("|")}` };
}

/**
 * Recomendações de descoberta — múltiplos gêneros e estilos, independente
 * do histórico do usuário. Serve como feed de exploração ("novidades").
 */
export function useDiscoverRecommendations(excludeIds: Set<string>): {
  songs: Song[];
  isLoading: boolean;
} {
  const [songs, setSongs] = useState<Song[]>(() => readCache()?.songs || []);
  const [isLoading, setIsLoading] = useState(false);
  const fetchingRef = useRef(false);
  const lastSigRef = useRef<string>("");

  useEffect(() => {
    const { seeds, sig } = pickSeeds(8);
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
        // Interleave round-robin garantindo diversidade de gêneros
        for (let i = 0; i < maxLen; i++) {
          for (const list of results) {
            const s = list[i];
            if (!s) continue;
            const key = s.youtubeId || s.id;
            if (!key || seen.has(key)) continue;
            seen.add(key);
            merged.push(s);
            if (merged.length >= 60) break;
          }
          if (merged.length >= 60) break;
        }
        if (cancelled) return;
        if (merged.length > 0) {
          writeCache({ songs: merged, ts: Date.now(), seedSig: sig });
          lastSigRef.current = sig;
          setSongs(merged);
        }
      } catch {
        // never propagate
      } finally {
        fetchingRef.current = false;
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      fetchingRef.current = false;
    };
  }, []);

  const filtered = songs.filter(s => {
    const k = s.youtubeId || s.id;
    return k && !excludeIds.has(k);
  });

  return { songs: filtered, isLoading };
}
