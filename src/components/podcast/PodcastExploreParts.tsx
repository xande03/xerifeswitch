/**
 * Componentes EXCLUSIVOS do Explorar de Xerife Podcasts.
 * Não reutilizar em Xerife Vídeos / Music para preservar identidade visual.
 * Assinatura visual: acento lilás (primary do módulo podcast), micro-onda "rádio"
 * no rail horizontal, cantos assimétricos nos tiles, tipografia editorial.
 */
import React, { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/* Rail horizontal com raia decorativa "on-air" na base — exclusivo do podcast */
export const PodcastRail: React.FC<{ children: React.ReactNode; className?: string; label?: string }> = ({
  children,
  className,
  label,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  const onDown = useCallback((e: React.MouseEvent) => {
    if (!ref.current) return;
    setDrag(true);
    startX.current = e.pageX - ref.current.offsetLeft;
    scrollLeft.current = ref.current.scrollLeft;
  }, []);
  const onMove = useCallback((e: React.MouseEvent) => {
    if (!drag || !ref.current) return;
    e.preventDefault();
    const x = e.pageX - ref.current.offsetLeft;
    ref.current.scrollLeft = scrollLeft.current - (x - startX.current) * 1.5;
  }, [drag]);
  const onUp = useCallback(() => setDrag(false), []);

  return (
    <div className="relative">
      <div
        ref={ref}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={onUp}
        role="list"
        aria-label={label ?? "Podcasts em destaque"}
        data-podcast-rail="1"
        className={cn(
          "overflow-x-auto scrollbar-hide select-none cursor-grab",
          drag && "cursor-grabbing",
          className,
        )}
      >
        {children}
      </div>
      {/* raia decorativa tipo waveform de rádio */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-1 left-3 right-3 h-[3px] opacity-40"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, hsl(var(--primary)) 0 3px, transparent 3px 8px)",
          maskImage: "linear-gradient(90deg, transparent, black 15%, black 85%, transparent)",
        }}
      />
    </div>
  );
};

/* Tile editorial exclusivo: canto superior-esquerdo com corte "recorte de revista" */
export const PodcastGenreTile: React.FC<{
  label: string;
  icon: string;
  active?: boolean;
  onClick: () => void;
  index?: number;
}> = ({ label, icon, active, onClick, index = 0 }) => (
  <button
    onClick={onClick}
    data-podcast-tile="1"
    className={cn(
      "relative h-16 sm:h-20 overflow-hidden p-2.5 text-left group active:scale-[0.97] transition-all",
      "bg-[linear-gradient(135deg,hsl(var(--primary)/0.32),hsl(var(--primary)/0.06))]",
      active && "ring-2 ring-primary",
    )}
    style={{
      // corte assimétrico exclusivo (diferente dos cards de vídeo, que são rounded uniformes)
      clipPath: "polygon(12px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 12px)",
      animationDelay: `${index * 20}ms`,
    }}
  >
    <span className="absolute -right-2 -bottom-3 text-4xl sm:text-5xl opacity-40 group-hover:opacity-70 transition-opacity">
      {icon}
    </span>
    <span className="relative text-xs sm:text-sm font-bold text-foreground drop-shadow-sm">{label}</span>
    {/* borda interna sutil, marca da identidade podcast */}
    <span
      aria-hidden
      className="absolute inset-0 border border-primary/20 pointer-events-none"
      style={{
        clipPath: "polygon(12px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 12px)",
      }}
    />
  </button>
);

/* Linha do ranking editorial "top da semana" — layout exclusivo, com número gigante */
export const PodcastChartRow: React.FC<{
  rank: number;
  title: string;
  subtitle: string;
  thumb?: string;
  fallbackGradient?: string;
  onClick: () => void;
  action?: React.ReactNode;
}> = ({ rank, title, subtitle, thumb, fallbackGradient, onClick, action }) => (
  <button
    onClick={onClick}
    data-podcast-chart-row="1"
    className="w-full flex items-center gap-3 p-2.5 hover:bg-secondary/50 transition-colors active:scale-[0.995] text-left"
  >
    <span
      className={cn(
        "w-6 text-center text-xl font-black tabular-nums",
        rank <= 3 ? "text-primary" : "text-muted-foreground/50",
      )}
    >
      {rank}
    </span>
    <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
      {thumb ? (
        <img src={thumb} alt="" className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <div className={cn("w-full h-full bg-gradient-to-br", fallbackGradient)} />
      )}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-semibold text-foreground truncate">{title}</p>
      <p className="text-[10.5px] text-muted-foreground truncate">{subtitle}</p>
    </div>
    {action}
  </button>
);

/* Hero "no ar" — hero exclusivo com selo pulsante e badge de horário */
export const PodcastOnAirHero: React.FC<{
  greetingLabel: string;
  greetingIcon: string;
  subtitle: string;
  showName?: string;
  showThumb?: string;
  showGradient?: string;
  onPlay?: () => void;
}> = ({ greetingLabel, greetingIcon, subtitle, showName, showThumb, showGradient, onPlay }) => (
  <div
    data-podcast-hero="1"
    className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-4 sm:p-5"
  >
    <div className="absolute -right-8 -top-8 w-48 h-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
    <div className="relative flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary/80">
          {greetingIcon} {greetingLabel}
        </p>
        <h2 className="mt-1 text-lg sm:text-xl font-bold text-foreground leading-tight">{subtitle}</h2>
      </div>
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/90 text-primary-foreground text-[10px] font-bold uppercase tracking-wider shadow">
        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> No ar
      </div>
    </div>
    {showName && (
      <button
        onClick={onPlay}
        className="relative mt-4 w-full flex items-center gap-3 p-2 rounded-xl bg-background/60 backdrop-blur-sm border border-border/40 hover:border-primary/50 transition-colors active:scale-[0.99] text-left"
      >
        <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden flex-shrink-0">
          {showThumb ? (
            <img src={showThumb} alt={showName} className="w-full h-full object-cover" />
          ) : (
            <div className={cn("w-full h-full bg-gradient-to-br", showGradient)} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">Episódio em destaque</p>
          <p className="text-sm sm:text-base font-bold text-foreground truncate">{showName}</p>
          <p className="text-[11px] text-muted-foreground truncate">Toque para ouvir agora</p>
        </div>
      </button>
    )}
  </div>
);
