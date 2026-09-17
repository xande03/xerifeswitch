import { useState, useRef, useCallback, useEffect } from "react";
import { X, Play, Pause, SkipForward, SkipBack, Maximize2 } from "lucide-react";
import { Song } from "@/data/mockSongs";

interface FloatingPiPPlayerProps {
  song: Song;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  onExpand: () => void;
  onClose: () => void;
}

const FloatingPiPPlayer = ({
  song, isPlaying, currentTime, duration,
  onTogglePlay, onNext, onPrev, onExpand, onClose,
}: FloatingPiPPlayerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 16, y: Math.max(80, parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sat') || '0') + 60) });
  const [dragging, setDragging] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const dragOffset = useRef({ x: 0, y: 0 });
  const controlsTimer = useRef<ReturnType<typeof setTimeout>>();
  const progress = duration > 0 ? currentTime / duration : 0;
  const videoId = song.youtubeId;

  // Auto-hide controls after 3s
  useEffect(() => {
    if (showControls) {
      controlsTimer.current = setTimeout(() => setShowControls(false), 3000);
    }
    return () => clearTimeout(controlsTimer.current);
  }, [showControls]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    setDragging(true);
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    const maxX = window.innerWidth - (containerRef.current?.offsetWidth || 280);
    const maxY = window.innerHeight - (containerRef.current?.offsetHeight || 160);
    setPosition({
      x: Math.max(0, Math.min(maxX, e.clientX - dragOffset.current.x)),
      y: Math.max(0, Math.min(maxY, e.clientY - dragOffset.current.y)),
    });
  }, [dragging]);

  const handlePointerUp = useCallback(() => setDragging(false), []);

  // Snap to edges on release
  useEffect(() => {
    if (dragging) return;
    const w = containerRef.current?.offsetWidth || 280;
    const midX = position.x + w / 2;
    const screenMid = window.innerWidth / 2;
    setPosition((p) => ({
      ...p,
      x: midX < screenMid ? 8 : window.innerWidth - w - 8,
    }));
  }, [dragging]);

  const toggleControlsVisibility = useCallback(() => {
    setShowControls(prev => !prev);
  }, []);

  return (
    <div
      ref={containerRef}
      className="fixed z-[100] rounded-2xl bg-card/95 backdrop-blur-xl shadow-2xl border border-border/50 overflow-hidden select-none touch-none"
      style={{
        left: position.x,
        top: position.y,
        width: "min(280px, calc(100vw - 16px))",
        transition: dragging ? "none" : "left 0.3s ease, top 0.1s ease",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Video embed */}
      {videoId ? (
        <div className="relative w-full aspect-video bg-black overflow-hidden" onClick={toggleControlsVisibility}>
          {/* Overflow masking sem zoom: o iframe é 128px mais alto e sobe
              64px — as faixas internas de branding do YouTube (título/logo/
              "Mais vídeos") ficam FORA do retângulo visível (overflow hidden),
              SEM cortar/zoarar o vídeo 16:9 dentro de 16:9 */}
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1&controls=0&modestbranding=1&rel=0&iv_load_policy=3&enablejsapi=0&mute=1`}
            className="w-full pointer-events-none absolute left-0"
            style={{ top: "-72px", height: "calc(100% + 144px)" }}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen={false}
            title={song.title}
          />

          {/* Overlay controls */}
          <div className={`absolute inset-0 bg-black/40 flex flex-col justify-between transition-opacity duration-200 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            {/* Top bar */}
            <div className="flex items-center justify-between px-2 pt-1.5">
              <p className="text-[10px] text-white font-medium truncate flex-1 mr-2">{song.title}</p>
              <div className="flex gap-1">
                <button onClick={onExpand} className="p-1 text-white/80 hover:text-white active:scale-90 transition-all" title="Expandir">
                  <Maximize2 size={12} />
                </button>
                <button onClick={onClose} className="p-1 text-white/80 hover:text-white active:scale-90 transition-all" title="Fechar">
                  <X size={12} />
                </button>
              </div>
            </div>

            {/* Center controls */}
            <div className="flex items-center justify-center gap-4">
              <button onClick={onPrev} className="p-1 text-white/80 hover:text-white active:scale-90 transition-all">
                <SkipBack size={16} fill="currentColor" />
              </button>
              <button
                onClick={onTogglePlay}
                className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white active:scale-90 transition-transform"
              >
                {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
              </button>
              <button onClick={onNext} className="p-1 text-white/80 hover:text-white active:scale-90 transition-all">
                <SkipForward size={16} fill="currentColor" />
              </button>
            </div>

            {/* Progress bar */}
            <div className="h-[3px] bg-white/20 mx-1 mb-1 rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${progress * 100}%` }} />
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Fallback: audio-only with thumbnail */}
          <div className="h-[2px] bg-muted">
            <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress * 100}%` }} />
          </div>
          <div className="flex items-center gap-2.5 p-2.5">
            <img
              src={song.cover}
              alt={song.album}
              className="w-11 h-11 rounded-lg object-cover flex-shrink-0 shadow-md"
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-foreground truncate leading-tight">{song.title}</p>
              <p className="text-[10px] text-muted-foreground truncate">{song.artist}</p>
            </div>
          </div>
          <div className="flex items-center justify-between px-2 pb-2">
            <button onClick={onPrev} className="p-1.5 text-muted-foreground hover:text-foreground active:scale-90 transition-all">
              <SkipBack size={14} fill="currentColor" />
            </button>
            <button
              onClick={onTogglePlay}
              className="w-8 h-8 rounded-full bg-foreground flex items-center justify-center text-background active:scale-90 transition-transform"
            >
              {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
            </button>
            <button onClick={onNext} className="p-1.5 text-muted-foreground hover:text-foreground active:scale-90 transition-all">
              <SkipForward size={14} fill="currentColor" />
            </button>
            <button onClick={onExpand} className="p-1.5 text-muted-foreground hover:text-foreground active:scale-90 transition-all" title="Expandir">
              <Maximize2 size={13} />
            </button>
            <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground active:scale-90 transition-all" title="Fechar PiP">
              <X size={13} />
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default FloatingPiPPlayer;
