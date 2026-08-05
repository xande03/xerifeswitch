import { useState, useRef, useEffect } from "react";
import { useTrendingVideos } from "@/hooks/useTrendingVideos";
import { motion, AnimatePresence } from "framer-motion";
import { Search, TrendingUp, Loader2, X, PlayCircle, Users, ListVideo, MessageSquare, ChevronRight, Play, LayoutGrid, List, Rows3 } from "lucide-react";
import { searchYouTubeGeneral, searchYouTubeGeneralPage, loadMoreYouTubeGeneral, type VideoResult } from "@/lib/youtubeGeneralSearch";
import HorizontalScroll from "./HorizontalScroll";
import { getSearchSuggestions } from "@/lib/youtubeSearch";
import { hdThumbnail } from "@/lib/utils";
import { fetchVideoInfo, type Comment, type VideoInfo } from "@/lib/youtubeVideoInfo";
import VideoCard from "./VideoCard";
import RelatedVideos from "./RelatedVideos";
import VideoComments from "./VideoComments";
import VideoCategorySelector, { VIDEO_CATEGORIES, type VideoCategory } from "./VideoCategorySelector";
import { useAutoRefreshChannel } from "@/hooks/useAutoRefreshChannel";
import NewContentBadge from "./NewContentBadge";
import { useToast } from "@/hooks/use-toast";
import { extractYouTubeVideoId, fetchVideoByUrl } from "@/lib/youtubeUrl";
import { recordVideoSearchQuery } from "@/lib/localStorage";

interface ExploreScreenProps {
  onPlayVideo: (video: VideoResult) => void;
  onFullscreenVideo?: (video: VideoResult) => void;
  onChannelClick?: (channelName: string, channelThumbnail?: string, channelId?: string, channelUrl?: string) => void;
  onAddToPlaylist?: (video: any) => void;
}

// Categories are now imported from VideoCategorySelector

const TRENDING_QUERIES = [
  "receitas fáceis", "rock in rio", "treino em casa",
  "resumo novela", "gameplay fortnite", "tutorial programação",
  "notícias hoje", "música nova 2026", "comédia stand up",
];

type SectionTab = "videos" | "channels" | "playlists" | "comments";

// Parse pt-BR/en "há X unidades" / "X units ago" into approximate minutes.
function ageMinutes(pt: string): number {
  if (!pt) return Number.MAX_SAFE_INTEGER;
  if (/agora|transmitindo|streaming|now/i.test(pt)) return 0;
  const m = pt.toLowerCase().match(/(\d+)\s*(minuto|minute|hora|hour|dia|day|semana|week|mês|mes|month|ano|year)/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  const n = parseInt(m[1], 10);
  const mult: Record<string, number> = {
    minuto: 1, minute: 1, hora: 60, hour: 60, dia: 1440, day: 1440,
    semana: 10080, week: 10080, mês: 43200, mes: 43200, month: 43200,
    ano: 525600, year: 525600,
  };
  return n * (mult[m[2]] ?? 60);
}

// Group videos by channel, sort each channel's videos by recency (newest
// first) and sort channels by their freshest upload so recently-active
// creators bubble to the top of the "Canais" panel.
const groupByChannel = (videos: VideoResult[]) => {
  const groups: Record<string, { channel: string; channelId?: string; channelUrl?: string; thumbnail?: string; videos: VideoResult[] }> = {};
  videos.forEach((v) => {
    const key = v.channelId || v.channelUrl || v.channel;
    if (!groups[key]) {
      groups[key] = { channel: v.channel, channelId: v.channelId, channelUrl: v.channelUrl, thumbnail: v.channelThumbnail, videos: [] };
    }
    // Alguns itens da API vêm sem o avatar do canal — completa com o primeiro
    // vídeo do grupo que tiver a foto, garantindo que a logo sempre apareça.
    if (!groups[key].thumbnail && v.channelThumbnail) groups[key].thumbnail = v.channelThumbnail;
    groups[key].videos.push(v);
  });

  const arr = Object.values(groups).filter((g) => g.videos.length >= 1);
  for (const g of arr) {
    g.videos.sort((a, b) => ageMinutes(a.publishedTime) - ageMinutes(b.publishedTime));
  }
  arr.sort((a, b) => ageMinutes(a.videos[0]?.publishedTime || "") - ageMinutes(b.videos[0]?.publishedTime || ""));
  return arr.slice(0, 30);
};


// Group videos into pseudo-playlists by similarity
const groupPlaylists = (videos: VideoResult[]) => {
  if (videos.length < 3) return [];
  const playlists: { title: string; videos: VideoResult[] }[] = [];
  const keywords = new Map<string, VideoResult[]>();
  videos.forEach((v) => {
    const words = v.title.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    words.forEach((w) => {
      if (!keywords.has(w)) keywords.set(w, []);
      keywords.get(w)!.push(v);
    });
  });
  const used = new Set<string>();
  Array.from(keywords.entries())
    .sort(([, a], [, b]) => b.length - a.length)
    .forEach(([word, vids]) => {
      const unique = vids.filter(v => !used.has(v.videoId));
      if (unique.length >= 2) {
        playlists.push({ title: word.charAt(0).toUpperCase() + word.slice(1), videos: unique.slice(0, 8) });
        unique.forEach(v => used.add(v.videoId));
      }
    });
  const remaining = videos.filter(v => !used.has(v.videoId));
  if (remaining.length >= 2) {
    playlists.push({ title: "Mistura variada", videos: remaining.slice(0, 8) });
  }
  return playlists.slice(0, 5);
};

const ExploreScreen = ({ onPlayVideo, onFullscreenVideo, onChannelClick, onAddToPlaylist }: ExploreScreenProps) => {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [results, setResults] = useState<VideoResult[]>([]);
  const { trendingVideos: trendingResults, isLoading: trendingLoading } = useTrendingVideos();
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionTab>("videos");
  const [trendingChipsExpanded, setTrendingChipsExpanded] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'large'>(() => (localStorage.getItem('demus-view-mode') as 'grid' | 'list' | 'large') || 'grid');
  const [continuation, setContinuation] = useState<string>();
  const [loadingMore, setLoadingMore] = useState(false);
  const { toast } = useToast();

  // Auto-refresh para resultados de busca
  const {
    newContentCount,
    forceRefresh,
    resetNewContentCount
  } = useAutoRefreshChannel(
    () => {
      if (query.length < 2) return Promise.resolve([]);
      return searchYouTubeGeneral(query, { fresh: true });
    },
    {
      enabled: query.length >= 2 && results.length > 0,
      interval: 2 * 60 * 1000, // 2 minutos
      onNewContent: (count) => {
        toast({
          title: "Novos resultados disponíveis!",
          description: `${count} novo(s) vídeo(s) para "${query}"`,
        });
      }
    }
  );

  const cycleViewMode = () => {
    const modes: Array<'grid' | 'list' | 'large'> = ['grid', 'list', 'large'];
    const idx = modes.indexOf(viewMode);
    const next = modes[(idx + 1) % modes.length];
    setViewMode(next);
    localStorage.setItem('demus-view-mode', next);
  };
  
  // Comments state
  const [selectedVideoForComments, setSelectedVideoForComments] = useState<VideoResult | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [relatedFromComments, setRelatedFromComments] = useState<VideoResult[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const suggestTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const scrollRowRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const scrollStartX = useRef(0);

  // Infinite scroll do feed principal (tendências + busca) — anexa novas
  // páginas conforme o usuário se aproxima do fim, sem exigir pull-to-refresh.
  const [extraVideos, setExtraVideos] = useState<VideoResult[]>([]);
  const [loadingMoreExtras, setLoadingMoreExtras] = useState(false);
  const extraPageRef = useRef(0);
  const feedSentinelRef = useRef<HTMLDivElement>(null);
  // Reseta a paginação quando muda a busca / categoria
  useEffect(() => { setExtraVideos([]); extraPageRef.current = 0; }, [query, activeCategory]);

  const handleDragStart = (e: React.MouseEvent) => {
    isDragging.current = true;
    dragStartX.current = e.pageX;
    scrollStartX.current = scrollRowRef.current?.scrollLeft || 0;
  };
  const handleDragMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !scrollRowRef.current) return;
    e.preventDefault();
    scrollRowRef.current.scrollLeft = scrollStartX.current - (e.pageX - dragStartX.current);
  };
  const handleDragEnd = () => { isDragging.current = false; };

  const doSearch = async (q: string) => {
    if (q.length < 2) return;

    // Se o usuário colou uma URL do YouTube, resolve o vídeo direto e toca.
    const videoId = extractYouTubeVideoId(q);
    if (videoId) {
      setLoading(true);
      setShowSuggestions(false);
      try {
        const video = await fetchVideoByUrl(q);
        if (video) {
          setResults([video]);
          setContinuation(undefined);
          onPlayVideo(video);
          toast({
            title: "Vídeo encontrado!",
            description: video.title,
          });
          return;
        }
      } catch (error) {
        console.error("Erro ao resolver URL do YouTube:", error);
        toast({
          title: "Não foi possível abrir a URL",
          description: "Verifique o link e tente novamente.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    setShowSuggestions(false);
    recordVideoSearchQuery(q);

    
    try {
      // Use paginação para busca completa
      const result = await searchYouTubeGeneralPage(q, { sortByDate: true, fresh: true, limit: 100 });
      setResults(result.results);
      setContinuation(result.continuation);
      
      if (result.results.length > 0) {
        toast({
          title: "Busca realizada!",
          description: `${result.results.length} vídeo(s) encontrado(s)`,
        });
      }
    } catch (error) {
      console.error("Erro na busca:", error);
      // Fallback para busca antiga se paginação falhar
      const res = await searchYouTubeGeneral(q, { limit: 100 });
      setResults(res);
    } finally {
      setLoading(false);
    }
  };

  // Função para carregar mais resultados
  const loadMoreResults = async () => {
    if (!continuation || loadingMore) return;
    setLoadingMore(true);
    
    try {
      const result = await loadMoreYouTubeGeneral(continuation, 20);
      
      const existingIds = new Set(results.map(v => v.videoId));
      const newResults = result.results.filter(v => !existingIds.has(v.videoId));
      
      if (newResults.length > 0) {
        setResults(prev => [...prev, ...newResults]);
        toast({
          title: "Mais resultados carregados!",
          description: `${newResults.length} novo(s) vídeo(s) adicionado(s)`,
        });
      }
      
      setContinuation(result.continuation);
    } catch (error) {
      console.error("Erro ao carregar mais resultados:", error);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleInput = (val: string) => {
    setQuery(val);
    // Cola de URL do YouTube: resolve imediatamente sem sugestões.
    if (extractYouTubeVideoId(val)) {
      if (suggestTimeoutRef.current) clearTimeout(suggestTimeoutRef.current);
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      setSuggestions([]);
      setShowSuggestions(false);
      doSearch(val);
      return;
    }
    if (val.length >= 2) {
      setShowSuggestions(true);
      if (suggestTimeoutRef.current) clearTimeout(suggestTimeoutRef.current);
      suggestTimeoutRef.current = setTimeout(async () => {
        setSuggestions(await getSearchSuggestions(val));
      }, 500);
      // Auto-search is intentionally disabled here to require manual 'Enter' or 'Confirm'
      // per user request. We only clear any existing timeout.
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
      if (val.length === 0) setResults([]);
    }
  };

  const handleSuggestionClick = (term: string) => {
    setQuery(term);
    setSuggestions([]);
    setShowSuggestions(false);
    doSearch(term);
  };

  const handleChannelClick = (channelName: string, channelThumbnail?: string, channelId?: string, channelUrl?: string) => {
    if (!channelName) return;
    if (onChannelClick) {
      onChannelClick(channelName, channelThumbnail, channelId, channelUrl);
    } else {
      setQuery(channelName);
      setActiveCategory("all");
      doSearch(channelName);
    }
  };

  const handleCategoryClick = (cat: VideoCategory) => {
    setActiveCategory(cat.id);
    if (cat.query) {
      const combined = query.length >= 2 ? `${query} ${cat.query}` : cat.query;
      doSearch(combined);
    } else if (query.length >= 2) {
      doSearch(query);
    } else {
      setResults([]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    setShowSuggestions(false);
    // URLs do YouTube ignoram categoria e vão direto para o resolver.
    if (extractYouTubeVideoId(query)) {
      doSearch(query);
      return;
    }
    const cat = VIDEO_CATEGORIES.find(c => c.id === activeCategory);
    const combined = cat?.query && query.length >= 2 ? `${query} ${cat.query}` : query;
    doSearch(combined || query);
  };

  const handleLoadComments = async (video: VideoResult) => {
    setSelectedVideoForComments(video);
    setActiveSection("comments");
    setCommentsLoading(true);
    try {
      const info = await fetchVideoInfo(video.videoId);
      setComments(info.comments);
      setRelatedFromComments(info.relatedVideos);
    } catch {
      setComments([]);
      setRelatedFromComments([]);
    }
    setCommentsLoading(false);
  };

  const baseVideos = results.length > 0 ? results : trendingResults;
  const displayVideos = extraVideos.length > 0
    ? [...baseVideos, ...extraVideos.filter((e) => !baseVideos.some((b) => b.videoId === e.videoId))]
    : baseVideos;

  // Sentinela de scroll infinito para o feed de vídeos: quando aparece na
  // viewport, busca a próxima página automaticamente.
  useEffect(() => {
    const el = feedSentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (activeSection !== "videos") return;
    if (loading || trendingLoading) return;

    const io = new IntersectionObserver(async (entries) => {
      if (!entries[0]?.isIntersecting || loadingMoreExtras) return;
      setLoadingMoreExtras(true);
      try {
        const seen = new Set(displayVideos.map((v) => v.videoId));
        const rotator = query.trim().length >= 2
          ? [query, `${query} novo`, `${query} 2026`, `${query} recente`]
          : TRENDING_QUERIES;
        const q = rotator[extraPageRef.current++ % rotator.length];
        const results = await searchYouTubeGeneral(q, { fresh: true });
        const fresh = (results || []).filter((v) => !seen.has(v.videoId));
        if (fresh.length > 0) setExtraVideos((prev) => [...prev, ...fresh]);
      } catch { /* ignore */ }
      setLoadingMoreExtras(false);
    }, { rootMargin: "800px 0px" });

    io.observe(el);
    return () => io.disconnect();
  }, [displayVideos, loadingMoreExtras, query, activeSection, loading, trendingLoading]);
  const channelGroups = groupByChannel(displayVideos);
  const playlists = groupPlaylists(displayVideos);

  // Auto-refresh do painel de Canais: consulta periódica por data para cada
  // canal atualmente visível, mesclando uploads novos no topo. Só roda quando
  // a aba "Canais" está ativa e a página está visível.
  const [channelsFreshCount, setChannelsFreshCount] = useState(0);
  useEffect(() => {
    if (activeSection !== "channels") return;
    if (channelGroups.length === 0) return;

    let cancelled = false;
    const REFRESH_MS = 90 * 1000; // 1min30s

    const tick = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      const seen = new Set(displayVideos.map((v) => v.videoId));
      const targets = channelGroups.slice(0, 12); // limita para não sobrecarregar
      const newOnes: VideoResult[] = [];

      await Promise.all(targets.map(async (g) => {
        try {
          const fresh = await searchYouTubeGeneral(g.channel, {
            channelId: g.channelId,
            channelName: g.channel,
            sortByDate: true,
            fresh: true,
            limit: 10,
          });
          for (const v of fresh) {
            if (!seen.has(v.videoId)) {
              seen.add(v.videoId);
              // Só considera "novo" o que tem menos de 24h — evita empurrar
              // vídeos antigos que só apareceram por variação da busca.
              if (ageMinutes(v.publishedTime) < 24 * 60) newOnes.push(v);
            }
          }
        } catch { /* ignore per-channel errors */ }
      }));

      if (cancelled || newOnes.length === 0) return;
      setExtraVideos((prev) => [...newOnes, ...prev]);
      setChannelsFreshCount((n) => n + newOnes.length);
      toast({
        title: `${newOnes.length} novo(s) upload(s) dos canais`,
        description: "Trazidos para o topo da lista",
      });
    };

    const id = setInterval(tick, REFRESH_MS);
    const onVis = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVis);
    // Primeira sondagem imediata ao entrar na aba
    tick();

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, channelGroups.length]);


  const SECTIONS: { id: SectionTab; icon: React.ElementType; label: string; count?: number }[] = [
    { id: "videos", icon: PlayCircle, label: "Vídeos", count: displayVideos.length },
    { id: "channels", icon: Users, label: "Canais", count: channelGroups.length },
    { id: "playlists", icon: ListVideo, label: "Playlists", count: playlists.length },
    { id: "comments", icon: MessageSquare, label: "Comentários" },
  ];

  return (
    <div className="space-y-2">
      {/* Badge de novo conteúdo */}
      <NewContentBadge
        count={newContentCount}
        onRefresh={() => {
          forceRefresh();
          resetNewContentCount();
        }}
        onDismiss={resetNewContentCount}
        channelName={`"${query}"`}
        position="floating"
      />

      {/* Search bar + View Toggle */}
      <div className="flex items-center gap-2 px-4 pt-1">
        <form onSubmit={handleSubmit} className="flex-1">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => handleInput(e.target.value)}
              onFocus={() => query.length >= 2 && setShowSuggestions(true)}
              placeholder="Pesquisar vídeos, canais ou colar URL do YouTube..."
              className="w-full pl-10 pr-9 py-2.5 rounded-full bg-secondary text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            {query && (
              <button
                type="button"
                onClick={() => { setQuery(""); setResults([]); setSuggestions([]); setActiveCategory("all"); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </form>

        <button
          onClick={cycleViewMode}
          className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full bg-secondary text-muted-foreground hover:text-primary transition-colors"
          title={viewMode === 'grid' ? 'Lista' : viewMode === 'list' ? 'Cards grandes' : 'Grade'}
        >
          {viewMode === 'grid' ? <List size={20} /> : viewMode === 'list' ? <Rows3 size={20} /> : <LayoutGrid size={20} />}
        </button>
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div className="mx-4 mt-[-4px] bg-card rounded-xl border border-border shadow-lg overflow-hidden z-20 relative">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleSuggestionClick(s)}
              className="w-full text-left px-4 py-2.5 text-sm text-foreground hover:bg-accent transition-colors flex items-center gap-2"
            >
              <Search size={14} className="text-muted-foreground flex-shrink-0" />
              <span className="truncate">{s}</span>
            </button>
          ))}
        </div>
      )}

      {/* Category + Section tabs in single row */}
      <div className="px-4 sticky top-0 bg-background/80 backdrop-blur-xl z-30 py-1.5 border-b border-white/5">
        <div 
          ref={scrollRowRef}
          onMouseDown={handleDragStart}
          onMouseMove={handleDragMove}
          onMouseUp={handleDragEnd}
          onMouseLeave={handleDragEnd}
          className="flex gap-1.5 overflow-x-auto scrollbar-hide cursor-grab active:cursor-grabbing select-none"
        >
          <VideoCategorySelector
            activeCategory={activeCategory}
            onSelect={handleCategoryClick}
          />
          {/* Section tabs inline after categories */}
          {!loading && !trendingLoading && displayVideos.length > 0 && (
            <>
              <div className="w-px bg-border/40 mx-1 self-stretch flex-shrink-0" />
              {SECTIONS.map(({ id, icon: Icon, label, count }) => (
                <button
                  key={id}
                  onClick={() => setActiveSection(id)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap flex-shrink-0 ${
                    activeSection === id
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                >
                  <Icon size={12} />
                  {label}
                  {count !== undefined && count > 0 && (
                    <span className={`text-[10px] px-1 py-0.5 rounded-full leading-none ${
                      activeSection === id ? "bg-primary-foreground/20" : "bg-muted"
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              ))}
            </>
          )}
        </div>
      </div>


          {/* Loading */}
          {(loading || (trendingLoading && results.length === 0)) && (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <Loader2 size={24} className="text-primary animate-spin" />
              <p className="text-xs text-muted-foreground">{loading ? "Buscando vídeos..." : "Carregando tendências..."}</p>
            </div>
          )}

          {/* Animated section content */}
          <AnimatePresence mode="wait">
            {/* ═══ SECTION: VÍDEOS ═══ */}
            {!loading && !trendingLoading && displayVideos.length > 0 && activeSection === "videos" && (
              <motion.div
                key="videos"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="space-y-4 px-4 pb-4"
              >
                {results.length === 0 && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <TrendingUp size={14} className="text-primary" />
                      <h2 className="text-sm font-semibold text-foreground">Bombando agora</h2>
                    </div>
                    <div className="hidden lg:flex items-center gap-1 opacity-40 hover:opacity-100 transition-opacity cursor-default">
                       <h2 className="text-lg font-black text-foreground italic tracking-tighter">XERIFE <span className="text-primary">VIDEOS</span></h2>
                    </div>
                  </div>
                )}
                <motion.div
                  className={
                    viewMode === 'large'
                      ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 lg:gap-8"
                      : viewMode === 'grid' 
                        ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-8 sm:gap-x-6 sm:gap-y-10 lg:gap-x-6 lg:gap-y-8" 
                        : "flex flex-col gap-3 sm:gap-4 lg:max-w-4xl"
                  }
                  initial="hidden"
                  animate="visible"
                  variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}
                >
                  {displayVideos.map((video) => (
                    <motion.div
                      key={video.videoId}
                      className="space-y-2"
                      variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.25 } } }}
                    >
                      <VideoCard
                        video={video}
                        onPlay={onPlayVideo}
                        onChannelClick={handleChannelClick}
                        onFullscreen={onFullscreenVideo}
                        onAddToPlaylist={onAddToPlaylist}
                        viewMode={viewMode}
                      />
                      {(viewMode === 'grid' || viewMode === 'large') && (
                        <button
                          onClick={() => handleLoadComments(video)}
                          className="flex items-center gap-1.5 ml-12 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <MessageSquare size={12} />
                          Ver comentários
                          <ChevronRight size={12} />
                        </button>
                      )}
                    </motion.div>
                  ))}
                </motion.div>
                
                {/* Botão Carregar Mais Resultados */}
                {continuation && (
                  <div className="flex justify-center pt-6">
                    <button
                      onClick={loadMoreResults}
                      disabled={loadingMore}
                      className="px-6 py-3 bg-primary text-primary-foreground rounded-full font-semibold hover:bg-primary/90 transition-colors flex items-center gap-2"
                    >
                      {loadingMore ? (
                        <>
                          <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                          Carregando...
                        </>
                      ) : (
                        <>
                          <ChevronRight className="w-4 h-4" />
                          Carregar mais resultados
                        </>
                      )}
                    </button>
                  </div>
                )}
                {/* Sentinela de scroll infinito — dispara carregamento da próxima página */}
                <div ref={feedSentinelRef} aria-hidden className="h-1 w-full" />
                {loadingMoreExtras && (
                  <div className="flex items-center justify-center py-4 gap-2 text-xs text-muted-foreground">
                    <Loader2 size={14} className="animate-spin" />
                    Buscando mais vídeos…
                  </div>
                )}
              </motion.div>
            )}

            {/* ═══ SECTION: CANAIS ═══ */}
            {!loading && !trendingLoading && displayVideos.length > 0 && activeSection === "channels" && (
              <motion.div
                key="channels"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="space-y-4 px-4 pb-4"
              >
                <div className="flex items-center gap-2">
                  <Users size={14} className="text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">Canais encontrados</h2>
                </div>
                
                {channelGroups.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-2">
                    <Users size={32} className="text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">Nenhum canal identificado</p>
                  </div>
                ) : (
                  <motion.div
                    className={viewMode === 'grid' 
                      ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" 
                      : "space-y-5"}
                    initial="hidden"
                    animate="visible"
                    variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }}
                  >
                    {channelGroups.map((group) => (
                      <motion.div
                        key={group.channel}
                        className="space-y-3"
                        variants={{ hidden: { opacity: 0, x: -16 }, visible: { opacity: 1, x: 0, transition: { duration: 0.3 } } }}
                      >
                        <button
                          onClick={() => handleChannelClick(group.channel, group.thumbnail, group.channelId, group.channelUrl)}
                          className="flex items-center gap-3 w-full p-3 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors active:scale-[0.98]"
                        >
                          {group.thumbnail ? (
                            <img src={group.thumbnail} alt={group.channel} className="w-12 h-12 rounded-full object-cover ring-2 ring-primary/20" loading="lazy" />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary text-lg font-bold">
                              {group.channel.charAt(0)}
                            </div>
                          )}
                          <div className="text-left flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">{group.channel}</p>
                            <p className="text-[11px] text-muted-foreground">{group.videos.length} vídeo{group.videos.length > 1 ? "s" : ""}</p>
                          </div>
                          <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />
                        </button>

                        {viewMode === 'grid' ? (
                          <div className="grid grid-cols-2 gap-2">
                            {group.videos.slice(0, 4).map((video) => (
                              <button key={video.videoId} onClick={() => onPlayVideo(video)} className="w-full text-left">
                                <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-card">
                                  <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover" loading="lazy" />
                                  {video.duration && <span className="absolute bottom-1 right-1 bg-background/80 text-foreground text-[9px] font-mono px-1 py-0.5 rounded">{video.duration}</span>}
                                </div>
                                <p className="font-medium text-foreground line-clamp-2 mt-1.5 leading-tight text-[10px]">{video.title}</p>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <HorizontalScroll className="flex gap-3 pb-2 -mx-4 px-4">
                            {group.videos.slice(0, 6).map((video) => (
                              <button key={video.videoId} onClick={() => onPlayVideo(video)} className="flex-shrink-0 w-[200px] active:scale-[0.98] transition-transform text-left">
                                <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-card">
                                  <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover" loading="lazy" />
                                  {video.duration && <span className="absolute bottom-1 right-1 bg-background/80 text-foreground text-[9px] font-mono px-1 py-0.5 rounded">{video.duration}</span>}
                                </div>
                                <p className="font-medium text-foreground line-clamp-2 mt-1.5 leading-tight text-xs">{video.title}</p>
                              </button>
                            ))}
                          </HorizontalScroll>
                        )}

                        <div className="h-px bg-border/50" />
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </motion.div>
            )}

            {/* ═══ SECTION: PLAYLISTS ═══ */}
            {!loading && !trendingLoading && displayVideos.length > 0 && activeSection === "playlists" && (
              <motion.div
                key="playlists"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="space-y-4 px-4 pb-4"
              >
                <div className="flex items-center gap-2">
                  <ListVideo size={14} className="text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">Playlists sugeridas</h2>
                </div>

                {playlists.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-2">
                    <ListVideo size={32} className="text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">Nenhuma playlist formada</p>
                  </div>
                ) : (
                  playlists.map((pl, pi) => (
                    <motion.div
                      key={pi}
                      className="space-y-3"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: pi * 0.05 }}
                    >
                      <h3 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                        <span className="w-5 h-5 rounded bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold">{pi + 1}</span>
                        {pl.title}
                        <span className="text-muted-foreground font-normal">• {pl.videos.length} vídeos</span>
                      </h3>
                      <HorizontalScroll className="flex gap-3 pb-2 -mx-4 px-4">
                        {pl.videos.map((video) => (
                          <button
                            key={video.videoId}
                            onClick={() => onPlayVideo(video)}
                            className="flex-shrink-0 w-[180px] active:scale-[0.98] transition-transform text-left"
                          >
                            <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-card">
                              <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover" loading="lazy" />
                              {video.duration && (
                                <span className="absolute bottom-1 right-1 bg-background/80 text-foreground text-[9px] font-mono px-1 py-0.5 rounded">
                                  {video.duration}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] font-medium text-foreground line-clamp-2 mt-1.5 leading-tight">{video.title}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{video.channel}</p>
                          </button>
                        ))}
                      </HorizontalScroll>
                    </motion.div>
                  ))
                )}
              </motion.div>
            )}

            {/* ═══ SECTION: COMMENTS ═══ */}
            {!loading && !trendingLoading && activeSection === "comments" && (
              <motion.div
                key="comments"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="space-y-4 px-4 pb-4"
              >
                {!selectedVideoForComments ? (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <MessageSquare size={14} className="text-primary" />
                      <h2 className="text-sm font-semibold text-foreground">Escolha um vídeo para ver comentários</h2>
                    </div>
                    <motion.div
                      className="space-y-2"
                      initial="hidden"
                      animate="visible"
                      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.03 } } }}
                    >
                      {displayVideos.slice(0, 60).map((video) => (
                        <motion.button
                          key={video.videoId}
                          onClick={() => handleLoadComments(video)}
                          className="flex items-center gap-3 w-full p-2.5 rounded-xl bg-card/40 hover:bg-card/80 border border-border/30 transition-all active:scale-[0.99] text-left"
                          variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
                        >
                          <div className="relative w-16 aspect-video rounded-lg overflow-hidden bg-muted flex-shrink-0">
                            <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover" loading="lazy" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground line-clamp-2 leading-tight">{video.title}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                              <MessageSquare size={10} />
                              Toque para ver comentários
                            </p>
                          </div>
                          <ChevronRight size={14} className="text-muted-foreground flex-shrink-0" />
                        </motion.button>
                      ))}
                    </motion.div>
                  </div>
                ) : (
                  <motion.div
                    className="space-y-4"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50">
                      <div className="relative w-20 aspect-video rounded-lg overflow-hidden bg-card flex-shrink-0">
                        <img src={selectedVideoForComments.thumbnail} alt={selectedVideoForComments.title} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground line-clamp-2 leading-tight">{selectedVideoForComments.title}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{selectedVideoForComments.channel}</p>
                      </div>
                      <button
                        onClick={() => { setSelectedVideoForComments(null); setComments([]); setRelatedFromComments([]); }}
                        className="p-1.5 rounded-full hover:bg-accent transition-colors"
                      >
                        <X size={14} className="text-muted-foreground" />
                      </button>
                    </div>

                    <div>
                      <h3 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
                        <MessageSquare size={12} className="text-primary" />
                        {commentsLoading ? "Carregando..." : `${comments.length} comentários`}
                      </h3>
                      <VideoComments comments={comments} loading={commentsLoading} />
                    </div>

                    {relatedFromComments.length > 0 && (
                      <div className="pt-2">
                        <div className="h-px bg-border/50 mb-4" />
                        <h3 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
                          <PlayCircle size={12} className="text-primary" />
                          Vídeos relacionados
                        </h3>
                        <RelatedVideos
                          videos={relatedFromComments}
                          onPlay={(video) => onPlayVideo(video)}
                        />
                      </div>
                    )}
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Empty state */}
          {!loading && query.length >= 2 && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <Search size={32} className="text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Nenhum vídeo encontrado</p>
            </div>
          )}
    </div>
  );
};

export default ExploreScreen;
