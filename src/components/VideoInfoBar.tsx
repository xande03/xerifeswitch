import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  MessageCircle,
  Share2,
  ThumbsUp,
  ThumbsDown,
  Download,
  Clock,
  Settings2,
  Plus,
  Check,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Song } from "@/data/mockSongs";
import { hdThumbnail } from "@/lib/utils";
import VideoComments from "@/components/VideoComments";
import { fetchVideoInfo, type Comment } from "@/lib/youtubeVideoInfo";
import { isInWatchLater, addToWatchLater, removeFromWatchLater } from "./VideoHomeScreen";

function detectPipSupport(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  if ((document as any).pictureInPictureEnabled) return true;
  const v = document.createElement("video");
  if (
    (v as any).webkitSupportsPresentationMode &&
    typeof (v as any).webkitSetPresentationMode === "function"
  )
    return true;
  if ("documentPictureInPicture" in window) return true;
  return false;
}

interface VideoInfoBarProps {
  song: Song;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onTogglePiP: () => void;
  onShare: () => void;
  onDownload?: () => void;
  onClose: () => void;
  isLiked?: boolean;
  onToggleLike?: () => void;
  onAddToPlaylist?: () => void;
}

const VideoInfoBar = ({
  song,
  isFullscreen,
  onToggleFullscreen,
  onTogglePiP,
  onShare,
  onDownload,
  onClose,
  isLiked = false,
  onToggleLike,
  onAddToPlaylist,
}: VideoInfoBarProps) => {
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [titleExpanded, setTitleExpanded] = useState(false);
  const [dislike, setDislike] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [currentQuality, setCurrentQuality] = useState<string>(() => {
    try { return localStorage.getItem("demus_video_quality") || "auto"; } catch { return "auto"; }
  });
  // Actual resolution being rendered by YouTube (may differ from the preference,
  // especially when the preference is "auto").
  const [activeQuality, setActiveQuality] = useState<string>("auto");
  const [qualityLoading, setQualityLoading] = useState(false);
  const [availableQualities, setAvailableQualities] = useState<string[]>([]);
  const qualityRef = useRef<HTMLDivElement | null>(null);
  const QUALITY_OPTIONS: { value: string; label: string }[] = [
    { value: "auto", label: "Automática" },
    { value: "hd2160", label: "2160p (4K)" },
    { value: "hd1440", label: "1440p (2K)" },
    { value: "hd1080", label: "1080p (HD)" },
    { value: "hd720", label: "720p (HD)" },
    { value: "large", label: "480p" },
    { value: "medium", label: "360p" },
    { value: "small", label: "240p" },
    { value: "tiny", label: "144p" },
  ];
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (qualityRef.current && !qualityRef.current.contains(e.target as Node)) {
        setQualityOpen(false);
      }
    };
    if (qualityOpen) {
      document.addEventListener("mousedown", onDocClick);
      // Ask the player hook to publish the currently available quality list.
      try { window.dispatchEvent(new Event("demus:request-quality-available")); } catch {}
    }
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [qualityOpen]);
  // Sync with player events: preference, active resolution, and loading state.
  useEffect(() => {
    const onPref = (e: Event) => {
      const q = (e as CustomEvent<string>).detail;
      if (q) setCurrentQuality(q);
    };
    const onActive = (e: Event) => {
      const q = (e as CustomEvent<string>).detail;
      if (q) setActiveQuality(q);
    };
    const onLoading = (e: Event) => setQualityLoading(!!(e as CustomEvent<boolean>).detail);
    const onAvailable = (e: Event) => {
      const list = (e as CustomEvent<string[]>).detail;
      if (Array.isArray(list)) setAvailableQualities(list);
    };
    window.addEventListener("demus:quality-changed", onPref as EventListener);
    window.addEventListener("demus:quality-active", onActive as EventListener);
    window.addEventListener("demus:quality-loading", onLoading as EventListener);
    window.addEventListener("demus:quality-available", onAvailable as EventListener);
    return () => {
      window.removeEventListener("demus:quality-changed", onPref as EventListener);
      window.removeEventListener("demus:quality-active", onActive as EventListener);
      window.removeEventListener("demus:quality-loading", onLoading as EventListener);
      window.removeEventListener("demus:quality-available", onAvailable as EventListener);
    };
  }, []);
  const applyQuality = (value: string) => {
    if (qualityLoading) return; // guard against spam while reloading
    setCurrentQuality(value);
    setQualityOpen(false);
    try {
      window.dispatchEvent(new CustomEvent("demus:set-quality", { detail: value }));
    } catch {}
    const label = QUALITY_OPTIONS.find((q) => q.value === value)?.label ?? value;
    toast.success(`Qualidade: ${label}`);
  };
  const activeLabel = QUALITY_OPTIONS.find((q) => q.value === activeQuality)?.label
    ?? (activeQuality && activeQuality !== "auto" ? activeQuality : "");
  const prefLabel = QUALITY_OPTIONS.find((q) => q.value === currentQuality)?.label ?? "";
  // Pill label: when auto, show "Auto · <actual>"; otherwise show the fixed choice.
  const pillLabel = qualityLoading
    ? "Carregando…"
    : currentQuality === "auto"
      ? (activeLabel ? `Auto · ${activeLabel}` : "Automática")
      : prefLabel;

  // Video "Assistir mais tarde" = adiciona à lista de watch later
  const videoId = song.youtubeId || song.id.replace(/^yt-/, "");
  const [saved, setSaved] = useState<boolean>(() => isInWatchLater(videoId));
  useEffect(() => { setSaved(isInWatchLater(videoId)); }, [videoId]);
  const toggleSaved = () => {
    if (saved) {
      removeFromWatchLater(videoId);
      setSaved(false);
      toast.success("Removido de Assistir mais tarde");
    } else {
      addToWatchLater({
        videoId,
        title: song.title,
        channel: song.artist,
        thumbnail: song.cover,
        lengthSeconds: song.duration,
        duration: "",
      } as any);
      setSaved(true);
      toast.success("Adicionado a Assistir mais tarde");
    }
  };

  // Drag-to-scroll for the horizontal action pills row (works with mouse + touch)
  const actionsRowRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ active: boolean; startX: number; startScroll: number; moved: boolean; pointerId: number | null }>({
    active: false, startX: 0, startScroll: 0, moved: false, pointerId: null,
  });
  const onActionsPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = actionsRowRef.current;
    if (!el) return;
    dragRef.current = { active: true, startX: e.clientX, startScroll: el.scrollLeft, moved: false, pointerId: e.pointerId };
    try { el.setPointerCapture(e.pointerId); } catch {}
  };
  const onActionsPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    const el = actionsRowRef.current;
    if (!d.active || !el) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 4) d.moved = true;
    el.scrollLeft = d.startScroll - dx;
  };
  const onActionsPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    const el = actionsRowRef.current;
    if (el && d.pointerId != null) { try { el.releasePointerCapture(d.pointerId); } catch {} }
    // If dragging occurred, swallow the click that follows so pills don't fire.
    if (d.moved) {
      const swallow = (ev: MouseEvent) => { ev.stopPropagation(); ev.preventDefault(); window.removeEventListener("click", swallow, true); };
      window.addEventListener("click", swallow, true);
    }
    dragRef.current = { active: false, startX: 0, startScroll: 0, moved: false, pointerId: null };
  };

  // Auto-load comments preview when track changes
  useEffect(() => {
    setComments([]);
    setShowComments(false);
    setTitleExpanded(false);
    if (!song.youtubeId) return;
    let cancelled = false;
    setLoadingComments(true);
    fetchVideoInfo(song.youtubeId)
      .then((info) => {
        if (!cancelled) setComments(info.comments || []);
      })
      .finally(() => {
        if (!cancelled) setLoadingComments(false);
      });
    return () => {
      cancelled = true;
    };
  }, [song.youtubeId]);

  const toggleComments = () => setShowComments((v) => !v);

  const pipSupported = useMemo(() => detectPipSupport(), []);
  const [isPipActive, setIsPipActive] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const update = () => setIsPipActive(!!(document as any).pictureInPictureElement);
    update();
    const onEnter = () => setIsPipActive(true);
    const onLeave = () => setIsPipActive(false);
    document.addEventListener("enterpictureinpicture", onEnter, true);
    document.addEventListener("leavepictureinpicture", onLeave, true);
    const onPresentation = (e: Event) => {
      const v = e.target as any;
      if (v && typeof v.webkitPresentationMode === "string") {
        setIsPipActive(v.webkitPresentationMode === "picture-in-picture");
      }
    };
    document.addEventListener("webkitpresentationmodechanged", onPresentation, true);
    const docPiP = (window as any).documentPictureInPicture;
    let onPipWindow: ((e: any) => void) | null = null;
    if (docPiP) {
      setIsPipActive(!!docPiP.window);
      onPipWindow = (e: any) => {
        setIsPipActive(true);
        e.window?.addEventListener?.("pagehide", () => setIsPipActive(false), { once: true });
      };
      docPiP.addEventListener?.("enter", onPipWindow);
    }
    return () => {
      document.removeEventListener("enterpictureinpicture", onEnter, true);
      document.removeEventListener("leavepictureinpicture", onLeave, true);
      document.removeEventListener("webkitpresentationmodechanged", onPresentation, true);
      if (docPiP && onPipWindow) docPiP.removeEventListener?.("enter", onPipWindow);
    };
  }, []);

  const isIOS = useMemo(
    () =>
      typeof navigator !== "undefined" &&
      /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      !(window as any).MSStream,
    []
  );
  const isAndroid = useMemo(
    () => typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent),
    []
  );

  const handlePip = () => {
    if (!pipSupported) {
      const description = isIOS
        ? "No iOS, o PiP funciona apenas no Safari com vídeo em tela cheia. Toque em Tela cheia e use o ícone do PiP no canto."
        : isAndroid
        ? "No Android, ative o PiP nas configurações do app/navegador (Chrome → Configurações do site → PiP)."
        : "Seu navegador não suporta Picture-in-Picture. Use Chrome, Edge ou Safari atualizado.";
      toast.info("Picture-in-Picture indisponível", { description, duration: 6000 });
      return;
    }
    try {
      onTogglePiP();
    } catch (e) {
      toast.error("Não foi possível abrir o PiP", {
        description: "Tente novamente após iniciar a reprodução do vídeo.",
      });
    }
  };


  if (isFullscreen) return null;

  const firstComment = comments[0];

  return (
    <>
      <div className="mt-3 rounded-2xl bg-transparent overflow-hidden">
        {/* 1) Title */}
        <h1 className="px-1 text-[18px] md:text-[20px] font-bold text-foreground tracking-[-0.01em] leading-snug">
          {song.title}
        </h1>

        {/* 2) Stats + description toggle (YouTube: "N visualizações · há X · ...mais") */}
        <button
          onClick={() => setTitleExpanded((v) => !v)}
          className="mt-2 w-full text-left px-3 py-2 rounded-xl bg-secondary/70 hover:bg-secondary transition-colors"
          aria-expanded={titleExpanded}
        >
          <div className="flex items-center gap-1.5 flex-wrap text-[13px] font-medium text-foreground/85">
            <span>{comments.length > 0 ? `${comments.length.toLocaleString("pt-BR")} interações` : "Vídeo"}</span>
            <span className="text-muted-foreground/60">·</span>
            <span className="text-muted-foreground">enviado recentemente</span>
            <span className="ml-1 text-foreground font-semibold">...{titleExpanded ? "menos" : "mais"}</span>
          </div>
          {titleExpanded && (
            <p className="mt-2 text-[15px] md:text-[16px] text-muted-foreground leading-relaxed">
              {song.title} — canal {song.artist}. Toque em Compartilhar para enviar, ou em Salvar para adicionar a uma playlist.
            </p>
          )}
        </button>

        {/* 3) Channel row: avatar + name + subscribers | Subscribe pill on the right */}
        <div className="mt-3 flex items-center gap-3 px-1">
          <button
            onClick={() => {/* artist profile handled by parent NowPlayingView title */}}
            className="flex items-center gap-3 min-w-0 flex-1 group"
            title={song.artist}
          >
            <img
              src={hdThumbnail(song.cover)}
              alt={song.artist}
              className="w-10 h-10 rounded-full object-cover flex-shrink-0"
              loading="lazy"
            />
            <div className="min-w-0 text-left">
              <div className="text-[14px] font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                {song.artist}
              </div>
              <div className="text-[11.5px] text-muted-foreground truncate">
                @{(song.artist || "").replace(/\s+/g, "").toLowerCase()}
              </div>
            </div>
          </button>

          <button
            className="flex-shrink-0 px-4 py-2 rounded-full bg-foreground text-background text-[13px] font-semibold hover:opacity-90 transition-opacity"
            onClick={() => toast.success("Inscrição salva localmente")}
          >
            Inscrever-se
          </button>
        </div>

        {/* 4) Actions carousel: Like|Dislike group, Compartilhar, Só áudio, Salvar, Download, Denunciar */}
        <div
          ref={actionsRowRef}
          className="mt-3 flex items-center gap-2 overflow-x-auto scrollbar-none px-1 pb-1 cursor-grab active:cursor-grabbing select-none touch-pan-x"
          style={{ WebkitOverflowScrolling: "touch" }}
          onPointerDown={onActionsPointerDown}
          onPointerMove={onActionsPointerMove}
          onPointerUp={onActionsPointerEnd}
          onPointerCancel={onActionsPointerEnd}
        >
          <div className="inline-flex items-center rounded-full bg-secondary flex-shrink-0">
            <button
              onClick={() => onToggleLike?.()}
              className={`flex items-center gap-1.5 pl-3.5 pr-3 py-2 text-[13px] font-medium rounded-l-full transition-colors ${
                isLiked ? "text-primary" : "text-foreground hover:bg-accent"
              }`}
              aria-label={isLiked ? "Remover dos favoritos" : "Gostei"}
              title={isLiked ? "Remover dos favoritos" : "Gostei (adiciona aos favoritos)"}
            >
              <ThumbsUp
                size={16}
                fill={isLiked ? "currentColor" : "none"}
                strokeWidth={isLiked ? 0 : 2}
                key={isLiked ? "liked" : "unliked"}
                className={`transition-transform duration-200 ${
                  isLiked
                    ? "animate-scale-in scale-110"
                    : "animate-[fade-in_0.2s_ease-out] hover:scale-110"
                }`}
                style={!isLiked ? { animation: "scale-out 0.18s ease-out reverse" } : undefined}
              />
              <span>{isLiked ? "Gostei" : "Gostei"}</span>
            </button>
            <span className="w-px h-5 bg-border/70" />
            <button
              onClick={() => setDislike((v) => !v)}
              className={`flex items-center justify-center h-9 w-10 rounded-r-full transition-colors ${
                dislike ? "text-primary" : "text-foreground hover:bg-accent"
              }`}
              aria-label="Não gostei"
            >
              <ThumbsDown size={16} fill={dislike ? "currentColor" : "none"} />
            </button>
          </div>

          <PillAction icon={<Share2 size={16} />} label="Compartilhar" onClick={onShare} />
          <PillAction
            icon={<Clock size={16} fill={saved ? "currentColor" : "none"} />}
            label={saved ? "Salvo em Assistir mais tarde" : "Assistir mais tarde"}
            onClick={toggleSaved}
            active={saved}
          />
          {onAddToPlaylist && (
            <PillAction
              icon={<Plus size={16} />}
              label="Playlist"
              onClick={onAddToPlaylist}
            />
          )}
          <PillAction
            icon={<Download size={16} />}
            label="Download"
            onClick={() => onDownload?.()}
          />
          <div ref={qualityRef} className="relative flex-shrink-0">
            {(() => {
              const isConfirmed = !qualityLoading && (
                (currentQuality !== "auto" && activeQuality === currentQuality) ||
                (currentQuality === "auto" && !!activeQuality && activeQuality !== "unknown")
              );
              return (
                <div className="relative">
                  <PillAction
                    icon={qualityLoading ? <Loader2 size={16} className="animate-spin" /> : <Settings2 size={16} />}
                    label={`Qualidade${pillLabel ? ` · ${pillLabel}` : ""}`}
                    onClick={() => setQualityOpen((v) => !v)}
                    active={qualityOpen || isConfirmed}
                  />
                  {/* Status dot: pulse while loading/pending, solid green ring when confirmed */}
                  <span
                    className={`pointer-events-none absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background transition-all ${
                      qualityLoading
                        ? "bg-yellow-400 animate-pulse"
                        : isConfirmed
                          ? "bg-emerald-500 shadow-[0_0_0_3px_hsl(142_76%_45%/0.35)]"
                          : "bg-muted-foreground/40"
                    }`}
                    aria-hidden
                  />
                </div>
              );
            })()}
            {qualityOpen && (
              <div
                role="menu"
                aria-busy={qualityLoading}
                className="absolute right-0 bottom-full mb-2 z-50 min-w-[240px] rounded-2xl bg-popover border border-border shadow-xl overflow-hidden"
              >
                <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border/60 flex items-center justify-between gap-2">
                  <span>Qualidade do vídeo</span>
                  {qualityLoading && <Loader2 size={12} className="animate-spin text-primary" />}
                </div>

                {/* Native select — the "botão de seleção" the user asked for.
                    Works consistently on iOS/Android/desktop and triggers the OS picker. */}
                <div className="px-3 py-2.5 border-b border-border/60">
                  <label className="block text-[11px] font-semibold text-muted-foreground mb-1.5">
                    Selecionar resolução
                  </label>
                  <select
                    value={currentQuality}
                    disabled={qualityLoading}
                    onChange={(e) => applyQuality(e.target.value)}
                    className="w-full h-9 rounded-lg bg-secondary border border-border px-2.5 text-[13px] font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
                    aria-label="Selecionar qualidade do vídeo"
                  >
                    {QUALITY_OPTIONS.map((opt) => {
                      const isAvailable =
                        opt.value === "auto" ||
                        availableQualities.length === 0 ||
                        availableQualities.includes(opt.value);
                      return (
                        <option key={opt.value} value={opt.value} disabled={!isAvailable}>
                          {opt.label}{!isAvailable ? " — indisponível" : ""}
                        </option>
                      );
                    })}
                  </select>
                  <div className="mt-1.5 text-[11px] text-muted-foreground">
                    {qualityLoading ? "Aplicando…" : activeQuality && activeQuality !== "unknown"
                      ? `Tocando em ${QUALITY_OPTIONS.find(q => q.value === activeQuality)?.label ?? activeQuality}`
                      : "A qualidade real será aplicada ao vídeo."}
                  </div>
                </div>

                {QUALITY_OPTIONS.map((opt) => {
                  const isPref = currentQuality === opt.value;
                  const isActive = activeQuality === opt.value;
                  const isAvailable =
                    opt.value === "auto" ||
                    availableQualities.length === 0 ||
                    availableQualities.includes(opt.value);
                  const isConfirmed = isPref && !qualityLoading && (
                    (opt.value !== "auto" && isActive) ||
                    (opt.value === "auto" && !!activeQuality && activeQuality !== "unknown")
                  );
                  return (
                    <button
                      key={opt.value}
                      role="menuitemradio"
                      aria-checked={isPref}
                      disabled={qualityLoading || !isAvailable}
                      onClick={() => applyQuality(opt.value)}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-[13px] transition-colors ${
                        isConfirmed
                          ? "bg-emerald-500/15 text-emerald-500 font-semibold"
                          : isPref
                            ? "bg-primary/10 text-primary font-semibold"
                            : "text-foreground hover:bg-accent"
                      } ${(qualityLoading || !isAvailable) ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <span className="flex items-center gap-2">
                        {opt.label}
                        {isConfirmed && (
                          <span className="text-[9px] uppercase tracking-wider bg-emerald-500/20 text-emerald-500 px-1.5 py-0.5 rounded-full font-bold">aplicado</span>
                        )}
                        {!isPref && isActive && (
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">agora</span>
                        )}
                        {!isAvailable && (
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">n/d</span>
                        )}
                      </span>
                      {isPref && (
                        isConfirmed
                          ? <Check size={14} className="text-emerald-500" />
                          : qualityLoading
                            ? <Loader2 size={14} className="animate-spin" />
                            : <Check size={14} />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>





        {/* Inline comments accordion — stays in the same page, never as a popup */}
        <button
          onClick={toggleComments}
          className="mt-2 w-full text-left rounded-2xl bg-secondary/70 hover:bg-secondary transition-colors px-4 py-3.5"
          title={showComments ? "Minimizar comentários" : "Expandir comentários"}
          aria-expanded={showComments}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <MessageCircle size={16} className="text-muted-foreground flex-shrink-0" />
              <span className="text-[15px] font-semibold text-foreground">Comentários</span>
              <span className="text-[13px] text-muted-foreground font-medium">
                {comments.length.toLocaleString("pt-BR")}
              </span>
            </div>
            {showComments ? (
              <ChevronUp size={18} className="text-muted-foreground flex-shrink-0" />
            ) : (
              <ChevronDown size={18} className="text-muted-foreground flex-shrink-0" />
            )}
          </div>
          {!showComments && (
            <div className="mt-2">
              {loadingComments && comments.length === 0 ? (
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-muted animate-pulse flex-shrink-0" />
                  <div className="flex-1 h-2.5 bg-muted rounded animate-pulse" />
                </div>
              ) : firstComment ? (
                <div className="flex items-start gap-3">
                  {firstComment.authorThumbnail ? (
                    <img
                      src={firstComment.authorThumbnail}
                      alt={firstComment.author}
                      className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-background flex-shrink-0 flex items-center justify-center text-[11px] text-muted-foreground font-bold">
                      {firstComment.author.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <p className="text-[13.5px] text-foreground/90 line-clamp-2 leading-snug flex-1 min-w-0">
                    {firstComment.content}
                  </p>
                </div>
              ) : (
                <p className="text-[13px] text-muted-foreground">Toque para ver os comentários</p>
              )}
            </div>
          )}
        </button>

        <div
          className={`grid transition-all duration-300 ease-out ${
            showComments ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="overflow-hidden">
            <div className="mt-3 rounded-2xl bg-secondary/45 px-4 py-4">
              <VideoComments comments={comments} loading={loadingComments} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

const PillAction = ({
  icon,
  label,
  onClick,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) => (
  <button
    onClick={onClick}
    title={label}
    aria-label={label}
    className={`flex items-center gap-1.5 flex-shrink-0 px-3.5 py-2 rounded-full text-[13px] font-medium transition-colors ${
      active
        ? "bg-primary/15 text-primary"
        : "bg-secondary text-foreground hover:bg-accent"
    }`}
  >
    {icon}
    <span>{label}</span>
  </button>
);

export default VideoInfoBar;
