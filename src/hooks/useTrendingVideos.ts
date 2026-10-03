import { useState, useEffect } from "react";
import { searchYouTubeGeneral, type VideoResult } from "@/lib/youtubeGeneralSearch";

const CACHE_KEY = "demus_trending_videos_cache";
// Stale-while-revalidate: serve cache instantâneo e revalida UMA vez ao abrir
// o app (gesto do usuário). Sem polling nem refresh por focus/visibility —
// zero egress automático ao Supabase (o projeto pode ficar pausado).
const FRESH_MS = 30 * 60 * 1000;          // 30min considerado fresco (cache)
const MAX_AGE_MS = 24 * 60 * 60 * 1000;   // 24h absoluto

interface CachedVideos {
  videos: VideoResult[];
  ts: number;
}

function readCache(): CachedVideos | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached: CachedVideos = JSON.parse(raw);
    if (!cached.videos?.length) return null;
    if (Date.now() - cached.ts > MAX_AGE_MS) return null;
    return cached;
  } catch {
    return null;
  }
}

function setCache(videos: VideoResult[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ videos, ts: Date.now() }));
  } catch {}
}

const QUERIES = [
  "tendências Brasil hoje",
  "mais assistidos hoje Brasil",
  "vídeos populares hoje",
];

async function fetchFresh(): Promise<VideoResult[]> {
  const allVideos: VideoResult[] = [];
  const seenIds = new Set<string>();
  for (const q of QUERIES) {
    if (allVideos.length >= 20) break;
    try {
      // fresh: true → bypass 4h search cache so newly-uploaded videos surface
      const results = await searchYouTubeGeneral(q, { fresh: true });
      for (const v of results) {
        if (!seenIds.has(v.videoId)) {
          seenIds.add(v.videoId);
          allVideos.push(v);
        }
      }
    } catch {}
  }
  return sortByRecency(allVideos);
}

// Parse pt-BR "há X unidades" into an approximate age in minutes; unknown → very old.
function ageMinutes(pt: string): number {
  if (!pt) return Number.MAX_SAFE_INTEGER;
  const m = pt.toLowerCase().match(/(\d+)\s*(minuto|hora|dia|semana|mês|mes|ano)/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  const n = parseInt(m[1], 10);
  const unit = m[2];
  const mult: Record<string, number> = {
    minuto: 1, hora: 60, dia: 1440, semana: 10080, mês: 43200, mes: 43200, ano: 525600,
  };
  return n * (mult[unit] ?? 60);
}

function sortByRecency(videos: VideoResult[]): VideoResult[] {
  return [...videos].sort((a, b) => ageMinutes(a.publishedTime) - ageMinutes(b.publishedTime));
}

export function useTrendingVideos() {
  const [trendingVideos, setTrendingVideos] = useState<VideoResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let refreshing = false;

    const refresh = async (showLoading: boolean) => {
      if (refreshing) return;
      refreshing = true;
      if (showLoading) setIsLoading(true);
      try {
        const fresh = await fetchFresh();
        if (cancelled) return;
        if (fresh.length > 0) {
          setTrendingVideos(fresh);
          setCache(fresh);
        }
      } finally {
        refreshing = false;
        if (!cancelled && showLoading) setIsLoading(false);
      }
    };

    const load = async () => {
      const cached = readCache();
      if (cached) {
        setTrendingVideos(sortByRecency(cached.videos));
        setIsLoading(false);
        // Always revalidate on app open so newly-uploaded videos surface
        refresh(false);
      } else {
        await refresh(true);
      }
    };

    load();

    // Polling de3min + refresh por focus/visibility REMOVIDOS (revisão22ª:
    // nenhum pulso automático ao Supabase; revalidação = só na abertura).
    return () => {
      cancelled = true;
    };
  }, []);

  return { trendingVideos, isLoading };
}
