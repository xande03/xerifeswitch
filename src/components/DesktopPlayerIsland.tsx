import { Play, Pause, SkipBack, SkipForward, Heart, Maximize2, Music } from "lucide-react";
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
}

/**
 * Player do DESKTOP (lg+, ≥1024px) como ILHA DINÂMICA em forma de pílula,
 * centralizada no rodapé: capa/thumbnail à esquerda e controles de
 * reprodução + slider à direita — substitui a visão "card quadrada" que
 * antigamente ficava na base da sidebar. Só desktop; mobile/tablet usam
 * seus próprios players.
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
}: Props) => {
  if (!song) return null;

  return (
    <div
      role="region"
      aria-label="Player (desktop)"
      className="hidden lg:flex items-center gap-3 rounded-full border border-border/70 bg-card/95 backdrop-blur-xl shadow-2xl shadow-black/45 pl-2 pr-2.5 py-2 fixed bottom-4 left-1/2 -translate-x-1/2 z-[80]"
      style={{ width: "min(780px, calc(100vw - 48px))" }}
    >
      {/* Capa/thumbnail à esquerda — toque abre o player expandido */}
      <button
        onClick={onExpand}
        aria-label={`Abrir player: ${song.title}`}
        className="w-14 h-14 rounded-2xl overflow-hidden ring-1 ring-border shadow-md shrink-0 hover:scale-[1.04] active:scale-95 transition-transform"
      >
        {song.cover ? (
          <img src={hdThumbnail(song.cover)} alt={song.album || song.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-secondary flex items-center justify-center text-muted-foreground">
            <Music size={18} />
          </div>
        )}
      </button>

      {/* Meta (título/artista) */}
      <div className="min-w-0 w-36 xl:w-44 shrink-0 text-left">
        <p className="text-[12.5px] font-semibold text-foreground truncate leading-tight">{song.title}</p>
        <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">{song.artist}</p>
      </div>

      {/* Transporte */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onPrev}
          aria-label="Anterior"
          className="w-9 h-9 rounded-full flex items-center justify-center text-foreground/80 hover:text-foreground hover:bg-accent/70 active:scale-90 transition"
        >
          <SkipBack size={18} fill="currentColor" />
        </button>
        <button
          onClick={onTogglePlay}
          aria-label={isPlaying ? "Pausar" : "Reproduzir"}
          className="w-11 h-11 rounded-full flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-transform bg-primary text-primary-foreground"
          style={podcastMode ? { backgroundColor: "hsl(var(--module-accent))", color: "hsl(var(--module-accent-foreground))" } : undefined}
        >
          {isPlaying
            ? <Pause size={20} fill="currentColor" />
            : <Play size={20} fill="currentColor" className="ml-0.5" />}
        </button>
        <button
          onClick={onNext}
          aria-label="Próximo"
          className="w-9 h-9 rounded-full flex items-center justify-center text-foreground/80 hover:text-foreground hover:bg-accent/70 active:scale-90 transition"
        >
          <SkipForward size={18} fill="currentColor" />
        </button>
      </div>

      {/* Slider + tempos à direita — ocupa o restante da pílula */}
      <div className="flex-1 flex items-center gap-2.5 min-w-0">
        <span className="text-[10.5px] font-mono text-muted-foreground tabular-nums min-w-[36px] text-right shrink-0 hidden xl:block">
          {formatDuration(currentTime)}
        </span>
        <div className="flex-1 min-w-0">
          <SeekBar
            progress={progress}
            onSeek={onSeek}
            trackHeight="thin"
            showThumb
            duration={duration}
          />
        </div>
        <span className="text-[10.5px] font-mono text-muted-foreground tabular-nums min-w-[36px] shrink-0 hidden xl:block">
          {formatDuration(duration)}
        </span>
      </div>

      {/* Cursor: curtir + expandir */}
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
              <Heart size={17} fill={isLiked ? "currentColor" : "none"} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs font-semibold">
            {isLiked ? "Favorita" : "Favoritar"}
          </TooltipContent>
        </Tooltip>
      )}
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <button
            onClick={onExpand}
            aria-label="Expandir player"
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-foreground/70 hover:text-foreground hover:bg-accent/70 active:scale-90 transition"
          >
            <Maximize2 size={16} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs font-semibold">Abrir em tela cheia</TooltipContent>
      </Tooltip>
    </div>
  );
};

export default DesktopPlayerIsland;
