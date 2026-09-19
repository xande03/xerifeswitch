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

/**
 * Player de vídeo MINIMIZADO (janela flutuante). O vídeo aparece LIMPO:
 * nenhum botão, título, barra de progresso ou indicativo sobre a imagem —
 * apenas o quadro do vídeo (com a máscara anti-branding do YouTube).
 *
 * Interações invisíveis:
 *  - Arrastar → move a janela (com snap às bordas)
 *  - Clique simples (sem arrastar) → reabre o player completo (expandido),
 *    de onde o usuário acessa todos os controles e o caminho de fechar
 *
 * O fallback de áudio (sem youtubeId) mantém seus controles próprios.
 */
const FloatingPiPPlayer = ({
  song, isPlaying, currentTime, duration,
  onTogglePlay, onNext, onPrev, onExpand, onClose,
}: FloatingPiPPlayerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 16, y: Math.max(80, parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sat') || '0') + 60) });
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  /** Ponto inicial do gesto — distingue clique (reabre) de arrasto (move) */
  const dragStartRef = useRef({ x: 0, y: 0 });
  const progress = duration > 0 ? currentTime / duration : 0;
  const videoId = song.youtubeId;

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    setDragging(true);
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
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
      {/* Video embed — LIMPO: só o vídeo, sem overlay/botões/indicativos.
          Clique simples reabre o player completo; arrastar move a janela. */}
      {videoId ? (
        <div
          className="relative w-full aspect-video bg-black overflow-hidden cursor-pointer"
          onClick={(e) => {
            // Clique "parado" (≤6px entre pressão e soltura) reabre o player;
            // se o ponteiro andou mais que isso, foi um arrasto — só moveu.
            const dist = Math.hypot(e.clientX - dragStartRef.current.x, e.clientY - dragStartRef.current.y);
            if (!(dist > 6)) onExpand(); // NaN-safe: só bloqueia se PROVADO arrasto
          }}
        >
          {/* Overflow masking sem zoom (mesma geometria do player principal):
              o iframe é 240px mais alto e sobe 120px — as faixas internas de
              branding do YouTube (título/logo/"Mais vídeos") ficam FORA do
              retângulo visível (overflow hidden), SEM cortar/zoar o vídeo 16:9
              dentro de 16:9. loop+playlist reinicia o preview ao terminar: a
              endscreen ("Mais vídeos") nunca chega a aparecer. pointer-events
              none: nenhum toque chega ao YouTube. */}
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1&controls=0&modestbranding=1&rel=0&iv_load_policy=3&enablejsapi=0&mute=1&loop=1&playlist=${videoId}`}
            className="w-full pointer-events-none absolute left-0"
            style={{ top: "-120px", height: "calc(100% + 240px)" }}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen={false}
            title={song.title}
          />
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
