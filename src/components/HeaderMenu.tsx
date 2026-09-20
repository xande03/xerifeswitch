import { useState, useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Settings, Music, MonitorPlay, Sun, Moon, Palette, Cast, X, ListMusic, ZoomIn, Plus, Minus, Sparkles, User, LogIn, LogOut, SlidersHorizontal, Download, EyeOff, Eye, ChevronDown, Lock } from "lucide-react";

import AppHeartbeatStatus from "@/components/AppHeartbeatStatus";
import LockScreenSetupGuide from "@/components/LockScreenSetupGuide";

type HomeMode = "hub" | "music" | "video";

interface HeaderMenuProps {
  homeMode: HomeMode;
  onHomeModeChange: (mode: HomeMode) => void;
  isDark: boolean;
  onToggleTheme: () => void;
  colorTheme: string;
  onColorChange: (color: string) => void;
  onCast?: () => void;
  onOpenHistory?: () => void;
  onOpenPlaylists?: () => void;
  onOpenDownloads?: () => void;
  onZoomChange?: (newZoom: number) => void;
  onOpenChat?: () => void;
  onLogin?: () => void;
  onLogout?: () => void;
  user?: any;
  isLoadingUser?: boolean;
  currentZoom?: number;
  placement?: "bottom-right" | "sidebar";
}

const COLOR_OPTIONS = [
  { id: "default", color: "bg-[hsl(142,70%,30%)]", label: "Verde Escuro (Padrão)" },
  { id: "ambient", color: "bg-gradient-to-r from-pink-500 to-violet-500", label: "Ambiente (Capa)" },
  { id: "artist-exclusive", color: "bg-[#EAB308]", label: "Exclusivo: Xerife" },
  { id: "genre-rock", color: "bg-[#ef4444]", label: "Rock Experience" },
  { id: "genre-jazz", color: "bg-[#3b82f6]", label: "Jazz Smooth" },
  { id: "red", color: "bg-[hsl(0,100%,50%)]", label: "Vermelho" },
  { id: "blue", color: "bg-[hsl(217,91%,60%)]", label: "Azul" },
  { id: "purple", color: "bg-[hsl(271,76%,53%)]", label: "Roxo" },
  { id: "green", color: "bg-[hsl(142,71%,45%)]", label: "Verde Claro" },
  { id: "orange", color: "bg-[hsl(25,95%,53%)]", label: "Laranja" },
  { id: "pink", color: "bg-[hsl(330,81%,60%)]", label: "Rosa" },
] as const;


const HeaderMenu = ({
  homeMode,
  onHomeModeChange,
  isDark,
  onToggleTheme,
  colorTheme,
  onColorChange,
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
  placement = "bottom-right",
}: HeaderMenuProps) => {
  const [open, setOpen] = useState(false);
  const [showServerStatus, setShowServerStatus] = useState(false);
  const [updateState, setUpdateState] = useState<"idle" | "checking" | "latest">("idle");

  /** Força a atualização do app: limpa caches do SW, pede o update do
   *  Service Worker, confere o bundle publicado no servidor e recarrega
   *  se houver build novo — resolve PWA preso em versão antiga. */
  const checkUpdateNow = async () => {
    if (updateState === "checking") return;
    setUpdateState("checking");
    try {
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({ type: "CLEAR_CACHES" });
      }
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.update().catch(() => {});
      const res = await fetch(`/?_v=${Date.now()}`, { cache: "no-store" });
      const html = await res.text();
      const m = html.match(/assets\/index-[^"']+\.js/);
      const el = document.querySelector<HTMLScriptElement>('script[src*="/assets/index-"]');
      const current = el ? new URL(el.src, location.href).pathname : null;
      const latest = m ? "/" + m[0] : null;
      if (latest && current && latest !== current) {
        location.reload(); // build novo publicado: recarrega para ele
        return;
      }
      // Mesmo bundle: recarrega mesmo assim para aplicar o SW que acabou
      // de atualizar/assumir (se houver um esperando).
      if (reg?.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
        setTimeout(() => location.reload(), 400);
        return;
      }
      setUpdateState("latest");
      setTimeout(() => setUpdateState("idle"), 2500);
    } catch {
      setUpdateState("idle");
    }
  };
  const [showLockGuide, setShowLockGuide] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => localStorage.getItem('demus-reduced-motion') === 'true');



  const menuRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const handleNav = () => setOpen(false);
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("touchstart", handleClick, { passive: true });
    document.addEventListener("keydown", handleKey);
    window.addEventListener("popstate", handleNav);
    window.addEventListener("hashchange", handleNav);
    window.addEventListener("xerife:navigate", handleNav);
    window.addEventListener("xerife:module-change", handleNav);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("touchstart", handleClick);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("popstate", handleNav);
      window.removeEventListener("hashchange", handleNav);
      window.removeEventListener("xerife:navigate", handleNav);
      window.removeEventListener("xerife:module-change", handleNav);
    };
  }, [open]);

  // Close whenever the route or active home section changes
  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.hash, homeMode]);

  useEffect(() => {
    if (reducedMotion) {
      document.documentElement.classList.add('force-reduced-motion');
    } else {
      document.documentElement.classList.remove('force-reduced-motion');
    }
    localStorage.setItem('demus-reduced-motion', reducedMotion.toString());
  }, [reducedMotion]);


  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center hover:bg-accent transition-colors active:scale-95"
        aria-label="Menu"
      >
        {open ? <X size={16} className="text-foreground" /> : <Settings size={16} className="text-muted-foreground" />}
      </button>

      {open && (
        <div
          className={`fixed sm:absolute w-[13rem] max-w-[calc(100vw-1rem)] bg-card border border-border rounded-xl shadow-xl z-[100] overflow-y-auto overflow-x-hidden overscroll-contain animate-in fade-in slide-in-from-top-2 duration-200 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/40 [&::-webkit-scrollbar-thumb]:rounded-full ${
            placement === "sidebar"
              ? "sm:left-full sm:bottom-0 sm:top-auto sm:ml-2 bottom-16 left-2"
              : "sm:right-0 sm:top-11 top-14 right-2"
          }`}
          style={{ maxHeight: "min(70dvh, calc(100dvh - 80px - env(safe-area-inset-bottom)))", touchAction: "pan-y" }}
        >


          {/* Module switcher removed — available in the top nav/dynamic island */}


          <div className="p-2 space-y-1 border-b border-border">
             <button
              onClick={() => setReducedMotion(!reducedMotion)}
              className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm text-foreground hover:bg-secondary transition-colors"
            >
              <div className="flex items-center gap-3">
                {reducedMotion ? <EyeOff size={16} className="text-primary" /> : <Eye size={16} className="text-muted-foreground" />}
                <span>Reduzir Movimento</span>
              </div>
              <div className={`w-8 h-4 rounded-full transition-colors relative ${reducedMotion ? 'bg-primary' : 'bg-secondary'}`}>
                <div className={`absolute top-1 w-2 h-2 rounded-full bg-white transition-all ${reducedMotion ? 'right-1' : 'left-1'}`} />
              </div>
              </button>
          </div>



          {/* Theme toggle */}
          <button
            onClick={onToggleTheme}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-foreground hover:bg-accent transition-colors"
          >
            {isDark ? <Moon size={16} /> : <Sun size={16} />}
            <span>{isDark ? "Modo Claro" : "Modo Escuro"}</span>
          </button>

          {/* Color theme */}
          <div className="px-3 py-2.5 border-t border-border space-y-2">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <Palette size={16} />
              <span>Cor do ícone</span>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {COLOR_OPTIONS.map((t) => (
                <button
                  key={t.id}
                  title={t.label}
                  onClick={() => onColorChange(t.id)}
                  className={`w-7 h-7 rounded-full ${t.color} transition-all ${
                    colorTheme === t.id
                      ? "ring-2 ring-foreground ring-offset-2 ring-offset-card scale-110"
                      : "opacity-70 hover:opacity-100"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* History and Playlists removed — accessible via Biblioteca */}


          {/* Zoom Controls */}
          <div className="px-3 py-2.5 border-t border-border space-y-2">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <ZoomIn size={16} className="text-muted-foreground" />
              <span>Zoom</span>
              <span className="ml-auto text-[10px] bg-secondary px-1.5 py-0.5 rounded font-mono">
                {Math.round(currentZoom * 100)}%
              </span>
            </div>
            <div className="flex items-stretch gap-1.5">
              <button
                onClick={() => onZoomChange?.(Math.max(0.5, currentZoom - 0.1))}
                className="flex-1 min-w-0 flex items-center justify-center p-2 rounded-lg bg-secondary hover:bg-accent hover:text-primary transition-colors border border-border"
                title="Reduzir Zoom"
                aria-label="Reduzir zoom"
              >
                <Minus size={14} />
              </button>
              <button
                onClick={() => onZoomChange?.(1)}
                className="flex-1 min-w-0 px-2 py-2 rounded-lg bg-secondary hover:bg-accent text-[10px] font-bold border border-border tabular-nums truncate"
                title="Resetar Zoom"
                aria-label={`Zoom atual ${Math.round(currentZoom * 100)}%, clique para resetar`}
              >
                {Math.round(currentZoom * 100)}%
              </button>
              <button
                onClick={() => onZoomChange?.(Math.min(2, currentZoom + 0.1))}
                className="flex-1 min-w-0 flex items-center justify-center p-2 rounded-lg bg-secondary hover:bg-accent hover:text-primary transition-colors border border-border"
                title="Ampliar Zoom"
                aria-label="Ampliar zoom"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          {/* Downloads removed — available in Biblioteca */}



          {/* Lock screen / Dynamic Island setup guide */}
          <button
            onClick={() => { setShowLockGuide(true); setOpen(false); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-foreground hover:bg-accent transition-colors border-t border-border"
          >
            <Lock size={16} className="text-muted-foreground" />
            <span>Controles na Tela de Bloqueio</span>
          </button>



          {/* Version Info — click to reveal server status */}
          <button
            onClick={() => setShowServerStatus(v => !v)}
            className="w-full text-left px-3 py-2 bg-muted/30 border-t border-border hover:bg-muted/50 transition-colors"
            aria-expanded={showServerStatus}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest leading-tight">Versão do App</span>
                <span className="text-[10px] text-muted-foreground/80 font-medium">
                  {(() => {
                    // Build REAL (git SHA + data, injetado no build e exposto no
                    // <html data-app-build> pelo main.tsx) — se esta linha não
                    // mostrar o build mais recente, o app está rodando versão
                    // antiga em cache: feche e reabra (ou limpe os dados do site).
                    const b = document.documentElement.dataset.appBuild || "";
                    const [sha, date] = b.split("-");
                    if (!sha) return "dev";
                    const d = date ? `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}` : "";
                    return `${sha} • ${d}`;
                  })()}
                </span>
              </div>
              <ChevronDown size={14} className={`text-muted-foreground transition-transform ${showServerStatus ? "rotate-180" : ""}`} />
            </div>
          </button>
          {showServerStatus && (
            <div className="px-3 py-3 border-t border-border bg-muted/10 space-y-2.5">
              <AppHeartbeatStatus />
              <button
                onClick={checkUpdateNow}
                disabled={updateState === "checking"}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary/90 hover:bg-primary text-primary-foreground text-[11px] font-bold transition active:scale-[0.98] disabled:opacity-60"
              >
                {updateState === "checking" ? "Verificando…" : updateState === "latest" ? "✓ Você está na versão mais recente" : "Verificar atualização"}
              </button>
            </div>
          )}
        </div>
      )}

      
      <LockScreenSetupGuide open={showLockGuide} onClose={() => setShowLockGuide(false)} />
    </div>
  );
};

export default HeaderMenu;

