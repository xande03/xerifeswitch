import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Shuffle, Repeat, Maximize2 } from "lucide-react";
import { Song, formatDuration } from "@/data/mockSongs";
import { hdThumbnail } from "@/lib/utils";
import SeekBar from "@/components/SeekBar";

interface DesktopPlayerProps {
  song: Song;
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
}

const DesktopPlayer = ({
  song, isPlaying, currentTime, duration, volume,
  onTogglePlay, onNext, onPrev, onExpand, onSeek, onVolumeChange,
  isShuffled, onShuffle,
}: DesktopPlayerProps) => {
  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <div className="hidden lg:flex items-center h-[72px] bg-card border-t border-border px-4 gap-4 flex-shrink-0 animate-fade-in">
      {/* Song info */}
      <button onClick={onExpand} className="flex items-center gap-3 min-w-[200px] max-w-[280px] group">
        <img
          src={hdThumbnail(song.cover)}
          alt={song.album}
          className="w-12 h-12 rounded-lg object-cover shadow-md group-hover:shadow-lg transition-shadow"
        />
        <div className="min-w-0 text-left">
          <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">{song.title}</p>
          <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
        </div>
      </button>

      {/* Center controls + progress */}
      <div className="flex-1 flex flex-col items-center gap-1 max-w-[600px] mx-auto">
        {/* Transport */}
        <div className="flex items-center gap-3">
          <button onClick={onShuffle} className={`p-1.5 transition-colors active:scale-90 ${isShuffled ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
            <Shuffle size={16} />
          </button>
          <button onClick={onPrev} className="p-1.5 text-foreground hover:text-primary transition-colors active:scale-90">
            <SkipBack size={18} fill="currentColor" />
          </button>
          <button
            onClick={onTogglePlay}
            className="w-9 h-9 rounded-full bg-foreground flex items-center justify-center text-background hover:scale-110 active:scale-95 transition-transform"
          >
            {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
          </button>
          <button onClick={onNext} className="p-1.5 text-foreground hover:text-primary transition-colors active:scale-90">
            <SkipForward size={18} fill="currentColor" />
          </button>
          <button className="p-1.5 text-muted-foreground hover:text-foreground transition-colors active:scale-90">
            <Repeat size={16} />
          </button>
        </div>

        {/* Progress bar — SeekBar com drag completo */}
        <div className="w-full flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground font-mono w-10 text-right">{formatDuration(currentTime)}</span>
          <SeekBar
            progress={progress}
            onSeek={onSeek}
            trackHeight="thin"
            showThumb={true}
            className="flex-1"
            duration={duration}
          />
          <span className="text-[10px] text-muted-foreground font-mono w-10">{formatDuration(duration)}</span>
        </div>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-2 min-w-[160px] justify-end">
        <button
          onClick={() => onVolumeChange(volume > 0 ? 0 : 70)}
          className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          {volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        <SeekBar
          progress={volume / 100}
          onSeek={(f) => onVolumeChange(Math.round(f * 100))}
          trackHeight="thin"
          showThumb={false}
          className="w-20"
        />
        <button onClick={onExpand} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors" title="Expandir">
          <Maximize2 size={16} />
        </button>
      </div>
    </div>
  );
};

export default DesktopPlayer;
