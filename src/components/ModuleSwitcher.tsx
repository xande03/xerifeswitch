import { memo, useCallback, useState } from "react";
import { Music, MonitorPlay, Headphones, Repeat2, Check } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTheme } from "@/hooks/useTheme";
import { getModuleTones } from "@/lib/moduleTones";

export type SwitchableModule = "music" | "video" | "podcast";

export const MODULE_COLOR: Record<SwitchableModule, string> = {
  music: "142 55% 45%",
  video: "0 68% 55%",
  podcast: "270 55% 60%",
};

export const MODULE_LABEL: Record<SwitchableModule, string> = {
  music: "Music",
  video: "Vídeos",
  podcast: "Podcasts",
};

const MODULE_ICON: Record<SwitchableModule, typeof Music> = {
  music: Music,
  video: MonitorPlay,
  podcast: Headphones,
};

interface Props {
  active: SwitchableModule;
  onSelect: (m: SwitchableModule) => void;
}

const ModuleSwitcher = memo(function ModuleSwitcher({ active, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [transitionTo, setTransitionTo] = useState<SwitchableModule | null>(null);
  const { isLight } = useTheme();
  const activeTones = getModuleTones(MODULE_COLOR[active], isLight);

  const handle = useCallback(
    (m: SwitchableModule) => {
      setOpen(false);
      if (m === active) return;
      setTransitionTo(m);
      window.setTimeout(() => onSelect(m), 220);
      window.setTimeout(() => setTransitionTo(null), 620);
    },
    [onSelect, active],
  );

  const TransitionIcon = transitionTo ? MODULE_ICON[transitionTo] : Music;
  const transitionTones = getModuleTones(
    MODULE_COLOR[transitionTo ?? active],
    isLight,
  );

  return (
    <>
    {/* Fundo fosco enquanto o alternador está aberto */}
    {open && (
      <div
        aria-hidden
        className="fixed inset-0 z-40 backdrop-blur-md bg-background/50 animate-fade-in motion-reduce:animate-none"
      />
    )}

    {/* Tela de passagem entre sessões */}
    {transitionTo && (
      <div
        aria-hidden
        className="fixed inset-0 z-[100] flex items-center justify-center backdrop-blur-xl animate-fade-in motion-reduce:animate-none"
        style={{
          backgroundColor: "hsl(var(--background) / 0.85)",
          backgroundImage: `radial-gradient(circle at 50% 45%, hsl(${MODULE_COLOR[transitionTo]} / 0.28), transparent 62%)`,
        }}
      >
        <div className="flex flex-col items-center gap-3 animate-scale-in motion-reduce:animate-none">
          <span
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl"
            style={{
              color: transitionTones.fg,
              backgroundColor: transitionTones.bg,
              boxShadow: `0 0 0 1px ${transitionTones.ring}, 0 18px 45px -18px hsl(${MODULE_COLOR[transitionTo]} / 0.7)`,
            }}
          >
            <TransitionIcon size={28} strokeWidth={2.2} />
          </span>
          <span
            className="text-sm font-semibold tracking-wide"
            style={{ color: transitionTones.fg }}
          >
            Xerife {MODULE_LABEL[transitionTo]}
          </span>
        </div>
      </div>
    )}

    <Popover open={open} onOpenChange={setOpen}>

      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                aria-label="Alternar entre Music, Vídeos e Podcasts"
                aria-haspopup="dialog"
                aria-expanded={open}
                className="relative inline-flex items-center justify-center w-9 h-9 rounded-full border transition-colors"
                style={{
                  color: activeTones.fg,
                  backgroundColor: open ? activeTones.bgHover : activeTones.bg,
                  borderColor: activeTones.ring,
                }}
              >
                <Repeat2 size={18} strokeWidth={2.2} />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">Alternar sessão</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <PopoverContent
        align="end"
        sideOffset={12}
        collisionPadding={12}
        onPointerDownOutside={() => setOpen(false)}
        onEscapeKeyDown={() => setOpen(false)}
        className="w-[min(18rem,calc(100vw-24px))] sm:w-64 p-2.5 sm:p-2 rounded-2xl border border-border/70 bg-popover/95 backdrop-blur-xl shadow-2xl ring-1 ring-foreground/5 origin-top-right data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-top-2 data-[state=closed]:slide-out-to-top-2 motion-reduce:transition-none motion-reduce:animate-none motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none"
        style={{
          boxShadow:
            "0 20px 50px -18px hsl(var(--foreground) / 0.35), 0 8px 22px -14px hsl(var(--foreground) / 0.22), 0 0 0 1px hsl(var(--border) / 0.6), inset 0 1px 0 hsl(var(--foreground) / 0.05)",
          backgroundImage:
            "linear-gradient(180deg, hsl(var(--foreground) / 0.03) 0%, transparent 40%)",
        }}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-2xl"
          style={{
            background:
              "linear-gradient(90deg, transparent, hsl(var(--foreground) / 0.18), transparent)",
          }}
        />
        <div className="flex items-center justify-between px-2 pt-1 pb-2">
          <span className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground">
            Alternar sessão
          </span>
          <span
            className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border"
            style={{
              color: activeTones.fg,
              backgroundColor: activeTones.bg,
              borderColor: activeTones.ring,
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: activeTones.fg }}
            />
            Atual
          </span>
        </div>
        <div className="flex flex-col gap-1.5 sm:gap-1">
          {(Object.keys(MODULE_LABEL) as SwitchableModule[]).map((id, idx) => {
            const Icon = MODULE_ICON[id];
            const tones = getModuleTones(MODULE_COLOR[id], isLight);
            const isActive = id === active;
            return (
              <button
                key={id}
                onClick={() => handle(id)}
                aria-pressed={isActive}
                aria-current={isActive ? "true" : undefined}
                className="group relative flex items-center gap-3 px-2.5 py-2.5 sm:py-2 rounded-xl text-left transition-all duration-200 ease-out hover:bg-muted/60 hover:translate-x-0.5 active:scale-[0.98] focus:outline-none focus-visible:ring-2 animate-fade-in motion-reduce:transition-none motion-reduce:animate-none motion-reduce:hover:translate-x-0 motion-reduce:active:scale-100"
                style={{
                  boxShadow: isActive ? `inset 0 0 0 1px ${tones.ring}` : "none",
                  backgroundColor: isActive ? tones.bg : "transparent",
                  animationDelay: `${idx * 40}ms`,
                  animationFillMode: "backwards",
                }}
              >
                {isActive && (
                  <span
                    aria-hidden
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full"
                    style={{ backgroundColor: tones.fg }}
                  />
                )}
                <span
                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg transition-transform duration-200 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                  style={{ color: tones.fg, backgroundColor: tones.bg }}
                >
                  <Icon size={16} strokeWidth={2.2} />
                </span>
                <span className="flex-1 min-w-0">
                  <span
                    className="block text-[13px] font-semibold leading-tight"
                    style={{ color: isActive ? tones.fg : undefined }}
                  >
                    Xerife {MODULE_LABEL[id]}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {id === "music" && "Faixas, álbuns e artistas"}
                    {id === "video" && "Videoclipes e canais"}
                    {id === "podcast" && "Programas e episódios"}
                  </span>
                </span>
                {isActive && (
                  <span
                    aria-label="Módulo ativo"
                    className="inline-flex items-center justify-center w-5 h-5 rounded-full"
                    style={{ color: tones.fg, backgroundColor: tones.bg }}
                  >
                    <Check size={12} strokeWidth={3} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
});

export default ModuleSwitcher;
