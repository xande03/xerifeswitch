import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from "react";
import { ArrowLeft, Loader2, Play, ListVideo, Info, Users, Radio, Flame, Zap, Clock, Film, Heart } from "lucide-react";
import { searchYouTubeGeneral, searchYouTubeGeneralPage, loadMoreYouTubeGeneral, type VideoResult } from "@/lib/youtubeGeneralSearch";
import { isFavoriteChannel, toggleFavoriteChannel, FAV_CHANNELS_EVENT } from "@/lib/favoriteChannels";


// Persist pagination state per channel so reload retomes onde parou.
const CHANNEL_PAG_KEY = (name: string, channelId?: string) => `channel_pag:${(channelId || name).toLowerCase().trim()}`;
const CHANNEL_PAG_TTL = 6 * 60 * 60 * 1000; // 6h
interface StoredPagination {
  continuation: string | null;
  extraVideos: VideoResult[];
  ts: number;
}
function loadStoredPagination(name: string, channelId?: string): StoredPagination | null {
  try {
    const raw = localStorage.getItem(CHANNEL_PAG_KEY(name, channelId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPagination;
    if (Date.now() - parsed.ts > CHANNEL_PAG_TTL) return null;
    return parsed;
  } catch { return null; }
}
function saveStoredPagination(name: string, channelId: string | undefined, data: StoredPagination) {
  try { localStorage.setItem(CHANNEL_PAG_KEY(name, channelId), JSON.stringify(data)); } catch {}
}

// Cache in-memory por canal: mantém o último snapshot de vídeos para reexibir
// instantaneamente ao renavegar entre canais sem esperar o auto-refresh.
const channelVideosCache = new Map<string, { data: any; ts: number }>();
const CHANNEL_CACHE_TTL = 5 * 60 * 1000;
const channelCacheKey = (name: string, id?: string) => `${(id || name).toLowerCase().trim()}`;

// Scroll por aba, por canal — persistido em sessionStorage para restaurar
// posição individual ao trocar de aba (Vídeos, Shorts, Ao vivo, Populares, Playlists).
const TAB_SCROLL_KEY = (name: string, id: string | undefined, tab: string) =>
  `channel_scroll:${(id || name).toLowerCase().trim()}:${tab}`;


import { hdThumbnail } from "@/lib/utils";
import VideoCard from "./VideoCard";
import BlurImage from "./BlurImage";
import PullToRefresh from "./PullToRefresh";
import RefreshSkeleton from "./RefreshSkeleton";
import { useChannelAutoRefresh } from "@/hooks/useAutoRefreshChannel";
import NewContentBadge from "./NewContentBadge";
import { useToast } from "@/hooks/use-toast";

interface ChannelProfileProps {
  channelName: string;
  channelId?: string;
  channelUrl?: string;
  channelThumbnail?: string;
  onBack: () => void;
  onPlayVideo: (video: VideoResult) => void;
  onFullscreenVideo?: (video: VideoResult) => void;
}

type ChannelTab = "videos" | "shorts" | "live" | "playlists" | "popular" | "about";

// Converte "1.2M", "345K", "1,234" em número aproximado de views
function parseViews(s: string): number {
  if (!s) return 0;
  const cleaned = s.replace(/\.|,/g, "").toLowerCase();
  const m = cleaned.match(/([\d]+)\s*([kmb]?)/);
  if (!m) return 0;
  const n = parseInt(m[1], 10);
  const mult = m[2] === "b" ? 1e9 : m[2] === "m" ? 1e6 : m[2] === "k" ? 1e3 : 1;
  return n * mult;
}

// Parse pt-BR "há X unidades" into approximate age in minutes.
function ageMinutes(pt: string): number {
  if (!pt) return Number.MAX_SAFE_INTEGER;
  if (/agora|transmitindo/i.test(pt)) return 0;
  const m = pt.toLowerCase().match(/(\d+)\s*(minuto|hora|dia|semana|mês|mes|ano)/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  const n = parseInt(m[1], 10);
  const mult: Record<string, number> = {
    minuto: 1, hora: 60, dia: 1440, semana: 10080, mês: 43200, mes: 43200, ano: 525600,
  };
  return n * (mult[m[2]] ?? 60);
}

const normalizeChannelName = (s: string) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/^@/, "")
    .replace(/\s*[-–]\s*topic$/i, "")
    .replace(/\s+/g, " ")
    .trim();

const extractChannelId = (s?: string) => (s || "").trim().match(/UC[\w-]{20,}/)?.[0] || "";

const ChannelProfile = ({ channelName, channelId, channelUrl, channelThumbnail, onBack, onPlayVideo, onFullscreenVideo }: ChannelProfileProps) => {
  const [activeTab, setActiveTab] = useState<ChannelTab>("videos");
  const { toast } = useToast();
  const [resolvedChannelId, setResolvedChannelId] = useState<string | null>(null);
  const effectiveChannelId = channelId || resolvedChannelId || undefined;

  // ── Avatar do canal ──
  // A prop pode chegar vazia (busca, cards antigos, cache). Resolvemos com
  // fallback: prop → thumbnail de canal vindo dos vídeos → busca dedicada.
  const [fetchedAvatar, setFetchedAvatar] = useState<string>("");
  const [avatarBroken, setAvatarBroken] = useState(false);
  useEffect(() => { setFetchedAvatar(""); setAvatarBroken(false); }, [channelName, channelId]);

  // ── Favoritar canal ──
  const [isFav, setIsFav] = useState(false);
  useEffect(() => {
    const sync = () => setIsFav(isFavoriteChannel({ channelId: effectiveChannelId, name: channelName }));
    sync();
    window.addEventListener(FAV_CHANNELS_EVENT, sync);
    return () => window.removeEventListener(FAV_CHANNELS_EVENT, sync);
  }, [channelName, effectiveChannelId]);


  // Paginação: primeira página vem via auto-refresh; carregamos as demais aqui
  const [extraVideos, setExtraVideos] = useState<VideoResult[]>([]);
  const [continuation, setContinuation] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialContinuationLoaded, setInitialContinuationLoaded] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Sistema de auto-refresh em tempo real
  const {
    data: videos,
    loading,
    lastUpdate,
    newContentCount,
    forceRefresh,
    resetNewContentCount,
    isAutoRefreshEnabled
  } = useChannelAutoRefresh(
    effectiveChannelId || channelName,
    async (_name, options) => {
      const results = await searchYouTubeGeneral(channelName, { ...options, limit: 100, channelId: effectiveChannelId, channelName, noCache: !effectiveChannelId });
      // Validação estrita: descarta qualquer item cujo channelId não bata com o canal ativo.
      // Garante que a resposta da IFrame/Data API pertence exclusivamente a este canal —
      // sem mistura de conteúdo entre channelIds diferentes.
      const targetId = extractChannelId(effectiveChannelId || channelUrl);
      const target = normalizeChannelName(channelName);
      const filtered = (results || []).filter((v) => {
        const vid = extractChannelId(v.channelId || v.channelUrl);
        if (targetId) {
          if (vid && vid !== targetId) {
            console.warn(`[ChannelProfile] ⛔ Ignorando vídeo de outro canal: "${v.channel}" (${vid}) ≠ alvo ${targetId}`);
            return false;
          }
          return vid === targetId;
        }
        return normalizeChannelName(v.channel) === target;
      });
      if (filtered.length !== (results?.length || 0)) {
        console.log(`[ChannelProfile] 🔒 Filtro por channelId: ${filtered.length}/${results?.length} vídeos válidos para ${channelName}`);
      }
      return filtered;
    },
    {
      enabled: true,
      // Sincronização a cada 30 minutos — mais frequente para garantir que
      // publicações recentes apareçam rapidamente. Novo conteúdo também é
      // verificado imediatamente ao voltar à aba/app (visibilitychange + focus).
      interval: 30 * 60 * 1000,
      onNewContent: (count) => {
        toast({
          title: "Novo conteúdo disponível!",
          description: `${count} novo(s) vídeo(s) de ${channelName}`,
          duration: 5000,
        });
      }
    }
  );


  // Hidratar cache in-memory ao trocar de canal para exibir vídeos instantaneamente
  const [cachedVideos, setCachedVideos] = useState<any>(null);
  useEffect(() => {
    const key = channelCacheKey(channelName, effectiveChannelId);
    const entry = channelVideosCache.get(key);
    if (entry && Date.now() - entry.ts < CHANNEL_CACHE_TTL) {
      setCachedVideos(entry.data);
    } else {
      setCachedVideos(null);
    }
  }, [channelName, effectiveChannelId]);

  // Sempre que o auto-refresh entregar dados novos, atualiza o cache do canal
  useEffect(() => {
    if (!videos) return;
    const key = channelCacheKey(channelName, effectiveChannelId);
    channelVideosCache.set(key, { data: videos, ts: Date.now() });
  }, [videos, channelName, effectiveChannelId]);

  // Ao trocar de canal, restaurar estado persistido (se houver) e resetar flags
  useEffect(() => {
    setResolvedChannelId(null);
  }, [channelName, channelId]);



  // Ao trocar de canal, restaurar estado persistido (se houver) e resetar flags
  useEffect(() => {
    const stored = loadStoredPagination(channelName, effectiveChannelId);
    if (stored) {
      setExtraVideos(stored.extraVideos);
      setContinuation(stored.continuation);
      setInitialContinuationLoaded(true); // já temos token do storage
    } else {
      setExtraVideos([]);
      setContinuation(null);
      setInitialContinuationLoaded(false);
    }
  }, [channelName, effectiveChannelId]);

  // Se não havia estado persistido, ao receber a 1ª página buscamos o token
  useEffect(() => {
    if (initialContinuationLoaded) return;
    const results = (videos as any)?.results || videos;
    if (!Array.isArray(results) || results.length === 0) return;

    let cancelled = false;
    setInitialContinuationLoaded(true);
    searchYouTubeGeneralPage(channelName, { sortByDate: true, fresh: true, noCache: !effectiveChannelId, limit: 100, channelId: effectiveChannelId, channelName })
      .then((page) => {
        if (!cancelled) setContinuation(page.continuation);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [videos, channelName, effectiveChannelId, initialContinuationLoaded]);

  useEffect(() => {
    if (channelId || resolvedChannelId) return;
    const results = ((videos as any)?.results || videos || []) as VideoResult[];
    const target = normalizeChannelName(channelName);
    const exact = results.find((v) => normalizeChannelName(v.channel) === target && extractChannelId(v.channelId || v.channelUrl));
    const id = extractChannelId(exact?.channelId || exact?.channelUrl);
    if (id) setResolvedChannelId(id);
  }, [videos, channelName, channelId, resolvedChannelId]);

  const loadMore = useCallback(async () => {
    if (!continuation || loadingMore) return;
    setLoadingMore(true);
    const scrollBefore = typeof window !== "undefined" ? window.scrollY : 0;
    try {
      // Página máxima (100) para reduzir requisições e trazer o catálogo inteiro mais rápido
      const page = await loadMoreYouTubeGeneral(continuation, 100, effectiveChannelId ? { source: "channel", channelId: effectiveChannelId, channelName } : undefined);
      let nextExtra: VideoResult[] = [];
      setExtraVideos((prev) => {
        const seen = new Set(prev.map((v) => v.videoId));
        const firstPage = ((videos as any)?.results || videos || []) as VideoResult[];
        for (const v of firstPage) seen.add(v.videoId);
        nextExtra = [...prev, ...page.results.filter((v) => !seen.has(v.videoId))];
        return nextExtra;
      });
      setContinuation(page.continuation);
      saveStoredPagination(channelName, effectiveChannelId, {
        continuation: page.continuation,
        extraVideos: nextExtra,
        ts: Date.now(),
      });
    } finally {
      setLoadingMore(false);
      // Restaura a posição de rolagem após o append para evitar "saltos"
      if (typeof window !== "undefined") {
        requestAnimationFrame(() => window.scrollTo({ top: scrollBefore }));
      }
    }
  }, [continuation, loadingMore, videos, channelName, effectiveChannelId]);

  // Infinite scroll: dispara loadMore quando o sentinel entra na viewport.
  // rootMargin generoso (1200px) garante que carregamos a próxima página bem
  // antes do usuário chegar no fim — scroll infinito verdadeiro sem limites.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !continuation || loadingMore) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "1200px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [continuation, loadMore, loadingMore]);

  // Fail-safe: se a página inteira couber na viewport (poucos vídeos ainda
  // carregados) e ainda houver continuation, dispara automaticamente para
  // encadear páginas até preencher a tela.
  useEffect(() => {
    if (!continuation || loadingMore) return;
    if (typeof window === "undefined") return;
    const doc = document.documentElement;
    if (doc.scrollHeight <= window.innerHeight + 200) {
      loadMore();
    }
  }, [continuation, loadingMore, extraVideos.length, videos]);

  // Ordena vídeos por recência após receber dados
  const sortedVideos = useMemo(() => {
    const source = videos || cachedVideos;
    const firstPage = ((source as any)?.results || source || []) as VideoResult[];
    const all = [...firstPage, ...extraVideos];

    const target = normalizeChannelName(channelName);
    const targetId = extractChannelId(effectiveChannelId || channelUrl);
    // Deduplicar por videoId E filtrar somente o canal exato selecionado.
    // Sem includes/similaridade: nomes parecidos não entram no catálogo.
    const seen = new Set<string>();
    const unique = all.filter((v) => {
      if (seen.has(v.videoId)) return false;
      seen.add(v.videoId);
      const vidChannelId = extractChannelId(v.channelId || v.channelUrl);
      if (targetId) return vidChannelId === targetId;
      const vc = normalizeChannelName(v.channel);
      if (!vc) return false;
      return vc === target;
    });
    return unique.sort((a, b) => ageMinutes(a.publishedTime) - ageMinutes(b.publishedTime));
  }, [videos, cachedVideos, extraVideos, channelName, effectiveChannelId, channelUrl]);

  // Scroll independente por aba (Vídeos, Shorts, Ao vivo, Populares, Playlists, Sobre).
  // Salva a posição ao sair da aba atual e restaura ao entrar em outra.
  const prevTabRef = useRef<ChannelTab>(activeTab);
  useEffect(() => {
    const prev = prevTabRef.current;
    if (typeof window === "undefined") return;
    // Salva scroll da aba anterior
    try {
      sessionStorage.setItem(TAB_SCROLL_KEY(channelName, effectiveChannelId, prev), String(window.scrollY));
    } catch {}
    prevTabRef.current = activeTab;
    // Restaura scroll da nova aba no próximo frame (após o novo conteúdo montar)
    const raf = requestAnimationFrame(() => {
      try {
        const y = Number(sessionStorage.getItem(TAB_SCROLL_KEY(channelName, effectiveChannelId, activeTab)) || "0");
        window.scrollTo({ top: Number.isFinite(y) ? y : 0 });
      } catch {}
    });
    return () => cancelAnimationFrame(raf);
  }, [activeTab, channelName, effectiveChannelId]);

  // Preservação de scroll durante auto-refresh (prepend de novos vídeos).
  // Cada aba mantém sua posição: mede a altura antes/depois e desloca a
  // rolagem pela diferença quando novos itens são inseridos no topo,
  // evitando que a lista "salte" ao mesclar novidades.
  const prevFirstIdRef = useRef<string | null>(null);
  const prevScrollHeightRef = useRef<number>(0);
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const currentFirst = sortedVideos[0]?.videoId || null;
    const prevFirst = prevFirstIdRef.current;
    const prevH = prevScrollHeightRef.current;
    const newH = document.documentElement.scrollHeight;

    // Se o primeiro id mudou e o antigo ainda está presente => houve prepend
    if (prevFirst && currentFirst && prevFirst !== currentFirst && !loadingMore) {
      const stillHasOld = sortedVideos.some((v) => v.videoId === prevFirst);
      if (stillHasOld && prevH > 0) {
        const delta = newH - prevH;
        if (delta > 0) {
          const y = window.scrollY;
          window.scrollTo({ top: y + delta });
          // Atualiza a posição salva da aba ativa para refletir o novo offset
          try {
            sessionStorage.setItem(
              TAB_SCROLL_KEY(channelName, effectiveChannelId, activeTab),
              String(y + delta)
            );
          } catch {}
        }
      }
    }
    prevFirstIdRef.current = currentFirst;
    prevScrollHeightRef.current = newH;
  }, [sortedVideos, activeTab, channelName, effectiveChannelId, loadingMore]);




  // Todas as sub-listas herdam a ordenação por recência de sortedVideos e
  // reforçam com um sort explícito — garantindo que os vídeos mais novos
  // apareçam sempre no topo, mesmo após paginação/append de conteúdo antigo.
  const liveVideos = useMemo(
    () => sortedVideos.filter((v) => v.isLive).sort((a, b) => ageMinutes(a.publishedTime) - ageMinutes(b.publishedTime)),
    [sortedVideos]
  );
  const regularVideos = useMemo(
    () => sortedVideos.filter((v) => !v.isLive).sort((a, b) => ageMinutes(a.publishedTime) - ageMinutes(b.publishedTime)),
    [sortedVideos]
  );
  const shortsVideos = useMemo(
    () => regularVideos.filter((v) => (v.lengthSeconds ?? 999) > 0 && (v.lengthSeconds ?? 999) <= 65),
    [regularVideos]
  );
  const longVideos = useMemo(
    () => regularVideos.filter((v) => (v.lengthSeconds ?? 0) > 65),
    [regularVideos]
  );

  const popularVideos = useMemo(
    () => [...regularVideos].sort((a, b) => parseViews(b.views) - parseViews(a.views)),
    [regularVideos]
  );
  const oldestVideos = useMemo(
    () => [...regularVideos].sort((a, b) => ageMinutes(b.publishedTime) - ageMinutes(a.publishedTime)),
    [regularVideos]
  );
  const longestVideos = useMemo(
    () => [...regularVideos].sort((a, b) => (b.lengthSeconds ?? 0) - (a.lengthSeconds ?? 0)),
    [regularVideos]
  );

  // Playlists automáticas — organizadas em módulos no estilo dos painéis do YouTube.
  // Todas derivam do catálogo completo carregado via iframe/Data API, filtradas ao canal exato.
  const playlists = useMemo(() => {
    const list: { title: string; icon: any; videos: VideoResult[] }[] = [];
    if (popularVideos.length > 0)
      list.push({ title: `Populares de ${channelName}`, icon: Flame, videos: popularVideos.slice(0, 12) });
    if (regularVideos.length > 0)
      list.push({ title: "Enviados recentemente", icon: Clock, videos: regularVideos.slice(0, 12) });
    if (shortsVideos.length > 0)
      list.push({ title: "Shorts", icon: Zap, videos: shortsVideos.slice(0, 12) });
    if (liveVideos.length > 0)
      list.push({ title: "Transmissões ao vivo", icon: Radio, videos: liveVideos.slice(0, 12) });
    if (longestVideos.length > 0)
      list.push({ title: "Episódios completos", icon: Film, videos: longestVideos.slice(0, 12) });
    if (oldestVideos.length > 4)
      list.push({ title: "Do início do canal", icon: ListVideo, videos: oldestVideos.slice(0, 12) });
    return list;
  }, [popularVideos, regularVideos, shortsVideos, liveVideos, longestVideos, oldestVideos, channelName]);

  return (
    <PullToRefresh
      onRefresh={() => { forceRefresh(); resetNewContentCount(); }}
      className="space-y-0 min-h-screen bg-background pb-20"
      skeleton={<RefreshSkeleton rows={3} variant="grid" />}
    >

      {/* Badge de Novo Conteúdo */}
      <NewContentBadge
        count={newContentCount}
        onRefresh={() => {
          forceRefresh();
          resetNewContentCount();
        }}
        onDismiss={resetNewContentCount}
        channelName={channelName}
        position="floating"
      />

      {/* Premium Header / Banner Area */}
      <div className="relative">
        <div className="h-40 sm:h-56 lg:h-72 overflow-hidden bg-gradient-to-br from-primary/20 via-background to-background border-b border-border/40 relative">
           {(() => {
             // Banner: prefer a real 16:9 thumbnail from a recent video with a
             // valid (non-placeholder) cover. We skip the first video if its
             // thumbnail resolves to YouTube's grey placeholder — BlurImage
             // handles the fallback chain (maxres → sd → hq → mq → default).
             const heroVideo = sortedVideos.find((v) => v.thumbnail);
             const bg = heroVideo?.thumbnail || channelThumbnail || sortedVideos[0]?.channelThumbnail;
             if (!bg) return null;
             return (
               <>
                 {/* Camada principal — imagem nítida com fallback automático */}
                 <BlurImage
                   src={hdThumbnail(bg)}
                   alt={`Banner de ${channelName}`}
                   className="absolute inset-0 w-full h-full opacity-90"
                   loading="eager"
                 />
                 {/* Camada blur ambiente atrás — profundidade sem apagar a imagem */}
                 <div
                   aria-hidden
                   className="absolute inset-0 w-full h-full opacity-60 blur-2xl scale-125 bg-center bg-cover"
                   style={{ backgroundImage: `url(${hdThumbnail(bg)})` }}
                 />
                 {/* Gradiente para leitura do card de perfil embaixo */}
                 <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/10 to-background/80" />
               </>
             );
           })()}
        </div>



        {/* Back Button Overlay */}
        <div className="absolute top-4 left-4 z-20">
          <button onClick={onBack} className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center hover:bg-primary transition-all text-white shadow-lg">
            <ArrowLeft size={20} />
          </button>
        </div>

        {/* Profile Info Card Overlay */}
        <div className="absolute -bottom-16 left-0 right-0 px-4 sm:px-8 lg:px-12 flex flex-col sm:flex-row items-end gap-4 sm:gap-6">
          <div className="relative group flex-shrink-0">
             {channelThumbnail ? (
               <img src={hdThumbnail(channelThumbnail)} alt={channelName} className="w-24 h-24 sm:w-32 sm:h-32 rounded-3xl object-cover ring-4 ring-background shadow-2xl" />
             ) : (
               <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-3xl bg-secondary flex items-center justify-center text-primary text-3xl font-bold ring-4 ring-background shadow-2xl">
                 {channelName.charAt(0)}
               </div>
             )}
             <div className="absolute inset-0 rounded-3xl bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
          </div>
          <div className="flex-1 pb-2 sm:pb-4 text-center sm:text-left">
            <h1 className="text-2xl sm:text-4xl font-black text-foreground tracking-tight mb-0.5 sm:mb-1">{channelName}</h1>
            <div className="flex items-center justify-center sm:justify-start gap-3 text-xs sm:text-sm text-muted-foreground font-medium">
               <span className="flex items-center gap-1"><Users size={14} className="text-primary" /> Canal Oficial</span>
               <span className="w-1 h-1 rounded-full bg-border" />
               <span>{sortedVideos.length} vídeos</span>
               {isAutoRefreshEnabled && (
                 <>
                   <span className="w-1 h-1 rounded-full bg-border" />
                   <span className="flex items-center gap-1 text-green-500">
                     <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                     Ao vivo
                   </span>
                 </>
               )}
            </div>
          </div>
          <div className="pb-2 sm:pb-4 flex-shrink-0">
             <button className="px-8 py-2.5 rounded-full bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-all active:scale-95 shadow-lg shadow-primary/20">
               Inscrever-se
             </button>
          </div>
        </div>
      </div>

      {/* Spacing for info card */}
      <div className="h-20 sm:h-24" />

      {/* Tabs - Sticky */}
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border/40 px-4 sm:px-8 lg:px-12 py-1.5 flex gap-2 overflow-x-auto scrollbar-hide">
        {([
          { id: "videos" as ChannelTab, icon: Play, label: "Vídeos", count: regularVideos.length },
          { id: "shorts" as ChannelTab, icon: Zap, label: "Shorts", count: shortsVideos.length },
          { id: "live" as ChannelTab, icon: Radio, label: "Ao vivo", count: liveVideos.length },
          { id: "playlists" as ChannelTab, icon: ListVideo, label: "Playlists", count: playlists.length },
          { id: "popular" as ChannelTab, icon: Flame, label: "Populares", count: popularVideos.length },
          { id: "about" as ChannelTab, icon: Info, label: "Sobre", count: 0 },
        ]).filter((t) => t.id === "videos" || t.id === "about" || t.id === "playlists" || t.count > 0).map(({ id, icon: Icon, label, count }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
              activeTab === id
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/10"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            }`}
          >
            <Icon size={14} className={activeTab === id ? "animate-pulse" : ""} />
            {label}
            {count > 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === id ? "bg-primary-foreground/20" : "bg-secondary/70 text-muted-foreground"}`}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="px-4 sm:px-8 lg:px-12 py-6">
        {loading && sortedVideos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 size={32} className="text-primary animate-spin" />
            <p className="text-sm font-medium text-muted-foreground">Sintonizando canal...</p>
          </div>
        ) : activeTab === "videos" ? (
          <div className="space-y-8">
            {liveVideos.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="relative flex items-center justify-center w-6 h-6">
                    <span className="absolute inset-0 rounded-full bg-red-600/40 animate-ping" />
                    <Radio size={16} className="relative text-red-500" />
                  </span>
                  <h2 className="text-lg font-black text-foreground uppercase tracking-wider">Ao vivo agora</h2>
                  <span className="text-xs font-bold text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full">
                    {liveVideos.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-6">
                  {liveVideos.map((video) => (
                    <VideoCard
                      key={video.videoId}
                      video={video}
                      onPlay={onPlayVideo}
                      onFullscreen={onFullscreenVideo}
                      viewMode="grid"
                    />
                  ))}
                </div>
              </section>
            )}
            {regularVideos.length > 0 && (
              <section className="space-y-4">
                {liveVideos.length > 0 && (
                  <h2 className="text-lg font-black text-foreground uppercase tracking-wider">Vídeos</h2>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-6">
                  {regularVideos.map((video) => (
                    <VideoCard
                      key={video.videoId}
                      video={video}
                      onPlay={onPlayVideo}
                      onFullscreen={onFullscreenVideo}
                      viewMode="grid"
                    />
                  ))}
                </div>
              </section>
            )}
            {/* Infinite scroll sentinel + botão fallback (garante que sempre há um jeito de carregar mais) */}
            {continuation && (
              <>
                <div ref={sentinelRef} className="h-10" aria-hidden />
                <div className="flex justify-center pt-2">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="px-6 py-2.5 rounded-full bg-secondary text-foreground text-sm font-semibold hover:bg-secondary/80 transition-all active:scale-95 disabled:opacity-60 flex items-center gap-2"
                  >
                    {loadingMore ? (
                      <><Loader2 size={16} className="animate-spin" /> Carregando mais vídeos...</>
                    ) : (
                      <>Carregar mais vídeos do catálogo</>
                    )}
                  </button>
                </div>
              </>
            )}
            {!continuation && loadingMore && (
              <div className="flex justify-center pt-2 pb-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 size={16} className="animate-spin" />
                  Carregando mais vídeos...
                </div>
              </div>
            )}
            {!continuation && !loadingMore && sortedVideos.length > 0 && (
              <div className="flex flex-col items-center gap-2 pt-4">
                <button
                  onClick={async () => {
                    // Sem continuation em cache: busca uma nova página fresca e
                    // anexa os novos vídeos sem recarregar o canal inteiro.
                    setLoadingMore(true);
                    const scrollBefore = typeof window !== "undefined" ? window.scrollY : 0;
                    try {
                      const page = await searchYouTubeGeneralPage(channelName, {
                        sortByDate: true,
                        fresh: true,
                        noCache: true,
                        limit: 100,
                        channelId: effectiveChannelId,
                        channelName,
                      });
                      const existing = new Set(sortedVideos.map((v) => v.videoId));
                      const additions = page.results.filter((v) => !existing.has(v.videoId));
                      if (additions.length > 0) {
                        setExtraVideos((prev) => {
                          const next = [...prev, ...additions];
                          saveStoredPagination(channelName, effectiveChannelId, {
                            continuation: page.continuation,
                            extraVideos: next,
                            ts: Date.now(),
                          });
                          return next;
                        });
                      }
                      setContinuation(page.continuation);
                    } finally {
                      setLoadingMore(false);
                      if (typeof window !== "undefined") {
                        requestAnimationFrame(() => window.scrollTo({ top: scrollBefore }));
                      }
                    }
                  }}
                  disabled={loadingMore}
                  className="px-6 py-2.5 rounded-full bg-secondary text-foreground text-sm font-semibold hover:bg-secondary/80 transition-all active:scale-95 disabled:opacity-60 flex items-center gap-2"
                >
                  {loadingMore ? (
                    <><Loader2 size={16} className="animate-spin" /> Buscando mais vídeos...</>
                  ) : (
                    <>Carregar mais</>
                  )}
                </button>
                <p className="text-center text-xs text-muted-foreground/70">
                  {sortedVideos.length} vídeos carregados
                </p>
              </div>
            )}
          </div>

        ) : activeTab === "shorts" ? (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Zap size={18} className="text-primary" />
              <h2 className="text-lg font-black text-foreground uppercase tracking-wider">Shorts</h2>
              <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">{shortsVideos.length}</span>
            </div>
            {shortsVideos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 opacity-40">
                <Zap size={48} />
                <p className="font-medium">Este canal ainda não publicou Shorts</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-3 gap-y-6">
                {shortsVideos.map((video) => (
                  <button
                    key={video.videoId}
                    onClick={() => onPlayVideo(video)}
                    className="group/item flex flex-col text-left active:scale-[0.98] transition-transform"
                  >
                    <div className="relative aspect-[9/16] rounded-2xl overflow-hidden bg-card border border-white/5 shadow-lg">
                      <BlurImage src={hdThumbnail(video.thumbnail)} alt={video.title} className="w-full h-full transition-transform group-hover/item:scale-110 duration-500" />
                      <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/70 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md">
                        <Zap size={10} /> SHORT
                      </div>
                    </div>
                    <p className="text-xs font-semibold text-foreground line-clamp-2 mt-2 leading-tight group-hover:text-primary transition-colors">{video.title}</p>
                  </button>
                ))}
              </div>
            )}
          </section>
        ) : activeTab === "live" ? (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Radio size={18} className="text-red-500" />
              <h2 className="text-lg font-black text-foreground uppercase tracking-wider">Ao vivo</h2>
              <span className="text-xs font-bold text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full">{liveVideos.length}</span>
            </div>
            {liveVideos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 opacity-40">
                <Radio size={48} />
                <p className="font-medium">Nenhuma transmissão ao vivo no momento</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-6">
                {liveVideos.map((video) => (
                  <VideoCard key={video.videoId} video={video} onPlay={onPlayVideo} onFullscreen={onFullscreenVideo} viewMode="grid" />
                ))}
              </div>
            )}
          </section>
        ) : activeTab === "popular" ? (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Flame size={18} className="text-primary" />
              <h2 className="text-lg font-black text-foreground uppercase tracking-wider">Populares do canal</h2>
              <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">{popularVideos.length}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-6">
              {popularVideos.map((video) => (
                <VideoCard key={video.videoId} video={video} onPlay={onPlayVideo} onFullscreen={onFullscreenVideo} viewMode="grid" />
              ))}
            </div>
          </section>
        ) : activeTab === "playlists" ? (
          <div className="space-y-12 max-w-7xl mx-auto">
            {playlists.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-40">
                <ListVideo size={48} />
                <p className="font-medium">Nenhuma playlist organizada ainda</p>
              </div>
            ) : (
              playlists.map((playlist, pi) => {
                const PIcon = playlist.icon || ListVideo;
                return (
                <div key={pi} className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                      <PIcon size={18} className="text-primary" />
                      {playlist.title}
                      <span className="text-[10px] font-bold text-muted-foreground bg-secondary/60 px-1.5 py-0.5 rounded-full">
                        {playlist.videos.length}
                      </span>
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-6">
                    {playlist.videos.map((video) => (
                      <button
                        key={video.videoId}
                        onClick={() => onPlayVideo(video)}
                        className="group/item flex flex-col text-left active:scale-[0.98] transition-transform"
                      >
                        <div className="relative aspect-video rounded-2xl overflow-hidden bg-card border border-white/5 shadow-lg">
                          <BlurImage src={hdThumbnail(video.thumbnail)} alt={video.title} className="w-full h-full transition-transform group-hover/item:scale-110 duration-500" />

                          <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover/item:opacity-100 transition-opacity">
                             <div className="flex justify-center"><Play size={20} className="text-white fill-white" /></div>
                          </div>
                          {video.duration && (
                            <span className="absolute bottom-2 right-2 bg-black/70 backdrop-blur-sm text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md border border-white/10 italic">
                              {video.duration}
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-semibold text-foreground line-clamp-2 mt-2 leading-tight group-hover:text-primary transition-colors">{video.title}</p>
                      </button>
                    ))}
                  </div>
                </div>
                );
              })
            )}
          </div>
        ) : (
          <div className="max-w-3xl mx-auto py-4">
            <div className="bg-card/40 border border-border/40 rounded-3xl p-6 sm:p-10 space-y-8 backdrop-blur-sm">
              <div className="flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
                {channelThumbnail ? (
                  <img src={hdThumbnail(channelThumbnail)} alt={channelName} className="w-20 h-20 rounded-2xl object-cover ring-2 ring-primary/20" />
                ) : (
                  <div className="w-20 h-20 rounded-2xl bg-primary/20 flex items-center justify-center text-primary text-2xl font-bold">
                    {channelName.charAt(0)}
                  </div>
                )}
                <div className="flex-1">
                  <h3 className="text-2xl font-black text-foreground mb-1">{channelName}</h3>
                  <p className="text-sm text-muted-foreground flex items-center justify-center sm:justify-start gap-1.5 font-medium">
                    <Info size={16} className="text-primary" />
                    Parceiro Oficial Xerife Switch
                  </p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-background/60 border border-border/20 rounded-2xl p-4 text-center">
                  <p className="text-3xl font-black text-primary leading-none mb-1">{sortedVideos.length}</p>
                  <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Vídeos</p>
                </div>
                <div className="bg-background/60 border border-border/20 rounded-2xl p-4 text-center">
                  <p className="text-3xl font-black text-primary leading-none mb-1">{playlists.length}</p>
                  <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Playlists</p>
                </div>
              </div>

              <div className="space-y-4">
                 <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Descrição</h4>
                 <p className="text-sm text-muted-foreground leading-relaxed">
                   Bem-vindo ao canal oficial de {channelName} no Xerife Switch. Aqui você encontra os melhores conteúdos, produções originais e transmissões de alta qualidade selecionadas especialmente para você. Aproveite a experiência definitiva em streaming.
                 </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </PullToRefresh>
  );
};

export default ChannelProfile;
