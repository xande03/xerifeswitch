import { useState } from "react";
import { Play, Pause, SkipForward, SkipBack, X } from "lucide-react";
import { Song } from "@/data/mockSongs";
import { hdThumbnail } from "@/lib/utils";
import BlurImage from "@/components/BlurImage";

interface MiniPlayerProps {
  song: Song;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev?: () => void;
  onExpand: () => void;
  onDismiss?: () => void;
}

const MiniPlayer = ({ song, isPlaying, currentTime, duration, onTogglePlay, onNext, onPrev, onExpand, onDismiss }: MiniPlayerProps) => {
  const progress = duration > 0 ? currentTime / duration : 0;
  const [showDismiss, setShowDismiss] = useState(false);

  return (
    // z-[60] garante que fica acima do overlay do álbum (z-50) e do menu de 3 pontinhos
    <div data-debug="miniplayer" className="relative overflow-hidden bg-card/98 backdrop-blur-md animate-slide-up flex-shrink-0 border-t border-border/20 z-[60]">
      {/* Progress */}
      <div className="h-[2px] bg-muted">
        <div className="h-full bg-primary transition-all duration-200" style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="flex items-center gap-3 p-2 pr-3">
        {/* Thumbnail — toque para mostrar/esconder botão X */}
        <button
          onClick={() => setShowDismiss((v) => !v)}
          className="relative flex-shrink-0 w-11 h-11 rounded-lg overflow-hidden group"
          aria-label="Minimizar player"
        >
          <BlurImage src={hdThumbnail(song.cover)} alt={song.album} className="w-full h-full object-cover" />
          {/* Botão X sobreposto na foto */}
          {showDismiss && onDismiss && (
            <div
              className="absolute inset-0 bg-black/60 flex items-center justify-center"
              onClick={(e) => { e.stopPropagation(); onDismiss(); }}
            >
              <X size={20} className="text-white" />
            </div>
          )}
        </button>

        <button onClick={onExpand} className="flex items-center gap-3 flex-1 min-w-0">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate text-foreground">{song.title}</p>
            <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
          </div>
        </button>
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {onPrev && (
            <button onClick={(e) => { e.stopPropagation(); onPrev(); }} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
              <SkipBack size={18} />
            </button>
          )}
          <button onClick={(e) => { e.stopPropagation(); onTogglePlay(); }} className="w-10 h-10 rounded-full bg-foreground flex items-center justify-center text-background hover:scale-105 active:scale-95 transition-transform">
            {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
          </button>
          <button onClick={(e) => { e.stopPropagation(); onNext(); }} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
            <SkipForward size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default MiniPlayer;
