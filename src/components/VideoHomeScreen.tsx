import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import HorizontalScroll from "./HorizontalScroll";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, Sparkles, Play, TrendingUp, RefreshCw, Film, BookmarkPlus, Bookmark, X, Flame, Search, Compass, ChevronUp, ChevronDown } from "lucide-react";
import { VIDEO_CATEGORIES, type VideoCategory } from "./VideoCategorySelector";
import { searchYouTubeGeneral, searchYouTubeGeneralPage, loadMoreYouTubeGeneral, type VideoResult } from "@/lib/youtubeGeneralSearch";
import { getSearchSuggestions } from "@/lib/youtubeSearch";
import { getHistory, getVideoSearchLog, type HistoryEntry } from "@/lib/localStorage";
import { createFunctionUrl, createFunctionHeadersWithIp } from "@/lib/backendConfig";
import { supabase } from "@/integrations/supabase/client";
import { hdThumbnail } from "@/lib/utils";
import VideoCard from "./VideoCard";
import BlurImage from "./BlurImage";
import PullToRefresh from "./PullToRefresh";
import RefreshSkeleton from "./RefreshSkeleton";
import { useAutoRefreshChannel } from "@/hooks/useAutoRefreshChannel";
import NewContentBadge from "./NewContentBadge";
import { useToast } from "@/hooks/use-toast";

interface VideoHomeScreenProps {
  onPlayVideo: (video: VideoResult) => void;
  onFullscreenVideo?: (video: VideoResult) => void;
  onChannelClick?: (channelName: string, channelThumbnail?: string, channelId?: string, channelUrl?: string) => void;
  onAddToPlaylist?: (video: any) => void;
  onNavigateToExplore?: () => void;
}

// ── Watch Later storage ──
const WATCH_LATER_KEY = "demus_watch_later";

export function getWatchLater(): VideoResult[] {
  try {
    return JSON.parse(localStorage.getItem(WATCH_LATER_KEY) || "[]");
  } catch {
    return [];
  }
}

export function addToWatchLater(video: VideoResult): void {
  const list = getWatchLater();
  if (!list.some(v => v.videoId === video.videoId)) {
    list.unshift(video);
    if (list.length > 50) list.length = 50;
    localStorage.setItem(WATCH_LATER_KEY, JSON.stringify(list));
  }
}

export function removeFromWatchLater(videoId: string): void {
  const list = getWatchLater().filter(v => v.videoId !== videoId);
  localStorage.setItem(WATCH_LATER_KEY, JSON.stringify(list));
}

export function isInWatchLater(videoId: string): boolean {
  return getWatchLater().some(v => v.videoId === videoId);
}
// ── Recommendation cache ──
const RECOMMENDATION_CACHE_KEY = "demus_video_recommendations";
const RECOMMENDATION_TTL = 10 * 60 * 1000; // 10 minutes

interface CachedRecommendations {
  videos: VideoResult[];
  ts: number;
  basedOn: string[];
}

function getCachedRecommendations(): CachedRecommendations | null {
  try {
    const raw = localStorage.getItem(RECOMMENDATION_CACHE_KEY);
    if (!raw) return null;
    const cached: CachedRecommendations = JSON.parse(raw);
    if (Date.now() - cached.ts < RECOMMENDATION_TTL && cached.videos.length > 0) return cached;
    return null;
  } catch {
    return null;
  }
}

function setCachedRecommendations(videos: VideoResult[], basedOn: string[]): void {
  try {
    localStorage.setItem(RECOMMENDATION_CACHE_KEY, JSON.stringify({ videos, ts: Date.now(), basedOn }));
  } catch {}
}

// ── Trending cache ──
const TRENDING_CACHE_KEY = "demus_trending_home_cache";
const TRENDING_TTL = 24 * 60 * 60 * 1000; // 24 hours

function getCachedTrending(): VideoResult[] | null {
  try {
    const raw = localStorage.getItem(TRENDING_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (Date.now() - cached.ts < TRENDING_TTL && cached.videos?.length > 0) return cached.videos;
    return null;
  } catch {
    return null;
  }
}

function setCachedTrending(videos: VideoResult[]): void {
  try {
    localStorage.setItem(TRENDING_CACHE_KEY, JSON.stringify({ videos, ts: Date.now() }));
  } catch {}
}

async function fetchTrendingVideos(): Promise<VideoResult[]> {
  const cached = getCachedTrending();
  if (cached) return cached;

  try {
    const url = createFunctionUrl("youtube-trending");
    const headers = await createFunctionHeadersWithIp();
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error("Trending API error");
    const data = await res.json();
    const results: VideoResult[] = (data.results || []).map((t: any) => ({
      videoId: t.youtubeId || t.videoId || "",
      title: t.title || "",
      channel: t.artist || t.channel || "",
      channelThumbnail: "",
      thumbnail: t.cover || "",
      duration: t.duration > 0 ? `${Math.floor(t.duration / 60)}:${String(t.duration % 60).padStart(2, "0")}` : "",
      views: "",
      publishedTime: "",
      lengthSeconds: t.duration || 0,
      description: "",
    })).filter((v: VideoResult) => v.videoId);

    if (results.length > 0) setCachedTrending(results);
    return results;
  } catch (e) {
    console.warn("Trending fetch failed:", e);
    return [];
  }
}

// Parse pt-BR/en "há X unidades" / "X units ago" into approximate minutes.
function ageMinutes(pt: string): number {
  if (!pt) return Number.MAX_SAFE_INTEGER;
  const m = pt.toLowerCase().match(/(\d+)\s*(minuto|minute|hora|hour|dia|day|semana|week|mês|mes|month|ano|year)/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  const n = parseInt(m[1], 10);
  const unit = m[2];
  const mult: Record<string, number> = {
    minuto: 1, minute: 1, hora: 60, hour: 60, dia: 1440, day: 1440,
    semana: 10080, week: 10080, mês: 43200, mes: 43200, month: 43200,
    ano: 525600, year: 525600,
  };
  return n * (mult[unit] ?? 60);
}
const VideoHomeScreen = ({ onPlayVideo, onFullscreenVideo, onChannelClick, onAddToPlaylist, onNavigateToExplore }: VideoHomeScreenProps) => {
  // Basic state
  const [recommendations, setRecommendations] = useState<VideoResult[]>([]);
  const [trendingVideos, setTrendingVideos] = useState<VideoResult[]>([]);
  const [loadingRecs, setLoadingRecs] = useState(true);
  const [loadingTrending, setLoadingTrending] = useState(true);
  const [watchLater, setWatchLater] = useState<VideoResult[]>(() => getWatchLater());
  const [visibleRecs, setVisibleRecs] = useState(12);
  const [loadingMoreRecs, setLoadingMoreRecs] = useState(false);
  const [recContinuation, setRecContinuation] = useState<string>();
  const recsSentinelRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // History setup FIRST - before any hooks that depend on it
  const [historyTick, setHistoryTick] = useState(0);
  const history = useMemo(() => {
    try {
      return getHistory().filter(h => {
        if (!h?.youtubeId) return false;
        if (h.type === "video") return true;
        if (!h.type && h.songId?.startsWith("yt-") && !h.album) return true;
        return false;
      });
    } catch {
      return [];
    }
  }, [historyTick]);

  // Recent Explore searches (last 24h) — feed recommendations from every
  // query the user ran, not just the latest one.
  const recentSearches = useMemo(() => {
    try {
      const entries = getVideoSearchLog(24 * 60 * 60 * 1000);
      // Rank by frequency + recency: freq * (1 / ageHours+1)
      const now = Date.now();
      const score = new Map<string, number>();
      for (const e of entries) {
        const q = e.q.trim();
        if (q.length < 2) continue;
        const ageH = Math.max(0, (now - e.ts) / 3600000);
        const s = (score.get(q) || 0) + 1 / (1 + ageH * 0.25);
        score.set(q, s);
      }
      return [...score.entries()].sort((a, b) => b[1] - a[1]).map(([q]) => q).slice(0, 6);
    } catch { return []; }
  }, [historyTick]);


  const recentVideos = useMemo(() => history.slice(0, 10), [history]);

  // Generate recommendation queries based on history — bias toward the user's
  // most-watched channels and the strongest keywords from recent titles, so
  // the "Recomendados para você" grid is genuinely personalized.
  const recQueries = useMemo(() => {
    if (history.length === 0) return ["vídeos recomendados Brasil"];

    // Rank channels by watch frequency instead of just recency.
    const channelCount = new Map<string, number>();
    for (const h of history.slice(0, 25)) {
      const c = (h.artist || "").trim();
      if (!c) continue;
      channelCount.set(c, (channelCount.get(c) || 0) + 1);
    }
    const channels = [...channelCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([c]) => c);

    const STOP = new Set(["oficial","official","video","vídeo","clip","clipe","music","lyrics","letra","feat","part","com","the","com.","para","uma","dos","das","que","por","sobre","novo","nova"]);
    const titleWords = history.slice(0, 12)
      .flatMap(h => (h.title || "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 4 && !STOP.has(w)))
      .reduce((acc, w) => { acc.set(w, (acc.get(w) || 0) + 1); return acc; }, new Map<string, number>());
    const topKeywords = [...titleWords.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([w]) => w);

    const queries: string[] = [];
    // Channel-only queries (top 3)
    channels.forEach(c => queries.push(c));
    // Keyword-only combos
    if (topKeywords.length >= 2) queries.push(topKeywords.slice(0, 2).join(" "));
    if (topKeywords.length >= 3) queries.push(topKeywords.slice(1, 3).join(" "));
    // Channel + keyword crosses (expands variety beyond just creators)
    if (channels[0] && topKeywords[0]) queries.push(`${channels[0]} ${topKeywords[0]}`);
    if (channels[1] && topKeywords[0]) queries.push(`${channels[1]} ${topKeywords[0]}`);
    if (channels[0] && topKeywords[1]) queries.push(`${channels[0]} ${topKeywords[1]}`);
    // Generic top keyword — pulls in similar content across the platform
    if (topKeywords[0]) queries.push(topKeywords[0]);
    if (queries.length === 0) queries.push("vídeos recomendados Brasil");
    return queries.slice(0, 8);
  }, [history]);

  // History change listener
  useEffect(() => {
    const bump = () => setHistoryTick(t => t + 1);
    const onStorage = (e: StorageEvent) => { 
      if (!e.key || e.key === "demus_history") bump(); 
    };
    window.addEventListener("demus:history-updated", bump);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("demus:history-updated", bump);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  // NOW we can use auto-refresh hooks since recQueries is defined
  const {
    newContentCount: recsNewContentCount,
    forceRefresh: forceRefreshRecs,
    resetNewContentCount: resetRecsNewContentCount
  } = useAutoRefreshChannel(
    () => {
      if (recQueries.length === 0) return Promise.resolve([]);
      return searchYouTubeGeneral(recQueries[0] || "vídeos recomendados Brasil", { fresh: true });
    },
    {
      enabled: recQueries.length > 0,
      interval: 3 * 60 * 1000, // 3 minutes
      onNewContent: (count) => {
        toast({
          title: "Novas recomendações!",
          description: `${count} novo(s) vídeo(s) recomendado(s)`,
        });
      }
    }
  );

  const {
    newContentCount: trendingNewContentCount,
    forceRefresh: forceRefreshTrending,
    resetNewContentCount: resetTrendingNewContentCount
  } = useAutoRefreshChannel(
    () => fetchTrendingVideos(),
    {
      enabled: true,
      interval: 4 * 60 * 1000, // 4 minutes
      onNewContent: (count) => {
        toast({
          title: "Novos vídeos em alta!",
          description: `${count} novo(s) vídeo(s) em alta`,
        });
      }
    }
  );

  // Load more recommendations
  const loadMoreRecommendations = useCallback(async () => {
    if (!recContinuation || loadingMoreRecs || recQueries.length === 0) return;
    setLoadingMoreRecs(true);
    
    try {
      const result = await loadMoreYouTubeGeneral(recContinuation, 20);
      
      const existingIds = new Set(recommendations.map(v => v.videoId));
      const channelCount = new Map<string, number>();
      for (const v of recommendations) {
        const ch = (v.channel || "").trim().toLowerCase();
        if (ch) channelCount.set(ch, (channelCount.get(ch) || 0) + 1);
      }
      const MAX_PER_CHANNEL_MORE = 6;
      const newRecs: VideoResult[] = [];
      for (const v of result.results) {
        if (existingIds.has(v.videoId)) continue;
        const ch = (v.channel || "").trim().toLowerCase();
        const count = ch ? (channelCount.get(ch) || 0) : 0;
        if (ch && count >= MAX_PER_CHANNEL_MORE) continue;
        existingIds.add(v.videoId);
        if (ch) channelCount.set(ch, count + 1);
        newRecs.push(v);
      }
      
      if (newRecs.length > 0) {
        setRecommendations(prev => [...prev, ...newRecs]);
        toast({
          title: "Mais recomendações carregadas!",
          description: `${newRecs.length} novo(s) vídeo(s) adicionado(s)`,
        });
      }

      
      setRecContinuation(result.continuation);
    } catch (error) {
      console.error("Erro ao carregar mais recomendações:", error);
    } finally {
      setLoadingMoreRecs(false);
    }
  }, [recContinuation, loadingMoreRecs, recQueries, recommendations, toast]);
  // Load trending videos
  useEffect(() => {
    let cancelled = false;
    setLoadingTrending(true);
    fetchTrendingVideos().then(videos => {
      if (!cancelled) {
        setTrendingVideos(videos);
        setLoadingTrending(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  // Load recommendations
  useEffect(() => {
    let cancelled = false;
    
    const loadRecommendations = async () => {
      if (recQueries.length === 0) {
        setLoadingRecs(false);
        return;
      }

      const cached = getCachedRecommendations();
      if (cached && JSON.stringify(cached.basedOn) === JSON.stringify(recQueries)) {
        setRecommendations(cached.videos);
        setLoadingRecs(false);
        return;
      }

      setLoadingRecs(true);
      const allVideos: VideoResult[] = [];
      const seenIds = new Set(history.map(h => h.youtubeId));
      const channelCount = new Map<string, number>();
      // Diversity cap: no single channel dominates the grid. Scales with total
      // history size so power-users still see their favorites, but a fresh
      // watch of a different genre isn't drowned by the top creator.
      const MAX_PER_CHANNEL = Math.max(2, Math.min(4, Math.ceil(recQueries.length / 2)));
      let firstContinuation: string | undefined;

      const pushWithDiversity = (v: VideoResult) => {
        if (seenIds.has(v.videoId)) return;
        const ch = (v.channel || "").trim().toLowerCase();
        const count = ch ? (channelCount.get(ch) || 0) : 0;
        if (ch && count >= MAX_PER_CHANNEL) return;
        seenIds.add(v.videoId);
        if (ch) channelCount.set(ch, count + 1);
        allVideos.push(v);
      };

      for (let i = 0; i < recQueries.length; i++) {
        const q = recQueries[i];
        if (allVideos.length >= 48) break;
        // Channel-only queries (top 3) get sortByDate to surface newest uploads
        const isChannelQuery = i < 3;
        const opts = isChannelQuery ? { sortByDate: true, fresh: true } : undefined;
        try {
          if (i === 0) {
            const page = await searchYouTubeGeneralPage(q, opts);
            firstContinuation = page.continuation;
            for (const v of page.results) pushWithDiversity(v);
          } else {
            const results = await searchYouTubeGeneral(q, opts);
            for (const v of results) pushWithDiversity(v);
          }
        } catch {
          // Continue on error
        }
      }

      // Interleave by channel so consecutive cards rarely share a creator,
      // even when the fetch order clumped them together. Each bucket is
      // pre-sorted by recency so the newest upload from each creator surfaces
      // first when we round-robin across channels.
      const byChannel = new Map<string, VideoResult[]>();
      for (const v of allVideos) {
        const key = (v.channel || "__unknown__").trim().toLowerCase();
        if (!byChannel.has(key)) byChannel.set(key, []);
        byChannel.get(key)!.push(v);
      }
      for (const bucket of byChannel.values()) {
        bucket.sort((a, b) => ageMinutes(a.publishedTime) - ageMinutes(b.publishedTime));
      }
      const buckets = [...byChannel.values()];
      const interleaved: VideoResult[] = [];
      while (buckets.some(b => b.length > 0)) {
        for (const b of buckets) {
          const next = b.shift();
          if (next) interleaved.push(next);
        }
      }

      // Final safety: promote very recent uploads (< 24h) to the top so brand
      // new videos from any creator lead the grid, regardless of interleave.
      interleaved.sort((a, b) => {
        const aAge = ageMinutes(a.publishedTime);
        const bAge = ageMinutes(b.publishedTime);
        const aFresh = aAge < 24 * 60;
        const bFresh = bAge < 24 * 60;
        if (aFresh && !bFresh) return -1;
        if (!aFresh && bFresh) return 1;
        if (aFresh && bFresh) return aAge - bAge;
        return 0;
      });

      if (!cancelled) {
        setRecommendations(interleaved);
        setRecContinuation(firstContinuation);
        if (interleaved.length > 0) setCachedRecommendations(interleaved, recQueries);
        setLoadingRecs(false);
      }

    };


    loadRecommendations();
    return () => { cancelled = true; };
  }, [recQueries, history]);

  // Auto-load: when the sentinel scrolls into view, first reveal more from the
  // in-memory list; if we've exhausted it, fetch the next page via continuation.
  useEffect(() => {
    const el = recsSentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting) return;
      if (visibleRecs < recommendations.length) {
        setVisibleRecs((n) => Math.min(n + 6, recommendations.length));
      } else if (recContinuation && !loadingMoreRecs) {
        loadMoreRecommendations();
      }
    }, { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [visibleRecs, recommendations.length, recContinuation, loadingMoreRecs, loadMoreRecommendations]);
  // Helper function
  const historyToVideoResult = useCallback((h: HistoryEntry): VideoResult => ({
    videoId: h.youtubeId,
    title: h.title,
    channel: h.artist,
    channelThumbnail: "",
    thumbnail: h.cover,
    duration: h.duration > 0 ? `${Math.floor(h.duration / 60)}:${String(h.duration % 60).padStart(2, "0")}` : "",
    views: "",
    publishedTime: "",
    lengthSeconds: h.duration,
    description: "",
  }), []);

  return (
    <PullToRefresh
      onRefresh={() => window.location.reload()}
      className="space-y-5 pb-6"
      skeleton={<RefreshSkeleton rows={3} variant="grid" />}
    >
      {/* Badge de novo conteúdo - Recomendações */}
      <NewContentBadge
        count={recsNewContentCount}
        onRefresh={() => {
          forceRefreshRecs();
          resetRecsNewContentCount();
        }}
        onDismiss={resetRecsNewContentCount}
        channelName="Recomendações"
        position="floating"
      />

      {/* Badge de novo conteúdo - Trending */}
      <NewContentBadge
        count={trendingNewContentCount}
        onRefresh={() => {
          forceRefreshTrending();
          resetTrendingNewContentCount();
        }}
        onDismiss={resetTrendingNewContentCount}
        channelName="Em Alta"
        position="floating"
      />

      {/* Continue watching */}
      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
        <div className="flex items-center gap-2 px-4">
          <Clock size={14} className="text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Continuar assistindo</h2>
        </div>
        {recentVideos.length > 0 ? (
          <>
            {/* Mobile: horizontal scroll */}
            <HorizontalScroll className="flex gap-3 px-4 md:hidden">
              {recentVideos.map((h) => (
                <button
                  key={h.songId}
                  onClick={() => onPlayVideo(historyToVideoResult(h))}
                  className="flex-shrink-0 w-44 group"
                >
                  <div className="relative aspect-video rounded-lg overflow-hidden mb-1.5">
                    <BlurImage src={hdThumbnail(h.cover)} alt={h.title} className="w-full h-full object-cover" />
                    {h.duration > 0 && (
                      <span className="absolute bottom-1 right-1 px-1 py-0.5 rounded text-[10px] bg-black/80 text-white font-medium">
                        {Math.floor(h.duration / 60)}:{String(h.duration % 60).padStart(2, "0")}
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-medium text-foreground line-clamp-2 text-left">{h.title}</p>
                  <p className="text-[11px] text-muted-foreground truncate text-left">{h.artist}</p>
                </button>
              ))}
            </HorizontalScroll>
            {/* Desktop: grid */}
            <div className="hidden md:grid px-4 gap-x-4 gap-y-6 md:grid-cols-2 lg:grid-cols-3">
              {recentVideos.slice(0, 10).map((h) => (
                <VideoCard
                  key={h.songId}
                  video={historyToVideoResult(h)}
                  onPlay={onPlayVideo}
                  onChannelClick={onChannelClick}
                  onFullscreen={onFullscreenVideo}
                  onAddToPlaylist={onAddToPlaylist}
                  viewMode="grid"
                />
              ))}
            </div>
          </>
        ) : (
          <div className="mx-4 rounded-xl border border-border/60 bg-muted/30 p-5 flex flex-col items-center text-center gap-2">
            <Film size={22} className="text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Você ainda não assistiu nada por aqui</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Comece a assistir vídeos para acompanhar de onde parou. Que tal explorar novidades?
            </p>
            {onNavigateToExplore && (
              <button
                onClick={onNavigateToExplore}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition"
              >
                <Compass size={12} /> Explorar vídeos
              </button>
            )}
          </div>
        )}
      </motion.section>

      {/* Personalized Recommendations */}
      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-3">
        <div className="flex items-center gap-2 px-4">
          <Sparkles size={14} className="text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Recomendados para você</h2>
          <span className="text-[10px] text-muted-foreground/70 hidden sm:inline">com base no seu histórico</span>
        </div>

        {loadingRecs ? (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-muted-foreground">Carregando recomendações...</p>
          </div>
        ) : recommendations.length > 0 ? (
          <>
            <div className="grid gap-y-6 gap-x-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 px-0 sm:px-4">
              {recommendations.slice(0, visibleRecs).map((video) => (
                <VideoCard
                  key={video.videoId}
                  video={video}
                  onPlay={onPlayVideo}
                  onChannelClick={onChannelClick}
                  onFullscreen={onFullscreenVideo}
                  onAddToPlaylist={onAddToPlaylist}
                  viewMode="grid"
                />
              ))}
              {loadingMoreRecs && Array.from({ length: 3 }).map((_, i) => (
                <div key={`sk-${i}`} className="animate-pulse">
                  <div className="w-full aspect-video rounded-xl bg-muted mb-2" />
                  <div className="h-3 bg-muted rounded w-3/4 mb-1.5" />
                  <div className="h-2.5 bg-muted rounded w-1/2" />
                </div>
              ))}
            </div>
            
            <div ref={recsSentinelRef} className="h-8" aria-hidden />
            
            {/* Load More Button */}
            {recContinuation && (
              <div className="flex justify-center px-4">
                <button
                  onClick={loadMoreRecommendations}
                  disabled={loadingMoreRecs}
                  className="px-6 py-3 bg-primary text-primary-foreground rounded-full font-semibold hover:bg-primary/90 transition-colors flex items-center gap-2"
                >
                  {loadingMoreRecs ? (
                    <>
                      <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                      Carregando...
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-4 h-4" />
                      Carregar mais recomendações
                    </>
                  )}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="mx-4 rounded-xl border border-border/60 bg-muted/30 p-5 flex flex-col items-center text-center gap-2">
            <Sparkles size={22} className="text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Nenhuma recomendação disponível</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Assista alguns vídeos e vamos personalizar sugestões com base no seu gosto.
            </p>
          </div>
        )}
      </motion.section>
    </PullToRefresh>
  );
};

export default VideoHomeScreen;