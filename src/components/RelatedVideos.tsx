import { useEffect, useRef, useState } from "react";
import { Play, MoreVertical, Loader2, CheckCircle2, Volume2 } from "lucide-react";
import type { VideoResult } from "@/lib/youtubeGeneralSearch";
import { hdThumbnail } from "@/lib/utils";
import BlurImage from "@/components/BlurImage";

interface RelatedVideosProps {
  videos: VideoResult[];
  onPlay: (video: VideoResult) => void;
  loading?: boolean;
  /** Page size for the "Carregar mais" button. Default: 6 */
  pageSize?: number;
  /** Layout variant. "list" = full cards, "rail" = compact right-rail rows, "scroll" = horizontal carousel. */
  variant?: "list" | "rail" | "scroll";
  /** videoId of the item currently playing — highlighted in the list */
  currentVideoId?: string;
  /**
   * Callback opcional para buscar a próxima página de vídeos relacionados.
   * Se fornecido, o componente chama automaticamente ao rolar até o fim,
   * anexando os novos itens ao feed sem exigir gesto do usuário.
   */
  onLoadMore?: () => Promise<VideoResult[]>;
}

const RelatedVideos = ({
  videos,
  onPlay,
  loading,
  pageSize = 6,
  variant = "list",
  currentVideoId,
  onLoadMore,
}: RelatedVideosProps) => {
  const [visible, setVisible] = useState(pageSize);
  const [extras, setExtras] = useState<VideoResult[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const exhaustedRef = useRef(false);

  // Reset pagination whenever the underlying list changes (new track / new fetch)
  useEffect(() => {
    setVisible(pageSize);
    setExtras([]);
    exhaustedRef.current = false;
  }, [videos, pageSize]);

  // Combined feed = props.videos + extras carregados dinamicamente
  const allVideos = extras.length > 0 ? [...videos, ...extras] : videos;

  const fetchMore = async () => {
    if (!onLoadMore || loadingMore || exhaustedRef.current) return;
    setLoadingMore(true);
    try {
      const seen = new Set(allVideos.map((v) => v.videoId));
      const next = await onLoadMore();
      const fresh = (next || []).filter((v) => !seen.has(v.videoId));
      if (fresh.length === 0) {
        exhaustedRef.current = true;
      } else {
        setExtras((prev) => [...prev, ...fresh]);
        setVisible((v) => v + fresh.length);
      }
    } catch {
      // silent — próximo scroll tenta novamente
    } finally {
      setLoadingMore(false);
    }
  };

  const advance = () => {
    if (visible < allVideos.length) {
      setVisible((v) => Math.min(v + pageSize, allVideos.length));
    } else if (onLoadMore) {
      void fetchMore();
    }
  };

  if (loading) {
    return (
      <div className={variant === "rail" ? "space-y-2" : "space-y-4"}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={variant === "rail" ? "flex gap-2 animate-pulse" : "animate-pulse"}>
            <div className={variant === "rail" ? "w-[42%] aspect-video rounded-lg bg-muted flex-shrink-0" : "w-full aspect-video rounded-xl bg-muted mb-2"} />
            <div className={variant === "rail" ? "flex-1 min-w-0 space-y-1.5 py-1" : "flex gap-3"}>
              {variant !== "rail" && <div className="w-9 h-9 rounded-full bg-muted flex-shrink-0" />}
              <div className={variant === "rail" ? "space-y-1.5" : "flex-1 space-y-1.5 py-0.5"}>
                <div className="h-3.5 bg-muted rounded w-full" />
                <div className="h-3.5 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-[13px] text-muted-foreground">
          Buscando vídeos relacionados…
        </p>
        <p className="text-[11px] text-muted-foreground/70 mt-1">
          Toque em outra faixa ou tente novamente em instantes.
        </p>
      </div>
    );
  }

  const shown = allVideos.slice(0, visible);
  // Enquanto onLoadMore existir, o feed é considerado infinito (a menos que
  // uma tentativa recente tenha esgotado a fonte).
  const hasMore = visible < allVideos.length || (!!onLoadMore && !exhaustedRef.current);

  // Horizontal carousel variant (tight mobile contexts)
  if (variant === "scroll") {
    return (
      <div className="-mx-4 px-4 overflow-x-auto scrollbar-none">
        <div className="flex gap-3 pb-1" style={{ scrollSnapType: "x mandatory" }}>
          {videos.map((video) => (
            <button
              key={video.videoId}
              onClick={() => onPlay(video)}
              className="group flex-shrink-0 w-[260px] text-left"
              style={{ scrollSnapAlign: "start" }}
            >
              <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-muted mb-2">
                <BlurImage
                  src={hdThumbnail(video.thumbnail)}
                  alt={video.title}
                  className="w-full h-full object-cover"
                />
                {video.duration && (
                  <span className="absolute bottom-2 right-2 bg-black/80 text-white text-[11px] font-semibold px-1.5 py-0.5 rounded-md">
                    {video.duration}
                  </span>
                )}
              </div>
              <h3 className="text-[13px] font-semibold text-foreground line-clamp-2 leading-snug">
                {video.title}
              </h3>
              <p className="text-[11px] text-muted-foreground mt-1 truncate">
                {video.channel}
                {video.views && <><span className="mx-1 opacity-40">•</span>{video.views}</>}
              </p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (variant === "rail") {
    return (
      <div className="space-y-2">
        {shown.map((video) => {
          const isActive = currentVideoId && video.videoId === currentVideoId;
          return (
            <button
              key={video.videoId}
              onClick={() => onPlay(video)}
              className={`group w-full min-w-0 grid grid-cols-[minmax(108px,42%)_minmax(0,1fr)_24px] gap-2.5 rounded-lg p-1.5 text-left transition-colors ${
                isActive ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-accent/70"
              }`}
              aria-current={isActive ? "true" : undefined}
            >
              <div className="relative aspect-video overflow-hidden rounded-md bg-muted">
                <BlurImage
                  src={hdThumbnail(video.thumbnail)}
                  alt={video.title}
                  className={`w-full h-full object-cover transition-transform duration-300 ${
                    isActive ? "" : "group-hover:scale-105"
                  }`}
                />
                {video.duration && (
                  <span className="absolute bottom-1 right-1 rounded bg-background/90 px-1 py-0.5 text-[10px] font-semibold text-foreground">
                    {video.duration}
                  </span>
                )}
                {isActive && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/55">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
                      <Volume2 size={14} />
                    </span>
                  </div>
                )}
              </div>

              <div className="min-w-0 py-0.5">
                <h3 className={`line-clamp-2 text-[12.5px] font-semibold leading-snug ${isActive ? "text-primary" : "text-foreground"}`}>
                  {video.title}
                </h3>
                <p className="mt-1 line-clamp-1 text-[11px] leading-tight text-muted-foreground">
                  {video.channel || "Xerife Videos"}
                </p>
                <p className="mt-0.5 line-clamp-1 text-[10.5px] leading-tight text-muted-foreground/80">
                  {[video.views, video.publishedTime].filter(Boolean).join(" • ")}
                </p>
              </div>

              <span className="flex h-6 w-6 items-center justify-center self-start rounded-full text-muted-foreground transition-colors group-hover:text-foreground">
                {isActive ? <CheckCircle2 size={15} className="text-primary" /> : <Play size={13} fill="currentColor" />}
              </span>
            </button>
          );
        })}

        {hasMore && (
          <>
            <InfiniteSentinel onVisible={advance} />
            <button
              onClick={advance}
              className="w-full py-2 rounded-full bg-secondary hover:bg-secondary/80 text-foreground text-[12px] font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <Loader2 size={13} className={`opacity-70 ${loadingMore ? "animate-spin" : ""}`} />
              {loadingMore ? "Carregando…" : "Carregar mais"}
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {shown.map((video) => {
        const isActive = currentVideoId && video.videoId === currentVideoId;
        return (
        <div
          key={video.videoId}
          className={`group rounded-xl transition-colors ${
            isActive ? "bg-primary/10 ring-1 ring-primary/40 p-2 -m-2" : ""
          }`}
        >
          {/* Thumbnail — full width, rounded */}
          <div
            className="relative w-full aspect-video rounded-xl overflow-hidden bg-muted cursor-pointer mb-2.5"
            onClick={() => onPlay(video)}
          >
            <BlurImage
              src={hdThumbnail(video.thumbnail)}
              alt={video.title}
              className={`w-full h-full object-cover transition-transform duration-500 ${
                isActive ? "" : "group-hover:scale-105"
              }`}
            />
            {video.duration && (
              <span className="absolute bottom-2 right-2 bg-black/80 text-white text-[11px] font-semibold px-1.5 py-0.5 rounded-md">
                {video.duration}
              </span>
            )}
            {isActive ? (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center pointer-events-none">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold shadow-lg">
                  <Volume2 size={12} />
                  Reproduzindo
                </div>
              </div>
            ) : (
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-primary/90 text-primary-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100 transition-all shadow-xl">
                  <Play size={20} className="ml-0.5" fill="currentColor" />
                </div>
              </div>
            )}
          </div>

          {/* Info row: avatar + title + menu */}
          <div className="flex gap-3 items-start">
            <div className="w-9 h-9 rounded-full bg-secondary flex-shrink-0 flex items-center justify-center overflow-hidden">
              {video.channelThumbnail ? (
                <img src={video.channelThumbnail} alt={video.channel} className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <span className="text-xs font-bold text-muted-foreground">{video.channel?.charAt(0)}</span>
              )}
            </div>
            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onPlay(video)}>
              <h3 className={`text-[13px] font-semibold line-clamp-2 leading-snug ${
                isActive ? "text-primary" : "text-foreground"
              }`}>
                {video.title}
              </h3>
              <p className="text-[11px] text-muted-foreground mt-1 truncate flex items-center gap-1">
                {isActive && <CheckCircle2 size={11} className="text-primary flex-shrink-0" />}
                {video.channel}
                {video.views && <><span className="mx-1 opacity-40">•</span>{video.views}</>}
                {video.publishedTime && <><span className="mx-1 opacity-40">•</span>{video.publishedTime}</>}
              </p>
            </div>
            <button className="p-1 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 mt-0.5">
              <MoreVertical size={16} />
            </button>
          </div>
        </div>
        );
      })}

      {hasMore && (
        <>
          {/* Infinite scroll sentinel — loads more as user scrolls the right rail */}
          <InfiniteSentinel onVisible={advance} />
          <button
            onClick={advance}
            className="w-full py-2.5 rounded-full bg-secondary hover:bg-secondary/80 text-foreground text-[13px] font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            <Loader2 size={14} className={`opacity-70 ${loadingMore ? "animate-spin" : ""}`} />
            {loadingMore ? "Buscando mais vídeos…" : "Carregar mais"}
            {visible < allVideos.length && (
              <span className="text-[11px] text-muted-foreground font-normal">
                ({allVideos.length - visible} restantes)
              </span>
            )}
          </button>
        </>
      )}

      {!hasMore && allVideos.length > pageSize && (
        <p className="text-center text-[11px] text-muted-foreground/70 pt-1">
          Você viu todas as {allVideos.length} recomendações
        </p>
      )}
    </div>
  );
};

/** Auto-triggers `onVisible` when scrolled into view within the nearest scroll container. */
const InfiniteSentinel = ({ onVisible }: { onVisible: () => void }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) onVisible();
        }
      },
      { rootMargin: "300px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [onVisible]);
  return <div ref={ref} aria-hidden className="h-1 w-full" />;
};

export default RelatedVideos;
