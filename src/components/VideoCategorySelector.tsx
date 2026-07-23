import { useState, useRef, useEffect } from "react";
import { ChevronDown, Music2, Gamepad2, Trophy, GraduationCap, Newspaper, TrendingUp, Tv, Film, Laugh, Utensils, Plane, Dumbbell, Code, Palette as PaletteIcon } from "lucide-react";

export interface VideoCategory {
  id: string;
  label: string;
  icon: React.ElementType;
  query: string;
}

export const VIDEO_CATEGORIES: VideoCategory[] = [
  { id: "all", label: "Tudo", icon: TrendingUp, query: "" },
  { id: "music", label: "Música", icon: Music2, query: "música" },
  { id: "gaming", label: "Gaming", icon: Gamepad2, query: "gameplay" },
  { id: "sports", label: "Esportes", icon: Trophy, query: "esportes highlights" },
  { id: "education", label: "Educação", icon: GraduationCap, query: "aula tutorial" },
  { id: "news", label: "Notícias", icon: Newspaper, query: "notícias hoje" },
  { id: "entertainment", label: "Entretenimento", icon: Tv, query: "entretenimento" },
  { id: "movies", label: "Filmes", icon: Film, query: "filmes trailers" },
  { id: "comedy", label: "Comédia", icon: Laugh, query: "comédia stand up" },
  { id: "cooking", label: "Culinária", icon: Utensils, query: "receitas culinária" },
  { id: "travel", label: "Viagem", icon: Plane, query: "viagem turismo" },
  { id: "fitness", label: "Fitness", icon: Dumbbell, query: "treino fitness" },
  { id: "tech", label: "Tecnologia", icon: Code, query: "tecnologia review" },
  { id: "art", label: "Arte", icon: PaletteIcon, query: "arte design" },
];

interface VideoCategorySelectorProps {
  activeCategory: string;
  onSelect: (category: VideoCategory) => void;
}

const VideoCategorySelector = ({ activeCategory, onSelect }: VideoCategorySelectorProps) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = VIDEO_CATEGORIES.find((c) => c.id === activeCategory) || VIDEO_CATEGORIES[0];
  const ActiveIcon = active.icon;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium transition-all active:scale-95 shadow-sm"
      >
        <ActiveIcon size={14} />
        <span>{active.label}</span>
        <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-11 w-52 max-h-72 overflow-y-auto bg-card border border-border rounded-xl shadow-xl z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          {VIDEO_CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isActive = cat.id === activeCategory;
            return (
              <button
                key={cat.id}
                onClick={() => { onSelect(cat); setOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-foreground hover:bg-accent"
                }`}
              >
                <Icon size={15} className={isActive ? "text-primary" : "text-muted-foreground"} />
                <span>{cat.label}</span>
                {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default VideoCategorySelector;
