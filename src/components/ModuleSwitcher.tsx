import { memo, useCallback, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Music, MonitorPlay, Headphones, Repeat2, Check } from "lucide-react";
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

const MODULE_IDS = Object.keys(MODULE_LABEL) as SwitchableModule[];

/** Direções das partículas em parallax (dx, dy em px a partir do ponto clicado) */
const FX_DOTS: { dx: number; dy: number; s: number; o: number; d: number }[] = [
  { dx: 130, dy: -50, s: 7, o: 0.9, d: 0.7 },
  { dx: 170, dy: 40, s: 5, o: 0.7, d: 0.85 },
  { dx: -120, dy: -70, s: 6, o: 0.8, d: 0.8 },
  { dx: -160, dy: 60, s: 5, o: 0.6, d: 0.95 },
  { dx: 100, dy: 110, s: 8, o: 0.75, d: 1.0 },
  { dx: -90, dy: 130, s: 6, o: 0.85, d: 1.05 },
  { dx: 50, dy: -150, s: 5, o: 0.65, d: 0.75 },
  { dx: -60, dy: -140, s: 7, o: 0.8, d: 0.9 },
  { dx: 180, dy: -100, s: 4, o: 0.55, d: 1.1 },
  { dx: -180, dy: 110, s: 6, o: 0.6, d: 1.15 },
];

/** Anéis expansivos em velocidades diferentes = sensação de parallax/depth */
const FX_RINGS = [
  { size: 240, dur: "0.55s", delay: "0s", opacity: 0.55 },
  { size: 520, dur: "0.75s", delay: "0.06s", opacity: 0.38 },
  { size: 920, dur: "0.95s", delay: "0.12s", opacity: 0.24 },
];

const ModuleSwitcher = memo(function ModuleSwitcher({ active, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [transitionTo, setTransitionTo] = useState<SwitchableModule | null>(null);
  /** Origem do wipe/anéis: ponto onde o usuário clicou (centro como fallback) */
  const [fxOrigin, setFxOrigin] = useState<{ x: number; y: number } | null>(null);
  const { isLight } = useTheme();
  const activeTones = getModuleTones(MODULE_COLOR[active], isLight);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handle = useCallback(
    (m: SwitchableModule, x?: number, y?: number) => {
      setOpen(false);
      // Devolve o foco ao gatilho ao fechar via seleção.
      window.setTimeout(() => triggerRef.current?.focus(), 0);
      if (m === active) return;
      setFxOrigin({
        x: typeof x === "number" ? x : window.innerWidth / 2,
        y: typeof y === "number" ? y : window.innerHeight * 0.45,
      });
      setTransitionTo(m);
      window.setTimeout(() => onSelect(m), 240);
      window.setTimeout(() => { setTransitionTo(null); setFxOrigin(null); }, 850);
    },
    [onSelect, active],
  );

  // Navegação por teclado entre os 3 botões (setas, Home/End).
  const handleGridKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const keys = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"];
      if (!keys.includes(e.key)) return;
      e.preventDefault();
      const items = itemRefs.current.filter(Boolean) as HTMLButtonElement[];
      if (!items.length) return;
      const current = items.findIndex((el) => el === document.activeElement);
      let next = current < 0 ? 0 : current;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (next + 1) % items.length;
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
        next = (next - 1 + items.length) % items.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = items.length - 1;
      items[next]?.focus();
    },
    [],
  );


  const TransitionIcon = transitionTo ? MODULE_ICON[transitionTo] : Music;
  const transitionTones = getModuleTones(
    MODULE_COLOR[transitionTo ?? active],
    isLight,
  );

  return (
    <>


    {/* Tela de passagem entre sessões — wipe circular a partir do clique +
        anéis/partículas em PARALLAX + ícone herói. Todo o conjunto sai via
        keyframe xerife-fx-out antes do unmount (~850ms). */}
    {transitionTo && fxOrigin && (
      <div
        aria-hidden
        data-module-fx
        className="fixed inset-0 z-[100] overflow-hidden"
        style={{
          animation: "xerife-fx-out 0.85s ease both",
          backgroundColor: "hsl(var(--background) / 0.72)",
          backdropFilter: "blur(4px)",
          ["--fx-x" as unknown as string]: `${fxOrigin.x}px`,
          ["--fx-y" as unknown as string]: `${fxOrigin.y}px`,
        } as React.CSSProperties}
      >
        {/* Wipe circular na cor do módulo, a partir do ponto tocado/clicado */}
        <div
          className="xerife-fx-wipe fixed inset-0"
          style={{
            backgroundColor: `hsl(${MODULE_COLOR[transitionTo]} / 0.16)`,
            backgroundImage: `radial-gradient(circle at var(--fx-x) var(--fx-y), hsl(${MODULE_COLOR[transitionTo]} / 0.34), transparent 58%)`,
            animation: "xerife-fx-wipe 0.62s cubic-bezier(0.22, 0.61, 0.36, 1) both",
          }}
        />

        {/* Anéis em parallax (velocidades diferentes) saindo do ponto do clique */}
        {FX_RINGS.map((r, i) => (
          <div
            key={`ring-${i}`}
            className="xerife-fx-ring fixed rounded-full"
            style={{
              left: fxOrigin.x,
              top: fxOrigin.y,
              width: r.size,
              height: r.size,
              boxShadow: `inset 0 0 0 3px hsl(${MODULE_COLOR[transitionTo]} / ${r.opacity})`,
              animation: `xerife-fx-ring ${r.dur} cubic-bezier(0.22, 0.61, 0.36, 1) ${r.delay} both`,
            }}
          />
        ))}

        {/* Partículas em parallax dispersando do clique */}
        {FX_DOTS.map((p, i) => (
          <span
            key={`dot-${i}`}
            className="xerife-fx-dot fixed rounded-full"
            style={{
              left: fxOrigin.x,
              top: fxOrigin.y,
              width: p.s,
              height: p.s,
              backgroundColor: `hsl(${MODULE_COLOR[transitionTo]} / ${p.o})`,
              boxShadow: `0 0 ${p.s * 2}px hsl(${MODULE_COLOR[transitionTo]} / 0.9)`,
              animation: `xerife-fx-dot ${p.d}s cubic-bezier(0.22, 0.61, 0.36, 1) both`,
              ["--fx-dx" as unknown as string]: `${p.dx}px`,
              ["--fx-dy" as unknown as string]: `${p.dy}px`,
            } as React.CSSProperties}
          />
        ))}

        {/* Ícone herói central com pop + float, e label com tracking animado */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <span
              className="xerife-fx-icon-pop inline-flex items-center justify-center w-[72px] h-[72px] rounded-[22px]"
              style={{
                color: transitionTones.fg,
                backgroundColor: transitionTones.bg,
                boxShadow: `0 0 0 1.5px ${transitionTones.ring}, 0 22px 55px -18px hsl(${MODULE_COLOR[transitionTo]} / 0.8), 0 0 60px -10px hsl(${MODULE_COLOR[transitionTo]} / 0.5)`,
                animation: "xerife-fx-icon-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.08s both",
              }}
            >
              <span style={{ animation: "xerife-fx-icon-float 1.1s ease-in-out 0.55s infinite" }} className="xerife-fx-icon-float inline-flex">
                <TransitionIcon size={32} strokeWidth={2.2} />
              </span>
            </span>
            <span
              className="xerife-fx-label-in text-[15px] font-bold tracking-wide"
              style={{
                color: transitionTones.fg,
                animation: "xerife-fx-label-in 0.45s cubic-bezier(0.22, 0.61, 0.36, 1) 0.18s both",
                textShadow: `0 2px 18px hsl(${MODULE_COLOR[transitionTo]} / 0.6)`,
              }}
            >
              Xerife {MODULE_LABEL[transitionTo]}
            </span>
          </div>
        </div>
      </div>
    )}

    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>

      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogPrimitive.Trigger asChild>
              <button
                ref={triggerRef}
                aria-label="Alternar entre Music, Vídeos e Podcasts"
                aria-haspopup="dialog"
                aria-expanded={open}
                className="relative inline-flex items-center justify-center w-9 h-9 rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                style={{
                  color: activeTones.fg,
                  backgroundColor: open ? activeTones.bgHover : activeTones.bg,
                  borderColor: activeTones.ring,
                }}
              >
                <Repeat2 size={18} strokeWidth={2.2} />
              </button>
            </DialogPrimitive.Trigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">Alternar sessão</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[90] backdrop-blur-md bg-background/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:duration-200 data-[state=closed]:duration-150 motion-reduce:animate-none" />
        <DialogPrimitive.Content
          aria-label="Alternar sessão"
          onEscapeKeyDown={() => setOpen(false)}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            triggerRef.current?.focus();
          }}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            const idx = Math.max(0, MODULE_IDS.indexOf(active));
            (itemRefs.current[idx] ?? itemRefs.current[0])?.focus();
          }}
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[95] w-[min(20rem,calc(100vw-24px))] sm:w-80 max-h-[calc(100dvh-5rem)] overflow-y-auto p-2.5 sm:p-2 rounded-2xl border border-border/70 bg-popover/95 backdrop-blur-xl shadow-2xl ring-1 ring-foreground/5 origin-center will-change-transform data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:duration-300 data-[state=closed]:duration-150 data-[state=open]:ease-[cubic-bezier(0.16,1,0.3,1)] data-[state=closed]:ease-[cubic-bezier(0.4,0,1,1)] data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 motion-reduce:transition-none motion-reduce:animate-none motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none"

        style={{
          boxShadow:
            "0 20px 50px -18px hsl(var(--foreground) / 0.35), 0 8px 22px -14px hsl(var(--foreground) / 0.22), 0 0 0 1px hsl(var(--border) / 0.6), inset 0 1px 0 hsl(var(--foreground) / 0.05)",
          backgroundImage:
            "linear-gradient(180deg, hsl(var(--foreground) / 0.03) 0%, transparent 40%)",
        }}
      >
        <DialogPrimitive.Title className="sr-only">Alternar sessão</DialogPrimitive.Title>
        <DialogPrimitive.Description className="sr-only">
          Escolha entre Xerife Music, Vídeos ou Podcasts.
        </DialogPrimitive.Description>
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
        <div
          role="group"
          aria-label="Sessões disponíveis"
          onKeyDown={handleGridKeyDown}
          className="grid grid-cols-3 gap-1.5 sm:gap-2"
        >
          {MODULE_IDS.map((id, idx) => {
            const Icon = MODULE_ICON[id];
            const tones = getModuleTones(MODULE_COLOR[id], isLight);
            const isActive = id === active;
            return (
              <button
                key={id}
                ref={(el) => {
                  itemRefs.current[idx] = el;
                }}
                onClick={(e) => handle(id, e.clientX, e.clientY)}
                aria-pressed={isActive}
                aria-current={isActive ? "true" : undefined}
                className="group relative flex flex-col items-center justify-center gap-1.5 px-1.5 py-3 min-h-[4.25rem] rounded-xl transition-all duration-200 ease-out hover:bg-muted/60 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover animate-enter motion-reduce:transition-none motion-reduce:animate-none motion-reduce:active:scale-100"
                style={{
                  boxShadow: isActive ? `inset 0 0 0 1px ${tones.ring}` : "none",
                  backgroundColor: isActive ? tones.bg : "transparent",
                  animationDelay: `${60 + idx * 50}ms`,
                  animationFillMode: "backwards",
                }}
              >
                {isActive && (
                  <span
                    aria-label="Módulo ativo"
                    className="absolute top-1 right-1 inline-flex items-center justify-center w-4 h-4 rounded-full"
                    style={{ color: tones.fg, backgroundColor: tones.bgActive }}
                  >
                    <Check size={10} strokeWidth={3} />
                  </span>
                )}
                <span
                  className="inline-flex items-center justify-center w-9 h-9 rounded-xl transition-transform duration-200 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                  style={{ color: tones.fg, backgroundColor: tones.bg }}
                >
                  <Icon size={18} strokeWidth={2.2} />
                </span>
                <span
                  className="text-[11px] font-semibold leading-tight text-center"
                  style={{ color: isActive ? tones.fg : undefined }}
                >
                  {MODULE_LABEL[id]}
                </span>
              </button>
            );
          })}
        </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
    </>

  );
});

export default ModuleSwitcher;
