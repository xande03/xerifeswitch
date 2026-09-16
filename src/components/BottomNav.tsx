import { useEffect, useState } from "react";
import { Home, Search, Heart, Compass, ThumbsUp, Library } from "lucide-react";
import { getFavoritesMetadata } from "@/lib/localStorage";
import { getFavoriteEpisodes } from "@/lib/podcastStorage";

type Tab = "home" | "search" | "library" | "offline" | "profile" | "history" | "playlists" | "podcast" | "libraryhub" | "stats";
type HomeMode = "hub" | "music" | "video";

interface BottomNavProps {
  active: Tab;
  onChange: (tab: Tab) => void;
  homeMode?: HomeMode;
  podcastMode?: boolean;
}

const musicTabs: { id: Tab; icon: typeof Home; label: string }[] = [
  { id: "home", icon: Home, label: "Início" },
  { id: "search", icon: Search, label: "Buscar" },
  { id: "library", icon: Heart, label: "Favoritas" },
  { id: "libraryhub", icon: Library, label: "Biblioteca" },
];

const videoTabs: { id: Tab; icon: typeof Home; label: string }[] = [
  { id: "home", icon: Home, label: "Início" },
  { id: "search", icon: Compass, label: "Explorar" },
  { id: "library", icon: ThumbsUp, label: "Gostei" },
  { id: "libraryhub", icon: Library, label: "Biblioteca" },
];

const podcastTabs: { id: Tab; icon: typeof Home; label: string }[] = [
  { id: "home", icon: Home, label: "Início" },
  { id: "search", icon: Compass, label: "Explorar" },
  { id: "library", icon: Heart, label: "Curtidas" },
  { id: "libraryhub", icon: Library, label: "Biblioteca" },
];


const BottomNav = ({ active, onChange, homeMode = "music", podcastMode = false }: BottomNavProps) => {
  const tabs = podcastMode ? podcastTabs : homeMode === "video" ? videoTabs : musicTabs;
  const activeType: "music" | "video" | "podcast" =
    podcastMode ? "podcast" : homeMode === "video" ? "video" : "music";
  const [likedCount, setLikedCount] = useState(0);

  useEffect(() => {
    const recompute = () => {
      try {
        if (activeType === "podcast") {
          setLikedCount(getFavoriteEpisodes().length);
          return;
        }
        const favs = getFavoritesMetadata();
        const n = favs.filter((f: any) => (f?.type ?? "music") === activeType).length;
        setLikedCount(n);
      } catch {}
    };
    recompute();
    const handler = () => recompute();
    window.addEventListener("storage", handler);
    window.addEventListener("demus:favorites-updated", handler);
    window.addEventListener("xerife:podcast-favs-updated", handler);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener("demus:favorites-updated", handler);
      window.removeEventListener("xerife:podcast-favs-updated", handler);
    };
  }, [activeType]);

  return (
    <nav data-debug="bottomnav" aria-label="bottom-nav" className="bottom-nav w-full flex-shrink-0 bg-background/95 backdrop-blur-md border-t border-border/10 z-50">
      <div
        className="flex items-center justify-around pt-2"
        style={{
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)',
          paddingLeft: 'max(4px, env(safe-area-inset-left))',
          paddingRight: 'max(4px, env(safe-area-inset-right))',
        }}
      >
        {tabs.map(({ id, icon: Icon, label }) => {
          const showBadge = id === "library" && likedCount > 0;
          const isActive = active === id;
          const activeStyle = isActive && podcastMode
            ? { color: "hsl(var(--module-accent))" }
            : undefined;
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              style={activeStyle}
              className={`flex flex-col items-center gap-1 px-3 sm:px-4 py-1 transition-all min-w-[64px] ${
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="relative">
                <Icon size={22} strokeWidth={isActive ? 2.2 : 1.5} />
                {showBadge && (
                  <span
                    key={likedCount}
                    className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center animate-scale-in shadow-sm"
                    style={podcastMode ? { backgroundColor: "hsl(var(--module-accent))", color: "hsl(var(--module-accent-foreground))" } : undefined}
                    aria-label={`${likedCount} curtidos`}
                  >
                    {likedCount > 99 ? "99+" : likedCount}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-medium">{label}</span>
            </button>
          );
        })}

      </div>
    </nav>
  );
};


export default BottomNav;
