import { memo, useCallback, useState } from "react";
import { Music, MonitorPlay, Headphones, Repeat2 } from "lucide-react";
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
  const { isLight } = useTheme();
  const activeTones = getModuleTones(MODULE_COLOR[active], isLight);

  const handle = useCallback(
    (m: SwitchableModule) => {
      onSelect(m);
      setOpen(false);
    },
    [onSelect],
  );

  return (
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
        className="w-[min(18rem,calc(100vw-24px))] sm:w-64 p-2.5 sm:p-2 rounded-2xl border border-border/70 bg-popover/95 backdrop-blur-xl shadow-2xl ring-1 ring-foreground/5 origin-top-right data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-top-2 data-[state=closed]:slide-out-to-top-2"
        style={{
          boxShadow:
            "0 10px 40px -12px hsl(var(--foreground) / 0.25), 0 0 0 1px hsl(var(--border) / 0.6), inset 0 1px 0 hsl(var(--foreground) / 0.04)",
        }}
      >
        <div className="px-2 pt-1 pb-2 text-[10px] font-semibold tracking-wider uppercase text-muted-foreground">
          Alternar sessão
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
                className="group flex items-center gap-3 px-2.5 py-2.5 sm:py-2 rounded-xl text-left transition-all duration-200 ease-out hover:bg-muted/60 hover:translate-x-0.5 active:scale-[0.98] focus:outline-none focus-visible:ring-2 animate-fade-in"
                style={{
                  boxShadow: isActive ? `inset 0 0 0 1px ${tones.ring}` : "none",
                  backgroundColor: isActive ? tones.bg : "transparent",
                  animationDelay: `${idx * 40}ms`,
                  animationFillMode: "backwards",
                }}
              >
                <span
                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg transition-transform duration-200 group-hover:scale-105"
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
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
});

export default ModuleSwitcher;
