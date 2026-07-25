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
}: DesktopSidebarProps) => {
  const mainTabs = podcastMode ? podcastTabs : (homeMode === "video" ? videoTabs : musicTabs);
  const [likedVideoCount, setLikedVideoCount] = useState(0);
  useEffect(() => {
    if (homeMode !== "video" || podcastMode) return;
    const recompute = () => {
      try {
        const favs = getFavoritesMetadata();
        setLikedVideoCount(favs.filter((f: any) => (f?.type ?? "music") === "video").length);
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
  }, [homeMode, podcastMode]);
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
      className="hidden md:flex flex-col w-20 lg:w-[268px] h-full bg-sidebar border-r border-sidebar-border flex-shrink-0 transition-[width] duration-300 ease-in-out relative"
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

      {/* Vertical module switcher when collapsed (icons-only + tooltips on hover) */}
      {collapsed && onHomeModeChange && (() => {
        const modules = [
          { id: "hub", label: "Início", Icon: Home, color: "217 91% 60%", active: pillHub, onClick: () => { onHomeModeChange("hub"); onChange("home"); } },
          { id: "music", label: "Music", Icon: Music, color: "142 55% 45%", active: pillMusic, onClick: () => { onHomeModeChange("music"); onChange("home"); } },
          { id: "video", label: "Vídeos", Icon: MonitorPlay, color: "0 68% 55%", active: pillVideo, onClick: () => { onHomeModeChange("video"); onChange("home"); } },
          { id: "podcast", label: "Podcasts", Icon: Headphones, color: "270 55% 60%", active: isPodcast, onClick: () => onChange("podcast") },
        ] as const;
        return (
          <div className="hidden lg:flex flex-col gap-1 p-1 mx-2 mb-3 rounded-2xl border border-border bg-secondary shadow-inner">
            {modules.map((m) => (
              <ModulePillButton
                key={m.id}
                label={m.label}
                Icon={m.Icon}
                color={m.color}
                isActive={m.active}
                onClick={m.onClick}
                orientation="vertical"
              />
            ))}
          </div>
        );
      })()}

      {/* Module switcher pill — matches mobile Dynamic Island styling (expanded state) */}
      {onHomeModeChange && (() => {
        const modules = [
          { id: "hub", label: "Início", Icon: Home, color: "217 91% 60%", active: pillHub, onClick: () => { onHomeModeChange("hub"); onChange("home"); } },
          { id: "music", label: "Music", Icon: Music, color: "142 55% 45%", active: pillMusic, onClick: () => { onHomeModeChange("music"); onChange("home"); } },
          { id: "video", label: "Vídeos", Icon: MonitorPlay, color: "0 68% 55%", active: pillVideo, onClick: () => { onHomeModeChange("video"); onChange("home"); } },
          { id: "podcast", label: "Podcasts", Icon: Headphones, color: "270 55% 60%", active: isPodcast, onClick: () => onChange("podcast") },
        ] as const;
        return (
          <div className="pl-2 pr-3 lg:pl-2.5 lg:pr-4 pb-3" data-sidebar-fullonly>
            <div className="flex items-center gap-0.5 p-1 rounded-full border border-border shadow-md bg-secondary overflow-hidden">

              {modules.map((m) => (
                <ModulePillButton
                  key={m.id}
                  label={m.label}
                  Icon={m.Icon}
                  color={m.color}
                  isActive={m.active}
                  onClick={m.onClick}
                />
              ))}
            </div>
          </div>
        );
      })()}

      {/* Divider between pill and nav */}
      <div className="h-px bg-sidebar-border/60 mx-4 mb-1" />

      {/* Main nav */}
      <nav className="flex-1 px-3 pt-3 lg:pt-4 pb-4 lg:pb-2 space-y-1.5 lg:space-y-0.5">
        {mainTabs.map(({ id, icon: Icon, label }) => (
          <Tooltip key={id} delayDuration={200}>
            <TooltipTrigger asChild>
              <button
                onClick={() => onChange(id)}
                aria-label={label}
                className={`w-full flex flex-col lg:flex-row items-center gap-2 lg:gap-3.5 px-2 lg:px-4 py-3.5 lg:py-3 rounded-2xl lg:rounded-xl text-[10px] lg:text-[13px] font-semibold transition-all duration-200 group relative ${
                  active === id
                    ? "bg-primary/15 text-primary shadow-sm shadow-primary/5"
                    : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
                }`}
              >
                {active === id && (
                  <div className="hidden lg:block absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-primary rounded-r-full" />
                )}
                <div className={`flex items-center justify-center w-9 h-9 lg:w-8 lg:h-8 rounded-xl transition-all duration-200 ${
                  active === id
                    ? "bg-primary/20 text-primary scale-105"
                    : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80 group-hover:bg-sidebar-accent group-hover:scale-105"
                }`}>
                  <Icon
                    size={active === id ? 22 : 20}
                    strokeWidth={active === id ? 2.5 : 1.8}
                    className="transition-all duration-200"
                  />
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

      {/* Bottom section — Profile + Settings/Tools button */}
      <div className="px-3 pb-6 lg:pb-4 space-y-2 lg:space-y-1 relative" ref={toolsRef}>
        <div className="h-px bg-sidebar-border mx-2 mb-2 opacity-50" />
        <div className={`flex flex-col gap-2 ${collapsed ? "items-center" : "items-stretch"}`} data-sidebar-iconcenter>
          {/* Ferramentas — reuses the exact same module as mobile (HeaderMenu) */}
          <div className={`flex ${collapsed ? "justify-center w-11" : "justify-center lg:justify-start w-full"}`}>
            <HeaderMenu
              homeMode={homeMode}
              onHomeModeChange={(m) => onHomeModeChange?.(m)}
              isDark={!!isDark}
              onToggleTheme={() => onToggleTheme?.()}
              colorTheme={colorTheme}
              onColorChange={(c) => onColorChange?.(c)}
              onCast={onCast}
              onOpenHistory={onOpenHistory}
              onOpenPlaylists={onOpenPlaylists}
              onOpenDownloads={onOpenDownloads}
              onZoomChange={onZoomChange}
              onOpenChat={onOpenChat}
              onLogin={onLogin}
              onLogout={onLogout}
              user={user}
              isLoadingUser={isLoadingUser}
              currentZoom={currentZoom}
              placement="sidebar"
            />
          </div>
          {/* Profile button */}
          <div className={`flex ${collapsed ? "justify-center w-11" : "justify-center lg:justify-start w-full"}`}>
            <ProfileButton
              user={user ?? null}
              onLogin={() => onLogin?.()}
              onLogout={() => onLogout?.()}
              onOpenHistory={onOpenHistory}
              onUpdateName={onUpdateName}
            />
          </div>
        </div>
      </div>

    </aside>

  );
};

export default DesktopSidebar;
