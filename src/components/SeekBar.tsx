/**
 * SeekBar — barra de progresso com suporte completo a drag no mobile (touch) e desktop (mouse).
 *
 * Comportamento:
 * - Durante o drag: a barra segue o dedo/cursor em tempo real.
 * - Ao soltar: a barra permanece onde parou E dispara onSeek(fraction) para sincronizar a reprodução.
 * - O player externo NÃO deve sobrescrever a posição durante o drag (controlado pelo flag isSeeking).
 */

import { useRef, useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface SeekBarProps {
  /** Progresso atual da reprodução: 0–1 */
  progress: number;
  /** Chamado quando o usuário SOLTA o slider — fraction 0–1 */
  onSeek: (fraction: number) => void;
  /** Altura da track */
  trackHeight?: "thin" | "normal" | "thick";
  className?: string;
  showThumb?: boolean;
  /** Duração total em segundos para exibir no tooltip */
  duration?: number;
}

export function SeekBar({
  progress,
  onSeek,
  trackHeight = "normal",
  className,
  showThumb = true,
  duration = 0,
}: SeekBarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragValue, setDragValue] = useState(0);
  const [seekLock, setSeekLock] = useState<number | null>(null);
  const isDraggingRef = useRef(false);
  const seekTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const suppressClickRef = useRef(false);
  const suppressClickTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const heightClass = {
    thin: "h-1",
    normal: "h-[6px]",
    thick: "h-2",
  }[trackHeight];

  /** Converte segundos para formato MM:SS */
  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  /** Calcula a fração (0–1) a partir da posição horizontal do evento */
  const getFraction = useCallback((clientX: number): number => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  const suppressSyntheticClick = useCallback(() => {
    suppressClickRef.current = true;
    if (suppressClickTimeoutRef.current) clearTimeout(suppressClickTimeoutRef.current);
    suppressClickTimeoutRef.current = setTimeout(() => {
      suppressClickRef.current = false;
    }, 350);
  }, []);

  const commitSeek = useCallback((fraction: number) => {
    const clamped = Math.max(0, Math.min(1, fraction));
    isDraggingRef.current = false;
    setIsDragging(false);
    setDragValue(clamped);
    setSeekLock(clamped);
    if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
    // Mantém o valor local por mais tempo para players que demoram a refletir o seek
    seekTimeoutRef.current = setTimeout(() => {
      setSeekLock(null);
    }, 1200);
    onSeek(clamped);
  }, [onSeek]);

  // ─── Distância vertical máxima aceita durante o drag ─────────────────────
  // Se o ponteiro/dedo se afasta mais do que isto do eixo Y da barra, o drag
  // é cancelado (sem commit) — evita que gestos verticais movam o slider.
  const MAX_VERTICAL_DRIFT = 80;

  /** Distância vertical entre o ponteiro e o centro da track. */
  const getVerticalOffset = useCallback((clientY: number): number => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    const centerY = rect.top + rect.height / 2;
    return Math.abs(clientY - centerY);
  }, []);

  /** Cancela drag em andamento sem chamar onSeek. */
  const cancelDrag = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);
    setDragValue(progress);
    setSeekLock(null);
    suppressSyntheticClick();
  }, [progress, suppressSyntheticClick]);

  // ─── Mouse handlers ───────────────────────────────────────────────────────

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDraggingRef.current = true;
      setIsDragging(true);
      if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
      setSeekLock(null);
      setDragValue(getFraction(e.clientX));
    },
    [getFraction]
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      // Cancela se o cursor se afastou demais verticalmente da barra
      if (getVerticalOffset(e.clientY) > MAX_VERTICAL_DRIFT) {
        cancelDrag();
        return;
      }
      setDragValue(getFraction(e.clientX));
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      suppressSyntheticClick();
      // Se soltou fora da faixa vertical válida, descarta o seek
      if (getVerticalOffset(e.clientY) > MAX_VERTICAL_DRIFT) {
        cancelDrag();
        return;
      }
      commitSeek(getFraction(e.clientX));
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [getFraction, commitSeek, suppressSyntheticClick, getVerticalOffset, cancelDrag]);

  // ─── Touch handlers ───────────────────────────────────────────────────────

  // Touch needs a horizontal dead-zone so vertical scrolls aren't hijacked.
  // `startedOnBar` garante que só ativamos drag se o touch começou na própria
  // SeekBar — evita que gestos verticais em outros elementos (ex.: capa da
  // música) sejam interpretados como seek.
  const touchStartRef = useRef<{ x: number; y: number; activated: boolean; startedOnBar: boolean }>({ x: 0, y: 0, activated: false, startedOnBar: false });

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, activated: false, startedOnBar: true };
    },
    []
  );


  useEffect(() => {
    const handleTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      const ts = touchStartRef.current;

      // Só considera drag se o touch começou sobre a própria barra.
      if (!ts.startedOnBar) return;

      if (!ts.activated) {
        const dx = Math.abs(t.clientX - ts.x);
        const dy = Math.abs(t.clientY - ts.y);
        if (dx < 8 && dy < 8) return;
        if (dy >= dx) {
          // Gesto vertical — desarma e libera para scroll nativo
          touchStartRef.current = { x: 0, y: 0, activated: false, startedOnBar: false };
          return;
        }
        // Activate drag
        ts.activated = true;
        isDraggingRef.current = true;
        setIsDragging(true);
        if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
        setSeekLock(null);
      }

      if (!isDraggingRef.current) return;

      // Trava: se o dedo se afastou verticalmente da barra, cancela o drag
      if (getVerticalOffset(t.clientY) > MAX_VERTICAL_DRIFT) {
        cancelDrag();
        touchStartRef.current = { x: 0, y: 0, activated: false, startedOnBar: false };
        return;
      }

      e.preventDefault();
      setDragValue(getFraction(t.clientX));
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!isDraggingRef.current) {
        touchStartRef.current = { x: 0, y: 0, activated: false, startedOnBar: false };
        return;
      }
      suppressSyntheticClick();
      const endTouch = e.changedTouches[0];
      // Se soltou fora da faixa vertical válida, descarta o seek
      if (endTouch && getVerticalOffset(endTouch.clientY) > MAX_VERTICAL_DRIFT) {
        cancelDrag();
      } else if (endTouch) {
        commitSeek(getFraction(endTouch.clientX));
      }
      touchStartRef.current = { x: 0, y: 0, activated: false, startedOnBar: false };
    };



    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd);
    window.addEventListener("touchcancel", handleTouchEnd);
    return () => {
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [getFraction, commitSeek, suppressSyntheticClick, getVerticalOffset, cancelDrag]);


  useEffect(() => {
    return () => {
      if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
      if (suppressClickTimeoutRef.current) clearTimeout(suppressClickTimeoutRef.current);
    };
  }, []);

  // Clique simples (sem drag)
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!isDraggingRef.current && !suppressClickRef.current) {
        commitSeek(getFraction(e.clientX));
      }
    },
    [getFraction, commitSeek]
  );

  // Valor visual atual: prioriza dragValue durante o drag,
  // dps usa o seekLock para manter parado enquanto o player carrega,
  // ou finalmente volta ao progress normal do player
  const displayValue = isDragging ? dragValue : (seekLock !== null ? seekLock : progress);

  return (
    <div
      ref={trackRef}
      className={cn(
        "relative w-full rounded-full bg-muted/60 cursor-pointer group select-none touch-none",
        heightClass,
        // Área de toque levemente expandida (menor que antes) para reduzir toques acidentais
        "before:absolute before:inset-x-0 before:-top-2 before:-bottom-2 before:content-['']",
        "active:outline-none",
        className
      )}

      style={{ WebkitTapHighlightColor: "transparent", userSelect: "none" }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onTouchStart={handleTouchStart}
    >
      {/* Background Track (already exists in the div classes) */}

      {/* Tooltip de tempo durante o drag */}
      {isDragging && duration > 0 && (
        <div
          className={cn(
            "absolute -top-10 -translate-x-1/2 px-2 py-1 rounded bg-black/80 text-white text-xs font-medium tabular-nums shadow-xl border border-white/10 z-50",
            "after:content-[''] after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:border-4 after:border-transparent after:border-t-black/80"
          )}
          style={{ left: `${displayValue * 100}%` }}
        >
          {formatTime(displayValue * duration)}
        </div>
      )}

      {/* Progress Fill */}
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-primary transition-none pointer-events-none"
        style={{ width: `${displayValue * 100}%` }}
      />

      {/* Thumb (bolinha) */}
      {showThumb && (
        <div
          className={cn(
            "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full bg-primary shadow-lg",
            "w-5 h-5 border-2 border-white/80",
            isDragging
              ? "scale-125 opacity-100"
              : "scale-100 opacity-0 group-hover:opacity-100",
            "transition-all duration-150 pointer-events-none"
          )}
          style={{ left: `${displayValue * 100}%` }}
        />
      )}
    </div>
  );
}

export default SeekBar;
