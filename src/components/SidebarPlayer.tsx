import { Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Volume2, VolumeX, Maximize2, Music } from "lucide-react";
import { Song, formatDuration } from "@/data/mockSongs";
import { hdThumbnail } from "@/lib/utils";
import SeekBar from "@/components/SeekBar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface SidebarPlayerProps {
  song?: Song | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  onExpand: () => void;
  onSeek: (fraction: number) => void;
  onVolumeChange: (vol: number) => void;
  isShuffled?: boolean;
  onShuffle?: () => void;
  collapsed?: boolean;
}

const PillButton = ({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) => (
  <Tooltip delayDuration={200}>
    <TooltipTrigger asChild>
      <button
        onClick={onClick}
        aria-label={label}
        aria-pressed={active}
        className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors active:scale-90 ${
          active
            ? "bg-primary/20 text-primary"
            : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
        }`}
      >
        {children}
      </button>
    </TooltipTrigger>
    <TooltipContent side="top" className="text-xs font-semibold">{label}</TooltipContent>
  </Tooltip>
);

const SidebarPlayer = ({
  song,
  isPlaying,
  currentTime,
  duration,
  volume,
  onTogglePlay,
  onNext,
  onPrev,
  onExpand,
  onSeek,
  onVolumeChange,
  isShuffled,
  onShuffle,
  collapsed = false,
}: SidebarPlayerProps) => {
  const progress = duration > 0 ? currentTime / duration : 0;

  if (!song) return null;

  if (collapsed) {
    return (
      <div className="px-2 pb-4 pt-2 flex flex-col items-center gap-2">
        <button onClick={onExpand} className="w-12 h-12 rounded-xl overflow-hidden ring-1 ring-border shadow-md">
          <img src={hdThumbnail(song.cover)} alt={song.album} className="w-full h-full object-cover" />
        </button>
        <button
          onClick={onTogglePlay}
          aria-label={isPlaying ? "Pausar" : "Reproduzir"}
          className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
        >
          {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
        </button>
      </div>
    );
  }

  return (
    <div className="px-3 pb-4 pt-2 space-y-3">
      {/* Capa do álbum */}
      <button
        onClick={onExpand}
        className="block w-full rounded-2xl overflow-hidden ring-1 ring-border shadow-lg group relative"
        aria-label="Abrir tocando agora"
      >
        {song.cover ? (
          <img
            src={hdThumbnail(song.cover)}
            alt={song.album || song.title}
            className="w-full aspect-square object-cover group-hover:scale-[1.02] transition-transform duration-300"
          />
        ) : (
          <div className="w-full aspect-square bg-secondary flex items-center justify-center text-muted-foreground">
            <Music size={32} />
          </div>
        )}
      </button>

      {/* Título */}
      <div className="min-w-0 text-left">
        <p className="text-[13px] font-semibold text-sidebar-foreground truncate">{song.title}</p>
        <p className="text-[11px] text-muted-foreground truncate">{song.artist}</p>
      </div>

      {/* Pílula de ações */}
      <div className="flex items-center justify-between gap-0.5 p-1 rounded-full border border-border bg-secondary/70">
        <PillButton label="Aleatório" active={isShuffled} onClick={onShuffle}>
          <Shuffle size={15} />
        </PillButton>
        <PillButton label="Repetir">
          <Repeat size={15} />
        </PillButton>
        <PillButton
          label={volume === 0 ? "Ativar som" : "Silenciar"}
          onClick={() => onVolumeChange(volume > 0 ? 0 : 70)}
        >
          {volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </PillButton>
        <PillButton label="Expandir" onClick={onExpand}>
          <Maximize2 size={15} />
        </PillButton>
      </div>

      {/* Slider de reprodução */}
      <div className="space-y-1">
        <SeekBar
          progress={progress}
          onSeek={onSeek}
          trackHeight="thin"
          showThumb
          duration={duration}
          className="w-full"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
          <span>{formatDuration(currentTime)}</span>
          <span>{formatDuration(duration)}</span>
        </div>
      </div>

      {/* Controles */}
      <div className="flex items-center justify-center gap-4">
        <button onClick={onPrev} aria-label="Anterior" className="text-sidebar-foreground hover:text-primary transition-colors active:scale-90">
          <SkipBack size={20} fill="currentColor" />
        </button>
        <button
          onClick={onTogglePlay}
          aria-label={isPlaying ? "Pausar" : "Reproduzir"}
          className="w-11 h-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-md"
        >
          {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
        </button>
        <button onClick={onNext} aria-label="Próxima" className="text-sidebar-foreground hover:text-primary transition-colors active:scale-90">
          <SkipForward size={20} fill="currentColor" />
        </button>
      </div>

      {/* Volume */}
      <div className="flex items-center gap-2 px-1">
        <Volume2 size={13} className="text-muted-foreground shrink-0" />
        <SeekBar
          progress={volume / 100}
          onSeek={(f) => onVolumeChange(Math.round(f * 100))}
          trackHeight="thin"
          showThumb={false}
          className="flex-1"
        />
      </div>
    </div>
  );
};

export default SidebarPlayer;
