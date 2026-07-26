import { useState, useEffect } from "react";
import Logo from "./Logo";

const SplashScreen = ({ onFinish }: { onFinish: () => void }) => {
  const [phase, setPhase] = useState<"logo" | "fade">("logo");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("fade"), 1800);
    const t2 = setTimeout(() => onFinish(), 2400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onFinish]);

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
      <div className="relative flex flex-col items-center gap-8 animate-splash-logo">
        <Logo size={240} className="drop-shadow-[0_0_50px_rgba(34,197,94,0.3)] transform transition-all duration-1000" style={{ transform: 'rotateY(15deg) rotateX(5deg)' }} />
        <div className="flex flex-col items-center gap-3">
          <h1 className="text-4xl font-display font-bold text-foreground tracking-tight text-glow">Xerife Switch</h1>
          <p className="text-[10px] text-muted-foreground tracking-[0.35em] uppercase opacity-80">Multi-Streaming</p>
          <div className="flex items-center gap-2 mt-1 text-[11px] font-semibold uppercase tracking-wider">
            <span className="px-2.5 py-1 rounded-full border border-[hsl(142_72%_45%/0.4)] text-[hsl(142_72%_55%)] bg-[hsl(142_72%_45%/0.08)]">Music</span>
            <span className="text-muted-foreground/50">·</span>
            <span className="px-2.5 py-1 rounded-full border border-[hsl(0_78%_54%/0.4)] text-[hsl(0_78%_62%)] bg-[hsl(0_78%_54%/0.08)]">Videos</span>
            <span className="text-muted-foreground/50">·</span>
            <span className="px-2.5 py-1 rounded-full border border-[hsl(265_75%_62%/0.4)] text-[hsl(265_75%_70%)] bg-[hsl(265_75%_62%/0.08)]">Podcasts</span>
          </div>
        </div>
      </div>

      {/* Circular spinner loader */}
      <div className="absolute bottom-24 w-12 h-12" role="status" aria-label="Carregando">
        <div
          className="w-full h-full rounded-full border-[3px] border-white/15 border-t-primary"
          style={{ animation: 'spin 0.9s linear infinite' }}
        />
      </div>
    </div>
  );
};

export default SplashScreen;
