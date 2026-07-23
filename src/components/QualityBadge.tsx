import { useEffect, useRef, useState } from "react";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

const LABELS: Record<string, string> = {
  auto: "Auto",
  hd2160: "2160p",
  hd1440: "1440p",
  hd1080: "1080p",
  hd720: "720p",
  large: "480p",
  medium: "360p",
  small: "240p",
  tiny: "144p",
};

/**
 * Floating pill anchored over the video player showing the resolution
 * that is *actually being rendered* by YouTube (not the transitional
 * hint). When the user's saved preference cannot be honored for the
 * current video, the badge shows the graceful fallback (pref → active).
 */
const QualityBadge = () => {
  const [pref, setPref] = useState<string>(() => {
    try { return localStorage.getItem("demus_video_quality") || "auto"; } catch { return "auto"; }
  });
  const [active, setActive] = useState<string>("auto");
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = (persist = false) => {
    setVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (!persist) {
      hideTimer.current = setTimeout(() => setVisible(false), 3800);
    }
  };

  useEffect(() => {
    const onPref = (e: Event) => {
      const q = (e as CustomEvent<string>).detail;
      if (!q) return;
      setPref(q);
      show(true);
    };
    const onActive = (e: Event) => {
      const q = (e as CustomEvent<string>).detail;
      if (!q || q === "unknown") return;
      setActive(q);
      show();
    };
    const onLoading = (e: Event) => {
      const v = !!(e as CustomEvent<boolean>).detail;
      setLoading(v);
      show(v);
    };
    window.addEventListener("demus:quality-changed", onPref as EventListener);
    window.addEventListener("demus:quality-active", onActive as EventListener);
    window.addEventListener("demus:quality-loading", onLoading as EventListener);
    return () => {
      window.removeEventListener("demus:quality-changed", onPref as EventListener);
      window.removeEventListener("demus:quality-active", onActive as EventListener);
      window.removeEventListener("demus:quality-loading", onLoading as EventListener);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  if (!visible) return null;

  const activeLabel = LABELS[active] ?? active;
  const prefLabel = LABELS[pref] ?? pref;
  const isAuto = pref === "auto";
  const isFallback = !isAuto && active && active !== "unknown" && active !== pref;
  const isConfirmed = !loading && !isFallback && (isAuto ? active !== "unknown" : active === pref);

  const label = isAuto
    ? (active && active !== "unknown" ? `Auto · ${activeLabel}` : "Auto")
    : (isFallback ? `${prefLabel} → ${activeLabel}` : prefLabel);

  const tone = loading
    ? "bg-black/70 text-white"
    : isFallback
      ? "bg-amber-500/90 text-black shadow-[0_0_0_2px_hsl(45_100%_50%/0.35),0_4px_18px_-2px_hsl(45_100%_50%/0.6)]"
      : isConfirmed
        ? "bg-primary/85 text-primary-foreground shadow-[0_0_0_2px_hsl(var(--primary)/0.35),0_4px_18px_-2px_hsl(var(--primary)/0.6)]"
        : "bg-black/70 text-white shadow-lg";

  return (
    <div
      className={`absolute top-2 right-2 z-[190] pointer-events-none select-none flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide backdrop-blur-md transition-all duration-300 ${tone}`}
      aria-live="polite"
    >
      {loading ? (
        <Loader2 size={12} className="animate-spin" />
      ) : isFallback ? (
        <AlertTriangle size={12} />
      ) : isConfirmed ? (
        <CheckCircle2 size={12} className="animate-in fade-in zoom-in" />
      ) : (
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
      )}
      <span>{label}</span>
      {!loading && isConfirmed && <span className="opacity-80 text-[9px] uppercase">aplicado</span>}
      {!loading && isFallback && <span className="opacity-80 text-[9px] uppercase">fallback</span>}
    </div>
  );
};

export default QualityBadge;
