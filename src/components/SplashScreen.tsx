import { useState, useEffect } from "react";
import Logo from "./Logo";

const getLogoSize = () => {
  if (typeof window === "undefined") return 240;
  const min = Math.min(window.innerWidth, window.innerHeight);
  return Math.round(Math.max(120, Math.min(240, min * 0.42)));
};

const SplashScreen = ({ onFinish }: { onFinish: () => void }) => {
  const [phase, setPhase] = useState<"logo" | "fade">("logo");
  const [logoSize, setLogoSize] = useState(getLogoSize);
  const [isDark, setIsDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  );

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("fade"), 1800);
    const t2 = setTimeout(() => onFinish(), 2400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onFinish]);

  useEffect(() => {
    const onResize = () => setLogoSize(getLogoSize());
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    const obs = new MutationObserver(() =>
      setIsDark(document.documentElement.classList.contains("dark"))
    );
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      obs.disconnect();
    };
  }, []);

  // Azul mais claro/luminoso no escuro; azul mais profundo e saturado no claro
  const colorFrom = isDark ? "#60a5fa" : "#2563eb";
  const colorTo = isDark ? "#2563eb" : "#1e3a8a";
  const glow = isDark
    ? "drop-shadow-[0_0_50px_rgba(96,165,250,0.45)]"
    : "drop-shadow-[0_6px_24px_rgba(30,58,138,0.35)]";

  return (
    <div
      className={`fixed inset-0 z-[100] bg-background flex flex-col items-center justify-center transition-opacity duration-500 ${
        phase === "fade" ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      {/* Gradient background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full bg-primary/10 blur-[100px] animate-pulse" />
        <div className="absolute bottom-1/4 left-1/3 w-[200px] h-[200px] rounded-full bg-primary/5 blur-[80px] animate-pulse" style={{ animationDelay: "0.5s" }} />
      </div>

      {/* Logo */}
      <div className="relative flex flex-col items-center gap-6 sm:gap-8 px-6 animate-splash-logo">
        <Logo
          size={logoSize}
          colorFrom={colorFrom}
          colorTo={colorTo}
          aria-label="Xerife Switch"
          className={`${glow} transform transition-all duration-1000`}
          style={{ transform: 'rotateY(15deg) rotateX(5deg)' }}
        />

        <div className="flex flex-col items-center gap-3">
          <h1 className="text-3xl sm:text-4xl font-display font-bold text-foreground tracking-tight text-glow">Xerife Switch</h1>
          <p className="text-[10px] text-muted-foreground tracking-[0.35em] uppercase opacity-80">Multi-Streaming</p>
          <div className="flex flex-wrap justify-center items-center gap-2 mt-1 text-[11px] font-semibold uppercase tracking-wider">
            <span className="px-2.5 py-1 rounded-full border border-[hsl(142_72%_40%/0.45)] text-[hsl(142_72%_32%)] dark:text-[hsl(142_72%_55%)] bg-[hsl(142_72%_45%/0.1)]">Music</span>
            <span className="text-muted-foreground/50">·</span>
            <span className="px-2.5 py-1 rounded-full border border-[hsl(0_78%_48%/0.45)] text-[hsl(0_78%_42%)] dark:text-[hsl(0_78%_62%)] bg-[hsl(0_78%_54%/0.1)]">Videos</span>
            <span className="text-muted-foreground/50">·</span>
            <span className="px-2.5 py-1 rounded-full border border-[hsl(265_75%_55%/0.45)] text-[hsl(265_75%_45%)] dark:text-[hsl(265_75%_70%)] bg-[hsl(265_75%_62%/0.1)]">Podcasts</span>
          </div>
        </div>
      </div>

      {/* Circular spinner loader */}
      <div className="absolute bottom-16 sm:bottom-24 w-10 h-10 sm:w-12 sm:h-12" role="status" aria-label="Carregando">
        <div
          className="w-full h-full rounded-full border-[3px] border-foreground/15 border-t-primary"

          style={{ animation: 'spin 0.9s linear infinite' }}
        />
      </div>
    </div>
  );
};

export default SplashScreen;
