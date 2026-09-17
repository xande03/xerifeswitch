import { useEffect, useState } from "react";
import { Music, MonitorPlay, Headphones } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getModuleTones } from "@/lib/moduleTones";
import { useTheme } from "@/hooks/useTheme";
import { MODULE_COLOR, MODULE_LABEL, type SwitchableModule } from "@/components/ModuleSwitcher";
import { getFavoritesMetadata } from "@/lib/localStorage";
import { getFavoriteEpisodes } from "@/lib/podcastStorage";
import { musicTabs, videoTabs, podcastTabs } from "@/components/DesktopSidebar";
import type { Tab } from "@/components/DesktopSidebar";

const MODULE_ICON: Record<SwitchableModule, typeof Music> = {
  music: Music,
  video: MonitorPlay,
  podcast: Headphones,
};

const MODULES: SwitchableModule[] = ["music", "video", "podcast"];

interface Props {
  /** Aba ativa (home/search/library/...) */
  active: Tab;
  onChange: (tab: Tab) => void;
  /** Módulo ativo derivado do estado global */
  currentModule: SwitchableModule;
  onModuleSelect: (m: SwitchableModule) => void;
}

/**
 * Ilha dinâmica do DESKTOP (≥lg): pílula fixa no topo que reúne
 * os 3 módulos (Music/Vídeos/Podcasts nas suas cores) + as sessões do
 * módulo ativo (Início, Buscar, Favoritas/Gostei, Biblioteca, Histórico,
 * Playlists) — substituindo completamente o menu lateral nesses break points.
 */
const DesktopTopIsland = ({ active, onChange, currentModule, onModuleSelect }: Props) => {
  const { isLight } = useTheme();
  const mainTabs = currentModule === "podcast" ? podcastTabs : currentModule === "video" ? videoTabs : musicTabs;

  // Badge de curtidas na aba "library" — mesma contagem da sidebar legacy
  const activeType = currentModule;
  const [likedCount, setLikedCount] = useState(0);
  useEffect(() => {
    const recompute = () => {
      try {
        if (activeType === "podcast") {
          setLikedCount(getFavoriteEpisodes().length);
          return;
        }
        const favs = getFavoritesMetadata();
        setLikedCount(favs.filter((f: any) => (f?.type ?? "music") === activeType).length);
      } catch {}
    };
    recompute();
    const h = () => recompute();
    window.addEventListener("storage", h);
    window.addEventListener("demus:favorites-updated", h);
    window.addEventListener("xerife:podcast-favs-updated", h);
    return () => {
      window.removeEventListener("storage", h);
      window.removeEventListener("demus:favorites-updated", h);
      window.removeEventListener("xerife:podcast-favs-updated", h);
    };
  }, [activeType]);

  const activeTones = getModuleTones(MODULE_COLOR[currentModule], isLight);
  const podcastMode = currentModule === "podcast";

  return (
    <nav
      data-desktop-island
      aria-label="Navegação principal (desktop)"
      className="hidden lg:flex items-center gap-1 rounded-full border border-border/70 bg-card/90 backdrop-blur-xl shadow-lg shadow-black/25 px-1.5 py-1 max-w-full overflow-hidden"
    >
      {/* ─ Trio de módulos (sempre nas cores de cada módulo) ─ */}
      <div className="flex items-center gap-1 shrink-0" role="group" aria-label="Sessões do app">
        {MODULES.map((m) => {
          const Icon = MODULE_ICON[m];
          const tones = getModuleTones(MODULE_COLOR[m], isLight);
          const isActive = m === currentModule;
          return (
            <Tooltip key={m} delayDuration={200}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onModuleSelect(m)}
                  aria-pressed={isActive}
                  aria-label={`Sessão Xerife ${MODULE_LABEL[m]}`}
                  className={`flex items-center justify-center gap-1.5 rounded-full transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    isActive ? "px-2.5 h-9" : "w-9 h-9 hover:scale-105 active:scale-95"
                  }`}
                  style={{
                    color: isActive ? "white" : tones.fg,
                    backgroundColor: isActive ? `hsl(${MODULE_COLOR[m]})` : tones.bg,
                    boxShadow: isActive
                      ? `0 0 0 1.5px ${tones.ring}, 0 6px 18px -6px hsl(${MODULE_COLOR[m]} / 0.7)`
                      : `inset 0 0 0 1px ${tones.ring}`,
                  }}
                >
                  <Icon size={16} strokeWidth={isActive ? 2.4 : 2} className="shrink-0" />
                  {isActive && (
                    <span className="hidden xl:inline text-[11px] font-bold whitespace-nowrap">
                      {MODULE_LABEL[m]}
                    </span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs font-semibold">
                Xerife {MODULE_LABEL[m]}{isActive ? " (atual)" : ""}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      {/* Divisor */}
      <div className="w-px h-6 bg-border/80 shrink-0 mx-0.5" aria-hidden />

      {/* ─ Sessões do módulo ativo ─ */}
      {mainTabs.map(({ id, icon: Icon, label }) => {
        const isActive = id === active;
        return (
          <Tooltip key={id} delayDuration={200}>
            <TooltipTrigger asChild>
              <button
                onClick={() => onChange(id)}
                aria-label={label}
                aria-current={isActive ? "page" : undefined}
                style={
                  isActive
                    ? podcastMode
                      ? { color: "hsl(var(--module-accent))", backgroundColor: "hsl(var(--module-accent) / 0.16)", boxShadow: "inset 0 0 0 1.5px hsl(var(--module-accent) / 0.4)" }
                      : { color: activeTones.fg, backgroundColor: activeTones.bg, boxShadow: `inset 0 0 0 1.5px ${activeTones.ring}` }
                    : undefined
                }
                className={`relative flex items-center justify-center gap-1.5 rounded-full transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  isActive
                    ? "px-3 h-9 font-semibold"
                    : "w-9 h-9 text-sidebar-foreground/65 hover:text-sidebar-foreground hover:bg-sidebar-accent/70 hover:scale-[1.04] active:scale-95"
                }`}
              >
                <Icon size={17} strokeWidth={isActive ? 2.3 : 1.9} className="shrink-0" />
                {/* Rótulo sempre visível no ativo; em xl todos mostram */}
                <span className={`text-[12px] whitespace-nowrap ${isActive ? "" : "hidden xl:inline"}`}>
                  {label}
                </span>
                {id === "library" && likedCount > 0 && (
                  <span
                    className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center shadow-sm"
                    style={podcastMode ? { backgroundColor: "hsl(var(--module-accent))", color: "hsl(var(--module-accent-foreground))" } : undefined}
                    aria-label={`${likedCount} curtidos`}
                  >
                    {likedCount > 99 ? "99+" : likedCount}
                  </span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs font-semibold">
              {label}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
};

export default DesktopTopIsland;
