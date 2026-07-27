import { useState, useEffect, useCallback, useRef } from "react";
import HorizontalScroll from "./HorizontalScroll";
import { Search, Play, Pause, Clock, X, ChevronRight, ChevronDown, Headphones, Radio, Bell, BellOff, Gauge, RotateCcw, ListMusic, SkipForward, Plus, Trash2, Calendar, Mic, ArrowLeft, Bookmark, MoreVertical, Download, LayoutGrid, List, Rows3, Eye, Palette, Video, Star, Sparkles, Compass, Heart } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { searchYouTubeGeneral, searchYouTubeGeneralPage, loadMoreYouTubeGeneral, type VideoResult } from "@/lib/youtubeGeneralSearch";
import { getSearchSuggestions } from "@/lib/youtubeSearch";
import { Song } from "@/data/mockSongs";
import {
  getSubscriptions, subscribe, unsubscribe, isSubscribed,
  getAllInProgressEpisodes, getEpisodeProgress, addToPodcastHistory,
  getPlaybackSpeed, setPlaybackSpeed, type PodcastShow, type PodcastEpisodeProgress,
  getPodcastHistory,
  getFavoriteEpisodes, isFavoriteEpisode, toggleFavoriteEpisode, type FavoriteEpisode,
} from "@/lib/podcastStorage";
import { useChannelAutoRefresh } from "@/hooks/useAutoRefreshChannel";
import NewContentBadge from "./NewContentBadge";
import { PodcastOnAirHero, PodcastGenreTile, PodcastChartRow, PodcastRail } from "./podcast/PodcastExploreParts";
import { useToast } from "@/hooks/use-toast";

// ── Popular pre-configured podcasts ──
const POPULAR_PODCASTS = [
  { name: "The News", query: "The News Waffle podcast episódio hoje", color: "from-yellow-400 to-amber-500", thumbnail: "", daily: true },
  { name: "Flow Podcast", query: "Flow Podcast episódio completo", color: "from-purple-600 to-blue-600", thumbnail: "" },
  { name: "Podpah", query: "Podpah podcast episódio completo", color: "from-yellow-500 to-orange-600", thumbnail: "" },
  { name: "Inteligência Ltda", query: "Inteligência Ltda podcast completo", color: "from-pink-500 to-purple-600", thumbnail: "" },
  { name: "Ticaracaticast", query: "Ticaracaticast episódio completo", color: "from-red-500 to-pink-600", thumbnail: "" },
  { name: "Oeste Sem Filtro", query: "Oeste Sem Filtro Revista Oeste completo", color: "from-amber-500 to-yellow-600", thumbnail: "" },
  { name: "Beto Ribeiro", query: "Beto Ribeiro podcast crime completo", color: "from-emerald-500 to-teal-600", thumbnail: "" },
  { name: "Jornal da Manhã JP", query: "Jornal da Manhã Jovem Pan completo", color: "from-blue-500 to-cyan-600", thumbnail: "", daily: true },
  { name: "PrimoCast", query: "PrimoCast podcast completo", color: "from-green-500 to-emerald-600", thumbnail: "" },
  { name: "Canal do Rica Perrone", query: "Cara a Tapa podcast completo", color: "from-blue-600 to-indigo-700", thumbnail: "" },
  { name: "Vênus Podcast", query: "Vênus Podcast episódio completo", color: "from-pink-400 to-rose-500", thumbnail: "" },
  { name: "Os Sócios Podcast", query: "Os Sócios Podcast episódio completo", color: "from-slate-700 to-slate-900", thumbnail: "" },
  { name: "Mano a Mano", query: "Mano a Mano podcast Mano Brown", color: "from-stone-800 to-black", thumbnail: "" },
  { name: "Podcast Plenitude", query: "Podcast Plenitude completo", color: "from-cyan-400 to-blue-500", thumbnail: "" },
  { name: "G1 - O Assunto", query: "O Assunto podcast completo G1", color: "from-red-600 to-red-800", thumbnail: "", daily: true },
  { name: "Podcast de Crime", query: "Modus Operandi podcast completo", color: "from-gray-800 to-gray-900", thumbnail: "" },
  { name: "NerdCast", query: "NerdCast podcast completo", color: "from-green-700 to-green-900", thumbnail: "" },
  { name: "Pânico Jovem Pan", query: "Pânico Jovem Pan completo", color: "from-red-500 to-red-700", thumbnail: "", daily: true },
  { name: "Canal Tech", query: "Canaltech podcast completo", color: "from-blue-400 to-blue-600", thumbnail: "" },
  { name: "Petit Journal", query: "Petit Journal podcast completo", color: "from-indigo-400 to-indigo-600", thumbnail: "", daily: true },
  { name: "Xadrez Verbal", query: "Xadrez Verbal podcast completo", color: "from-amber-700 to-amber-900", thumbnail: "" },
  { name: "História em Meia Hora", query: "História em Meia Hora podcast", color: "from-orange-400 to-orange-600", thumbnail: "" },
  { name: "Stock Pickers", query: "Stock Pickers podcast completo", color: "from-emerald-400 to-emerald-600", thumbnail: "" },
  { name: "Poucast", query: "Poucast Nathalia Arcuri completo", color: "from-pink-500 to-pink-700", thumbnail: "" },
  { name: "Mauricio Meirelles", query: "Mauricio Meirelles podcast completo", color: "from-blue-500 to-blue-700", thumbnail: "" },
];


// Bump para forçar refresh das thumbnails/caches quando editamos a lista acima.
const POPULAR_LIST_VERSION = "v2-thenews";

const POPULAR_THUMBS_KEY = "xerife_popular_podcast_thumbs";
const POPULAR_THUMBS_TTL = 6 * 60 * 60 * 1000; // 6h — mantém avatares atualizados
const DAILY_STAMP_KEY = "xerife_podcast_daily_stamp";

const PODCAST_CATEGORIES = [
  { label: "Em Alta", query: "podcast em alta brasil 2025", icon: "🔥", color: "from-orange-500 to-red-600" },
  { label: "Entrevistas", query: "podcast entrevista completo brasil", icon: "🎙️", color: "from-blue-500 to-indigo-600" },
  { label: "Comédia", query: "podcast comédia brasil", icon: "😂", color: "from-yellow-400 to-orange-500" },
  { label: "True Crime", query: "podcast true crime brasil", icon: "🔍", color: "from-zinc-700 to-zinc-900" },
  { label: "Negócios", query: "podcast negócios empreendedorismo", icon: "💼", color: "from-emerald-600 to-teal-700" },
  { label: "Tecnologia", query: "podcast tecnologia brasil", icon: "💻", color: "from-slate-600 to-slate-800" },
  { label: "Esportes", query: "podcast esportes futebol brasil", icon: "⚽", color: "from-green-600 to-green-800" },
  { label: "Música", query: "podcast sobre música artistas", icon: "🎵", color: "from-purple-500 to-pink-600" },
  { label: "Saúde", query: "podcast saúde bem estar", icon: "🧘", color: "from-cyan-500 to-blue-600" },
  { label: "Educação", query: "podcast educação conhecimento", icon: "📚", color: "from-amber-600 to-orange-700" },
  { label: "Política", query: "podcast política brasil completo", icon: "🏛️", color: "from-blue-700 to-blue-900" },
  { label: "Ciência", query: "podcast ciência astronomia brasil", icon: "🧪", color: "from-indigo-600 to-purple-700" },
];

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

type PodcastTab = "home" | "explore" | "subscriptions" | "liked" | "history" | "queue";
type EpisodeFilter = "recent" | "inProgress" | "unlistened";
type PodcastViewMode = "list" | "grid" | "large";

interface PodcastScreenProps {
  onPlayPodcast: (song: Song) => void;
  currentPodcastId?: string;
  isPlaying?: boolean;
  onAddToPlaylist?: (song: Song) => void;
  onSpeedChange?: (speed: number) => void;
  onSeek?: (fraction: number) => void;
  currentTime?: number;
  duration?: number;
}

const CACHE_KEY = "xerife_podcast_cache";
const CACHE_TTL = 24 * 60 * 60 * 1000; // diário: renova thumbnails, áudios e vídeos a cada 24h
const QUEUE_KEY = "xerife_podcast_queue";

function getCached(key: string): VideoResult[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw);
    if (cache[key] && Date.now() - cache[key].ts < CACHE_TTL) return cache[key].results;
  } catch {}
  return null;
}

function setCache(key: string, results: VideoResult[]) {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const cache = raw ? JSON.parse(raw) : {};
    cache[key] = { results, ts: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

function formatDur(seconds: number): string {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

function formatTimeAgo(seconds: number): string {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Parse relative time strings like "2 meses atrás", "1 dia atrás", "3 semanas atrás" into a rough numeric score (lower = more recent) */
function parsePublishedTimeToScore(publishedTime: string): number {
  if (!publishedTime) return 999999;
  const lower = publishedTime.toLowerCase();
  const numMatch = lower.match(/(\d+)/);
  const num = numMatch ? parseInt(numMatch[1], 10) : 1;

  if (lower.includes("segundo") || lower.includes("second")) return num;
  if (lower.includes("minuto") || lower.includes("minute")) return num * 60;
  if (lower.includes("hora") || lower.includes("hour")) return num * 3600;
  if (lower.includes("dia") || lower.includes("day")) return num * 86400;
  if (lower.includes("semana") || lower.includes("week")) return num * 604800;
  if (lower.includes("mês") || lower.includes("meses") || lower.includes("month")) return num * 2592000;
  if (lower.includes("ano") || lower.includes("year")) return num * 31536000;
  // "Transmitido há X" patterns
  if (lower.includes("stream")) return num * 86400;
  return 999999;
}

function videoToSong(v: VideoResult): Song {
  return {
    id: `yt-${v.videoId}`, youtubeId: v.videoId,
    title: v.title, artist: v.channel, album: v.channel,
    cover: v.thumbnail, duration: v.lengthSeconds,
    votes: 0, isDownloaded: false, type: "podcast",
  };
}

function groupByShow(results: VideoResult[]): { channel: string; thumbnail: string; channelThumbnail: string; episodes: VideoResult[] }[] {
  const map = new Map<string, { channel: string; thumbnail: string; channelThumbnail: string; episodes: VideoResult[] }>();
  for (const v of results) {
    if (!map.has(v.channel)) {
      map.set(v.channel, { channel: v.channel, thumbnail: v.thumbnail, channelThumbnail: v.channelThumbnail || v.thumbnail, episodes: [] });
    }
    map.get(v.channel)!.episodes.push(v);
  }
  return Array.from(map.values()).sort((a, b) => b.episodes.length - a.episodes.length);
}

/**
 * Converte publishedTime ("há 2 horas", "2 days ago", "há 1 mês") em segundos aproximados desde a publicação.
 * Retorna Number.MAX_SAFE_INTEGER quando não conseguir interpretar (para ficar por último ao ordenar desc).
 */
function parsePublishedAgo(text?: string): number {
  if (!text) return Number.MAX_SAFE_INTEGER;
  const t = text.toLowerCase();
  const m = t.match(/(\d+)\s*(segundo|minuto|hora|dia|semana|mês|mes|ano|second|minute|hour|day|week|month|year)/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  const n = parseInt(m[1], 10);
  const unit = m[2];
  const mult: Record<string, number> = {
    segundo: 1, second: 1,
    minuto: 60, minute: 60,
    hora: 3600, hour: 3600,
    dia: 86400, day: 86400,
    semana: 7 * 86400, week: 7 * 86400,
    mês: 30 * 86400, mes: 30 * 86400, month: 30 * 86400,
    ano: 365 * 86400, year: 365 * 86400,
  };
  return n * (mult[unit] || Number.MAX_SAFE_INTEGER);
}

function sortByRecency<T extends { publishedTime?: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => parsePublishedAgo(a.publishedTime) - parsePublishedAgo(b.publishedTime));
}

function getPodcastQueue(): Song[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); } catch { return []; }
}
function savePodcastQueue(queue: Song[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

const PodcastScreen = ({ onPlayPodcast, currentPodcastId, isPlaying, onAddToPlaylist, onSpeedChange, onSeek, currentTime = 0, duration = 0 }: PodcastScreenProps) => {
  const [isDraggingSeek, setIsDraggingSeek] = useState(false);
  const [dragTime, setDragTime] = useState(0);
  const seekRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<PodcastTab>("home");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<VideoResult[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [activeCategory, setActiveCategory] = useState(PODCAST_CATEGORIES[0].label);
  const [categoryResults, setCategoryResults] = useState<VideoResult[]>([]);
  const [loadingCategory, setLoadingCategory] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [expandedShow, setExpandedShow] = useState<string | null>(null);
  const [subs, setSubs] = useState<PodcastShow[]>(getSubscriptions());
  const [speed, setSpeed] = useState(getPlaybackSpeed());
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [inProgress, setInProgress] = useState<PodcastEpisodeProgress[]>(getAllInProgressEpisodes());
  const [history, setHistory] = useState(getPodcastHistory());
  const [favEpisodes, setFavEpisodes] = useState<FavoriteEpisode[]>(getFavoriteEpisodes());
  const [podcastQueue, setPodcastQueue] = useState<Song[]>(getPodcastQueue());
  const [autoPlay, setAutoPlay] = useState(() => localStorage.getItem("xerife_podcast_autoplay") !== "false");
  const [channelEpisodes, setChannelEpisodes] = useState<{ channel: string; channelThumbnail?: string; episodes: VideoResult[]; description?: string } | null>(null);
  const [loadingChannel, setLoadingChannel] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [loadingMoreEpisodes, setLoadingMoreEpisodes] = useState(false);
  const [episodeFilter, setEpisodeFilter] = useState<EpisodeFilter>("recent");
  const [popularThumbs, setPopularThumbs] = useState<Record<string, string>>({});
  const [loadingPopularThumbs, setLoadingPopularThumbs] = useState(true);
  const [channelSearchQuery, setChannelSearchQuery] = useState("");
  const [showChannelSearch, setShowChannelSearch] = useState(false);
  const [viewMode, setViewMode] = useState<PodcastViewMode>(() => (localStorage.getItem("xerife_podcast_viewmode") as PodcastViewMode) || "list");
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [mediaFilter, setMediaFilter] = useState<"all" | "audio" | "video">("all");
  const [epContinuation, setEpContinuation] = useState<string>();
  const [loadingMoreEps, setLoadingMoreEps] = useState(false);
  const { toast } = useToast();
  const prevEndedRef = useRef(false);

  // Auto-refresh para episódios de canal
  const {
    newContentCount,
    forceRefresh,
    resetNewContentCount
  } = useChannelAutoRefresh(
    channelEpisodes?.channel || "",
    (name, options) => searchYouTubeGeneral(`${name} podcast episódio`, options),
    {
      enabled: !!channelEpisodes,
      interval: 2 * 60 * 1000, // 2 minutos
      onNewContent: (count) => {
        toast({
          title: "Novos episódios!",
          description: `${count} novo(s) episódio(s) de ${channelEpisodes?.channel}`,
        });
      }
    }
  );

  // Fetch real thumbnails for popular podcasts
  useEffect(() => {
    try {
      const cached = localStorage.getItem(POPULAR_THUMBS_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        const versionOk = parsed.version === POPULAR_LIST_VERSION;
        if (versionOk && Date.now() - parsed.ts < POPULAR_THUMBS_TTL && Object.keys(parsed.thumbs).length > 0) {
          setPopularThumbs(parsed.thumbs);
          setLoadingPopularThumbs(false);
          return;
        }
      }
    } catch {}

    const fetchThumbs = async () => {
      setLoadingPopularThumbs(true);
      const thumbs: Record<string, string> = {};
      await Promise.all(
        POPULAR_PODCASTS.map(async (p) => {
          try {
            const results = await searchYouTubeGeneral(p.query);
            // Prefer the CHANNEL avatar (mais estável e atualizado) sobre a thumb do vídeo.
            const withChannel = results.find(r => r.channelThumbnail && r.channelThumbnail.startsWith("http"));
            if (withChannel?.channelThumbnail) {
              thumbs[p.name] = withChannel.channelThumbnail;
            } else if (withChannel) {
              thumbs[p.name] = withChannel.thumbnail;
            } else if (results[0]) {
              thumbs[p.name] = results[0].thumbnail;
            }
          } catch {}

        })
      );
      if (Object.keys(thumbs).length > 0) {
        setPopularThumbs(thumbs);
        localStorage.setItem(POPULAR_THUMBS_KEY, JSON.stringify({ thumbs, ts: Date.now(), version: POPULAR_LIST_VERSION }));
      }
      setLoadingPopularThumbs(false);
    };
    fetchThumbs();

    // Prefetch em background: episódios recentes dos podcasts DIÁRIOS (The News, etc.)
    // Assim quando o usuário clicar em "The News", os eps já estarão em memória.
    const prefetchDaily = async () => {
      const daily = POPULAR_PODCASTS.filter((p: any) => p.daily);
      const today = new Date();
      const dateStr = today.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
      await Promise.all(
        daily.map(async (p) => {
          try {
            // Uma única query prioritária por podcast, com bypass de cache diário
            await searchYouTubeGeneral(`${p.name} episódio hoje ${dateStr}`, { fresh: true, noCache: true });
            // E a query oficial para preaquecer o cache padrão
            if (p.query) await searchYouTubeGeneral(p.query, { fresh: true });
          } catch {}
        })
      );
    };
    // Delay pequeno para não competir com o carregamento inicial da tela
    const prefetchTimer = setTimeout(prefetchDaily, 800);
    return () => clearTimeout(prefetchTimer);
  }, []);


  const refreshSubs = () => setSubs(getSubscriptions());

  // Auto-play next episode when current ends
  useEffect(() => {
    if (!autoPlay || !currentPodcastId) return;
    const isEnded = currentTime > 0 && duration > 0 && (currentTime / duration) > 0.98;
    if (isEnded && !prevEndedRef.current && podcastQueue.length > 0) {
      const next = podcastQueue[0];
      const remaining = podcastQueue.slice(1);
      setPodcastQueue(remaining);
      savePodcastQueue(remaining);
      onPlayPodcast(next);
    }
    prevEndedRef.current = isEnded;
  }, [currentTime, duration, autoPlay, currentPodcastId, podcastQueue, onPlayPodcast]);

  const fetchCategory = useCallback(async (cat: typeof PODCAST_CATEGORIES[0]) => {
    const cached = getCached(cat.label);
    if (cached && cached.length >= 20) { setCategoryResults(cached); return; }
    setLoadingCategory(true);
    try {
      // Fan-out de variantes para uma exploração minuciosa do gênero
      const variants = [
        cat.query,
        `${cat.query} completo`,
        `${cat.query} episódio`,
        `${cat.query} 2025`,
        `melhores ${cat.label.toLowerCase()} podcast brasil`,
        `podcast ${cat.label.toLowerCase()} em alta`,
      ];
      const settled = await Promise.allSettled(
        variants.map((v) => searchYouTubeGeneral(v))
      );
      const all: VideoResult[] = [];
      for (const s of settled) if (s.status === "fulfilled") all.push(...s.value);

      // Dedupe por videoId
      const byId = new Map<string, VideoResult>();
      for (const v of all) if (!byId.has(v.videoId)) byId.set(v.videoId, v);

      const parseViews = (v: string) => {
        const n = parseFloat((v || "").replace(/[^\d.,]/g, "").replace(",", "."));
        if (isNaN(n)) return 0;
        if (/mi|m\b/i.test(v)) return n * 1_000_000;
        if (/mil|k\b/i.test(v)) return n * 1_000;
        return n;
      };
      const recencyBoost = (p: string) => {
        if (!p) return 0;
        if (/hora|hour|minuto|min/i.test(p)) return 30;
        if (/dia|day/i.test(p)) return 25;
        if (/semana|week/i.test(p)) return 18;
        if (/m[eê]s|month/i.test(p)) return 10;
        if (/ano|year/i.test(p)) return 2;
        return 0;
      };
      const ranked = Array.from(byId.values())
        .filter((v) => v.lengthSeconds > 300) // só formato podcast
        .map((v) => {
          let s = 0;
          s += Math.min(25, Math.log10(parseViews(v.views) + 1) * 3.5);
          s += recencyBoost(v.publishedTime);
          if (v.lengthSeconds >= 60 * 60) s += 6;
          return { v, s };
        })
        .sort((a, b) => b.s - a.s)
        .map((x) => x.v);

      const final = ranked.length > 0
        ? ranked.slice(0, 60)
        : Array.from(byId.values()).slice(0, 30);
      setCategoryResults(final);
      setCache(cat.label, final);
    } catch { setCategoryResults([]); }
    finally { setLoadingCategory(false); }
  }, []);


  useEffect(() => {
    if ((tab === "explore" || tab === "home") && !channelEpisodes) {
      const cat = PODCAST_CATEGORIES.find(c => c.label === activeCategory);
      if (cat && !hasSearched) fetchCategory(cat);
    }
  }, [activeCategory, fetchCategory, hasSearched, tab, channelEpisodes]);

  // Bottom-nav bridge: while in Podcast mode, the shell dispatches
  // `xerife:podcast-nav` with a sub-tab id so Início/Explorar/Favoritos map
  // onto internal Podcast screens without changing route/module.
  useEffect(() => {
    const onNav = (e: Event) => {
      const detail = (e as CustomEvent<{ target?: string; focusSearch?: boolean }>).detail || {};
      const target = detail.target;
      if (target === "home") {
        setChannelEpisodes(null);
        setSearchQuery("");
        setSearchResults([]);
        setHasSearched(false);
        setShowSuggestions(false);
        setTab("home");
        try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch {}
      } else if (target === "explore") {
        setChannelEpisodes(null);
        setTab("explore");
        if (detail.focusSearch) {
          setTimeout(() => {
            try {
              const input = document.querySelector<HTMLInputElement>('input[data-podcast-search="1"]');
              input?.focus();
            } catch {}
          }, 50);
        }
      } else if (target === "liked" || target === "favorites") {
        setChannelEpisodes(null);
        setTab("liked");
      } else if (target === "subscriptions") {
        setChannelEpisodes(null);
        setTab("subscriptions");
      } else if (target === "queue") {
        setChannelEpisodes(null);
        setTab("queue");
      } else if (target === "history") {
        setChannelEpisodes(null);
        setTab("history");
      }
    };
    window.addEventListener("xerife:podcast-nav", onNav as EventListener);
    return () => window.removeEventListener("xerife:podcast-nav", onNav as EventListener);
  }, []);

  // Initial load effect + daily refresh: se mudou o dia, invalida caches e re-busca
  const checkDailyRefresh = useCallback((): boolean => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const lastStamp = localStorage.getItem(DAILY_STAMP_KEY);
      if (lastStamp !== today) {
        localStorage.removeItem(CACHE_KEY);
        localStorage.removeItem(POPULAR_THUMBS_KEY);
        localStorage.setItem(DAILY_STAMP_KEY, today);
        return true;
      }
    } catch {}
    return false;
  }, []);

  useEffect(() => {
    const init = async () => {
      setIsInitialLoading(true);
      checkDailyRefresh();
      const cat = PODCAST_CATEGORIES[0];
      await fetchCategory(cat);
      setIsInitialLoading(false);
    };
    init();
  }, [fetchCategory, checkDailyRefresh]);

  // Revalida diariamente quando o app volta ao foco (usuários que deixam aberto por dias)
  useEffect(() => {
    const onFocus = async () => {
      if (document.visibilityState !== "visible") return;
      const refreshed = checkDailyRefresh();
      if (refreshed) {
        const cat = PODCAST_CATEGORIES.find(c => c.label === activeCategory) || PODCAST_CATEGORIES[0];
        await fetchCategory(cat);
      }
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [activeCategory, fetchCategory, checkDailyRefresh]);

  useEffect(() => {
    setInProgress(getAllInProgressEpisodes());
    setHistory(getPodcastHistory());
  }, [currentPodcastId, isPlaying]);

  useEffect(() => {
    const refresh = () => setFavEpisodes(getFavoriteEpisodes());
    window.addEventListener("xerife:podcast-favs-updated", refresh);
    return () => window.removeEventListener("xerife:podcast-favs-updated", refresh);
  }, []);

  const handleToggleFavEpisode = (ep: VideoResult) => {
    toggleFavoriteEpisode({
      episodeId: `yt-${ep.videoId}`,
      title: ep.title,
      channel: ep.channel,
      thumbnail: ep.thumbnail,
      duration: ep.lengthSeconds,
    });
  };

  const handleSearch = async (q: string) => {
    const query = q.trim();
    if (!query) return;
    setIsSearching(true); setHasSearched(true); setShowSuggestions(false);
    try {
      // Múltiplas variantes em paralelo para uma busca minuciosa
      const variants = [
        `${query} podcast`,
        `${query} podcast completo`,
        `${query} podcast episódio`,
        `podcast ${query} cast`,
        `${query} entrevista podcast`,
      ];
      const settled = await Promise.allSettled(
        variants.map((v) => searchYouTubeGeneral(v))
      );
      const all: VideoResult[] = [];
      for (const s of settled) if (s.status === "fulfilled") all.push(...s.value);

      // Dedupe por videoId
      const byId = new Map<string, VideoResult>();
      for (const v of all) if (!byId.has(v.videoId)) byId.set(v.videoId, v);

      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      const parseViews = (v: string) => {
        const n = parseFloat(v.replace(/[^\d.,]/g, "").replace(",", "."));
        if (isNaN(n)) return 0;
        if (/mi|m\b/i.test(v)) return n * 1_000_000;
        if (/mil|k\b/i.test(v)) return n * 1_000;
        return n;
      };
      const recencyBoost = (p: string) => {
        if (!p) return 0;
        if (/hora|hour|minuto|min/i.test(p)) return 30;
        if (/dia|day/i.test(p)) return 25;
        if (/semana|week/i.test(p)) return 18;
        if (/m[eê]s|month/i.test(p)) return 10;
        if (/ano|year/i.test(p)) return 2;
        return 0;
      };
      const score = (v: VideoResult) => {
        const title = v.title.toLowerCase();
        const channel = (v.channel || "").toLowerCase();
        let s = 0;
        for (const t of terms) {
          if (title.includes(t)) s += 12;
          if (channel.includes(t)) s += 10;
        }
        if (/podcast|cast|episódio|entrevista/i.test(title + " " + channel)) s += 8;
        s += Math.min(20, Math.log10(parseViews(v.views) + 1) * 3); // popularidade
        s += recencyBoost(v.publishedTime);                          // em alta
        if (v.lengthSeconds >= 20 * 60) s += 6;                      // formato longo (podcast real)
        if (v.lengthSeconds >= 60 * 60) s += 4;
        if (v.lengthSeconds < 120) s -= 50;
        return s;
      };

      const ranked = Array.from(byId.values())
        .filter((v) => v.lengthSeconds > 120)
        .map((v) => ({ v, s: score(v) }))
        .sort((a, b) => b.s - a.s)
        .slice(0, 40)
        .map((x) => x.v);

      setSearchResults(ranked);
    } catch { setSearchResults([]); }
    finally { setIsSearching(false); }
  };


  const handleInput = (val: string) => {
    setSearchQuery(val);
    if (val.length >= 2) {
      getSearchSuggestions(`podcast ${val}`).then(s => {
        setSuggestions(s.map(x => x.replace(/^podcast\s*/i, "")));
        setShowSuggestions(true);
      });
    } else setShowSuggestions(false);
  };

  const clearSearch = () => { setSearchQuery(""); setSearchResults([]); setHasSearched(false); setShowSuggestions(false); };

  const handlePlayEpisode = (ep: VideoResult) => {
    const song = videoToSong(ep);
    addToPodcastHistory({ episodeId: song.id, title: ep.title, channel: ep.channel, thumbnail: ep.thumbnail, duration: ep.lengthSeconds });
    onPlayPodcast(song);
  };

  const handlePlayEpisodeWithQueue = (ep: VideoResult, allEpisodes: VideoResult[], index: number) => {
    const song = videoToSong(ep);
    addToPodcastHistory({ episodeId: song.id, title: ep.title, channel: ep.channel, thumbnail: ep.thumbnail, duration: ep.lengthSeconds });
    const remaining = allEpisodes.slice(index + 1).map(videoToSong);
    setPodcastQueue(remaining);
    savePodcastQueue(remaining);
    onPlayPodcast(song);
  };

  const handleToggleSubscribe = (channel: string, thumbnail: string) => {
    if (isSubscribed(channel)) { unsubscribe(channel); }
    else { subscribe({ channelId: channel, name: channel, thumbnail }); }
    refreshSubs();
  };

  const handleSpeedChange = (newSpeed: number) => {
    setSpeed(newSpeed);
    setPlaybackSpeed(newSpeed);
    onSpeedChange?.(newSpeed);
    setShowSpeedMenu(false);
  };

  const addToQueue = (song: Song) => {
    const newQueue = [...podcastQueue, song];
    setPodcastQueue(newQueue);
    savePodcastQueue(newQueue);
  };

  const removeFromQueue = (index: number) => {
    const newQueue = podcastQueue.filter((_, i) => i !== index);
    setPodcastQueue(newQueue);
    savePodcastQueue(newQueue);
  };

  const clearQueue = () => {
    setPodcastQueue([]);
    savePodcastQueue([]);
  };

  // Função para carregar mais episódios com paginação
  const loadMoreEpisodes = async () => {
    if (!epContinuation || loadingMoreEps || !channelEpisodes) return;
    setLoadingMoreEps(true);
    
    try {
      const result = await loadMoreYouTubeGeneral(epContinuation, 20);
      
      const existing = new Set(channelEpisodes.episodes.map(e => e.videoId));
      const newEps = result.results.filter(e => !existing.has(e.videoId));
      
      if (newEps.length > 0) {
        setChannelEpisodes(prev => ({
          ...prev!,
          episodes: [...prev!.episodes, ...newEps]
        }));
        
        toast({
          title: "Mais episódios carregados!",
          description: `${newEps.length} novo(s) episódio(s) adicionado(s)`,
        });
      }
      
      setEpContinuation(result.continuation);
    } catch (error) {
      console.error("Erro ao carregar mais episódios:", error);
    } finally {
      setLoadingMoreEps(false);
    }
  };

  const browseChannel = async (channelName: string, channelThumb?: string, extraQueries?: string[], opts?: { daily?: boolean }) => {
    setLoadingChannel(true);
    setShowFullDescription(false);
    setChannelSearchQuery("");
    setShowChannelSearch(false);
    setEpisodeFilter("recent");
    // Abre o painel do canal IMEDIATAMENTE (com skeleton) para dar resposta instantânea ao toque.
    setChannelEpisodes({
      channel: channelName,
      channelThumbnail: channelThumb,
      episodes: [],
      description: "",
    });
    try {
      const today = new Date();
      const dateStr = today.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
      const freshnessQueries = opts?.daily ? [
        `${channelName} episódio hoje ${dateStr}`,
        `${channelName} novo episódio hoje`,
        `${channelName} último episódio`,
        `${channelName} episódio ${today.getFullYear()}`,
      ] : [
        `${channelName} novo episódio hoje`,
        `${channelName} último episódio`,
        `${channelName} episódio ${today.getFullYear()}`,
      ];
      const catalogQueries = [
        `${channelName} podcast episódio completo`,
        `${channelName} podcast`,
        `${channelName} episódio novo`,
      ];
      const extras = extraQueries || [];
      const freshList = [...extras, ...freshnessQueries];
      const nameLower = channelName.toLowerCase();

      const mergeResults = (results: VideoResult[], prevSeen: Set<string>) => {
        const added: VideoResult[] = [];
        for (const v of results) {
          const channelLower = v.channel.toLowerCase();
          const isMatch = channelLower.includes(nameLower) || nameLower.includes(channelLower);
          if (isMatch && !prevSeen.has(v.videoId)) {
            prevSeen.add(v.videoId);
            added.push(v);
          }
        }
        return added;
      };

      const seenIds = new Set<string>();
      let firstDescription = "";
      let firstChannelThumb = channelThumb || "";
      let firstResultArrived = false;

      // Fase 1: buscas de recência em PARALELO — atualiza a UI assim que a primeira chega.
      // Para diários (The News etc), bypass do cache para garantir eps do dia.
      const searchOpts = opts?.daily ? { fresh: true, noCache: true } : { fresh: true };
      const freshPromises = freshList.map((q) =>
        searchYouTubeGeneral(q, searchOpts).catch(() => [] as VideoResult[])
      );
      await Promise.all(
        freshPromises.map(async (p) => {
          const results = await p;
          const added = mergeResults(results, seenIds);
          if (added.length === 0) return;
          if (!firstDescription) {
            const withDesc = added.find((v) => v.description);
            if (withDesc) firstDescription = withDesc.description;
          }
          if (!firstChannelThumb) {
            const withThumb = added.find((v) => v.channelThumbnail);
            if (withThumb) firstChannelThumb = withThumb.channelThumbnail;
          }
          setChannelEpisodes((prev) => ({
            channel: channelName,
            channelThumbnail: firstChannelThumb || prev?.channelThumbnail,
            episodes: sortByRecency([...(prev?.episodes || []), ...added]),
            description: firstDescription || prev?.description || "",
          }));
          // Assim que os primeiros episódios chegam, tira o skeleton para exibir o que já temos.
          if (!firstResultArrived) {
            firstResultArrived = true;
            setLoadingChannel(false);
          }
        })
      );

      // Se nenhum resultado chegou na fase 1, ainda deixa o loading rolar até a fase 2.
      if (firstResultArrived) setLoadingChannel(false);

      // Fase 2: catálogo geral em paralelo, em background (não bloqueia UI).
      const catalogResults = await Promise.all(
        catalogQueries.map((q) => searchYouTubeGeneral(q).catch(() => [] as VideoResult[]))
      );
      const catalogAdded: VideoResult[] = [];
      for (const results of catalogResults) catalogAdded.push(...mergeResults(results, seenIds));
      if (catalogAdded.length > 0) {
        setChannelEpisodes((prev) => prev ? {
          ...prev,
          episodes: sortByRecency([...prev.episodes, ...catalogAdded]),
        } : prev);
      }
    } catch {
      setChannelEpisodes((prev) => prev ?? { channel: channelName, episodes: [] });
    } finally {
      setLoadingChannel(false);
    }
  };



  const browsePopularPodcast = (podcast: typeof POPULAR_PODCASTS[0]) => {
    // Injeta a query oficial (ex: "The News Waffle podcast episódio hoje") como reforço de recência.
    // Para podcasts diários, força bypass de cache para pegar o episódio do dia.
    browseChannel(podcast.name, podcast.thumbnail, podcast.query ? [podcast.query] : undefined, { daily: (podcast as any).daily });
  };


  const rawDisplayResults = hasSearched ? searchResults : categoryResults;
  // Heurística para separar perfis "áudio" (longos, 45min+) de "vídeo" (curtos/clipes)
  const displayResults = mediaFilter === "all"
    ? rawDisplayResults
    : mediaFilter === "audio"
      ? rawDisplayResults.filter(v => (v.lengthSeconds || 0) >= 45 * 60)
      : rawDisplayResults.filter(v => (v.lengthSeconds || 0) < 45 * 60);
  const shows = groupByShow(displayResults);

  // ── Channel Detail View (YouTube Music style) ──
  const renderChannelDetail = () => {
    if (!channelEpisodes) return null;
    const ch = channelEpisodes;
    const bannerEp = ch.episodes[0];

    return (
      <div className="space-y-0 -mx-3 sm:-mx-4 lg:-mx-6">
        {/* Sticky top bar: back button + channel name (sempre visível ao rolar) */}
        <div className="sticky top-0 z-30 flex items-center gap-3 px-3 py-2 bg-background/85 backdrop-blur-md border-b border-border/40">
          <button
            onClick={() => setChannelEpisodes(null)}
            aria-label="Voltar"
            className="flex-shrink-0 w-9 h-9 rounded-full hover:bg-accent flex items-center justify-center text-foreground transition-colors active:scale-95"
          >
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-base font-bold text-foreground truncate flex-1">{ch.channel}</h2>
        </div>
        {/* Banner + Channel Info — YouTube Music style */}
        <div className="relative">
          {bannerEp && (
            <div className="h-52 sm:h-64 overflow-hidden bg-black relative">
              {/* Blurred fill layer behind main image */}
              <img src={bannerEp.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover blur-2xl scale-125 opacity-60" />
              {/* Sharp centered image */}
              <img src={bannerEp.thumbnail} alt="" className="relative w-full h-full object-contain z-[1]" />
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/20 to-background z-[2]" />
            </div>
          )}
          {!bannerEp && <div className="h-52 bg-gradient-to-b from-primary/10 to-background" />}

          {/* Back button removido — agora existe uma sticky top bar acima do banner */}


          {/* Search icon */}
          <button onClick={() => { setShowChannelSearch(!showChannelSearch); setChannelSearchQuery(""); }}
            className="absolute top-4 right-4 z-20 w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/60 transition-all">
            <Search size={18} />
          </button>

          {/* Channel avatar + name + description overlay */}
          <div className="absolute bottom-0 left-0 right-0 px-4 pb-3">
            <div className="flex items-end gap-3 mb-1">
              {ch.channelThumbnail && (
                <img src={ch.channelThumbnail} alt={ch.channel}
                  className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover border-2 border-white/30 shadow-lg flex-shrink-0" />
              )}
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight drop-shadow-lg">{ch.channel}</h1>
            </div>
            {ch.description && (
              <div className="mt-1">
                <p className={`text-xs text-white/70 leading-relaxed ${showFullDescription ? "" : "line-clamp-1"}`}>
                  {ch.description}
                </p>
                <button onClick={() => setShowFullDescription(!showFullDescription)}
                  className="text-xs text-white/50 hover:text-white/80 transition-colors mt-0.5">
                  {showFullDescription ? "Menos" : "...Mais"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Action buttons — matches YT Music reference */}
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => ch.episodes.length > 0 && handlePlayEpisodeWithQueue(ch.episodes[0], ch.episodes, 0)}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-white text-black hover:bg-white/90 transition-all font-bold text-sm shadow-lg active:scale-95">
            <Play size={18} fill="currentColor" />
            Reproduzir
          </button>
          <button onClick={() => handleToggleSubscribe(ch.channel, ch.channelThumbnail || ch.episodes[0]?.thumbnail || "")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold transition-all ${
              isSubscribed(ch.channel)
                ? "bg-secondary/80 text-foreground border border-border/50"
                : "bg-secondary text-foreground hover:bg-secondary/80"
            }`}>
            <Star size={16} className={isSubscribed(ch.channel) ? "fill-primary text-primary" : ""} />
            {isSubscribed(ch.channel) ? "Favoritado" : "Favoritar"}
          </button>
          <button className="p-2.5 rounded-full bg-secondary/60 hover:bg-secondary transition-colors">
            <MoreVertical size={18} className="text-muted-foreground" />
          </button>
        </div>

        {/* Channel search bar */}
        <AnimatePresence>
          {showChannelSearch && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="px-4 overflow-hidden">
              <div className="flex items-center gap-2 bg-secondary/80 rounded-xl px-3 py-2.5 border border-border/50 focus-within:border-primary/40 transition-colors">
                <Search size={16} className="text-muted-foreground flex-shrink-0" />
                <input type="text" placeholder={`Buscar em ${ch.channel}...`} value={channelSearchQuery} autoFocus
                  onChange={(e) => setChannelSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 outline-none" />
                {channelSearchQuery && (
                  <button onClick={() => setChannelSearchQuery("")} className="p-1 rounded-full hover:bg-accent transition-colors">
                    <X size={14} className="text-muted-foreground" />
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Episode filters — YouTube Music style pills */}
        <HorizontalScroll className="flex gap-2 px-4 py-2">
          {([
            { id: "recent" as EpisodeFilter, label: "Mais recentes" },
            { id: "inProgress" as EpisodeFilter, label: "Em andamento" },
            { id: "unlistened" as EpisodeFilter, label: "Não ouvidos" },
          ]).map(f => (
            <button key={f.id} onClick={() => setEpisodeFilter(f.id)}
              className={`flex-shrink-0 px-4 py-2 rounded-lg text-xs font-semibold transition-all border ${
                episodeFilter === f.id
                  ? "bg-white text-black border-white"
                  : "bg-transparent text-muted-foreground border-border hover:border-foreground/30"
              }`}>
              {f.id === "recent" && "☰ "}{f.label}
            </button>
          ))}
        </HorizontalScroll>

        {/* Episode count */}
        <div className="px-4 py-1">
          <p className="text-[11px] text-muted-foreground">
            {ch.episodes.length} episódio{ch.episodes.length !== 1 ? "s" : ""} encontrado{ch.episodes.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Episodes list */}
        <div className="px-4 pt-1 pb-24 space-y-1">
          {loadingChannel ? (
            <div className="space-y-4 pt-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="animate-pulse space-y-2">
                  <div className="flex gap-3">
                    <div className="w-28 h-[72px] rounded-xl bg-secondary/60 flex-shrink-0" />
                    <div className="flex-1 space-y-2 py-1">
                      <div className="h-4 bg-secondary/60 rounded w-4/5" />
                      <div className="h-3 bg-secondary/40 rounded w-2/3" />
                      <div className="h-3 bg-secondary/30 rounded w-1/3" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (() => {
            const filtered = ch.episodes.filter(ep => {
              if (channelSearchQuery.trim()) {
                const q = channelSearchQuery.toLowerCase();
                if (!ep.title.toLowerCase().includes(q) && !ep.description?.toLowerCase().includes(q)) return false;
              }
              const songId = `yt-${ep.videoId}`;
              const progress = getEpisodeProgress(songId);
              if (episodeFilter === "inProgress") {
                return progress && progress.currentTime > 30 && !progress.completedAt;
              }
              if (episodeFilter === "unlistened") {
                return !progress || progress.currentTime <= 30;
              }
              return true;
            }).sort((a, b) => parsePublishedTimeToScore(a.publishedTime) - parsePublishedTimeToScore(b.publishedTime));

            if (filtered.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Headphones size={36} className="mb-3 opacity-20" />
                  <p className="text-sm font-medium">
                    {channelSearchQuery ? "Nenhum resultado encontrado" : episodeFilter === "inProgress" ? "Nenhum episódio em andamento" : "Todos os episódios já foram ouvidos"}
                  </p>
                  <button onClick={() => { setEpisodeFilter("recent"); setChannelSearchQuery(""); }} className="text-xs text-primary mt-2 hover:underline">
                    Ver todos
                  </button>
                </div>
              );
            }

            return (
              <>
                {filtered.map((ep, i) => {
                  const song = videoToSong(ep);
                  const isActive = currentPodcastId === song.id;
                  const progress = getEpisodeProgress(song.id);
                  const progressPct = isActive 
                    ? (duration > 0 ? (currentTime / duration) * 100 : 0)
                    : (progress && progress.duration > 0 ? (progress.currentTime / progress.duration) * 100 : 0);
                  const isLive = ep.duration === "0:00" || ep.lengthSeconds === 0;

                  return (
                    <motion.div key={ep.videoId} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.02, 0.3) }}
                      className="py-3 border-b border-border/20 last:border-0">
                      <div className="flex gap-3">
                        {/* Episode thumbnail */}
                        <button onClick={() => handlePlayEpisodeWithQueue(ep, filtered, i)}
                          className="relative flex-shrink-0 group">
                          <img src={ep.thumbnail} alt="" className="w-28 h-[72px] rounded-xl object-cover" />
                          <div className="absolute inset-0 rounded-xl bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            {isActive && isPlaying ? <Pause size={20} className="text-white" /> : <Play size={20} className="text-white" />}
                          </div>
                          {progressPct > 0 && (
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40 rounded-b-xl overflow-hidden">
                              <div className="h-full bg-primary" style={{ width: `${progressPct}%` }} />
                            </div>
                          )}
                        </button>

                        {/* Episode info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <button onClick={() => handlePlayEpisodeWithQueue(ep, filtered, i)} className="text-left flex-1 min-w-0">
                              <h4 className={`text-sm font-bold leading-tight line-clamp-2 ${isActive ? "text-primary" : "text-foreground"}`}>
                                {ep.title}
                              </h4>
                            </button>
                            <button className="p-1 flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors">
                              <MoreVertical size={16} />
                            </button>
                          </div>

                          {ep.description && (
                            <p className="text-xs text-muted-foreground/70 line-clamp-2 mt-1 leading-relaxed">{ep.description}</p>
                          )}

                          <div className="flex items-center gap-2 mt-2">
                            {isLive && (
                              <span className="bg-destructive text-destructive-foreground text-[9px] font-bold px-2 py-0.5 rounded uppercase">AO VIVO</span>
                            )}
                            {ep.publishedTime && (
                              <span className="text-[11px] text-muted-foreground">{ep.publishedTime}</span>
                            )}
                            {!isLive && ep.lengthSeconds > 0 && (
                              <>
                                <span className="text-muted-foreground/30">·</span>
                                <span className="text-[11px] text-muted-foreground">{formatDur(ep.lengthSeconds)}</span>
                              </>
                            )}
                          </div>

                          {/* Action buttons row */}
                          <div className="flex items-center gap-3 mt-2.5">
                            <button className="p-1.5 rounded-full hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
                              <Download size={16} />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); addToQueue(song); }}
                              className="p-1.5 rounded-full hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground" title="Adicionar à fila">
                              <Plus size={16} />
                            </button>
                            <button onClick={() => handlePlayEpisodeWithQueue(ep, filtered, i)}
                              className="p-1.5 rounded-full hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
                              <Play size={16} />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Playing indicator */}
                      {isActive && isPlaying && (
                        <div className="flex items-center gap-2 mt-2 px-1">
                          <div className="flex items-end gap-[2px] h-3">
                            {[1,2,3,4].map(n => (
                              <motion.div key={n} className="w-[2px] bg-primary rounded-full"
                                animate={{ height: [3, 10, 4, 9, 3] }}
                                transition={{ duration: 1.2, repeat: Infinity, delay: n * 0.15 }} />
                            ))}
                          </div>
                          <span className="text-[10px] text-primary font-medium">Reproduzindo agora</span>
                        </div>
                      )}
                    </motion.div>
                  );
                })}

                {/* Load more button */}
                <div className="pt-4 pb-2">
                  <button onClick={loadMoreEpisodes} disabled={loadingMoreEpisodes}
                    className="w-full py-3 rounded-xl border border-border/40 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                    {loadingMoreEpisodes ? (
                      <>
                        <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin" />
                        Carregando mais...
                      </>
                    ) : (
                      <>
                        <ChevronDown size={16} />
                        Carregar mais episódios
                      </>
                    )}
                  </button>
                </div>
              </>
            );
          })()}
        </div>
      </div>
    );
  };

  // ── Episode Row (compact, mobile-friendly) ──
  const renderEpisodeRow = (ep: VideoResult, showChannel = false, allEpisodes?: VideoResult[], index?: number) => {
    const song = videoToSong(ep);
    const isActive = currentPodcastId === song.id;
    const progress = getEpisodeProgress(song.id);
    const progressPct = isActive 
      ? (duration > 0 ? (currentTime / duration) * 100 : 0)
      : (progress && progress.duration > 0 ? (progress.currentTime / progress.duration) * 100 : 0);

    return (
      <div key={ep.videoId} className="group flex items-center gap-1">
        <button onClick={() => allEpisodes && index !== undefined ? handlePlayEpisodeWithQueue(ep, allEpisodes, index) : handlePlayEpisode(ep)}
          className={`flex-1 flex items-center gap-3 px-2 sm:px-3 py-3 sm:py-2.5 transition-colors ${isActive ? "bg-primary/10" : "hover:bg-accent/30 active:bg-accent/40"} rounded-xl`}>
          <div className="relative flex-shrink-0">
            <img src={ep.thumbnail} alt="" className="w-14 h-9 sm:w-16 sm:h-10 rounded-lg object-cover" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
              {isActive && isPlaying ? <Pause size={14} className="text-white" /> : <Play size={14} className="text-white" />}
            </div>
            {progressPct > 0 && !isActive && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-black/40 rounded-b-lg overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${progressPct}%` }} />
              </div>
            )}
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className={`text-[11px] sm:text-xs font-medium line-clamp-2 leading-tight ${isActive ? "text-primary" : "text-foreground"}`}>{ep.title}</p>
            <div className="flex items-center gap-1.5 sm:gap-2 mt-1 flex-wrap">
              {showChannel && <span className="text-[10px] text-muted-foreground truncate max-w-[100px] sm:max-w-[120px]">{ep.channel}</span>}
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                <Clock size={9} />{formatDur(ep.lengthSeconds)}
              </span>
              {ep.publishedTime && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                  <Calendar size={9} />{ep.publishedTime}
                </span>
              )}
            </div>
          </div>
          {isActive && isPlaying && (
            <div className="flex items-end gap-[2px] h-4 flex-shrink-0">
              {[1,2,3,4].map(i => (
                <motion.div key={i} className="w-[2px] bg-primary rounded-full"
                  animate={{ height: [4, 14, 6, 12, 4] }}
                  transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.15 }} />
              ))}
            </div>
          )}
        </button>
        <button onClick={(e) => { e.stopPropagation(); handleToggleFavEpisode(ep); }}
          className="p-2 sm:p-1.5 rounded-lg sm:opacity-0 sm:group-hover:opacity-100 hover:bg-accent active:bg-accent transition-all flex-shrink-0" title={isFavoriteEpisode(`yt-${ep.videoId}`) ? "Remover das curtidas" : "Curtir episódio"}>
          <Heart size={16} className={`sm:w-[14px] sm:h-[14px] ${isFavoriteEpisode(`yt-${ep.videoId}`) ? "text-primary fill-primary" : "text-muted-foreground"}`} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); addToQueue(song); }}
          className="p-2 sm:p-1.5 rounded-lg sm:opacity-0 sm:group-hover:opacity-100 hover:bg-accent active:bg-accent transition-all flex-shrink-0" title="Adicionar à fila">
          <Plus size={16} className="text-muted-foreground sm:w-[14px] sm:h-[14px]" />
        </button>
      </div>
    );
  };

  // ── Pull-to-refresh (mobile) ──
  const [pullDist, setPullDist] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const pullStartYRef = useRef<number | null>(null);
  const pullActiveRef = useRef(false);
  const PULL_THRESHOLD = 70;

  const doPullRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      // Invalida caches para forçar buscas atualizadas
      try {
        localStorage.removeItem(CACHE_KEY);
        localStorage.removeItem(POPULAR_THUMBS_KEY);
        localStorage.removeItem(DAILY_STAMP_KEY);
      } catch {}
      if (channelEpisodes) {
        const ch = channelEpisodes;
        const daily = POPULAR_PODCASTS.find(p => p.name === ch.channel)?.daily;
        await browseChannel(ch.channel, ch.channelThumbnail, undefined, { daily });
      } else if (hasSearched && searchQuery) {
        await handleSearch(searchQuery);
      } else {
        const cat = PODCAST_CATEGORIES.find(c => c.label === activeCategory) || PODCAST_CATEGORIES[0];
        await fetchCategory(cat);
      }
    } finally {
      setIsRefreshing(false);
      setPullDist(0);
      pullActiveRef.current = false;
      pullStartYRef.current = null;
    }
  };

  const handlePullTouchStart = (e: React.TouchEvent) => {
    const scroller = document.getElementById("root");
    if (!scroller || scroller.scrollTop > 4) return;
    if (isRefreshing) return;
    pullStartYRef.current = e.touches[0].clientY;
    pullActiveRef.current = false;
  };
  const handlePullTouchMove = (e: React.TouchEvent) => {
    if (pullStartYRef.current == null) return;
    const dy = e.touches[0].clientY - pullStartYRef.current;
    if (dy <= 0) { setPullDist(0); return; }
    pullActiveRef.current = true;
    setPullDist(Math.min(110, dy * 0.5));
  };
  const handlePullTouchEnd = () => {
    if (!pullActiveRef.current) { pullStartYRef.current = null; return; }
    if (pullDist >= PULL_THRESHOLD) {
      doPullRefresh();
    } else {
      setPullDist(0);
      pullActiveRef.current = false;
      pullStartYRef.current = null;
    }
  };

  return (
    <div
      className="px-3 sm:px-4 lg:px-6 space-y-3 pb-28 relative"
      onTouchStart={handlePullTouchStart}
      onTouchMove={handlePullTouchMove}
      onTouchEnd={handlePullTouchEnd}
      onTouchCancel={handlePullTouchEnd}
      style={{ transform: pullDist > 0 || isRefreshing ? `translateY(${isRefreshing ? 40 : pullDist}px)` : undefined, transition: pullDist === 0 || isRefreshing ? "transform 200ms ease" : undefined }}
    >
      {/* Pull-to-refresh indicator */}
      {(pullDist > 0 || isRefreshing) && (
        <div
          className="absolute left-1/2 -translate-x-1/2 -top-10 flex items-center justify-center w-9 h-9 rounded-full bg-card border border-border shadow-lg z-40"
          style={{ opacity: Math.min(1, (isRefreshing ? 1 : pullDist / PULL_THRESHOLD)) }}
        >
          <RotateCcw
            size={16}
            className={`text-primary ${isRefreshing ? "animate-spin" : ""}`}
            style={!isRefreshing ? { transform: `rotate(${pullDist * 3}deg)` } : undefined}
          />
        </div>
      )}
      {/* Header — podcast-exclusive identity: mic + on-air dot + editorial subtitle */}
      <div
        data-podcast-header="1"
        className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/12 via-primary/5 to-transparent px-4 py-3"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-3 w-24 opacity-30"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, hsl(var(--primary)) 0 2px, transparent 2px 6px)",
            maskImage: "linear-gradient(90deg, transparent, black 60%, transparent)",
          }}
        />
        <div className="relative flex items-center gap-2.5">
          <div className="relative flex items-center justify-center w-9 h-9 rounded-full bg-primary/20 border border-primary/40">
            <Mic size={16} className="text-primary" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary animate-pulse" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary/80">On air · Xerife</p>
            <h1 className="text-lg sm:text-xl font-display font-bold text-foreground leading-tight">Podcasts</h1>
          </div>
        </div>
      </div>

      {/* ── HOME / EXPLORE ── (pílula de abas removida: navegação vem do rodapé) */}
      {(tab === "home" || tab === "explore") && (
        <div className="space-y-4">
          {/* Channel detail view */}
          {channelEpisodes ? renderChannelDetail() : (
            <>
              {/* Search bar — só na aba Explorar (bússola do rodapé) */}
              {tab === "explore" && (
              <div
                data-podcast-search-field="1"
                className="relative rounded-2xl p-[1.5px] bg-[conic-gradient(from_0deg,hsl(var(--primary)/0.55),hsl(var(--primary)/0.1),hsl(var(--primary)/0.55))]"
              >
                <div className="relative rounded-2xl bg-background/95 backdrop-blur-sm">
                  <div className="absolute left-1.5 top-1/2 -translate-y-1/2 flex items-center justify-center w-9 h-9">
                    <span
                      aria-hidden
                      className="absolute inset-0 rounded-full border border-primary/30"
                      style={{
                        backgroundImage:
                          "repeating-conic-gradient(hsl(var(--primary)/0.35) 0deg 3deg, transparent 3deg 30deg)",
                        maskImage: "radial-gradient(circle, transparent 55%, black 58%, black 100%)",
                      }}
                    />
                    <Compass size={18} className="relative text-primary" />
                  </div>
                  <input
                    type="text"
                    placeholder="Radar de podcasts — busque episódios, canais, temas…"
                    value={searchQuery}
                    data-podcast-search="1"
                    onChange={(e) => handleInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch(searchQuery)}
                    className="w-full pl-12 pr-10 py-3 rounded-2xl bg-transparent text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={clearSearch}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label="Limpar busca"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                <AnimatePresence>
                  {showSuggestions && suggestions.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                      className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-lg z-30 overflow-hidden">
                      {suggestions.slice(0, 6).map((s, i) => (
                        <button key={i} onClick={() => { setSearchQuery(s); handleSearch(s); }}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-foreground hover:bg-accent transition-colors">
                          <Compass size={12} className="text-primary" />{s}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              )}

              {!hasSearched && (() => {
                // ── Personalização baseada em localStorage (histórico + em progresso) ──
                const listenedChannels = new Set<string>();
                inProgress.forEach(e => listenedChannels.add(e.channel));
                history.forEach(e => listenedChannels.add(e.channel));

                // "Ouça de novo": pega o histórico deduplicado por canal (variedade)
                const rehearBy = new Map<string, typeof history[0]>();
                for (const h of history) {
                  if (!rehearBy.has(h.channel)) rehearBy.set(h.channel, h);
                }
                const rehear = Array.from(rehearBy.values()).slice(0, 10);

                // Novidades diárias — podcasts marcados com `daily`
                const dailyShows = POPULAR_PODCASTS.filter((p: any) => p.daily);

                // "Recomendados para você": populares que o usuário AINDA NÃO ouviu
                const notListened = POPULAR_PODCASTS.filter(p => !listenedChannels.has(p.name));
                const hasPersonalization = inProgress.length > 0 || history.length > 0;
                const recommended = hasPersonalization
                  ? notListened.slice(0, 12)
                  : POPULAR_PODCASTS.slice(0, 12);
                const featuredChannels = POPULAR_PODCASTS.slice(0, 14);

                // Rotação editorial por horário do dia
                const hour = new Date().getHours();
                const daypart = hour < 12 ? { label: "Bom dia", sub: "Programas para começar o dia", icon: "☀️" }
                  : hour < 18 ? { label: "Boa tarde", sub: "Ouça enquanto trabalha", icon: "🌤️" }
                  : { label: "Boa noite", sub: "Relaxe com um bom papo", icon: "🌙" };

                const onAir = dailyShows[0] ?? POPULAR_PODCASTS[0];
                const onAirThumb = onAir ? popularThumbs[onAir.name] : undefined;
                const editorial = notListened.length > 0 ? notListened : POPULAR_PODCASTS;
                const topChart = editorial.slice(0, 8);
                const moreShows = editorial.slice(8, 20);

                return (
                <div className="space-y-6">
                  {/* HERO editorial exclusivo do módulo Podcast */}
                  {tab === "home" && (
                  <PodcastOnAirHero
                    greetingLabel={daypart.label}
                    greetingIcon={daypart.icon}
                    subtitle={daypart.sub}
                    showName={onAir?.name}
                    showThumb={onAirThumb}
                    showGradient={onAir?.color}
                    onPlay={onAir ? () => browsePopularPodcast(onAir) : undefined}
                  />
                  )}

                  {/* Categorias — só na aba Explorar */}
                  {tab === "explore" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <div className="flex items-center gap-1.5">
                        <LayoutGrid size={14} className="text-primary" />
                        <h2 className="text-sm font-semibold text-foreground">Navegar por gênero</h2>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                      {PODCAST_CATEGORIES.map((cat, i) => (
                        <PodcastGenreTile
                          key={cat.label}
                          label={cat.label}
                          icon={cat.icon}
                          index={i}
                          active={activeCategory === cat.label && categoryResults.length > 0}
                          onClick={() => {
                            setActiveCategory(cat.label);
                            setHasSearched(false);
                            setSearchQuery("");
                            setSearchResults([]);
                            setShowSuggestions(false);
                            setChannelEpisodes(null);
                            setExpandedShow(null);
                            setCategoryResults([]);
                            fetchCategory(cat);
                          }}
                        />
                      ))}
                    </div>

                  </div>
                  )}

                  {tab === "home" && (<>
                  {inProgress.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 px-1">
                        <RotateCcw size={14} className="text-primary" />
                        <h2 className="text-sm font-semibold text-foreground">Continuar ouvindo</h2>
                      </div>
                      <div className="space-y-1.5">
                        {inProgress.slice(0, 4).map(ep => {
                          const isActive = currentPodcastId === ep.episodeId;
                          const pct = isActive
                            ? (duration > 0 ? (currentTime / duration) * 100 : 0)
                            : (ep.duration > 0 ? (ep.currentTime / ep.duration) * 100 : 0);
                          return (
                            <button key={ep.episodeId} onClick={() => {
                              onPlayPodcast({ id: ep.episodeId, youtubeId: ep.episodeId.replace("yt-", ""), title: ep.title, artist: ep.channel, album: ep.channel, cover: ep.thumbnail, duration: ep.duration, votes: 0, isDownloaded: false, type: "podcast" });
                            }}
                              className="w-full flex items-center gap-3 p-2 rounded-xl bg-secondary/40 hover:bg-secondary/70 transition-colors active:scale-[0.99] text-left">
                              <img src={ep.thumbnail} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-foreground truncate">{ep.title}</p>
                                <p className="text-[10px] text-muted-foreground truncate">{ep.channel}</p>
                                <div className="mt-1 h-1 bg-background/60 rounded-full overflow-hidden">
                                  <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0">
                                {isActive && isPlaying ? <Pause size={13} /> : <Play size={13} className="ml-0.5" />}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Top da semana — LISTA RANQUEADA (identidade editorial, não grid de vídeos) */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <div className="flex items-center gap-1.5">
                        <Star size={14} className="text-primary" />
                        <h2 className="text-sm font-semibold text-foreground">Top programas da semana</h2>
                      </div>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Ranking editorial</span>
                    </div>
                    <div className="rounded-2xl border border-border/40 overflow-hidden bg-card/40 divide-y divide-border/30">
                      {topChart.map((podcast, i) => (
                        <PodcastChartRow
                          key={podcast.name}
                          rank={i + 1}
                          title={podcast.name}
                          subtitle="Podcast · Editorial"
                          thumb={popularThumbs[podcast.name]}
                          fallbackGradient={podcast.color}
                          onClick={() => browsePopularPodcast(podcast)}
                          action={<ChevronRight size={16} className="text-muted-foreground/60 flex-shrink-0" />}
                        />
                      ))}
                    </div>

                  </div>

                  {/* Novidades diárias — faixa horizontal compacta (mantida, é identidade de podcast) */}
                  {dailyShows.length > 1 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between px-1">
                        <div className="flex items-center gap-1.5">
                          <Sparkles size={14} className="text-primary" />
                          <h2 className="text-sm font-semibold text-foreground">Novos episódios diários</h2>
                        </div>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Toda manhã</span>
                      </div>
                      <PodcastRail label="Novos episódios diários" className="flex gap-2.5 -mx-3 px-3 pb-2">
                        {dailyShows.map((podcast, i) => {
                          const thumb = popularThumbs[podcast.name];
                          return (
                            <motion.button
                              key={podcast.name}
                              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                              onClick={() => browsePopularPodcast(podcast)}
                              className="flex-shrink-0 w-32 sm:w-36 text-left group active:scale-[0.97] transition-transform"
                            >
                              <div className="relative w-32 h-32 sm:w-36 sm:h-36 rounded-xl overflow-hidden">
                                {thumb ? (
                                  <img src={thumb} alt={podcast.name} className="absolute inset-0 w-full h-full object-cover" />
                                ) : (
                                  <div className={`absolute inset-0 bg-gradient-to-br ${podcast.color}`} />
                                )}
                                <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-full bg-primary/95 text-[8.5px] font-bold text-white uppercase tracking-wider">Novo</div>
                              </div>
                              <p className="mt-1.5 text-[11px] font-semibold text-foreground line-clamp-2 leading-tight">{podcast.name}</p>
                            </motion.button>
                          );
                        })}
                      </PodcastRail>

                    </div>
                  )}

                  {/* Mais programas — lista vertical editorial (dif. dos cards de vídeos) */}
                  {moreShows.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 px-1">
                        <Headphones size={14} className="text-primary" />
                        <h2 className="text-sm font-semibold text-foreground">
                          {hasPersonalization ? "Recomendados pra você" : "Descubra mais programas"}
                        </h2>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {moreShows.map((podcast, i) => {
                          const thumb = popularThumbs[podcast.name];
                          return (
                            <motion.button
                              key={podcast.name}
                              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                              onClick={() => browsePopularPodcast(podcast)}
                              className="flex items-center gap-3 p-2 rounded-xl hover:bg-secondary/50 transition-colors active:scale-[0.99] text-left"
                            >
                              <div className="relative w-14 h-14 rounded-lg overflow-hidden flex-shrink-0">
                                {thumb ? (
                                  <img src={thumb} alt={podcast.name} className="w-full h-full object-cover" />
                                ) : (
                                  <div className={`w-full h-full bg-gradient-to-br ${podcast.color}`} />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-foreground truncate">{podcast.name}</p>
                                <p className="text-[10px] text-muted-foreground truncate">{"Podcast"}</p>
                              </div>
                              <Plus size={14} className="text-muted-foreground/70 flex-shrink-0" />
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {rehear.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 px-1">
                        <Clock size={14} className="text-primary" />
                        <h2 className="text-sm font-semibold text-foreground">Ouça de novo</h2>
                      </div>
                      <PodcastRail label="Ouça de novo" className="flex gap-2 -mx-3 px-3 pb-2">
                        {rehear.map(ep => (
                          <button key={ep.episodeId} onClick={() => {
                            onPlayPodcast({ id: ep.episodeId, youtubeId: ep.episodeId.replace("yt-", ""), title: ep.title, artist: ep.channel, album: ep.channel, cover: ep.thumbnail, duration: ep.duration, votes: 0, isDownloaded: false, type: "podcast" });
                          }}
                            className="flex-shrink-0 w-20 sm:w-24 space-y-1 group active:scale-[0.97] transition-transform">
                            <div className="relative">
                              <img src={ep.thumbnail} alt="" className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg object-cover" />
                            </div>
                            <p className="text-[10px] font-medium text-foreground truncate text-left">{ep.channel}</p>
                          </button>
                        ))}
                      </PodcastRail>

                    </div>
                  )}
                  </>)}
                </div>
                );
              })()}


              {/* Results — apenas na aba Explorar */}
              {tab === "explore" && ((isSearching || loadingCategory) ? (
                <div className="space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex gap-3 animate-pulse">
                      <div className="w-16 h-10 rounded-lg bg-secondary/60 flex-shrink-0" />
                      <div className="flex-1 space-y-2 py-1"><div className="h-3 bg-secondary/60 rounded w-3/4" /><div className="h-2.5 bg-secondary/40 rounded w-1/2" /></div>
                    </div>
                  ))}
                </div>
              ) : shows.length > 0 ? (
                <div className="space-y-3">
                  {/* View mode toggle + Media type filter */}
                  <div className="flex items-center justify-between px-1 gap-2 flex-wrap">
                    <p className="text-xs text-muted-foreground font-medium">
                      {shows.length} programa{shows.length > 1 ? "s" : ""} · {displayResults.length} episódio{displayResults.length > 1 ? "s" : ""}
                    </p>
                    <div className="flex items-center gap-0.5 bg-secondary/60 rounded-lg p-0.5">
                      <button onClick={() => { setViewMode("list"); localStorage.setItem("xerife_podcast_viewmode", "list"); }}
                        className={`p-1.5 rounded-md transition-all ${viewMode === "list" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                        title="Lista">
                        <List size={14} />
                      </button>
                      <button onClick={() => { setViewMode("grid"); localStorage.setItem("xerife_podcast_viewmode", "grid"); }}
                        className={`p-1.5 rounded-md transition-all ${viewMode === "grid" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                        title="Grade">
                        <LayoutGrid size={14} />
                      </button>
                      <button onClick={() => { setViewMode("large"); localStorage.setItem("xerife_podcast_viewmode", "large"); }}
                        className={`p-1.5 rounded-md transition-all ${viewMode === "large" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                        title="Cards grandes">
                        <Rows3 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Filtro por tipo de mídia — separa perfis de áudio (longos) e vídeo (clipes) */}
                  <div className="flex items-center gap-1.5 -mx-1 px-1 overflow-x-auto scrollbar-hide">
                    {([
                      { id: "all" as const, label: "Todos", icon: null },
                      { id: "audio" as const, label: "Áudio", icon: Headphones },
                      { id: "video" as const, label: "Vídeo", icon: Video },
                    ]).map(({ id, label, icon: Icon }) => (
                      <button key={id} onClick={() => setMediaFilter(id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all ${
                          mediaFilter === id ? "bg-primary text-primary-foreground shadow-sm" : "bg-secondary/60 text-muted-foreground hover:text-foreground"
                        }`}>
                        {Icon && <Icon size={12} />}
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Channel profile cards — shown in search results */}
                  {hasSearched && shows.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 flex items-center gap-1.5">
                        <Mic size={12} />Canais encontrados
                      </h3>
                      <HorizontalScroll className="flex gap-2.5 -mx-3 px-3 pb-1">
                        {shows.map((show, si) => (
                          <motion.button key={show.channel} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: si * 0.04 }}
                            onClick={() => browseChannel(show.channel, show.channelThumbnail)}
                            className="flex-shrink-0 flex flex-col items-center gap-2 p-3 bg-card/60 rounded-2xl border border-border/40 hover:border-primary/30 transition-all active:scale-[0.97] w-28 sm:w-32">
                            <img src={show.channelThumbnail || show.thumbnail} alt={show.channel}
                              className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border-2 border-primary/10"
                              onError={(e) => { (e.target as HTMLImageElement).src = show.thumbnail; }} />
                            <div className="text-center min-w-0 w-full">
                              <h4 className="text-[11px] sm:text-xs font-semibold text-foreground truncate">{show.channel}</h4>
                              <p className="text-[10px] text-muted-foreground">{show.episodes.length} ep.</p>
                            </div>
                          </motion.button>
                        ))}
                      </HorizontalScroll>
                    </div>
                  )}

                  {viewMode === "list" ? (
                    /* ── List View ── */
                    shows.map((show, si) => (
                      <motion.div key={show.channel} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: si * 0.04 }}
                        className="bg-card/50 rounded-2xl border border-border/40 overflow-hidden">
                        <div className="flex items-center gap-3 p-3">
                          <button onClick={() => browseChannel(show.channel, show.channelThumbnail)}
                            className="flex items-center gap-3 flex-1 min-w-0">
                            <img src={show.channelThumbnail || show.thumbnail} alt={show.channel}
                              className="w-12 h-12 rounded-full object-cover flex-shrink-0 border-2 border-primary/10"
                              onError={(e) => { (e.target as HTMLImageElement).src = show.thumbnail; }} />
                            <div className="flex-1 text-left min-w-0">
                              <h3 className="text-sm font-semibold text-foreground truncate">{show.channel}</h3>
                              <p className="text-[11px] text-muted-foreground">{show.episodes.length} episódio{show.episodes.length > 1 ? "s" : ""}</p>
                            </div>
                          </button>
                          <button onClick={() => handleToggleSubscribe(show.channel, show.channelThumbnail || show.thumbnail)}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${
                              isSubscribed(show.channel) ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground hover:text-foreground"
                            }`}>
                            <Star size={11} className={isSubscribed(show.channel) ? "fill-primary text-primary" : ""} />
                            {isSubscribed(show.channel) ? "Favorito" : "Favoritar"}
                          </button>
                          <button onClick={() => setExpandedShow(expandedShow === show.channel ? null : show.channel)}
                            className="p-1 rounded-lg hover:bg-accent transition-colors">
                            <ChevronRight size={16}
                              className={`text-muted-foreground transition-transform ${expandedShow === show.channel ? "rotate-90" : ""}`} />
                          </button>
                        </div>
                        <AnimatePresence>
                          {(expandedShow === show.channel || show.episodes.length <= 2) && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                              <div className="border-t border-border/30 py-1">
                                {show.episodes.map((ep, i) => renderEpisodeRow(ep, false, show.episodes, i))}
                              </div>
                              {show.episodes.length > 2 && (
                                <button onClick={() => browseChannel(show.channel, show.channelThumbnail)}
                                  className="w-full py-2 text-[11px] text-primary font-medium hover:bg-primary/5 transition-colors border-t border-border/20">
                                  Ver todos os episódios →
                                </button>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    ))
                  ) : viewMode === "large" ? (
                    /* ── Large Cards View ── */
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {displayResults.map((ep, i) => {
                        const song = videoToSong(ep);
                        const isActive = currentPodcastId === song.id;
                        const progress = getEpisodeProgress(song.id);
                        const progressPct = isActive 
                          ? (duration > 0 ? (currentTime / duration) * 100 : 0)
                          : (progress && progress.duration > 0 ? (progress.currentTime / progress.duration) * 100 : 0);

                        return (
                          <motion.div key={ep.videoId} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                            className="group/card bg-card/60 hover:bg-card rounded-2xl border border-border/30 hover:border-border/60 overflow-hidden transition-all duration-300 hover:shadow-2xl hover:shadow-primary/5">
                            <button onClick={() => handlePlayEpisode(ep)} className="relative w-full aspect-video overflow-hidden group/thumb">
                              <img src={ep.thumbnail} alt="" className="w-full h-full object-cover transition-transform duration-700 group-hover/thumb:scale-105" />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover/thumb:opacity-100 transition-opacity duration-300" />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-16 h-16 rounded-full bg-primary/90 text-primary-foreground flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 scale-75 group-hover/thumb:scale-100 transition-all duration-300 shadow-2xl shadow-primary/30">
                                  {isActive && isPlaying ? <Pause size={28} /> : <Play size={28} className="ml-1" fill="currentColor" />}
                                </div>
                              </div>
                              {ep.lengthSeconds > 0 && (
                                <span className="absolute bottom-3 right-3 bg-black/80 backdrop-blur-md text-white text-xs font-semibold px-2.5 py-1 rounded-lg border border-white/10">
                                  {formatDur(ep.lengthSeconds)}
                                </span>
                              )}
                              {progressPct > 0 && (
                                <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40 overflow-hidden">
                                  <div className="h-full bg-primary" style={{ width: `${progressPct}%` }} />
                                </div>
                              )}
                              <button onClick={(e) => { e.stopPropagation(); addToQueue(song); }}
                                className="absolute top-3 right-3 w-9 h-9 rounded-lg bg-black/50 backdrop-blur-md text-white flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 hover:bg-primary transition-all z-10"
                                title="Adicionar à fila">
                                <Plus size={17} />
                              </button>
                            </button>
                            <div className="p-4 lg:p-5 space-y-3">
                              <div className="flex gap-3">
                                <button onClick={() => browseChannel(ep.channel, ep.channelThumbnail)} className="flex-shrink-0 active:scale-90 transition-transform">
                                  {ep.channelThumbnail ? (
                                    <img src={ep.channelThumbnail} alt={ep.channel} className="w-10 h-10 rounded-full object-cover border-2 border-border"
                                      onError={(e) => { (e.target as HTMLImageElement).src = ep.thumbnail; }} />
                                  ) : (
                                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary">
                                      {ep.channel.charAt(0)}
                                    </div>
                                  )}
                                </button>
                                <div className="min-w-0 flex-1">
                                  <button onClick={() => handlePlayEpisode(ep)} className="text-left w-full">
                                    <h3 className={`font-semibold text-base lg:text-lg line-clamp-2 leading-snug hover:text-primary transition-colors ${isActive ? "text-primary" : "text-foreground"}`}>
                                      {ep.title}
                                    </h3>
                                  </button>
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
                                    <button onClick={() => browseChannel(ep.channel, ep.channelThumbnail)}
                                      className="text-xs text-muted-foreground hover:text-primary transition-colors font-medium">
                                      {ep.channel}
                                    </button>
                                    {(ep.views || ep.publishedTime) && (
                                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60">
                                        {ep.views && <span className="flex items-center gap-1"><Eye size={11} />{ep.views}</span>}
                                        {ep.publishedTime && <span className="flex items-center gap-1"><Clock size={11} />{ep.publishedTime}</span>}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground/50 leading-relaxed line-clamp-2">
                                {ep.description || `Ouça este episódio de ${ep.channel} no Xerife Switch — áudio em alta qualidade para a melhor experiência de podcast.`}
                              </p>
                              <div className="flex items-center gap-2 pt-1">
                                <button onClick={() => handlePlayEpisode(ep)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors">
                                  <Play size={12} fill="currentColor" />Ouvir agora
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); addToQueue(song); }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-muted-foreground text-xs font-medium hover:text-foreground hover:bg-accent transition-colors">
                                  <Plus size={12} />Fila
                                </button>
                                {isActive && isPlaying && (
                                  <div className="flex items-end gap-[2px] h-3 ml-auto">
                                    {[1,2,3,4].map(n => (
                                      <motion.div key={n} className="w-[2px] bg-primary rounded-full"
                                        animate={{ height: [3, 10, 4, 9, 3] }}
                                        transition={{ duration: 1.2, repeat: Infinity, delay: n * 0.15 }} />
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  ) : (
                    /* ── Grid View ── */
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
                      {displayResults.map((ep, i) => {
                        const song = videoToSong(ep);
                        const isActive = currentPodcastId === song.id;
                        const progress = getEpisodeProgress(song.id);
                        const progressPct = isActive 
                          ? (duration > 0 ? (currentTime / duration) * 100 : 0)
                          : (progress && progress.duration > 0 ? (progress.currentTime / progress.duration) * 100 : 0);

                        return (
                          <motion.div key={ep.videoId} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.03 }}
                            className="group bg-card/50 rounded-xl sm:rounded-2xl border border-border/40 overflow-hidden hover:border-primary/30 transition-all">
                            <button onClick={() => handlePlayEpisode(ep)} className="relative w-full aspect-video">
                              <img src={ep.thumbnail} alt="" className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                {isActive && isPlaying ? <Pause size={24} className="text-white" /> : <Play size={24} className="text-white" />}
                              </div>
                              {progressPct > 0 && (
                                <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40 overflow-hidden">
                                  <div className="h-full bg-primary" style={{ width: `${progressPct}%` }} />
                                </div>
                              )}
                              {ep.lengthSeconds > 0 && (
                                <span className="absolute bottom-1.5 right-1.5 bg-black/70 text-white text-[9px] font-medium px-1.5 py-0.5 rounded">
                                  {formatDur(ep.lengthSeconds)}
                                </span>
                              )}
                            </button>
                            <div className="p-2.5 space-y-1.5">
                              <div className="flex items-start gap-2">
                                <img src={ep.channelThumbnail || ep.thumbnail} alt={ep.channel}
                                  className="w-6 h-6 rounded-full object-cover flex-shrink-0 mt-0.5"
                                  onError={(e) => { (e.target as HTMLImageElement).src = ep.thumbnail; }} />
                                <div className="flex-1 min-w-0">
                                  <button onClick={() => handlePlayEpisode(ep)} className="text-left w-full">
                                    <h4 className={`text-[11px] sm:text-xs font-semibold leading-tight line-clamp-2 ${isActive ? "text-primary" : "text-foreground"}`}>
                                      {ep.title}
                                    </h4>
                                  </button>
                                  <button onClick={() => browseChannel(ep.channel, ep.channelThumbnail)}
                                    className="text-[10px] text-muted-foreground hover:text-foreground transition-colors truncate block mt-0.5">
                                    {ep.channel}
                                  </button>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {ep.publishedTime && <span className="text-[9px] text-muted-foreground">{ep.publishedTime}</span>}
                                <button onClick={(e) => { e.stopPropagation(); addToQueue(song); }}
                                  className="ml-auto p-1 rounded-full hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                                  title="Adicionar à fila">
                                  <Plus size={13} />
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                !hasSearched && !loadingCategory ? null : (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Mic size={48} className="mb-4 opacity-20" />
                    <p className="text-sm">{hasSearched ? "Nenhum podcast encontrado" : "Carregando podcasts..."}</p>
                  </div>
                )
              ))}
            </>
          )}
        </div>
      )}

      {/* ── PROGRAMAS FAVORITOS (Biblioteca › Podcasts) ── */}
      {tab === "subscriptions" && (
        <div className="space-y-6">
          {subs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 sm:py-16 text-muted-foreground">
              <Star size={40} className="mb-3 opacity-20" />
              <p className="text-sm font-medium">Sem programas favoritos</p>
              <p className="text-[11px] mt-1 opacity-60 text-center max-w-[240px]">
                Toque na estrela em um podcast para fixá-lo aqui
              </p>
            </div>
          ) : (
            <section className="space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 flex items-center gap-1.5">
                <Star size={12} className="fill-primary text-primary" /> Podcasts favoritos
                <span className="text-muted-foreground/60">· {subs.length}</span>
              </h3>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                {subs.map((show, i) => (
                  <motion.div key={show.channelId} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.04 }}
                    className="group flex flex-col items-center text-center space-y-2 cursor-pointer active:scale-95 transition-transform"
                    onClick={() => { browseChannel(show.name, show.thumbnail); setTab("explore"); }}>
                    <div className="relative">
                      <img src={show.thumbnail} alt={show.name}
                        className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover border-2 border-primary/20 shadow-md group-hover:border-primary/50 transition-all" />
                      <button onClick={(e) => { e.stopPropagation(); handleToggleSubscribe(show.channelId, show.thumbnail); }}
                        className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-card border border-border flex items-center justify-center text-primary shadow-md hover:text-destructive transition-colors"
                        title="Remover dos favoritos">
                        <Star size={12} className="fill-current" />
                      </button>
                    </div>
                    <h3 className="text-[11px] sm:text-xs font-semibold text-foreground line-clamp-2 leading-tight w-full px-1">{show.name}</h3>
                  </motion.div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ── CURTIDAS (coraçãozinho do rodapé) ── */}
      {tab === "liked" && (
        <div className="space-y-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 flex items-center gap-1.5">
            <Heart size={12} className="fill-primary text-primary" /> Episódios curtidos
            {favEpisodes.length > 0 && <span className="text-muted-foreground/60">· {favEpisodes.length}</span>}
          </h3>
          {favEpisodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 sm:py-16 text-muted-foreground">
              <Heart size={40} className="mb-3 opacity-20" />
              <p className="text-sm font-medium">Nenhum episódio curtido</p>
              <p className="text-[11px] mt-1 opacity-60 text-center max-w-[240px]">
                Toque no coração de um episódio para guardá-lo aqui
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {favEpisodes.map((ep) => {
                const isActive = currentPodcastId === ep.episodeId;
                const song: Song = { id: ep.episodeId, youtubeId: ep.episodeId.replace("yt-", ""), title: ep.title, artist: ep.channel, album: ep.channel, cover: ep.thumbnail, duration: ep.duration, votes: 0, isDownloaded: false, type: "podcast" };
                return (
                  <div key={ep.episodeId} className="group flex items-center gap-1">
                    <button onClick={() => onPlayPodcast(song)}
                      className={`flex-1 flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${isActive ? "bg-primary/10" : "hover:bg-accent/30"}`}>
                      <img src={ep.thumbnail} alt="" className="w-14 h-9 rounded-lg object-cover flex-shrink-0" />
                      <div className="flex-1 text-left min-w-0">
                        <p className={`text-xs font-medium line-clamp-2 leading-tight ${isActive ? "text-primary" : "text-foreground"}`}>{ep.title}</p>
                        <p className="text-[10px] text-muted-foreground truncate mt-0.5">{ep.channel} · {formatDur(ep.duration)}</p>
                      </div>
                    </button>
                    <button onClick={() => toggleFavoriteEpisode({ episodeId: ep.episodeId, title: ep.title, channel: ep.channel, thumbnail: ep.thumbnail, duration: ep.duration })}
                      className="p-2 rounded-lg hover:bg-accent transition-colors flex-shrink-0"
                      title="Remover das curtidas">
                      <Heart size={14} className="fill-primary text-primary" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── QUEUE TAB ── */}
      {tab === "queue" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <ListMusic size={12} />Fila de reprodução
            </h3>
            {podcastQueue.length > 0 && (
              <button onClick={clearQueue}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-destructive font-semibold hover:bg-destructive/10 transition-colors">
                <Trash2 size={11} />Limpar
              </button>
            )}
          </div>
          {podcastQueue.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <ListMusic size={48} className="mb-4 opacity-20" />
              <p className="text-sm font-medium">Fila vazia</p>
              <p className="text-[11px] mt-1 opacity-60 text-center max-w-[200px]">
                {autoPlay ? "Episódios serão adicionados automaticamente ao reproduzir de um show" : "Ative o auto-play ou adicione episódios manualmente"}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {podcastQueue.map((song, i) => {
                const isActive = currentPodcastId === song.id;
                return (
                  <motion.div key={`${song.id}-${i}`} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl group transition-colors ${isActive ? "bg-primary/10" : "hover:bg-accent/30"}`}>
                    <span className="text-[10px] text-muted-foreground/50 w-5 text-center font-mono">{i + 1}</span>
                    <img src={song.cover} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium truncate ${isActive ? "text-primary" : "text-foreground"}`}>{song.title}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{song.artist} · {formatDur(song.duration)}</p>
                    </div>
                    <button onClick={() => {
                      const s = podcastQueue[i];
                      const remaining = podcastQueue.slice(i + 1);
                      setPodcastQueue(remaining);
                      savePodcastQueue(remaining);
                      onPlayPodcast(s);
                    }} className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-accent transition-all" title="Reproduzir agora">
                      <Play size={12} className="text-foreground" />
                    </button>
                    <button onClick={() => removeFromQueue(i)}
                      className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-destructive/10 transition-all" title="Remover">
                      <X size={12} className="text-muted-foreground hover:text-destructive" />
                    </button>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── HISTORY TAB ── */}
      {tab === "history" && (
        <div className="space-y-1">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Clock size={48} className="mb-4 opacity-20" />
              <p className="text-sm font-medium">Nenhum podcast ouvido</p>
              <p className="text-[11px] mt-1 opacity-60">Seus podcasts aparecerão aqui</p>
            </div>
          ) : (
            history.map(ep => {
              const isActive = currentPodcastId === ep.episodeId;
              const progress = getEpisodeProgress(ep.episodeId);
              const pct = isActive 
                ? (duration > 0 ? (currentTime / duration) * 100 : 0)
                : (progress && progress.duration > 0 ? (progress.currentTime / progress.duration) * 100 : 0);
              return (
                <motion.button key={`${ep.episodeId}-${ep.playedAt}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  onClick={() => onPlayPodcast({ id: ep.episodeId, youtubeId: ep.episodeId.replace("yt-", ""), title: ep.title, artist: ep.channel, album: ep.channel, cover: ep.thumbnail, duration: ep.duration, votes: 0, isDownloaded: false, type: "podcast" })}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors group ${isActive ? "bg-primary/10" : "hover:bg-accent/30"}`}>
                  <img src={ep.thumbnail} alt="" className="w-14 h-9 rounded-lg object-cover flex-shrink-0" />
                  <div className="flex-1 text-left min-w-0">
                    <p className={`text-xs font-medium truncate ${isActive ? "text-primary" : "text-foreground"}`}>{ep.title}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{ep.channel} · {formatDur(ep.duration)}</p>
                    {pct > 0 && (
                      <div className="mt-1 h-[2px] bg-secondary rounded-full overflow-hidden w-full max-w-[100px]">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                  <div className="text-[9px] text-muted-foreground/60">{new Date(ep.playedAt).toLocaleDateString("pt-BR")}</div>
                </motion.button>
              );
            })
          )}
        </div>
      )}

      {/* Mini player removido: usar apenas o player principal (comum a todos os módulos) */}
    </div>
  );
};

export default PodcastScreen;
