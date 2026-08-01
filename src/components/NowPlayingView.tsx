import { ChevronDown, Heart, Volume2, VolumeX, Video, Music2, Mic2, SkipBack, Play, Pause, SkipForward, Shuffle, Repeat, Loader2, ListVideo, MessageSquare, SkipForward as AutoPlayIcon, Maximize2, Minimize2, ListMusic, Download, Plus, Share2, PictureInPicture2, Headphones, RefreshCw, X, Palette, MoreHorizontal, FileText, ChevronUp } from "lucide-react";

import { Song, formatDuration } from "@/data/mockSongs";
import { hdThumbnail } from "@/lib/utils";
import AudioVisualizer from "./AudioVisualizer";
import BlurImage from "@/components/BlurImage";
import RelatedVideos from "./RelatedVideos";
import VideoComments from "./VideoComments";
import VideoInfoBar from "./VideoInfoBar";
import { isInWatchLater, addToWatchLater, removeFromWatchLater } from "./VideoHomeScreen";
import React, { useState, useEffect, useRef, useMemo, useCallback, Fragment } from "react";
import { fetchLyrics, invalidateLyricsCache, type LyricsResult } from "@/lib/lyrics";
import { getLyricsOffset, setLyricsOffset } from "@/lib/lyricsStorage";

import { fetchVideoInfo, isLikelyTruncatedDescription, type VideoInfo } from "@/lib/youtubeVideoInfo";
import type { VideoResult } from "@/lib/youtubeGeneralSearch";
import Logo from "./Logo";
import SeekBar from "@/components/SeekBar";
import { useAmbientTheme, useAmbientEnabled, useOverlayIntensity } from "@/hooks/useAmbientTheme";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { SlidersHorizontal } from "lucide-react";

import MarqueeText from "./MarqueeText";
import ChordsSheet from "./ChordsSheet";
import { fetchChords } from "@/lib/chords";
import { getMemorizedClip, setMemorizedClip, getClipOffset, setClipOffset, subscribeMemorizedClip } from "@/lib/videoClipMemory";
import { getAvailability, probeVideoClip, markUnavailable, findAlternativeClip, type Availability } from "@/lib/videoClipAvailability";
import { broadcastPlayerMode, subscribePlayerMode } from "@/lib/playerModeSync";




export type PlayerMode = "video" | "audio" | "lyrics";

// ── Painel de descrição do episódio de podcast ──
// Aparece dentro de "Tocando agora" quando o contexto é podcast e o vídeo/áudio
// possui uma descrição textual (transcrição, resumo, tópicos, links etc.).
function PodcastDescriptionPanel({
  description,
  loading,
  episodeTitle,
}: {
  description: string;
  loading: boolean;
  episodeTitle: string;
}) {
  // Normaliza espaçamento: colapsa 3+ quebras em 2, remove espaços à direita
  // e conserva quebras/parágrafos originais para manter a formatação do autor.
  const clean = React.useMemo(
    () =>
      (description || "")
        .replace(/\r\n/g, "\n")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        // Remove reticências finais (evita mostrar "..." indicando corte)
        .replace(/[\s]*(?:\.{3,}|…|\u2026)+\s*$/g, "")
        .trim(),
    [description]
  );

  const hasContent = clean.length > 0;

  // Renderiza parágrafos e transforma URLs em links clicáveis, sem quebrar
  // palavras/URLs em locais estranhos no meio da linha.
  const rendered = React.useMemo(() => {
    if (!hasContent) return null;
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const paragraphs = clean.split(/\n{2,}/);
    return paragraphs.map((para, pIdx) => {
      const lines = para.split("\n");
      return (
        <p
          key={pIdx}
          className="text-[13.5px] sm:text-[15px] leading-[1.7] text-foreground/90"
          style={{
            // Quebra apenas em limites naturais de palavra; URLs longas
            // podem quebrar em qualquer ponto para não estourar a caixa.
            wordBreak: "normal",
            overflowWrap: "break-word",
            hyphens: "auto",
          }}
        >
          {lines.map((line, lIdx) => {
            const parts = line.split(urlRegex);
            return (
              <React.Fragment key={lIdx}>
                {parts.map((part, i) => {
                  if (urlRegex.test(part)) {
                    // reset lastIndex porque a regex é global
                    urlRegex.lastIndex = 0;
                    return (
                      <a
                        key={i}
                        href={part}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2 hover:opacity-80 break-all"
                        style={{ color: "hsl(var(--module-accent))" }}
                      >
                        {part}
                      </a>
                    );
                  }
                  return <React.Fragment key={i}>{part}</React.Fragment>;
                })}
                {lIdx < lines.length - 1 && <br />}
              </React.Fragment>
            );
          })}
        </p>
      );
    });
  }, [clean, hasContent]);

  return (
    <section
      aria-label={`Descrição do episódio ${episodeTitle}`}
      className="mt-4 md:mt-6 mx-auto w-full max-w-2xl lg:max-w-3xl px-3 sm:px-5 pb-24 md:pb-10"
    >
      <div className="rounded-2xl border border-border/40 bg-background/50 backdrop-blur-sm p-4 sm:p-6 shadow-sm">
        <header className="flex items-center gap-2 mb-3 sm:mb-4">
          <FileText size={16} className="shrink-0" style={{ color: "hsl(var(--module-accent))" }} />
          <h3 className="text-sm sm:text-base font-semibold text-foreground truncate">
            Sobre este episódio
          </h3>
        </header>

        {loading && !hasContent ? (
          <div className="space-y-2">
            <div className="h-3 rounded bg-muted/60 animate-pulse w-11/12" />
            <div className="h-3 rounded bg-muted/60 animate-pulse w-10/12" />
            <div className="h-3 rounded bg-muted/60 animate-pulse w-8/12" />
            <div className="h-3 rounded bg-muted/60 animate-pulse w-9/12" />
          </div>
        ) : hasContent ? (
          <div className="space-y-3 sm:space-y-4">{rendered}</div>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            Este episódio não possui descrição disponível.
          </p>
        )}
      </div>
    </section>
  );
}

function sanitizeDescription(text?: string): string {
  return (text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[\s]*(?:\.{3,}|…|\u2026)+\s*$/g, "")
    .trim();
}

function getPodcastPanelDescription(fullDescription?: string, fallbackDescription?: string): string {
  const full = sanitizeDescription(fullDescription);
  const fallback = sanitizeDescription(fallbackDescription);

  // Prefere sempre a versão mais longa que não estava truncada originalmente.
  const candidates = [
    { text: full, truncated: isLikelyTruncatedDescription(fullDescription) },
    { text: fallback, truncated: isLikelyTruncatedDescription(fallbackDescription) },
  ].filter((c) => c.text.length > 0);

  const complete = candidates.filter((c) => !c.truncated);
  const pool = complete.length > 0 ? complete : candidates;
  return pool.sort((a, b) => b.text.length - a.text.length)[0]?.text || "";
}





interface NowPlayingViewProps {
  song: Song;
  isPlaying: boolean;
  isEnded?: boolean;
  currentTime: number;
  duration: number;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  onCollapse: () => void;
  onSeek: (fraction: number) => void;
  volume: number;
  onVolumeChange: (vol: number) => void;
  onTogglePiP?: () => void;
  onModeChange?: (mode: PlayerMode) => void;
  isShuffled?: boolean;
  onShuffle?: () => void;
  onAirPlay?: (mode: 'audio' | 'video') => void;
  onCast?: () => void;
  onPlayRelated?: (video: VideoResult) => void;
  onFullscreen?: () => void;
  onExitFullscreen?: () => void;
  isFullscreen?: boolean;
  context?: "music" | "video" | "podcast";
  onShowQueue?: () => void;
  queueCount?: number;
  onShare?: () => void;
  onDownload?: () => void;
  isLiked?: boolean;
  onLike?: () => void;
  onArtistClick?: (artist: { name: string; image: string }) => void;
  onOpenChannel?: (channel: { name: string; thumbnail?: string }) => void;
  onAddToPlaylist?: (song: Song) => void;
  initialMode?: PlayerMode;
  /** Xerife Music: troca o clipe do modo Vídeo preservando o tempo de reprodução. */
  onSwapClipAt?: (video: VideoResult, startSeconds: number) => void;
  /** Aquecer cache do YouTube para o clipe oficial (pré-load). */
  onPreloadClip?: (videoId: string) => void;
  /** videoId atualmente carregado no player (para saber se já estamos no clipe). */
  activeVideoId?: string | null;
  onNavigateToLibrary?: () => void;
}

type ToolItem = { icon: any; label: string; onClick: () => void; active?: boolean };

const ToolsMenu = ({
  className = "",
  items,
  open,
  onOpenChange,
}: {
  className?: string;
  items: ToolItem[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) => (
  <Popover open={open} onOpenChange={onOpenChange}>
    <PopoverTrigger asChild>
      <button
        type="button"
        title="Ferramentas"
        aria-label="Ferramentas da faixa"
        className={`w-10 h-10 flex items-center justify-center rounded-full bg-secondary/70 backdrop-blur text-foreground/90 hover:bg-primary hover:text-primary-foreground transition-all active:scale-95 shadow-lg ${className}`}
      >
        <MoreHorizontal size={20} />
      </button>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-60 p-1.5 z-[80] rounded-2xl">
      <div className="flex flex-col">
        {items.map((item, i) => (
          <button
            key={item.label}
            type="button"
            onClick={() => {
              onOpenChange(false);
              item.onClick();
            }}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left transition-colors ${
              item.active ? "bg-primary/15 text-primary" : "hover:bg-accent text-foreground"
            }`}
          >
            <item.icon size={17} aria-hidden />
            <span className="truncate">{item.label}</span>
          </button>
        ))}
      </div>
    </PopoverContent>
  </Popover>
);

const NowPlayingView = ({
  song, isPlaying, isEnded, currentTime, duration,
  onTogglePlay, onNext, onPrev,
  onCollapse, onSeek, volume, onVolumeChange, onTogglePiP, onModeChange, onAirPlay, onCast, onPlayRelated, onFullscreen, onExitFullscreen, isFullscreen,
  isShuffled, onShuffle,
  context = "music",
  onShowQueue, queueCount = 0,
  onShare, onDownload,
  isLiked, onLike,
  onArtistClick,
  onOpenChannel,
  onAddToPlaylist,
  initialMode,
  onSwapClipAt,
  onPreloadClip,
  activeVideoId,
  onNavigateToLibrary,
}: NowPlayingViewProps) => {
  const [mode, setMode] = useState<PlayerMode>(
    initialMode ?? (context === "video" ? "video" : "audio")
  );
  const [visualizerMode, setVisualizerMode] = useState<any>("bars");

  // Xerife Music: sempre iniciar no modo "áudio" ao trocar de faixa,
  // ignorando o modo previamente selecionado (ex.: vídeo).
  // Exceção: quando a troca de song.id é consequência de um clip swap
  // disparado por nós (entrar em modo Vídeo), NÃO resetamos para áudio —
  // caso contrário o primeiro clique em "Vídeo" cai de volta pra áudio.
  const suppressAudioResetRef = useRef(false);
  useEffect(() => {
    if (context === "music") {
      if (suppressAudioResetRef.current) {
        suppressAudioResetRef.current = false;
        return;
      }
      setMode("audio");
      onModeChange?.("audio");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.id, context]);

  // Xerife Music: só liberar o toggle "Vídeo" depois que o usuário
  // apertar play (no modo áudio) pelo menos uma vez para esta faixa.
  const [hasPlayedOnce, setHasPlayedOnce] = useState(false);
  useEffect(() => {
    // Não zera a permissão quando a troca de faixa é um clip swap interno,
    // senão o botão Vídeo pisca desabilitado no meio da transição.
    if (suppressAudioResetRef.current) return;
    setHasPlayedOnce(false);
  }, [song.id]);
  useEffect(() => { if (isPlaying) setHasPlayedOnce(true); }, [isPlaying]);


  const [autoplay, setAutoplay] = useState(() => localStorage.getItem('demus-autoplay') !== 'false');
  const [lyricsResult, setLyricsResult] = useState<LyricsResult | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsChecked, setLyricsChecked] = useState(false);
  const [lyricsOffset, setLyricsOffsetState] = useState<number>(() => getLyricsOffset(song.id));
  const [chordsOpen, setChordsOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState<string | null>(null);

  // Prefetch de cifra em background quando a música muda: garante que ao abrir
  // o painel a cifra apareça instantaneamente (cache mem + localStorage).
  useEffect(() => {
    if (!song?.artist || !song?.title) return;
    const t = window.setTimeout(() => {
      fetchChords(song.artist, song.title).catch(() => {});
    }, 800);
    return () => window.clearTimeout(t);
  }, [song?.artist, song?.title]);

  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [videoInfoLoading, setVideoInfoLoading] = useState(false);
  const [bottomTab, setBottomTab] = useState<"related" | "comments">("related");
  const podcastPanelDescription = useMemo(
    () => getPodcastPanelDescription(videoInfo?.description, song.description),
    [videoInfo?.description, song.description]
  );

  const [showFsControls, setShowFsControls] = useState(true);
  const fsControlsTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLParagraphElement>(null);
  // Cache lyrics per song.id to keep sync context when switching tracks quickly
  const lyricsCacheRef = useRef<Map<string, LyricsResult | null>>(new Map());
  const lyricsFetchIdRef = useRef(0);
  const prevActiveLineRef = useRef<number>(-1);
  const prevSongIdRef = useRef<string>(song.id);

  const progress = duration > 0 ? currentTime / duration : 0;

  // Fundo dinâmico opcional baseado na capa do álbum (cache por URL no localStorage)
  const [dynamicBgEnabled, setDynamicBgEnabled] = useAmbientEnabled();
  const [overlayIntensity, setOverlayIntensityValue] = useOverlayIntensity();

  const ambient = useAmbientTheme(song.cover);
  const ambientBg = ambient.gradient;




  // Auto-hide fullscreen controls after 3s
  const resetFsControlsTimer = useCallback(() => {
    setShowFsControls(true);
    if (fsControlsTimerRef.current) clearTimeout(fsControlsTimerRef.current);
    fsControlsTimerRef.current = setTimeout(() => setShowFsControls(false), 3000);
  }, []);

  useEffect(() => {
    if (isFullscreen) {
      resetFsControlsTimer();
    } else {
      setShowFsControls(true);
      if (fsControlsTimerRef.current) clearTimeout(fsControlsTimerRef.current);
    }
    return () => { if (fsControlsTimerRef.current) clearTimeout(fsControlsTimerRef.current); };
  }, [isFullscreen, resetFsControlsTimer]);

  const loadLyrics = useCallback((skipCache = false) => {
    const songId = song.id;
    // Serve from local per-song cache when available
    if (!skipCache && lyricsCacheRef.current.has(songId)) {
      setLyricsResult(lyricsCacheRef.current.get(songId) ?? null);
      setLyricsLoading(false);
      return;
    }
    const fetchId = ++lyricsFetchIdRef.current;
    setLyricsLoading(true);
    if (skipCache) invalidateLyricsCache(song.artist, song.title, song.album);
    fetchLyrics(song.artist, song.title, {
      album: song.album,
      duration: song.duration,
      skipCache,
    }).then((result) => {
      // Discard stale responses from previous songs / rapid switches
      if (fetchId !== lyricsFetchIdRef.current) return;
      lyricsCacheRef.current.set(songId, result);
      setLyricsResult(result);
      setLyricsLoading(false);
      setLyricsChecked(true);
    }).catch(() => {
      if (fetchId !== lyricsFetchIdRef.current) return;
      lyricsCacheRef.current.set(songId, null);
      setLyricsResult(null);
      setLyricsLoading(false);
      setLyricsChecked(true);
    });
  }, [song.id, song.artist, song.title, song.album, song.duration]);

  useEffect(() => {
    if (mode !== "lyrics") return;
    const cached = lyricsCacheRef.current.get(song.id);
    if (cached) {
      setLyricsResult(cached);
      setLyricsLoading(false);
      return;
    }
    loadLyrics(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, song.id]);

  // Reset lyrics and fetch video info when song changes.
  // Also warm the lyrics cache in the background so, when the user
  // opens the "Letra" tab, it is already there — no visible loading.
  useEffect(() => {
    // Preserve cached lyrics on rapid track switches: seed from cache if present
    const cached = lyricsCacheRef.current.get(song.id);
    setLyricsResult(cached ?? null);
    // If we've probed this song before, keep the availability flag; otherwise reset.
    setLyricsChecked(lyricsCacheRef.current.has(song.id));
    prevActiveLineRef.current = -1;
    prevSongIdRef.current = song.id;
    setVideoInfo(null);

    // Kick off a background fetch as soon as the track changes, unless
    // we already have a cached result. Small delay so it doesn't race
    // with critical playback boot work.
    let prefetchTimer: ReturnType<typeof setTimeout> | null = null;
    if (!lyricsCacheRef.current.has(song.id)) {
      prefetchTimer = setTimeout(() => loadLyrics(false), 150);
    }

    let cancelled = false;
    if (song.youtubeId) {
      setVideoInfoLoading(true);
      (async () => {
        const info = await fetchVideoInfo(song.youtubeId, { requireDescription: context === "podcast" });
        if (cancelled) return;
        // Fallback: if no related videos, search by artist + title to populate Recomendados
        if (!info.relatedVideos || info.relatedVideos.length === 0) {
          try {
            const { searchYouTubeGeneral } = await import("@/lib/youtubeGeneralSearch");
            const query = `${song.artist || ""} ${song.title || ""}`.trim();
            const fallback = await searchYouTubeGeneral(query);
            if (cancelled) return;
            const filtered = (fallback || []).filter((v) => v.videoId !== song.youtubeId).slice(0, 20);
            setVideoInfo({ ...info, relatedVideos: filtered });
          } catch {
            setVideoInfo(info);
          }
        } else {
          setVideoInfo(info);
        }
        setVideoInfoLoading(false);
      })();
    }
    return () => {
      cancelled = true;
      if (prefetchTimer) clearTimeout(prefetchTimer);
    };
  }, [song.id, context]);

  // Paginação infinita dos "Próximos vídeos" — busca mais recomendados sob
  // demanda (mesmo artista + queries variadas) para o usuário continuar
  // rolando sem precisar de swipe/refresh.
  const relatedPageRef = useRef(0);
  useEffect(() => { relatedPageRef.current = 0; }, [song.youtubeId]);
  const loadMoreRelated = useCallback(async () => {
    try {
      const { searchYouTubeGeneral } = await import("@/lib/youtubeGeneralSearch");
      const artist = (song.artist || "").trim();
      const title = (song.title || "").trim();
      const rotator = [
        `${artist} ${title}`,
        `${artist} ao vivo`,
        `${artist} novo`,
        `${artist} clipe oficial`,
        `${artist} playlist`,
        `${title} cover`,
      ].filter((q) => q.trim().length > 0);
      const idx = relatedPageRef.current++ % Math.max(1, rotator.length);
      const q = rotator[idx] || artist || title;
      const results = await searchYouTubeGeneral(q);
      return (results || []).filter((v) => v.videoId !== song.youtubeId);
    } catch {
      return [];
    }
  }, [song.youtubeId, song.artist, song.title]);

  // Ao trocar de música: recupera offset salvo para a nova faixa
  useEffect(() => {
    setLyricsOffsetState(getLyricsOffset(song.id));
  }, [song.id]);

  const adjustOffset = useCallback((delta: number) => {
    setLyricsOffsetState((prev) => {
      const next = Math.max(-15, Math.min(15, Math.round((prev + delta) * 10) / 10));
      setLyricsOffset(song.id, next);
      return next;
    });
  }, [song.id]);

  const resetOffset = useCallback(() => {
    setLyricsOffsetState(0);
    setLyricsOffset(song.id, 0);
  }, [song.id]);

  // Sync virtual: quando só temos letra plain mas conhecemos a duração,
  // distribuímos as linhas uniformemente entre um lead-in (~10% da duração,
  // mín 4s / máx 12s) e o final (menos ~5s de outro). Assim exibimos letras
  // "sincronizadas" mesmo sem timestamps oficiais.
  const virtualSyncTimes = useMemo(() => {
    if (!lyricsResult || lyricsResult.synced) return null;
    if (!duration || duration < 20) return null;
    const n = lyricsResult.lines.length;
    if (n === 0) return null;
    const leadIn = Math.min(12, Math.max(4, duration * 0.1));
    const tail = Math.min(6, Math.max(3, duration * 0.05));
    const span = Math.max(1, duration - leadIn - tail);
    return Array.from({ length: n }, (_, i) => leadIn + (span * i) / Math.max(1, n - 1));
  }, [lyricsResult, duration]);

  const [syncDisabled, setSyncDisabled] = useState(false);
  // Ao trocar de música, re-habilita sync automaticamente
  useEffect(() => { setSyncDisabled(false); }, [song.id]);
  const isEffectivelySynced = !syncDisabled && !!lyricsResult && (lyricsResult.synced || !!virtualSyncTimes);

  // Smoothed time: interpola entre updates do player (que chegam ~a cada 250ms)
  // usando requestAnimationFrame para reforçar a sincronia da letra.
  const [smoothTime, setSmoothTime] = useState(currentTime);
  const smoothBaseRef = useRef({ base: currentTime, at: performance.now() });
  useEffect(() => {
    smoothBaseRef.current = { base: currentTime, at: performance.now() };
    setSmoothTime(currentTime);
  }, [currentTime, song.id]);
  useEffect(() => {
    if (!isPlaying || mode !== "lyrics") return;
    let raf = 0;
    const tick = () => {
      const { base, at } = smoothBaseRef.current;
      setSmoothTime(base + (performance.now() - at) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, mode, song.id]);

  // Find active line index (binary search) — usa timestamps reais ou virtuais.
  const activeLineIndex = useMemo(() => {
    if (!lyricsResult) return -1;
    const lines = lyricsResult.lines;
    if (lines.length === 0) return -1;
    const t = smoothTime + 0.15 + lyricsOffset;
    const times = lyricsResult.synced
      ? lines.map((l) => l.time)
      : virtualSyncTimes;
    if (!times) return -1;
    let lo = 0, hi = times.length - 1, idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= t) { idx = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    return idx;
  }, [lyricsResult, smoothTime, lyricsOffset, virtualSyncTimes]);



  // Auto-scroll to active line: instant on big jumps (seek/track change), smooth on normal advance
  useEffect(() => {
    if (!activeLineRef.current || !lyricsContainerRef.current) return;
    const container = lyricsContainerRef.current;
    const activeLine = activeLineRef.current;
    const targetTop = activeLine.offsetTop - (container.clientHeight / 2) + (activeLine.clientHeight / 2);
    const prev = prevActiveLineRef.current;
    const bigJump = prev < 0 || Math.abs(activeLineIndex - prev) > 3;
    container.scrollTo({
      top: Math.max(0, targetTop),
      behavior: bigJump ? 'auto' : 'smooth',
    });
    prevActiveLineRef.current = activeLineIndex;
  }, [activeLineIndex]);



  // Autoplay: when video ends, play first related video
  useEffect(() => {
    if (isEnded && autoplay && videoInfo && videoInfo.relatedVideos.length > 0 && onPlayRelated) {
      onPlayRelated(videoInfo.relatedVideos[0]);
    }
  }, [isEnded, autoplay]);

  // Xerife Music — offset (ms) do clipe atual: quantos milissegundos de intro
  // existem no vídeo antes do vocal/música começar. Persistido por song.id.
  const [clipOffsetMs, setClipOffsetMsState] = useState<number>(() => getClipOffset(song.id));
  useEffect(() => { setClipOffsetMsState(getClipOffset(song.id)); }, [song.id]);
  const adjustClipOffset = useCallback((deltaMs: number) => {
    const next = clipOffsetMs + deltaMs;
    setClipOffsetMsState(next);
    setClipOffset(song.id, next);
    // Reajusta o clipe imediatamente se estamos no modo vídeo com clipe swapped
    const memorized = getMemorizedClip(song.id);
    if (mode === "video" && memorized && activeVideoId === memorized && onSwapClipAt) {
      onSwapClipAt(
        { videoId: memorized, title: song.title, channel: song.artist, thumbnail: song.cover } as VideoResult,
        Math.max(0, currentTime + next / 1000),
      );
    }
  }, [clipOffsetMs, song.id, song.title, song.artist, song.cover, mode, activeVideoId, currentTime, onSwapClipAt]);
  const resetClipOffset = useCallback(() => {
    setClipOffsetMsState(0);
    setClipOffset(song.id, 0);
  }, [song.id]);

  // Swap resumível: usar loadVideoAt via Index (onSwapClipAt) em vez de
  // handleSelect que reinicia a reprodução do zero.
  const performClipSwap = useCallback((video: VideoResult) => {
    const offsetS = (getClipOffset(song.id) || 0) / 1000;
    const startAt = Math.max(0, (currentTime || 0) + offsetS);
    // Persiste imediatamente no localStorage — garante que o mesmo clipe
    // reapareça em qualquer sessão/refresh (mobile e desktop).
    if (video?.videoId) setMemorizedClip(song.id, video.videoId);
    // Marca que a próxima troca de song.id vem do nosso swap interno, para
    // que o effect de reset de modo NÃO derrube o usuário de volta ao áudio.
    suppressAudioResetRef.current = true;
    if (onSwapClipAt) onSwapClipAt(video, startAt);
    else if (onPlayRelated) onPlayRelated(video);
  }, [song.id, currentTime, onSwapClipAt, onPlayRelated]);

  // Xerife Music — recarregar videoclipe (procura correspondente rápido).
  // 1 clique → próximo candidato do ranking em cache (<200ms).
  // 2 cliques em ≤2s → força busca fresca (bypass de cache).
  const [reloadingClip, setReloadingClip] = useState(false);
  const [triedClipIds, setTriedClipIds] = useState<string[]>([]);
  const lastReloadClickRef = useRef(0);
  useEffect(() => { setTriedClipIds([]); }, [song.id]);
  const reloadVideoClip = useCallback(async () => {
    if (reloadingClip) return;
    const now = Date.now();
    const isDoubleTap = now - lastReloadClickRef.current <= 2000;
    lastReloadClickRef.current = now;
    setReloadingClip(true);
    try {
      const exclude = Array.from(new Set([
        ...triedClipIds,
        activeVideoId || "",
        getMemorizedClip(song.id) || "",
      ].filter(Boolean)));
      const result = await findAlternativeClip(song, exclude, { fresh: isDoubleTap });
      if (result.status === "available" && result.videoId) {
        setTriedClipIds((prev) => Array.from(new Set([...prev, result.videoId!])));
        performClipSwap({
          videoId: result.videoId,
          title: song.title,
          channel: song.artist,
          thumbnail: song.cover,
        } as VideoResult);
      }
    } finally {
      setReloadingClip(false);
    }
  }, [reloadingClip, triedClipIds, activeVideoId, song, performClipSwap]);

  // Xerife Music — permite que o overlay do player (renderizado por Index.tsx
  // por cima do iframe do YouTube) dispare a recarga do clipe. Sem isto o
  // botão dentro do #music-video-anchor fica coberto pelo iframe (z-60).
  useEffect(() => {
    if (mode !== "video" || context !== "music") return;
    const handler = () => { reloadVideoClip(); };
    window.addEventListener("xerife:reload-video-clip", handler);
    return () => window.removeEventListener("xerife:reload-video-clip", handler);
  }, [mode, context, reloadVideoClip]);

  // Dica única ao entrar pela primeira vez no modo Vídeo do Xerife Music,
  // ensinando o botão de recarregar. Some após 6s ou ao ser fechada.
  const [showReloadHint, setShowReloadHint] = useState(false);
  useEffect(() => {
    if (mode !== "video" || context !== "music") { setShowReloadHint(false); return; }
    try {
      if (localStorage.getItem("xerife:music-video-reload-hint-seen") === "1") return;
    } catch {}
    setShowReloadHint(true);
    const t = setTimeout(() => {
      setShowReloadHint(false);
      try { localStorage.setItem("xerife:music-video-reload-hint-seen", "1"); } catch {}
    }, 6000);
    return () => clearTimeout(t);
  }, [mode, context, song.id]);
  const dismissReloadHint = useCallback(() => {
    setShowReloadHint(false);
    try { localStorage.setItem("xerife:music-video-reload-hint-seen", "1"); } catch {}
  }, []);

  // Autoplay: when video ends, play first related video
  useEffect(() => {
    if (isEnded && autoplay && videoInfo && videoInfo.relatedVideos.length > 0 && onPlayRelated) {
      onPlayRelated(videoInfo.relatedVideos[0]);
    }
  }, [isEnded, autoplay]);

  // Xerife Music — disponibilidade do videoclipe oficial (padrão YT Music):
  // sonda em background ao trocar de faixa; se não houver clipe confiável,
  // esconde o botão "Vídeo" (evita tela preta / travamentos).
  const [clipAvailability, setClipAvailability] = useState<Availability>(() =>
    context === "music" ? getAvailability(song.id) : { status: "available" }
  );
  useEffect(() => {
    if (context !== "music") { setClipAvailability({ status: "available" }); return; }
    let cancelled = false;
    const initial = getAvailability(song.id);
    setClipAvailability(initial);
    if (initial.status === "unknown") {
      probeVideoClip(song).then((r) => { if (!cancelled) setClipAvailability(r); });
    }
    // Cross-tab / cross-window: se a memória do clipe mudar em outra aba,
    // reflete aqui imediatamente (localStorage é a fonte da verdade).
    const unsub = subscribeMemorizedClip((changedId) => {
      if (changedId && changedId !== song.id) return;
      const fresh = getAvailability(song.id);
      if (!cancelled) setClipAvailability(fresh);
    });
    return () => { cancelled = true; unsub(); };
  }, [song.id, song.title, song.artist, context]);

  // Pré-carregamento silencioso do clipe oficial ao trocar de música,
  // para que a primeira frame no modo Vídeo apareça <200ms.
  useEffect(() => {
    if (context !== "music") return;
    const memorized = clipAvailability.status === "available" ? clipAvailability.videoId : null;
    if (memorized && memorized !== song.youtubeId && memorized !== activeVideoId) {
      onPreloadClip?.(memorized);
    }
  }, [song.id, song.youtubeId, activeVideoId, context, onPreloadClip, clipAvailability]);

  const handleModeChange = (newMode: PlayerMode) => {
    setMode(newMode);
    onModeChange?.(newMode);
    // Sincroniza a mudança de modo com outras abas/janelas do mesmo device.
    try { broadcastPlayerMode(newMode, song.id); } catch {}
    if (newMode === "lyrics" && !lyricsResult && !lyricsLoading) {
      loadLyrics(false);
    }
    // Ao entrar em modo vídeo (Music/Podcast), aplica o clipe REAL memorizado
    // ou disparado pela sonda. NÃO forçamos song.youtubeId — esse ID em geral
    // aponta para áudio-com-capa (canais Topic), o que degrada a UX. Se não
    // houver clipe real, o próprio botão de Vídeo já estará oculto pela
    // `clipAvailability`.
    if (newMode === "video" && (context === "music" || context === "podcast")) {
      (async () => {
        try {
          const memorized = getMemorizedClip(song.id);
          if (memorized && memorized !== activeVideoId) {
            performClipSwap({
              videoId: memorized,
              title: song.title,
              channel: song.artist,
              thumbnail: song.cover,
            } as VideoResult);
            return;
          }
          const result = await probeVideoClip(song);
          setClipAvailability(result);
          if (result.status === "available" && result.videoId
              && activeVideoId !== result.videoId) {
            performClipSwap({
              videoId: result.videoId,
              title: song.title,
              channel: song.artist,
              thumbnail: song.cover,
            } as VideoResult);
          } else if (result.status === "unavailable") {
            // Sem clipe real — volta para áudio silenciosamente. O botão
            // "Vídeo" já foi ocultado pela sonda.
            setMode("audio");
            onModeChange?.("audio");
          }
        } catch {
          // Erro transitório: mantém áudio (sem forçar capa/tema).
        }
      })();
    }
  };

  // Cross-tab: aplica o modo recebido de outra aba/janela quando refere-se à
  // mesma faixa. Garante que ao alternar Áudio/Vídeo/Letra num device, todas
  // as abas do mesmo device reflitam imediatamente.
  useEffect(() => {
    const unsub = subscribePlayerMode((remoteMode, remoteSongId) => {
      if (remoteSongId && remoteSongId !== song.id) return;
      setMode((cur) => (cur === remoteMode ? cur : remoteMode));
    });
    return unsub;
  }, [song.id]);






  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
  };

  const handleProgressTouch = (e: React.TouchEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const touch = e.touches[0];
    onSeek(Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width)));
  };

  const containerRef = useRef<HTMLDivElement>(null);

  const isVideoMode = mode === "video";
  // Podcast agora usa exatamente o mesmo esqueleto/proporções do player de vídeo
  // (rail à direita no desktop, full-bleed 16:9 no mobile). Mantemos apenas a
  // exibição dos controles/info específicos de podcast (feita via `context === "podcast"`).
  const isPodcastVideo = false;
  // Rail (YouTube-like split) só no contexto "Xerife Vídeos". No Xerife Music
  // o modo vídeo é exclusivo da faixa atual: player centralizado na posição
  // da capa, em 16:9, sem sair do painel de "Tocando agora".
  const isRailVideoMode = isVideoMode && context === "video";
  // Music AND Podcast use the anchor-overlay layout: the video replaces the
  // cover art in the exact same position/proportion (16:9), without the rail
  // split used by Xerife Vídeos.
  const isMusicVideoMode = isVideoMode && (context === "music" || context === "podcast");
  // Letra só aparece quando existe (assume "existe" enquanto não terminamos a verificação).
  const hasLyrics = !lyricsChecked || (!!lyricsResult && lyricsResult.lines.length > 0);
  // Vídeo clipe disponível quando temos um youtubeId associado à faixa.
  // Padrão YouTube Music: só mostra o toggle "Vídeo" quando há clipe vinculado.
  // - context !== "music": preserva o botão (Podcast usa o próprio youtubeId).
  // - "unknown"/"available": mostra (evita flicker durante sondagem).
  // - "unavailable": esconde (nenhuma correspondência confiável foi encontrada).
  const hasVideoClip = context !== "music"
    ? !!song.youtubeId
    : (!!song.youtubeId && clipAvailability.status !== "unavailable");


  const ambientActive = !isVideoMode && !!ambientBg;

  const toolItems = [
    onAddToPlaylist ? { icon: Plus, label: "Adicionar à playlist", onClick: () => onAddToPlaylist(song) } : null,
    { icon: Music2, label: "Ver cifra", onClick: () => setChordsOpen(true), active: chordsOpen },

    
    context === "music"
      ? {
          icon: Palette,
          label: dynamicBgEnabled ? "Desativar fundo dinâmico" : "Fundo dinâmico (paleta)",
          onClick: () => setDynamicBgEnabled(!dynamicBgEnabled),
          active: dynamicBgEnabled,
        }
      : null,
  ].filter(Boolean) as { icon: any; label: string; onClick: () => void; active?: boolean }[];

  const toolsMenuNode = (className = "", id = "desktop") => (
    <ToolsMenu
      className={className}
      items={toolItems}
      open={toolsOpen === id}
      onOpenChange={(v) => setToolsOpen(v ? id : null)}
    />
  );



  return (

    <div
      ref={containerRef}
      id="now-playing-shell"
      data-context={context}
      data-video-mode={isVideoMode ? "true" : "false"}
      className={`fixed inset-0 z-50 flex flex-col animate-slide-up bg-background ${isFullscreen ? 'z-[9999]' : ''} ${context === "video" ? 'xerife-video-context' : ''}`}
      style={{
        paddingTop: isFullscreen ? '0' : 'env(safe-area-inset-top)',
        paddingBottom: isFullscreen ? '0' : 'env(safe-area-inset-bottom)',
        backgroundColor: ambientActive ? ambient.solid : 'hsl(var(--background))',
        transition: 'background-color 1.2s ease-in-out',
        // Locally override design tokens so text/icons contrast against the matte background
        ...(ambientActive
          ? ({
              ['--foreground' as any]: ambient.foregroundHsl,
              ['--muted-foreground' as any]: ambient.mutedForegroundHsl,
              color: ambient.foreground,
            } as React.CSSProperties)
          : {}),
      }}
    >
      {/* Fundo dinâmico — camadas com crossfade suave ao trocar de faixa */}
      {ambientActive && (
        <>
          {/* 1) Capa em baixa resolução com blur pesado (GPU) */}
          {ambient.blurSrc && (
            <div
              key={`blur-${ambient.blurSrc}`}
              aria-hidden
              className="pointer-events-none absolute inset-0 z-0 motion-safe:animate-fade-in"
              style={{
                backgroundImage: `url(${ambient.blurSrc})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                filter: "blur(72px) saturate(1.25)",
                transform: "scale(1.35) translateZ(0)",
                willChange: "opacity, transform",
                // Cores já em cache → crossfade curto; extração nova → mais suave
                animationDuration: ambient.fromCache ? "220ms" : "800ms",
              }}
            />
          )}
          {/* 2) Mesh gradient derivado das cores dominantes */}
          <div
            key={`mesh-${ambientBg}`}
            aria-hidden
            className="pointer-events-none absolute inset-0 z-0 motion-safe:animate-fade-in"
            style={{
              backgroundImage: ambientBg,
              opacity: 0.85,
              transform: "translateZ(0)",
              willChange: "opacity",
              animationDuration: ambient.fromCache ? "260ms" : "900ms",
            }}
          />

          {/* 3) Overlay para contraste/legibilidade — intensidade ajustável e adaptada ao tema */}
          {ambient.overlay && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-0"
              style={{ backgroundImage: ambient.overlay, transition: "background-image 300ms ease-out" }}
            />
          )}

        </>
      )}

      <div className="relative z-10 flex-1 flex flex-col min-h-0">


      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto now-playing-scroll">
        {/* Desktop Header */}
        <div className="hidden md:flex items-center justify-between px-6 lg:px-12 py-4 lg:py-6 z-30">
          <button onClick={onCollapse} title="Voltar para Xerife Vídeos" className="p-2 rounded-full bg-secondary/80 hover:bg-primary transition-all text-foreground hover:text-primary-foreground shadow-lg">
            <ChevronDown size={28} />
          </button>
          <button onClick={onCollapse} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <Logo size={36} />
            <span className="font-display font-black text-lg lg:text-xl italic tracking-tighter">XERIFE <span className="text-primary">SWITCH</span></span>
          </button>
          <div className="w-12 h-12 flex items-center justify-end">
            {!isRailVideoMode && toolsMenuNode()}
          </div>

        </div>

        {/* Main Layout */}
        <div>
          <div className={`${isPodcastVideo ? "flex flex-col h-full w-full max-w-[900px] mx-auto lg:px-8 lg:pb-8" : isRailVideoMode ? "md:flex md:flex-row md:gap-4 md:items-start md:px-4 w-full" : "flex flex-col lg:flex-row h-full lg:gap-16 w-full max-w-[1600px] mx-auto lg:px-12 lg:pb-12"}`}>


            {/* Mobile top bar — collapse on the left, room for notch */}
            {!isRailVideoMode && (
              <div className="lg:hidden flex items-center justify-between px-4 pt-3 pb-1 relative z-[70]">
                <button onClick={onCollapse} className="p-2 -ml-1 rounded-full bg-background/70 backdrop-blur text-foreground/90 hover:text-foreground active:scale-95 transition">
                  <ChevronDown size={28} />
                </button>
                <div className="text-[11px] uppercase tracking-[0.18em] font-semibold text-foreground/70 truncate max-w-[60%] text-center">
                  {context === "podcast" ? "Podcast" : "Tocando agora"}
                </div>
                {toolsMenuNode("w-9 h-9 shadow-none bg-background/70", "mobile")}
              </div>
            )}

            {/* Left Column: Video / Artwork / Lyrics */}
            <div className={`w-full ${isPodcastVideo ? "" : isRailVideoMode ? "md:flex-1 md:min-w-0" : "lg:w-1/2 flex flex-col justify-center items-center gap-4"} relative`}>
              
              {/* Video/Artwork Container */}
              <div
                className={`w-full group ${
                isRailVideoMode
                  ? "pt-3 lg:pt-0"
                  : isMusicVideoMode
                    ? (context === "podcast"
                        ? "relative aspect-video w-full max-w-[420px] sm:max-w-[500px] md:max-w-[560px] lg:max-w-[600px] xl:max-w-[640px] mx-auto px-3 sm:px-4 md:px-2 mt-3 sm:mt-6 lg:mt-10 isolate"
                        : "relative aspect-video w-full max-w-[460px] sm:max-w-[620px] md:max-w-[720px] lg:max-w-[820px] mx-auto px-3 sm:px-4 md:px-2 mt-6 sm:mt-8 lg:mt-10 isolate")
                    : context === "podcast"
                      ? "relative aspect-video w-full max-w-[420px] sm:max-w-[520px] lg:max-w-[640px] mx-auto px-3 sm:px-4 mt-2 sm:mt-4"
                      : "relative aspect-square max-w-[380px] sm:max-w-[440px] lg:max-w-[520px] mx-auto px-3 sm:px-4 mt-2 sm:mt-4"
                }`}
                style={
                  isMusicVideoMode && context === "podcast"
                    ? {
                        // iOS/mobile: limita a altura do 16:9 ao viewport dinâmico real
                        // (barra de URL, notch e safe-areas), sem estourar a tela em
                        // portrait nem em landscape.
                        maxWidth:
                          "min(100%, calc((min(42dvh, 42vh) - env(safe-area-inset-top)) * 16 / 9 + 24px), 640px)",
                      }
                    : undefined
                }
              >

                {isRailVideoMode ? (
                  <>
                    {/* Spacer that matches the fixed yt-player height — full-bleed on mobile, matches left column on desktop */}
                    <div className="w-full lg:px-0" style={{ height: 'var(--xerife-video-h)' }} />
                    {context === "video" && (
                      <div
                        className="px-3 pt-3 pb-1 md:px-0 md:pt-3 relative z-10"
                        style={{ scrollMarginTop: 'calc(90px + var(--xerife-video-h) + 16px)' }}
                      >
                        <VideoInfoBar
                          song={song}
                          isFullscreen={!!isFullscreen}
                          onToggleFullscreen={() => (isFullscreen ? onExitFullscreen?.() : onFullscreen?.())}
                          onTogglePiP={() => onTogglePiP?.()}
                          onShare={() => onShare?.()}
                          onDownload={() => onDownload?.()}
                          onClose={onCollapse}
                          isLiked={!!isLiked}
                          onToggleLike={onLike}
                          onAddToPlaylist={onAddToPlaylist ? () => onAddToPlaylist(song) : undefined}
                          onNavigateToLibrary={onNavigateToLibrary}
                          onOpenChannel={onOpenChannel}
                        />
                      </div>
                    )}
                  </>
                ) : isMusicVideoMode ? (
                  // Music context: reserve a 16:9 area where the album cover sits.
                  // The actual YouTube iframe is positioned by Index.tsx to overlay
                  // exactly this box (id="music-video-anchor"), so the player
                  // substitui a área da capa em qualquer breakpoint.
                  <>
                    <div className="relative w-full">
                      <div id="music-video-anchor" className="w-full aspect-video rounded-2xl sm:rounded-3xl bg-black ring-1 ring-border/60 dark:ring-white/10" aria-hidden />
                      {context === "music" && (
                        <>
                          <button
                            onClick={reloadVideoClip}
                            disabled={reloadingClip}
                            aria-label="Recarregar videoclipe (1x próximo, 2x buscar novo)"
                            title="Não é este clipe? Toque para trocar. Toque 2x para buscar de novo."
                            className="absolute top-2 right-2 z-30 w-9 h-9 rounded-full bg-black/55 hover:bg-black/80 text-white backdrop-blur-md flex items-center justify-center opacity-70 hover:opacity-100 focus-visible:opacity-100 transition-opacity active:scale-90 disabled:opacity-60 shadow-md"
                          >
                            <RefreshCw size={16} className={reloadingClip ? "animate-spin" : ""} />
                          </button>
                          {showReloadHint && (
                            <div className="absolute left-1/2 -translate-x-1/2 bottom-2 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/70 backdrop-blur-md text-white text-[11px] font-medium shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-300">
                              <RefreshCw size={12} />
                              <span>Não é este clipe? Toque em ↻</span>
                              <button
                                onClick={dismissReloadHint}
                                aria-label="Fechar dica"
                                className="ml-1 -mr-1 w-5 h-5 rounded-full hover:bg-white/15 flex items-center justify-center"
                              >
                                <X size={10} />
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    {context === "music" && activeVideoId && activeVideoId !== song.youtubeId && (
                      <div className="mt-2 flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => adjustClipOffset(-500)}
                          className="w-7 h-7 rounded-full bg-secondary/70 text-foreground text-xs font-bold hover:bg-accent active:scale-90 transition"
                          aria-label="Atrasar clipe 0,5s"
                          title="Atrasar clipe 0,5s"
                        >−</button>
                        <button
                          onClick={resetClipOffset}
                          className="min-w-[92px] px-3 h-7 rounded-full bg-secondary/50 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-accent transition"
                          title="Redefinir sincronia do clipe"
                        >
                          Clipe {clipOffsetMs === 0 ? "0.0s" : `${clipOffsetMs > 0 ? "+" : ""}${(clipOffsetMs / 1000).toFixed(1)}s`}
                        </button>
                        <button
                          onClick={() => adjustClipOffset(500)}
                          className="w-7 h-7 rounded-full bg-secondary/70 text-foreground text-xs font-bold hover:bg-accent active:scale-90 transition"
                          aria-label="Adiantar clipe 0,5s"
                          title="Adiantar clipe 0,5s"
                        >+</button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="w-full h-full relative z-0">
                    <div className="w-full h-full relative z-0">
                    {mode === "lyrics" ? (
                      <div className="w-full h-full relative rounded-3xl overflow-hidden shadow-2xl">
                        <BlurImage src={hdThumbnail(song.cover)} alt={song.album} className="w-full h-full" />
                        <div className="absolute inset-0 z-20 bg-background/90 backdrop-blur-xl" />
                        <div ref={lyricsContainerRef} className="absolute inset-0 z-20 overflow-y-auto px-8 py-10 scrollbar-hide">
                          {lyricsLoading ? (
                            <div className="flex flex-col items-center justify-center h-full gap-4">
                              <Loader2 size={32} className="text-primary animate-spin" />
                              <p className="text-sm font-medium text-muted-foreground">Buscando letra...</p>
                            </div>
                          ) : lyricsResult && lyricsResult.lines.length > 0 ? (
                            <div className="space-y-6 py-6">
                              {(lyricsResult.synced || !!virtualSyncTimes) && (
                                <div className="sticky top-0 z-30 -mt-6 mb-2 flex items-center justify-center gap-2 py-2 bg-background/70 backdrop-blur-md rounded-full">
                                  <button
                                    onClick={() => adjustOffset(-0.5)}
                                    disabled={syncDisabled}
                                    aria-label="Atrasar letra 0,5s"
                                    className="w-8 h-8 rounded-full bg-secondary text-foreground text-sm font-bold hover:bg-accent active:scale-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
                                  >−</button>
                                  <button
                                    onClick={resetOffset}
                                    disabled={syncDisabled}
                                    title="Redefinir sincronização"
                                    className="min-w-[92px] px-3 h-8 rounded-full bg-secondary/60 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-accent transition disabled:opacity-40 disabled:cursor-not-allowed"
                                  >
                                    Sync {lyricsOffset === 0 ? "0.0s" : `${lyricsOffset > 0 ? "+" : ""}${lyricsOffset.toFixed(1)}s`}
                                    {!lyricsResult.synced && <span className="ml-1 opacity-60">~</span>}
                                  </button>
                                  <button
                                    onClick={() => adjustOffset(0.5)}
                                    disabled={syncDisabled}
                                    aria-label="Adiantar letra 0,5s"
                                    className="w-8 h-8 rounded-full bg-secondary text-foreground text-sm font-bold hover:bg-accent active:scale-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
                                  >+</button>
                                  <button
                                    onClick={() => setSyncDisabled((v) => !v)}
                                    title={syncDisabled ? "Ativar sincronização automática" : "Desativar sincronização (rolagem livre)"}
                                    aria-pressed={syncDisabled}
                                    className={`ml-1 px-3 h-8 rounded-full text-[11px] font-semibold transition active:scale-95 ${
                                      syncDisabled
                                        ? "bg-primary text-primary-foreground"
                                        : "bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-accent"
                                    }`}
                                  >
                                    {syncDisabled ? "Sync off" : "Sync on"}
                                  </button>
                                </div>
                              )}

                              {isEffectivelySynced && activeLineIndex < 0 && (
                                <p className="text-center text-xs uppercase tracking-widest text-muted-foreground/70 animate-pulse">
                                  ♪ Aguardando o vocal começar…
                                </p>
                              )}
                              {lyricsResult.lines.map((line, i) => {
                                const isActive = isEffectivelySynced && i === activeLineIndex;
                                const seekTime = lyricsResult.synced ? line.time : virtualSyncTimes?.[i] ?? -1;
                                return (
                                  <p
                                    key={i}
                                    ref={isActive ? activeLineRef : undefined}
                                    onClick={() => { if (isEffectivelySynced && seekTime >= 0) onSeek(seekTime / (duration || 1)); }}
                                    className={`text-center transition-all duration-700 cursor-pointer ${
                                      isActive ? "text-2xl sm:text-3xl font-black text-primary scale-110 drop-shadow-glow" : "text-base sm:text-xl text-foreground font-medium opacity-30 hover:opacity-100"
                                    }`}
                                  >
                                    {line.text}
                                  </p>
                                );
                              })}
                            </div>

                          ) : (
                            <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-4">
                              <Mic2 size={48} className="text-muted-foreground/20 animate-pulse" />
                              <div className="space-y-2">
                                <p className="text-foreground font-bold text-lg">{song.title}</p>
                                <p className="text-sm text-muted-foreground max-w-[280px]">
                                  Não encontramos a letra desta faixa nas APIs públicas (LRCLIB, Lyrist, lyrics.ovh, ChartLyrics). Tente novamente ou busque em uma fonte externa.
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2 justify-center mt-2">
                                <button
                                  onClick={() => loadLyrics(true)}
                                  className="px-5 py-2 rounded-full bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 active:scale-95 transition-all"
                                >
                                  Tentar novamente
                                </button>
                                <button
                                  onClick={() => handleModeChange("audio")}
                                  className="px-5 py-2 rounded-full bg-secondary text-foreground text-sm font-bold hover:bg-accent active:scale-95 transition-all"
                                >
                                  Voltar ao Player
                                </button>
                              </div>
                              <div className="flex flex-wrap gap-2 justify-center pt-2">
                                {(() => {
                                  const q = encodeURIComponent(`${song.artist} ${song.title} letra`);
                                  const links = [
                                    { label: "Google", url: `https://www.google.com/search?q=${q}` },
                                    { label: "Genius", url: `https://genius.com/search?q=${q}` },
                                    { label: "AZLyrics", url: `https://search.azlyrics.com/search.php?q=${q}` },
                                    { label: "Letras.mus.br", url: `https://www.letras.mus.br/?q=${q}` },
                                  ];
                                  return links.map((l) => (
                                    <a
                                      key={l.label}
                                      href={l.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/10 transition-all"
                                    >
                                      Buscar no {l.label}
                                    </a>
                                  ));
                                })()}
                              </div>
                            </div>

                          )}
                        </div>
                      </div>
                    ) : (
                      <div
                        className="w-full h-full relative rounded-3xl overflow-hidden shadow-2xl-glow group/art select-none"
                        style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
                      >
                        <BlurImage src={hdThumbnail(song.cover)} alt={song.album} className="w-full h-full transition-transform duration-700 group-hover/art:scale-105 pointer-events-none" />
                      </div>

                    )}
                    </div>
                  </div>
                )}

                {/* Collapse overlay removido no modo Letras — usar somente a barra superior */}
              </div>

              {/* Mode selector pill removed — Vídeo toggle now lives in the action bar
                  next to Letra; Áudio is the default state when Vídeo/Letra are off. */}
            </div>

            {/* Right Column: Controls + Related — on desktop rail video mode this becomes a sticky right rail (YouTube-style) */}
            <div
              className={`w-full ${
                isPodcastVideo
                  ? "mt-4"
                  : isRailVideoMode
                  ? "md:w-[var(--xerife-video-rail)] md:flex-shrink-0 md:sticky md:self-start md:overflow-y-auto scrollbar-hide"
                  : "lg:w-1/2"
              } flex flex-col ${isPodcastVideo ? "items-center px-4 sm:px-8" : isRailVideoMode ? "px-2 md:px-0 mt-0" : "justify-center lg:items-center px-4 sm:px-8 mt-4 lg:mt-0"} min-w-0 relative`}
              style={
                isRailVideoMode && !isPodcastVideo
                  ? {
                      // Stick right below the header, and cap height so the rail scrolls internally
                      // without ever overlapping the fixed player or being covered by it.
                      top: "90px",
                      maxHeight: "calc(100vh - 90px - env(safe-area-inset-bottom) - 16px)",
                    }
                  : undefined
              }
            >


              <div
                className={`w-full min-w-0 ${isPodcastVideo ? "max-w-xl lg:max-w-2xl mx-auto flex flex-col gap-5 lg:gap-6 items-center" : isRailVideoMode ? "" : "max-w-xl lg:max-w-2xl mx-auto flex flex-col gap-5 lg:gap-8 lg:items-center"} touch-pan-y`}

              >

                {/* Info Header - hidden only in rail video mode (Xerife Vídeos) */}
                {!isRailVideoMode && (
                  <div className="flex flex-col gap-1 w-full items-center text-center mt-2 lg:mt-0">
                    <div className="w-full max-w-full px-2">
                      <MarqueeText
                        text={song.title}
                        className="text-2xl sm:text-4xl lg:text-5xl font-black text-foreground tracking-tight leading-tight"
                      />
                    </div>
                    <button onClick={() => onArtistClick?.({ name: song.artist, image: song.cover })} className="group inline-flex items-center gap-1.5">
                      <p className="text-lg sm:text-2xl text-muted-foreground group-hover:text-primary transition-colors font-medium underline underline-offset-4 decoration-muted-foreground/30 group-hover:decoration-primary">{song.artist}</p>
                      <ChevronDown size={16} className="rotate-[-90deg] text-muted-foreground/50 group-hover:text-primary transition-colors" />
                    </button>
                  </div>
                )}

                {/* Action Bar - hidden only in rail video mode (Xerife Vídeos) */}
                {!isRailVideoMode && (
                  <div className="flex items-center justify-center gap-1 bg-card/40 backdrop-blur-xl border border-white/10 rounded-2xl p-1 shadow-2xl mx-auto w-fit">
                    <button 
                      onClick={onLike}
                      title={isLiked ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                      className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all active:scale-95 ${
                        isLiked ? 'bg-primary text-primary-foreground shadow-glow' : 'bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground'
                      }`}
                    >
                      <Heart size={20} fill={isLiked ? "currentColor" : "none"} strokeWidth={isLiked ? 0 : 2.5} />
                    </button>
                    {[
                      // Letra (atalho): alterna entre Letra e Áudio.
                      context === "music" && hasLyrics
                        ? {
                            icon: Mic2,
                            label: mode === 'lyrics' ? 'Fechar letra' : 'Letra',
                            onClick: () => handleModeChange(mode === 'lyrics' ? 'audio' : 'lyrics'),
                            active: mode === 'lyrics',
                            pressed: mode === 'lyrics',
                          }
                        : { icon: isFullscreen ? Minimize2 : Maximize2, label: isFullscreen ? 'Sair Tela Cheia' : 'Tela Cheia', onClick: isFullscreen ? onExitFullscreen : onFullscreen, active: false },
                      // Vídeo (toggle): ativa/desativa o modo vídeo; quando off, volta para a capa (áudio).
                      context !== "video" && hasVideoClip
                        ? {
                            icon: Video,
                            label: mode === 'video' ? 'Fechar vídeo' : 'Vídeo',
                            onClick: () => handleModeChange(mode === 'video' ? 'audio' : 'video'),
                            active: mode === 'video',
                            pressed: mode === 'video',
                          }
                        : null,
                      // Baixar música (atalho direto na pílula)
                      onDownload ? { icon: Download, label: 'Baixar música', onClick: onDownload, active: false } : null,
                      // Compartilhar (atalho direto na pílula)
                      onShare ? { icon: Share2, label: 'Compartilhar', onClick: onShare, active: false } : null,


                    ].filter(Boolean).map((btn: any, i) => btn.onClick && (

                      <button
                        key={i}
                        onClick={btn.onClick}
                        title={btn.label}
                        aria-label={btn.label}
                        aria-pressed={typeof btn.pressed === 'boolean' ? btn.pressed : undefined}
                        className={`w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-xl transition-all active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                          btn.active
                            ? 'bg-primary text-primary-foreground shadow-glow'
                            : 'bg-secondary/30 hover:bg-primary/20 hover:text-primary text-muted-foreground'
                        }`}
                      >
                        <btn.icon size={18} aria-hidden />
                      </button>
                    ))}

                    {/* Ajuste da intensidade do overlay (legibilidade do fundo dinâmico) */}
                    {context === "music" && dynamicBgEnabled && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            title="Legibilidade do fundo"
                            aria-label="Ajustar intensidade do overlay do fundo dinâmico"
                            className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-xl transition-all active:scale-90 bg-secondary/30 hover:bg-primary/20 hover:text-primary text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          >
                            <SlidersHorizontal size={18} aria-hidden />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-60 space-y-3">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium">Legibilidade do fundo</span>
                            <span className="tabular-nums text-muted-foreground">{overlayIntensity}%</span>
                          </div>
                          <Slider
                            value={[overlayIntensity]}
                            min={0}
                            max={100}
                            step={5}
                            onValueChange={(v) => setOverlayIntensityValue(v[0])}
                            aria-label="Intensidade do overlay"
                          />
                          <p className="text-[11px] leading-snug text-muted-foreground">
                            Aumente para escurecer (ou clarear, no tema claro) o fundo e deixar o texto mais legível.
                          </p>
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>

                )}

                {/* SeekBar & Transport — hidden only in rail (Xerife Vídeos) mode */}
                {!isRailVideoMode && context !== "video" && (
                <div className="w-full space-y-3">
                  <div className="w-full space-y-1.5">
                    <SeekBar progress={progress} onSeek={onSeek} trackHeight="normal" className="w-full" duration={duration} />
                    <div className="flex justify-between text-[11px] sm:text-sm font-bold text-muted-foreground/60">
                      <span>{formatDuration(currentTime)}</span>
                      <span>{formatDuration(duration)}</span>
                    </div>
                  </div>

                  <div className="w-full flex items-center justify-between lg:justify-center lg:gap-11">
                    <button onClick={onShuffle} className={`p-2 rounded-xl transition-all ${isShuffled ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
                      <Shuffle size={20} />
                    </button>
                    <div className="flex items-center gap-3 sm:gap-8">
                      <button onClick={onPrev} className="p-2 rounded-full bg-secondary hover:bg-accent text-foreground transition-all active:scale-90 shadow-lg">
                        <SkipBack size={24} fill="currentColor" />
                      </button>
                      <button onClick={onTogglePlay} className="w-16 h-16 sm:w-28 sm:h-28 flex-shrink-0 rounded-full bg-primary flex items-center justify-center text-primary-foreground shadow-2xl shadow-primary/40 hover:scale-105 active:scale-95 transition-transform">
                        {isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" className="ml-0.5" />}
                      </button>
                      <button onClick={onNext} className="p-2 rounded-full bg-secondary hover:bg-accent text-foreground transition-all active:scale-90 shadow-lg">
                        <SkipForward size={24} fill="currentColor" />
                      </button>
                    </div>
                    <button className="p-2 rounded-xl text-muted-foreground hover:text-foreground transition-all">
                      <Repeat size={20} />
                    </button>
                  </div>
                </div>
                )}


                {/* Volume removed — now controlled by device hardware buttons */}


                {/* Right-rail content — Tablet+Desktop: Related + Recommended stacked vertically. Mobile: tab UI unchanged. */}
                {context === "video" && (
                  <div className="mt-0 border-t border-white/5 pt-1 pb-20 md:pb-6 md:mt-0 md:border-0 md:pt-0">
                    {/* Mobile tabs (below md) */}
                    <div className="md:hidden">
                      <div className="flex gap-2 mb-2">
                        <button onClick={() => setBottomTab("related")} className={`px-3.5 py-1.5 rounded-full text-sm font-semibold flex items-center gap-1.5 ${bottomTab === 'related' ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}>
                          <ListVideo size={16} /> Recomendados
                        </button>
                        <button onClick={() => setBottomTab("comments")} className={`px-3.5 py-1.5 rounded-full text-sm font-semibold flex items-center gap-1.5 ${bottomTab === 'comments' ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}>
                          <MessageSquare size={16} /> Discussão
                        </button>
                      </div>
                      <div className="pr-1">
                        {bottomTab === 'related' ? (
                          <RelatedVideos
                            videos={videoInfo?.relatedVideos || []}
                            loading={videoInfoLoading}
                            onPlay={(v) => onPlayRelated?.(v)}
                            currentVideoId={song.youtubeId}
                            onLoadMore={loadMoreRelated}
                          />
                        ) : (
                          <VideoComments comments={videoInfo?.comments || []} loading={videoInfoLoading} />
                        )}
                      </div>
                    </div>

                    {/* Tablet+Desktop right rail: single vertical stack of recommended/related videos */}
                    <div className="hidden md:block">
                      <div className="flex items-center gap-2 mb-3">
                        <ListVideo size={16} className="text-muted-foreground" />
                        <h3 className="text-[15px] font-semibold text-foreground">Próximos vídeos</h3>
                      </div>
                      <RelatedVideos
                        videos={videoInfo?.relatedVideos || []}
                        loading={videoInfoLoading}
                        onPlay={(v) => onPlayRelated?.(v)}
                        pageSize={14}
                        variant="rail"
                        currentVideoId={song.youtubeId}
                        onLoadMore={loadMoreRelated}
                      />
                    </div>
                  </div>
                )}

                {/* Podcast episode description — descrição do episódio de podcast */}
                {context === "podcast" && (podcastPanelDescription || videoInfoLoading) && (
                  <PodcastDescriptionPanel
                    description={podcastPanelDescription}
                    loading={videoInfoLoading && !podcastPanelDescription}
                    episodeTitle={song.title}
                  />
                )}
              </div>

            </div>
          </div>
        </div>
      </div>
      </div>
      <ChordsSheet
        open={chordsOpen}
        onOpenChange={setChordsOpen}
        artist={song.artist}
        title={song.title}
      />
    </div>
  );

};

export default NowPlayingView;
