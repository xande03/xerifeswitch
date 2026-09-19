import { useState, useRef, useEffect } from "react";
import { Play, Pause, SkipBack, SkipForward, Heart, Maximize2, Music, Mic2, Video, Download, Share2, Shuffle, Volume2, X } from "lucide-react";
import { Song, formatDuration } from "@/data/mockSongs";
import { hdThumbnail } from "@/lib/utils";
import SeekBar from "@/components/SeekBar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  song: Song | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  progress: number;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (fraction: number) => void;
  onExpand: () => void;
  isLiked?: boolean;
  onLike?: () => void;
  /** true = sessão Podcasts (usa cor de módulo no botão principal) */
  podcastMode?: boolean;
  /** Volume 0-100 — mesmo pipeline do SidebarPlayer */
  volume?: number;
  onVolumeChange?: (vol: number) => void;
  isShuffled?: boolean;
  onShuffle?: () => void;
  /** Abre o modo letra (mesmo handler do SidebarPlayer) */
  onLyrics?: () => void;
  /** Abre o modo vídeo (mesmo handler do SidebarPlayer) */
  onVideo?: () => void;
  onDownload?: () => void;
  onShare?: () => void;
  /** Modo atual do player: capa (audio), letra ou vídeo */
  playerMode?: "audio" | "lyrics" | "video";
}

/**
 * Player do DESKTOP (lg+, ≥1024px) como BOLHA FLUTUANTE no canto inferior
 * direito: a capa/thumbnail da música tocando fica num botão circular fixo
 * (com barrinhas de equalizador quando está tocando). Ao clicar, abre um
 * POPUP RETANGULAR EM FORMATO DE PÍLULA ancorado acima da bolha, com
 * thumbnail, slider, transporte (voltar/pausar-reproduzir/próximo),
 * favoritar, letras, vídeo, download, compartilhar, aleatório e volume.
 * Só desktop; mobile/tablet usam seus próprios players.
 */
const DesktopPlayerIsland = ({
  song,
  isPlaying,
  currentTime,
  duration,
  progress,
  onTogglePlay,
  onNext,
  onPrev,
  onSeek,
  onExpand,
  isLiked = false,
  onLike,
  podcastMode = false,
  volume,
  onVolumeChange,
  isShuffled = false,
  onShuffle,
  onLyrics,
  onVideo,
  onDownload,
  onShare,
  playerMode = "audio",
}: Props) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Fecha o popup ao clicar fora ou apertar Esc
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!song) return null;

  const accent = podcastMode
    ? { backgroundColor: "hsl(var(--module-accent))", color: "hsl(var(--module-accent-foreground))" }
    : undefined;

  /** Botão de ícone redondo dos módulos (letras, vídeo, download, share) */
  const ModuleBtn = ({
    label,
    onClick,
    active = false,
    children,
  }: {
    label: string;
    onClick?: () => void;
    active?: boolean;
    children: React.ReactNode;
  }) => (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          aria-label={label}
          aria-pressed={active}
          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition active:scale-90 ${
            active ? "text-primary bg-primary/10" : "text-foreground/70 hover:text-foreground hover:bg-accent/70"
          }`}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs font-semibold">{label}</TooltipContent>
    </Tooltip>
  );

  return (
    <div ref={rootRef} className="hidden lg:block">

      {/* ── BOLHA FLUTUANTE (canto inferior direito) — abre/fecha o popup ── */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Fechar mini player" : "Abrir mini player"}
        aria-expanded={open}
        className="fixed z-[80] bottom-4 lg:bottom-[calc(1rem+var(--app-frame-inset))] right-4 lg:right-[calc(1rem+var(--app-frame-inset))] w-14 h-14 rounded-full overflow-hidden ring-1 ring-border shadow-2xl shadow-black/50 bg-card hover:scale-105 active:scale-95 transition-transform"
      >
        {song.cover ? (
          <img src={hdThumbnail(song.cover)} alt={song.album || song.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-secondary flex items-center justify-center text-muted-foreground">
            <Music size={20} />
          </div>
        )}
        {/* Indicador sobre a capa: equalizador (tocando) ou play (pausado) */}
        <span className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-black/80 via-black/45 to-transparent flex items-end justify-center pb-1 gap-[2.5px] pointer-events-none">
          {isPlaying ? (
            <>
              <span className="eq-bar w-[2.5px] rounded-full bg-white" style={{ animationDelay: "0ms" }} />
              <span className="eq-bar w-[2.5px] rounded-full bg-white" style={{ animationDelay: "160ms" }} />
              <span className="eq-bar w-[2.5px] rounded-full bg-white" style={{ animationDelay: "320ms" }} />
            </>
          ) : (
            <Play size={11} fill="currentColor" className="text-white mb-0.5" />
          )}
        </span>
      </button>

      {/* ── POPUP RETANGULAR EM PÍLULA (acima da bolha) ── */}
      {open && (
        <div
          role="region"
          aria-label="Player (desktop)"
          className="fixed z-[80] bottom-[calc(4.75rem+var(--app-frame-inset))] right-4 lg:right-[calc(1rem+var(--app-frame-inset))] w-[340px] max-w-[calc(100vw-2rem)] rounded-[28px] border border-border/70 bg-card/95 backdrop-blur-xl shadow-2xl shadow-black/50 p-3.5 animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-200 origin-bottom-right"
        >

          {/* Linha 1: thumbnail + título/artista + expandir + fechar */}
          <div className="flex items-center gap-3">
            <button
              onClick={onExpand}
              aria-label={`Abrir player: ${song.title}`}
              className="w-16 h-16 rounded-2xl overflow-hidden ring-1 ring-border shadow-md shrink-0 hover:scale-[1.04] active:scale-95 transition-transform"
            >
              {song.cover ? (
                <img src={hdThumbnail(song.cover)} alt={song.album || song.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-secondary flex items-center justify-center text-muted-foreground">
                  <Music size={20} />
                </div>
              )}
            </button>
            <div className="min-w-0 flex-1 text-left">
              <p className="text-[13px] font-semibold text-foreground truncate leading-tight">{song.title}</p>
              <p className="text-[11.5px] text-muted-foreground truncate leading-tight mt-0.5">{song.artist}</p>
            </div>
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <button
                  onClick={onExpand}
                  aria-label="Expandir player"
                  className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-foreground/70 hover:text-foreground hover:bg-accent/70 active:scale-90 transition"
                >
                  <Maximize2 size={15} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs font-semibold">Abrir em tela cheia</TooltipContent>
            </Tooltip>
            <button
              onClick={() => setOpen(false)}
              aria-label="Fechar mini player"
              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-muted-foreground hover:text-foreground hover:bg-accent/70 active:scale-90 transition"
            >
              <X size={15} />
            </button>
          </div>

          {/* Linha 2: slider de progresso + tempos */}
          <div className="flex items-center gap-2.5 mt-3">
            <span className="text-[10.5px] font-mono text-muted-foreground tabular-nums min-w-[34px] text-right shrink-0">
              {formatDuration(currentTime)}
            </span>
            <div className="flex-1 min-w-0">
              <SeekBar progress={progress} onSeek={onSeek} trackHeight="thin" showThumb duration={duration} />
            </div>
            <span className="text-[10.5px] font-mono text-muted-foreground tabular-nums min-w-[34px] shrink-0">
              {formatDuration(duration)}
            </span>
          </div>

          {/* Linha 3: transporte — aleatório, voltar, pausar/reproduzir, próximo, favoritar */}
          <div className="flex items-center justify-center gap-2 mt-2.5">
            {onShuffle && (
              <ModuleBtn label="Aleatorizar" onClick={onShuffle} active={isShuffled}>
                <Shuffle size={15} />
              </ModuleBtn>
            )}
            <button
              onClick={onPrev}
              aria-label="Anterior"
              className="w-10 h-10 rounded-full flex items-center justify-center text-foreground/80 hover:text-foreground hover:bg-accent/70 active:scale-90 transition"
            >
              <SkipBack size={19} fill="currentColor" />
            </button>
            <button
              onClick={onTogglePlay}
              aria-label={isPlaying ? "Pausar" : "Reproduzir"}
              className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-transform bg-primary text-primary-foreground"
              style={accent}
            >
              {isPlaying
                ? <Pause size={21} fill="currentColor" />
                : <Play size={21} fill="currentColor" className="ml-0.5" />}
            </button>
            <button
              onClick={onNext}
              aria-label="Próximo"
              className="w-10 h-10 rounded-full flex items-center justify-center text-foreground/80 hover:text-foreground hover:bg-accent/70 active:scale-90 transition"
            >
              <SkipForward size={19} fill="currentColor" />
            </button>
            {onLike && (
              <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                  <button
                    onClick={onLike}
                    aria-label={isLiked ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                    aria-pressed={isLiked}
                    className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition active:scale-90 ${
                      isLiked ? "text-primary" : "text-foreground/70 hover:text-foreground hover:bg-accent/70"
                    }`}
                  >
                    <Heart size={16} fill={isLiked ? "currentColor" : "none"} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs font-semibold">
                  {isLiked ? "Favorita" : "Favoritar"}
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* Linha 4: módulos — letras, vídeo, baixar, compartilhar + volume */}
          <div className="flex items-center gap-1 mt-2.5 pt-2.5 border-t border-border/60">
            {onLyrics && (
              <ModuleBtn label="Ver letra" onClick={onLyrics} active={playerMode === "lyrics"}>
                <Mic2 size={15} />
              </ModuleBtn>
            )}
            {onVideo && (
              <ModuleBtn label="Assistir vídeo" onClick={onVideo} active={playerMode === "video"}>
                <Video size={15} />
              </ModuleBtn>
            )}
            {onDownload && (
              <ModuleBtn label="Baixar" onClick={onDownload}>
                <Download size={15} />
              </ModuleBtn>
            )}
            {onShare && (
              <ModuleBtn label="Compartilhar" onClick={onShare}>
                <Share2 size={15} />
              </ModuleBtn>
            )}
            {volume !== undefined && onVolumeChange && (
              <div className="ml-auto flex items-center gap-1.5 min-w-0 pl-1">
                <Volume2 size={14} className="text-muted-foreground shrink-0" />
                <SeekBar
                  progress={volume / 100}
                  onSeek={(f) => onVolumeChange(Math.round(f * 100))}
                  trackHeight="thin"
                  showThumb={false}
                  className="w-[72px]"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DesktopPlayerIsland;
