import { memo, useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence, MotionConfig, LayoutGroup } from "framer-motion";
import { Home, Music, MonitorPlay, Headphones } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { getModuleTones } from "@/lib/moduleTones";

export type IslandModuleId = "hub" | "music" | "video" | "podcast";

interface Props {
  activeModule: IslandModuleId;
  onSelect: (id: IslandModuleId) => void;
}

const MODULES: { id: IslandModuleId; label: string; Icon: typeof Home; color: string }[] = [
  { id: "hub", label: "Início", Icon: Home, color: "217 91% 60%" },
  { id: "music", label: "Música", Icon: Music, color: "142 55% 45%" },
  { id: "video", label: "Vídeo", Icon: MonitorPlay, color: "0 68% 55%" },
  { id: "podcast", label: "Podcast", Icon: Headphones, color: "270 55% 60%" },
];


const SPRING = { type: "spring" as const, stiffness: 420, damping: 32, mass: 0.6 };

const IslandButton = memo(function IslandButton({
  id, label, Icon, color, isActive, onSelect, isLight,
}: {
  id: IslandModuleId;
  label: string;
  Icon: typeof Home;
  color: string;
  isActive: boolean;
  onSelect: (id: IslandModuleId) => void;
  isLight: boolean;
}) {
  const handle = useCallback(() => onSelect(id), [id, onSelect]);
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const tones = getModuleTones(color, isLight);

  // Estado padrão (inativo): apenas texto discreto; hover revela tinte suave.
  // Estado ativo: fg colorido + bg tingido; hover/pressed intensificam a opacidade.
  const bg = isActive
    ? pressed
      ? tones.bgActive
      : hover
      ? tones.bgHover
      : tones.bg
    : hover || focused
    ? tones.bg
    : "transparent";

  return (
    <motion.button
      layout
      onClick={handle}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      aria-pressed={isActive}
      aria-label={label}
      title={label}
      className="relative flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-full text-[11px] sm:text-[12px] font-bold outline-none min-w-[30px] min-h-[30px] justify-center tracking-wide transition-colors duration-150"
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
      <motion.span layout="position" className="flex items-center">
        <Icon size={14} strokeWidth={2.2} />
      </motion.span>

      <AnimatePresence initial={false} mode="popLayout">
        {isActive && (
          <motion.span
            key="lbl"
            layout
            initial={{ opacity: 0, width: 0, marginLeft: 0 }}
            animate={{ opacity: 1, width: "auto", marginLeft: 3 }}
            exit={{ opacity: 0, width: 0, marginLeft: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="overflow-hidden whitespace-nowrap max-w-[64px] xs:max-w-[80px] truncate"
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );

});

function DynamicIslandModulesInner({ activeModule, onSelect }: Props) {
  // Respect OS-level reduced motion: disable spring / layout tweens
  const [reduce, setReduce] = useState(false);
  const { isLight } = useTheme();
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduce(mq.matches || document.documentElement.classList.contains("force-reduced-motion"));
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  const transition = reduce ? { duration: 0 } : SPRING;

  return (
    <MotionConfig transition={transition} reducedMotion="user">
      <LayoutGroup id="xerife-island">
        <motion.div
          layout={!reduce}
          className="md:hidden flex items-center gap-0.5 p-1 rounded-full border border-border bg-secondary shadow-md overflow-hidden shrink min-w-0 max-w-[min(calc(100vw-160px),22rem)]"
        >
          {MODULES.map((m) => (
            <IslandButton
              key={m.id}
              id={m.id}
              label={m.label}
              Icon={m.Icon}
              color={m.color}
              isActive={activeModule === m.id}
              onSelect={onSelect}
              isLight={isLight}
            />
          ))}
        </motion.div>
      </LayoutGroup>
    </MotionConfig>
  );
}


const DynamicIslandModules = memo(DynamicIslandModulesInner);
export default DynamicIslandModules;
