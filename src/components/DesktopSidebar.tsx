import { useState, useRef, useEffect } from "react";
import { Home, Search, Heart, Download, Settings, Compass, MonitorPlay, Clock, ListMusic, Music, Sun, Moon, Palette, Cast, X, ZoomIn, Plus, Minus, Sparkles, User, LogOut, LogIn, SlidersHorizontal, Podcast, ChevronDown, Library, Headphones, ChevronLeft, ChevronRight, ThumbsUp } from "lucide-react";
import { getFavoritesMetadata } from "@/lib/localStorage";

import Logo from "@/components/Logo";
import AppHeartbeatStatus from "@/components/AppHeartbeatStatus";
import ProfileButton from "@/components/ProfileButton";
import HeaderMenu from "@/components/HeaderMenu";
import xerifeHubLogo from "@/assets/xerife-hub-logo.png";
import { useTheme } from "@/hooks/useTheme";
import { getModuleTones } from "@/lib/moduleTones";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";



type Tab = "home" | "search" | "library" | "offline" | "profile" | "history" | "playlists" | "podcast" | "libraryhub";
type HomeMode = "hub" | "music" | "video";

const COLOR_OPTIONS = [
  { id: "default", color: "bg-[hsl(142,70%,30%)]", label: "Verde Escuro (Padrão)" },
  { id: "red", color: "bg-[hsl(0,100%,50%)]", label: "Vermelho" },
  { id: "blue", color: "bg-[hsl(217,91%,60%)]", label: "Azul" },
  { id: "purple", color: "bg-[hsl(271,76%,53%)]", label: "Roxo" },
  { id: "green", color: "bg-[hsl(142,71%,45%)]", label: "Verde Claro" },
  { id: "orange", color: "bg-[hsl(25,95%,53%)]", label: "Laranja" },
  { id: "pink", color: "bg-[hsl(330,81%,60%)]", label: "Rosa" },
] as const;

interface DesktopSidebarProps {
  active: Tab;
  onChange: (tab: Tab) => void;
  homeMode?: HomeMode;
  podcastMode?: boolean;
  // Tools menu props (desktop)
  isDark?: boolean;
  onToggleTheme?: () => void;
  colorTheme?: string;
  onColorChange?: (color: string) => void;
  onHomeModeChange?: (mode: HomeMode) => void;
  onCast?: () => void;
  onOpenHistory?: () => void;
  onOpenPlaylists?: () => void;
  onOpenDownloads?: () => void;
  onZoomChange?: (zoom: number) => void;
  onOpenChat?: () => void;
  onLogin?: () => void;
  onLogout?: () => void;
  user?: any;
  isLoadingUser?: boolean;
  currentZoom?: number;
  onUpdateName?: (name: string) => void;
  playerSlot?: React.ReactNode;
  collapsedPlayerSlot?: React.ReactNode;
}


const musicTabs: { id: Tab; icon: typeof Home; label: string }[] = [
  { id: "home", icon: Home, label: "Início" },
  { id: "search", icon: Search, label: "Buscar" },
  { id: "library", icon: Heart, label: "Favoritas" },
  { id: "libraryhub", icon: Library, label: "Biblioteca" },
  { id: "history", icon: Clock, label: "Histórico" },
  { id: "playlists", icon: ListMusic, label: "Playlists" },
];

const videoTabs: { id: Tab; icon: typeof Home; label: string }[] = [
  { id: "home", icon: Home, label: "Início" },
  { id: "search", icon: Compass, label: "Explorar" },
  { id: "library", icon: ThumbsUp, label: "Gostei" },
  { id: "libraryhub", icon: Library, label: "Biblioteca" },
  { id: "history", icon: Clock, label: "Histórico" },
  { id: "playlists", icon: ListMusic, label: "Playlists" },
];

const podcastTabs: { id: Tab; icon: typeof Home; label: string }[] = [
  { id: "home", icon: Home, label: "Início" },
  { id: "search", icon: Compass, label: "Explorar" },
  { id: "library", icon: Heart, label: "Favoritos" },
  { id: "libraryhub", icon: Library, label: "Biblioteca" },
  { id: "history", icon: Clock, label: "Histórico" },
];


/**
 * Pílula individual de módulo com estados visuais consistentes
 * (default, hover, focus-visible, active/pressed) e cor derivada por tema
 * para atender contraste WCAG AA.
 */
function ModulePillButton({
  label,
  Icon,
  color,
  isActive,
  onClick,
  orientation = "horizontal",
}: {
  label: string;
  Icon: typeof Home;
  color: string;
  isActive: boolean;
  onClick: () => void;
  orientation?: "horizontal" | "vertical";
}) {
  const { isLight } = useTheme();
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const tones = getModuleTones(color, isLight);

  const bg = isActive
    ? pressed
      ? tones.bgActive
      : hover
      ? tones.bgHover
      : tones.bg
    : hover || focused
    ? tones.bg
    : "transparent";

  const isVertical = orientation === "vertical";

  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => { setHover(false); setPressed(false); }}
          onMouseDown={() => setPressed(true)}
          onMouseUp={() => setPressed(false)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          aria-pressed={isActive}
          aria-label={label}
          className={
            isVertical
              ? "w-full flex flex-col items-center justify-center gap-0.5 px-1 py-2 rounded-xl text-[9px] font-bold transition-colors duration-150 outline-none min-h-[42px]"
              : `flex items-center justify-center gap-1 px-2 py-1.5 rounded-full text-[10.5px] font-bold transition-colors duration-150 outline-none min-h-[30px] whitespace-nowrap ${isActive ? "flex-[2_1_0%]" : "flex-[1_1_0%]"}`
          }
          style={{
            color: isActive || hover || focused ? tones.fg : "hsl(var(--muted-foreground))",
            backgroundColor: bg,
            boxShadow: isActive
              ? `inset 0 0 0 1px ${tones.ring}${hover ? `, ${tones.shadow}` : ""}`
              : "none",
            outline: focused ? `2px solid ${tones.focusRing}` : "none",
            outlineOffset: focused ? 2 : 0,
          }}
        >
          <Icon size={isVertical ? 16 : 13} strokeWidth={isActive ? 2.6 : 1.9} className="shrink-0" />
          {!isVertical && isActive && <span className="hidden lg:inline tracking-tight truncate">{label}</span>}
          {isVertical && isActive && <span className="tracking-tight leading-none">{label}</span>}
        </button>

      </TooltipTrigger>
      <TooltipContent side={isVertical ? "right" : "bottom"} className="text-xs font-semibold">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}





const DesktopSidebar = ({
  active,
  onChange,
  homeMode = "music",
  podcastMode = false,
  isDark = false,
  onToggleTheme,
  colorTheme = "default",
  onColorChange,
  onHomeModeChange,
  onCast,
  onOpenHistory,
  onOpenPlaylists,
  onOpenDownloads,
  onZoomChange,
  onOpenChat,
  onLogin,
  onLogout,
  user,
  isLoadingUser,
  currentZoom = 1,
  onUpdateName,
  playerSlot,
  collapsedPlayerSlot,
}: DesktopSidebarProps) => {

  const mainTabs = podcastMode ? podcastTabs : (homeMode === "video" ? videoTabs : musicTabs);
  const activeType: "music" | "video" | "podcast" =
    podcastMode ? "podcast" : homeMode === "video" ? "video" : "music";
  const [likedCount, setLikedCount] = useState(0);
  useEffect(() => {
    const recompute = () => {
      try {
        const favs = getFavoritesMetadata();
        setLikedCount(favs.filter((f: any) => (f?.type ?? "music") === activeType).length);
      } catch {}
    };
    recompute();
    const h = () => recompute();
    window.addEventListener("storage", h);
    window.addEventListener("demus:favorites-updated", h);
    return () => {
      window.removeEventListener("storage", h);
      window.removeEventListener("demus:favorites-updated", h);
    };
  }, [activeType]);

  const [toolsOpen, setToolsOpen] = useState(false);
  
  const [showServerStatus, setShowServerStatus] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem("demus-sidebar-collapsed") === "true"; } catch { return false; }
  });
  const toolsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { localStorage.setItem("demus-sidebar-collapsed", String(collapsed)); } catch {}
    window.dispatchEvent(new CustomEvent("demus:sidebar-collapsed-changed", { detail: collapsed }));
  }, [collapsed]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (toolsRef.current && !toolsRef.current.contains(e.target as Node)) {
        setToolsOpen(false);
      }
    };
    if (toolsOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [toolsOpen]);

  const isPodcast = podcastMode || active === "podcast";
  const pillHub = homeMode === "hub" && !isPodcast;
  const pillMusic = homeMode === "music" && !isPodcast;
  const pillVideo = homeMode === "video" && !isPodcast;

  return (
    <aside
      data-sidebar-collapsed={collapsed}
      className="hidden md:flex flex-col w-20 lg:w-[320px] h-full bg-sidebar border-r border-sidebar-border flex-shrink-0 transition-[width] duration-300 ease-in-out relative"
    >
      {/* Collapse / expand toggle — evidente e destacado */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        aria-label={collapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
        title={collapsed ? "Expandir menu" : "Recolher menu"}
        className="absolute -right-4 top-7 z-30 w-8 h-8 rounded-full bg-primary text-primary-foreground border-2 border-background shadow-lg shadow-primary/40 flex items-center justify-center hover:scale-110 hover:shadow-primary/60 transition-all active:scale-95 ring-1 ring-primary/50"
      >
        {collapsed ? <ChevronRight size={18} strokeWidth={2.8} /> : <ChevronLeft size={18} strokeWidth={2.8} />}
      </button>




      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-7 lg:py-6 justify-center lg:justify-start" data-sidebar-iconcenter>
        <div className="hidden lg:flex" data-sidebar-fullonly>
          <Logo size={52} showText />
        </div>
        <Logo size={48} className="lg:hidden" />
        {collapsed && <Logo size={48} className="hidden lg:block" />}
      </div>

      {/* Divider between logo and nav */}
      <div className="h-px bg-sidebar-border/60 mx-4 mb-1" />


      {/* Main nav */}
      <nav className="flex-shrink-0 overflow-y-auto px-3 pt-2 pb-2 space-y-1 lg:space-y-0.5">
        {mainTabs.map(({ id, icon: Icon, label }) => (
          <Tooltip key={id} delayDuration={200}>
            <TooltipTrigger asChild>
              <button
                onClick={() => onChange(id)}
                aria-label={label}
                className={`w-full flex flex-col lg:flex-row items-center gap-2 lg:gap-3 px-2 lg:px-3 py-2.5 lg:py-2 rounded-2xl lg:rounded-xl text-[10px] lg:text-[12.5px] font-semibold transition-all duration-200 group relative ${
                  active === id
                    ? "bg-primary/15 text-primary shadow-sm shadow-primary/5"
                    : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
                }`}
              >

                {active === id && (
                  <div className="hidden lg:block absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-primary rounded-r-full" />
                )}
                <div className={`relative flex items-center justify-center w-8 h-8 lg:w-7 lg:h-7 rounded-xl transition-all duration-200 ${
                  active === id
                    ? "bg-primary/20 text-primary scale-105"
                    : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80 group-hover:bg-sidebar-accent group-hover:scale-105"
                }`}>
                  <Icon
                    size={active === id ? 20 : 18}
                    strokeWidth={active === id ? 2.5 : 1.8}
                    className="transition-all duration-200"
                  />

                  {id === "library" && likedCount > 0 && (
                    <span
                      key={likedCount}
                      className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center animate-scale-in shadow-sm"
                      aria-label={`${likedCount} curtidos`}
                    >
                      {likedCount > 99 ? "99+" : likedCount}
                    </span>
                  )}

                </div>
                <span className="lg:block transition-all font-medium" data-sidebar-fullonly>{label}</span>
                {active === id && (
                  <div className="hidden lg:block ml-auto w-2 h-2 rounded-full bg-primary animate-pulse" data-sidebar-fullonly />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs font-semibold">
              {label}
            </TooltipContent>
          </Tooltip>
        ))}

      </nav>

      {/* Bottom section — Player embutido na sidebar */}
      <div className="mt-auto border-t border-sidebar-border/60 overflow-y-auto" ref={toolsRef}>
        {playerSlot}
      </div>


    </aside>

  );
};

export default DesktopSidebar;
