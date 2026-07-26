import { useState } from "react";
import { Play, Pause, SkipBack, SkipForward, Volume2, Music, Heart, Mic2, Video, Download, Share2 } from "lucide-react";
import { Song, formatDuration } from "@/data/mockSongs";
import { hdThumbnail } from "@/lib/utils";
import SeekBar from "@/components/SeekBar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Check } from "lucide-react";

export type SidebarPlayerModule = "music" | "video" | "podcast";

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
  isLiked?: boolean;
  onLike?: () => void;
  onLyrics?: () => void;
  onVideo?: () => void;
  onDownload?: () => void;
  onShare?: () => void;
  /** Modo atual do player: capa (audio), letra ou vídeo */
  playerMode?: "audio" | "lyrics" | "video";
  /** Módulo/sessão atual (music, video, podcast) */
  module?: SidebarPlayerModule;
  hasLyrics?: boolean;
  hasVideo?: boolean;
}


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
  collapsed = false,
  isLiked = false,
  onLike,
  onLyrics,
  onVideo,
  onDownload,
  onShare,
  playerMode = "audio",
  module = "music",
  hasLyrics = true,
  hasVideo = true,
}: SidebarPlayerProps) => {
  const [flash, setFlash] = useState<string | null>(null);
  const runWithFeedback = (label: string, fn?: () => void) => {
    if (!fn) return;
    fn();
    setFlash(label);
    window.setTimeout(() => setFlash((f) => (f === label ? null : f)), 1400);
  };
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
    <div className="px-3 pb-4 pt-3 space-y-2.5">
      {/* Capa do álbum */}
      <button
        onClick={onExpand}
        className="block mx-auto w-full max-w-[190px] rounded-2xl overflow-hidden ring-1 ring-border shadow-lg group relative"
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
      <div className="flex items-center justify-center gap-1 bg-card/40 backdrop-blur-xl border border-border rounded-2xl p-1 shadow-lg mx-auto w-fit">
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <button
              onClick={onLike}
              aria-label={isLiked ? "Remover dos favoritos" : "Adicionar aos favoritos"}
              aria-pressed={isLiked}
              className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-90 ${
                isLiked ? "bg-primary text-primary-foreground" : "bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Heart size={15} fill={isLiked ? "currentColor" : "none"} strokeWidth={isLiked ? 0 : 2.4} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs font-semibold">Favorito</TooltipContent>
        </Tooltip>
        {[
          module === "music" && hasLyrics
            ? {
                icon: Mic2,
                label: playerMode === "lyrics" ? "Fechar letra" : "Letra",
                onClick: onLyrics,
                active: playerMode === "lyrics",
                toggle: true,
              }
            : null,
          hasVideo
            ? {
                icon: Video,
                label: playerMode === "video" ? "Fechar vídeo" : "Vídeo",
                onClick: onVideo,
                active: playerMode === "video",
                toggle: true,
              }
            : null,
          { icon: Download, label: "Baixar música", onClick: onDownload, active: false, toggle: false },
          { icon: Share2, label: "Compartilhar", onClick: onShare, active: false, toggle: false },
        ]
          .filter((b): b is { icon: typeof Mic2; label: string; onClick?: () => void; active: boolean; toggle: boolean } => !!b && !!b.onClick)
          .map((b) => {
            const done = flash === b.label;
            return (
              <Tooltip key={b.label} delayDuration={200}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => (b.toggle ? b.onClick?.() : runWithFeedback(b.label, b.onClick))}
                    aria-label={b.label}
                    aria-pressed={b.toggle ? b.active : undefined}
                    className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      b.active || done
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary/30 text-muted-foreground hover:bg-primary/20 hover:text-primary"
                    }`}
                  >
                    {done ? <Check size={15} strokeWidth={2.6} /> : <b.icon size={15} strokeWidth={2.2} />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs font-semibold">{b.label}</TooltipContent>
              </Tooltip>
            );
          })}
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
      <div className="flex items-center gap-2 px-1 pt-0.5">
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
