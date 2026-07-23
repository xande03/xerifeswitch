import { useEffect, useRef, useState, ReactNode } from "react";
import { RefreshCw, ArrowDown, ArrowUp } from "lucide-react";

interface PullToRefreshProps {
  onRefresh: () => void | Promise<any>;
  children: ReactNode;
  threshold?: number;
  maxPull?: number;
  disabled?: boolean;
  className?: string;
  /**
   * Skeleton nodes rendered on top of the content while refreshing.
   * Reduz a sensação de lentidão e evita "salto" de layout.
   */
  skeleton?: ReactNode;
}

/**
 * Pull-to-refresh bidirecional:
 *  - Swipe DOWN (puxar para baixo) quando o scroll está no topo
 *  - Swipe UP (arrastar para cima) quando o scroll está no fundo
 * Ambos os gestos disparam a mesma atualização (vídeos mais recentes).
 */
export default function PullToRefresh({
  onRefresh,
  children,
  threshold = 70,
  maxPull = 120,
  disabled = false,
  className = "",
  skeleton,
}: PullToRefreshProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pull, setPull] = useState(0);           // >0 = puxando para baixo, <0 = arrastando para cima
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const activeRef = useRef<"down" | "up" | null>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || disabled) return;

    function findScroller(node: HTMLElement | null): HTMLElement {
      let n: HTMLElement | null = node?.parentElement ?? null;
      while (n && n !== document.body) {
        const s = getComputedStyle(n);
        if (/(auto|scroll|overlay)/.test(s.overflowY) && n.scrollHeight > n.clientHeight) return n;
        n = n.parentElement;
      }
      return (document.scrollingElement as HTMLElement) || document.documentElement;
    }
    scrollerRef.current = findScroller(el);

    const isAtTop = () => (scrollerRef.current?.scrollTop ?? 0) <= 0;
    const isAtBottom = () => {
      const s = scrollerRef.current;
      if (!s) return false;
      return s.scrollTop + s.clientHeight >= s.scrollHeight - 2;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (refreshing) return;
      startY.current = e.touches[0].clientY;
      activeRef.current = null;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (startY.current == null || refreshing) return;
      const dy = e.touches[0].clientY - startY.current;

      // Determina a direção assim que o usuário move o dedo minimamente
      if (activeRef.current == null) {
        if (dy > 6 && isAtTop()) activeRef.current = "down";
        else if (dy < -6 && isAtBottom()) activeRef.current = "up";
        else return;
      }

      if (activeRef.current === "down") {
        if (!isAtTop() || dy <= 0) { setPull(0); return; }
        const eased = Math.min(maxPull, dy * 0.5);
        setPull(eased);
        if (dy > 10) { try { e.preventDefault(); } catch {} }
      } else if (activeRef.current === "up") {
        if (!isAtBottom() || dy >= 0) { setPull(0); return; }
        const eased = Math.max(-maxPull, dy * 0.5);
        setPull(eased);
        if (dy < -10) { try { e.preventDefault(); } catch {} }
      }
    };
    const onTouchEnd = async () => {
      if (!activeRef.current) { setPull(0); startY.current = null; return; }
      const dir = activeRef.current;
      const shouldRefresh = Math.abs(pull) >= threshold;
      activeRef.current = null;
      startY.current = null;
      if (shouldRefresh) {
        setRefreshing(true);
        setPull(dir === "down" ? threshold : -threshold);
        try { await onRefresh(); } catch {}
        setTimeout(() => {
          setRefreshing(false);
          setPull(0);
        }, 450);
      } else {
        setPull(0);
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [disabled, refreshing, pull, threshold, maxPull, onRefresh]);

  const progress = Math.min(1, Math.abs(pull) / threshold);
  const showIndicator = Math.abs(pull) > 4 || refreshing;
  const direction: "down" | "up" = pull < 0 ? "up" : "down";
  const DirIcon = direction === "up" ? ArrowUp : ArrowDown;

  return (
    <div ref={containerRef} className={className} style={{ position: "relative" }}>
      {/* Indicador de pull — aparece no topo (down) ou no fundo (up) */}
      <div
        aria-hidden={!showIndicator}
        style={{
          position: direction === "up" ? "fixed" : "absolute",
          top: direction === "down" ? 0 : undefined,
          bottom: direction === "up" ? 12 : undefined,
          left: "50%",
          transform:
            direction === "down"
              ? `translate(-50%, ${Math.max(0, pull - 40)}px)`
              : `translate(-50%, ${Math.min(0, pull + 40)}px)`,
          opacity: showIndicator ? 1 : 0,
          transition: refreshing || pull === 0 ? "transform 250ms ease, opacity 200ms" : "opacity 120ms",
          zIndex: 40,
          pointerEvents: "none",
        }}
      >
        <div
          className="flex items-center justify-center w-10 h-10 rounded-full bg-background/90 backdrop-blur border border-border/60 shadow-md text-primary"
          style={{ transform: refreshing ? undefined : `rotate(${progress * 360}deg)` }}
        >
          {refreshing ? (
            <RefreshCw size={18} className="animate-spin" />
          ) : progress >= 1 ? (
            <RefreshCw size={18} />
          ) : (
            <DirIcon size={18} />
          )}
        </div>
      </div>

      {/* Skeleton progressivo — sobrepõe brevemente o conteúdo enquanto o refresh acontece,
          evitando que o usuário veja layout estagnado e reduzindo salto ao repopular. */}
      {refreshing && skeleton && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-30 px-4 pt-3"
          style={{ animation: "pulse 1.5s ease-in-out infinite" }}
        >
          <div className="rounded-2xl bg-background/70 backdrop-blur-sm p-2">
            {skeleton}
          </div>
        </div>
      )}

      <div
        style={{
          transform: `translateY(${pull}px)`,
          transition: refreshing || pull === 0 ? "transform 250ms ease" : "none",
          willChange: "transform",
        }}
      >
        {children}
      </div>
    </div>
  );
}
