import { useState, useEffect } from "react";
import type { Song } from "@/data/mockSongs";
import { createFunctionHeadersWithIp, createFunctionUrl, getBackendConfig } from "@/lib/backendConfig";

const TRENDING_CACHE_KEY = "demus_trending_cache_v2";
// Stale-while-revalidate: fresh window vs absolute max age.
const FRESH_MS = 60 * 60 * 1000;             // 1h fresh
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;  // 3d hard cap

// One-time cleanup of old cache that may contain stale fallback songs
try { localStorage.removeItem("demus_trending_cache"); } catch {}

interface CachedTrending {
  songs: Song[];
  ts: number;
}

function getCachedTrending(): CachedTrending | null {
  try {
    const raw = localStorage.getItem(TRENDING_CACHE_KEY);
    if (!raw) return null;
    const cached: CachedTrending = JSON.parse(raw);
    if (!cached.songs?.length) return null;
    if (Date.now() - cached.ts > MAX_AGE_MS) return null;
    return cached;
  } catch {
    return null;
  }
}

function setCachedTrending(songs: Song[]): void {
  try {
    localStorage.setItem(TRENDING_CACHE_KEY, JSON.stringify({ songs, ts: Date.now() }));
  } catch {}
}

async function fetchTrendingViaEdgeFunction(): Promise<Song[]> {
  try {
    const { usingFallback } = getBackendConfig();

    console.log("[Trending] Edge fn attempt:", { usingFallback });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const url = createFunctionUrl("youtube-trending", { region: "BR" });
    console.log("[Trending] Calling:", url);

    const headers = await createFunctionHeadersWithIp();
    const res = await fetch(url, {
      signal: controller.signal,
      headers,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.error("[Trending] HTTP error:", res.status);
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    const items = data.results || [];
    console.log("[Trending] Got", items.length, "results");

    return items.map((v: any): Song => ({
      id: v.id || `trending-${v.youtubeId}`,
      youtubeId: v.youtubeId,
      title: v.title || "",
      artist: v.artist || "Desconhecido",
      album: v.album || v.title || "",
      cover: v.cover || "/placeholder.svg",
      duration: v.duration || 0,
      votes: v.votes || 0,
      isDownloaded: false,
    }));
  } catch (err) {
    console.error("[Trending] Edge function failed:", err);
    return [];
  }
}

/** Hardcoded fallback when both edge function and cache fail */
const FALLBACK_TRENDING: Song[] = [
  { id: "fb-1", youtubeId: "kJQP7kiw5Fk", title: "Despacito", artist: "Luis Fonsi ft. Daddy Yankee", album: "Despacito", cover: "https://i.ytimg.com/vi/kJQP7kiw5Fk/hqdefault.jpg", duration: 282, votes: 0, isDownloaded: false },
  { id: "fb-2", youtubeId: "RgKAFK5djSk", title: "See You Again", artist: "Wiz Khalifa ft. Charlie Puth", album: "See You Again", cover: "https://i.ytimg.com/vi/RgKAFK5djSk/hqdefault.jpg", duration: 237, votes: 0, isDownloaded: false },
  { id: "fb-3", youtubeId: "JGwWNGJdvx8", title: "Shape of You", artist: "Ed Sheeran", album: "÷ (Divide)", cover: "https://i.ytimg.com/vi/JGwWNGJdvx8/hqdefault.jpg", duration: 234, votes: 0, isDownloaded: false },
  { id: "fb-4", youtubeId: "OPf0YbXqDm0", title: "Uptown Funk", artist: "Mark Ronson ft. Bruno Mars", album: "Uptown Funk", cover: "https://i.ytimg.com/vi/OPf0YbXqDm0/hqdefault.jpg", duration: 270, votes: 0, isDownloaded: false },
  { id: "fb-5", youtubeId: "fRh_vgS2dFE", title: "Sorry", artist: "Justin Bieber", album: "Purpose", cover: "https://i.ytimg.com/vi/fRh_vgS2dFE/hqdefault.jpg", duration: 201, votes: 0, isDownloaded: false },
  { id: "fb-6", youtubeId: "09R8_2nJtjg", title: "Sugar", artist: "Maroon 5", album: "V", cover: "https://i.ytimg.com/vi/09R8_2nJtjg/hqdefault.jpg", duration: 235, votes: 0, isDownloaded: false },
  { id: "fb-7", youtubeId: "bo_efYhYU2A", title: "Faded", artist: "Alan Walker", album: "Different World", cover: "https://i.ytimg.com/vi/bo_efYhYU2A/hqdefault.jpg", duration: 212, votes: 0, isDownloaded: false },
  { id: "fb-8", youtubeId: "450p7goxZqg", title: "Believer", artist: "Imagine Dragons", album: "Evolve", cover: "https://i.ytimg.com/vi/450p7goxZqg/hqdefault.jpg", duration: 204, votes: 0, isDownloaded: false },
  { id: "fb-9", youtubeId: "pRpeEdMmmQ0", title: "Shake It Off", artist: "Taylor Swift", album: "1989", cover: "https://i.ytimg.com/vi/pRpeEdMmmQ0/hqdefault.jpg", duration: 219, votes: 0, isDownloaded: false },
  { id: "fb-10", youtubeId: "hT_nvWreIhg", title: "Counting Stars", artist: "OneRepublic", album: "Native", cover: "https://i.ytimg.com/vi/hT_nvWreIhg/hqdefault.jpg", duration: 257, votes: 0, isDownloaded: false },
  { id: "fb-11", youtubeId: "CevxZvSJLk8", title: "Roar", artist: "Katy Perry", album: "Prism", cover: "https://i.ytimg.com/vi/CevxZvSJLk8/hqdefault.jpg", duration: 224, votes: 0, isDownloaded: false },
  { id: "fb-12", youtubeId: "YqeW9_5kURI", title: "Perfect", artist: "Ed Sheeran", album: "÷ (Divide)", cover: "https://i.ytimg.com/vi/YqeW9_5kURI/hqdefault.jpg", duration: 263, votes: 0, isDownloaded: false },
];

export function useTrendingMusic() {
  const [trendingSongs, setTrendingSongs] = useState<Song[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let refreshing = false;

    const refresh = async (showLoading: boolean) => {
      if (refreshing) return;
      refreshing = true;
      if (showLoading) setIsLoading(true);
      try {
        const fetched = await fetchTrendingViaEdgeFunction();
        if (cancelled) return;
        if (fetched.length === 0) {
          console.log("[Trending] Using hardcoded fallback (NOT cached)");
          setTrendingSongs((prev) => (prev.length > 0 ? prev : FALLBACK_TRENDING));
        } else {
          setTrendingSongs(fetched);
          setCachedTrending(fetched);
        }
      } finally {
        refreshing = false;
        if (!cancelled && showLoading) setIsLoading(false);
      }
    };

    const load = async () => {
      const cached = getCachedTrending();
      if (cached) {
        setTrendingSongs(cached.songs);
        setIsLoading(false);
        // Always revalidate on app open so new releases surface in near real-time
        refresh(false);
      } else {
        await refresh(true);
      }
    };

    load();

    const onFocus = () => refresh(false);
    const onVisibility = () => { if (document.visibilityState === "visible") onFocus(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    // Periodic revalidation while tab remains open
    const intervalId = setInterval(() => refresh(false), FRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return { trendingSongs, isLoading };
}
