import { Home, Search, Heart, Compass, MonitorPlay, Library } from "lucide-react";

type Tab = "home" | "search" | "library" | "offline" | "profile" | "history" | "playlists" | "podcast" | "libraryhub";
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
  { id: "library", icon: MonitorPlay, label: "Inscrições" },
  { id: "libraryhub", icon: Library, label: "Biblioteca" },
];

const podcastTabs: { id: Tab; icon: typeof Home; label: string }[] = [
  { id: "home", icon: Home, label: "Início" },
  { id: "search", icon: Compass, label: "Explorar" },
  { id: "library", icon: Heart, label: "Favoritos" },
  { id: "libraryhub", icon: Library, label: "Biblioteca" },
];


const BottomNav = ({ active, onChange, homeMode = "music", podcastMode = false }: BottomNavProps) => {
  const tabs = podcastMode ? podcastTabs : homeMode === "video" ? videoTabs : musicTabs;

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
        {tabs.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={`flex flex-col items-center gap-1 px-3 sm:px-4 py-1 transition-all min-w-[64px] ${
              active === id
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon size={22} strokeWidth={active === id ? 2.2 : 1.5} />
            <span className="text-[10px] font-medium">{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
};

export default BottomNav;
