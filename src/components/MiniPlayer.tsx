import { useRef, useState } from "react";
import { Play, Pause, SkipForward, SkipBack, X, ChevronUp } from "lucide-react";
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

/**
 * Barra de reprodução enxuta (mobile).
 *
 * Parte 56 — o toque em play/pausa passou a ser resolvido no `pointerup`
 * (e não no `click`): o rodapé desliza (esconde/mostra conforme o scroll), e
 * num elemento que se move entre o `pointerdown` e o `pointerup` o navegador
 * pode não emitir o `click` — o toque "sumia". Além disso, cada controle tem
 * área de toque de 44 px (recomendação Apple/Google) para o play/pausa não ser
 * confundido com o botão de expandir ao lado.
 */
const MiniPlayer = ({ song, isPlaying, currentTime, duration, onTogglePlay, onNext, onPrev, onExpand, onDismiss }: MiniPlayerProps) => {
  const progress = duration > 0 ? currentTime / duration : 0;
  const [showDismiss, setShowDismiss] = useState(false);
  const pressRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const handledRef = useRef(false);

  // Toque: dispara no pointerup quando foi um toque curto e sem arrasto.
  const handlePointerDown = (e: React.PointerEvent) => {
    pressRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  };
  const handlePointerUp = (e: React.PointerEvent) => {
    const p = pressRef.current;
    pressRef.current = null;
    if (!p) return;
    e.stopPropagation();
    const moved = Math.hypot(e.clientX - p.x, e.clientY - p.y);
    if (moved > 12) return; // virou arrasto (scroll da tela)
    if (Date.now() - p.t > 900) return; // toque longo
    handledRef.current = true;
    window.setTimeout(() => { handledRef.current = false; }, 400);
    onTogglePlay();
  };
  const handlePointerCancel = () => { pressRef.current = null; };
  // Teclado (Enter/Espaço) chega como click com detail 0; clique "extra" de
  // ponteiro logo após o pointerup é ignorado para não alternar duas vezes.
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (handledRef.current) return;
    if (e.detail !== 0) return;
    onTogglePlay();
  };

  return (
    // z-[60] garante que fica acima do overlay do álbum (z-50) e do menu de 3 pontinhos
    <div data-debug="miniplayer" data-testid="mini-player" className="relative overflow-hidden bg-card/98 backdrop-blur-md animate-slide-up flex-shrink-0 border-t border-border/20 z-[60]">
      {/* Progress */}
      <div className="h-[2px] bg-muted">
        <div className="h-full bg-primary transition-all duration-200" style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="flex items-center gap-2 p-1.5 pr-2">
        {/* Thumbnail — toque para mostrar/esconder botão X */}
        <button
          onClick={() => setShowDismiss((v) => !v)}
          className="relative flex-shrink-0 w-11 h-11 rounded-lg overflow-hidden group touch-manipulation"
          aria-label="Minimizar player"
        >
          <BlurImage src={hdThumbnail(song.cover)} alt={song.album} className="w-full h-full object-cover" />
          {/* Botão X sobreposto na foto */}
          {showDismiss && onDismiss && (
            <div
              className="absolute inset-0 z-20 bg-black/60 flex items-center justify-center"
              onClick={(e) => { e.stopPropagation(); onDismiss(); }}
            >
              <X size={20} className="text-white" />
            </div>
          )}
        </button>

        <button data-testid="mini-expand" onClick={onExpand} className="tap-target relative flex items-center gap-2 flex-1 min-w-0 text-left touch-manipulation">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate text-foreground">{song.title}</p>
            <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
          </div>
          <ChevronUp size={16} className="flex-shrink-0 text-muted-foreground/70" aria-hidden="true" />
        </button>

        <div className="flex items-center gap-0.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          {onPrev && (
            <button
              data-testid="mini-prev"
              aria-label="Faixa anterior"
              onClick={(e) => { e.stopPropagation(); onPrev(); }}
              className="w-10 h-10 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground active:scale-95 transition-transform touch-manipulation"
            >
              <SkipBack size={18} />
            </button>
          )}
          <button
            data-testid="mini-play-pause"
            aria-label={isPlaying ? "Pausar" : "Reproduzir"}
            aria-pressed={isPlaying}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onClick={handleClick}
            className="w-11 h-11 rounded-full bg-foreground flex items-center justify-center text-background hover:scale-105 active:scale-95 transition-transform touch-manipulation"
          >
            {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
          </button>
          <button
            data-testid="mini-next"
            aria-label="Próxima faixa"
            onClick={(e) => { e.stopPropagation(); onNext(); }}
            className="w-10 h-10 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground active:scale-95 transition-transform touch-manipulation"
          >
            <SkipForward size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default MiniPlayer;
