import { useEffect, useState } from "react";
import { Download, Heart, Bookmark, ListMusic, Clock, Headphones, Music, MonitorPlay, Library, ChevronRight, Star } from "lucide-react";
import { getFavoritesMetadata, getHistory, getPlaylists } from "@/lib/localStorage";
import { getWatchLater } from "@/components/VideoHomeScreen";
import { getFavoriteEpisodes, getSubscriptions, PODCAST_SUBS_EVENT } from "@/lib/podcastStorage";
import { getAllSavedSongs } from "@/lib/indexedDB";
import { getFavoriteChannels, FAV_CHANNELS_EVENT } from "@/lib/favoriteChannels";

export type LibraryFilter = "music" | "podcast" | "video";
export type LibraryToolId = "downloads" | "liked" | "watchlater" | "playlists" | "podcasts" | "history" | "favchannels";


interface LibraryHubScreenProps {
  homeMode?: "hub" | "music" | "video";
  onHomeModeChange?: (mode: "hub" | "music" | "video") => void;
  onOpenTool?: (id: LibraryToolId, filter: LibraryFilter) => void;
  initialFilter?: LibraryFilter;
}

interface Tile {
  id: LibraryToolId;
  label: string;
  description: string;
  icon: React.ElementType;
  gradient: string;
  filters: LibraryFilter[];
  count: number;
}

const LibraryHubScreen = ({ onHomeModeChange, onOpenTool, initialFilter }: LibraryHubScreenProps) => {
  const [filter, setFilter] = useState<LibraryFilter>(initialFilter ?? "music");
  useEffect(() => { if (initialFilter) setFilter(initialFilter); }, [initialFilter]);
  const [counts, setCounts] = useState({
    downloadsMusic: 0,
    likedMusic: 0,
    likedVideo: 0,
    likedPodcast: 0,
    watchLater: 0,
    playlists: 0,
    historyMusic: 0,
    historyVideo: 0,
    historyPodcast: 0,
    podcastShows: 0,
    favChannels: 0,
  });

  useEffect(() => {
    let cancelled = false;
    const recompute = async () => {
      try {
        const favs = getFavoritesMetadata();
        const likedMusic = favs.filter((f: any) => (f?.type ?? "music") === "music").length;
        const likedVideo = favs.filter((f: any) => (f?.type ?? "music") === "video").length;
        const likedPodcast = getFavoriteEpisodes().length;
        const watchLater = getWatchLater().length;
        const playlists = getPlaylists().length;
        const history = getHistory();
        const historyMusic = history.filter((h) => (h.type ?? "music") === "music").length;
        const historyVideo = history.filter((h) => h.type === "video").length;
        const historyPodcast = history.filter((h) => h.type === "podcast").length;
        let downloadsMusic = 0;
        try { downloadsMusic = (await getAllSavedSongs()).length; } catch {}
        const podcastShows = getSubscriptions().length;
        const favChannels = getFavoriteChannels().length;
        if (!cancelled) {
          setCounts({ downloadsMusic, likedMusic, likedVideo, likedPodcast, watchLater, playlists, historyMusic, historyVideo, historyPodcast, podcastShows, favChannels });
        }
      } catch {}
    };
    recompute();
    const onStorage = () => recompute();
    window.addEventListener("storage", onStorage);
    window.addEventListener("demus:history-updated", onStorage);
    window.addEventListener("demus:favorites-updated", onStorage);
    window.addEventListener("demus:watchlater-updated", onStorage);
    window.addEventListener("demus:playlists-updated", onStorage);
    window.addEventListener("demus:downloads-updated", onStorage);
    window.addEventListener("xerife:podcast-favs-updated", onStorage);
    window.addEventListener(FAV_CHANNELS_EVENT, onStorage);
    window.addEventListener(PODCAST_SUBS_EVENT, onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("demus:history-updated", onStorage);
      window.removeEventListener("demus:favorites-updated", onStorage);
      window.removeEventListener("demus:watchlater-updated", onStorage);
      window.removeEventListener("demus:playlists-updated", onStorage);
      window.removeEventListener("demus:downloads-updated", onStorage);
      window.removeEventListener("xerife:podcast-favs-updated", onStorage);
      window.removeEventListener(FAV_CHANNELS_EVENT, onStorage);
      window.removeEventListener(PODCAST_SUBS_EVENT, onStorage);
    };
  }, [filter]);

  const countFor = (id: LibraryToolId): number => {
    if (id === "downloads") return filter === "music" ? counts.downloadsMusic : 0;
    if (id === "liked") return filter === "music" ? counts.likedMusic : filter === "video" ? counts.likedVideo : counts.likedPodcast;
    if (id === "watchlater") return counts.watchLater;
    if (id === "playlists") return counts.playlists;
    if (id === "podcasts") return counts.podcastShows;
    if (id === "favchannels") return filter === "podcast" ? counts.podcastShows : counts.favChannels;
    if (id === "history") return filter === "music" ? counts.historyMusic : filter === "video" ? counts.historyVideo : counts.historyPodcast;
    return 0;
  };

  const handleClick = (id: LibraryToolId) => {
    // Sync homeMode when possible so downstream screens filter correctly
    if (filter === "music") onHomeModeChange?.("music");
    else if (filter === "video") onHomeModeChange?.("video");
    onOpenTool?.(id, filter);
  };

  const tiles: Tile[] = [
    { id: "downloads", label: "Downloads", description: "Conteúdo baixado", icon: Download, gradient: "from-emerald-500/30 to-emerald-500/5", filters: ["music", "podcast", "video"], count: countFor("downloads") },
    { id: "liked", label: "Curtidos", description: filter === "video" ? "Vídeos que você curtiu" : filter === "podcast" ? "Episódios curtidos" : "Músicas que você curtiu", icon: Heart, gradient: "from-pink-500/30 to-rose-500/5", filters: ["music", "podcast", "video"], count: countFor("liked") },
    { id: "watchlater", label: "Assistir mais tarde", description: "Vídeos salvos para depois", icon: Bookmark, gradient: "from-sky-500/30 to-blue-500/5", filters: ["video"], count: countFor("watchlater") },
    { id: "playlists", label: "Playlists", description: "Suas coleções", icon: ListMusic, gradient: "from-violet-500/30 to-purple-500/5", filters: ["music", "video"], count: countFor("playlists") },
    { id: "favchannels", label: "Favoritos", description: filter === "podcast" ? "Canais de podcast favoritados" : "Canais que você favoritou", icon: Star, gradient: "from-yellow-500/30 to-amber-500/5", filters: ["podcast", "video"], count: countFor("favchannels") },
    { id: "history", label: "Histórico", description: "Reproduções recentes", icon: Clock, gradient: "from-slate-500/30 to-zinc-500/5", filters: ["music", "podcast", "video"], count: countFor("history") },
  ];

  const visible = tiles.filter((t) => t.filters.includes(filter));

  const filters: { id: LibraryFilter; label: string; icon: React.ElementType }[] = [
    { id: "music", label: "Xerife Music", icon: Music },
    { id: "podcast", label: "Podcasts", icon: Headphones },
    { id: "video", label: "Xerife Videos", icon: MonitorPlay },
  ];

  return (
    <div className="px-4 lg:px-8 py-2 space-y-5">
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-primary/15 text-primary">
          <Library size={18} />
        </span>
        <div>
          <h1 className="text-xl lg:text-2xl font-display font-bold text-foreground leading-tight">Biblioteca</h1>
          <p className="text-xs text-muted-foreground">Tudo o que você salvou em um só lugar</p>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
        {filters.map((f) => {
          const Icon = f.icon;
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${
                active
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-secondary/60 text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              <Icon size={13} />
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 lg:gap-4">
        {visible.map((tile) => {
          const Icon = tile.icon;
          return (
            <button
              key={tile.id}
              onClick={() => handleClick(tile.id)}
              className={`group relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br ${tile.gradient} p-4 lg:p-5 text-left transition-all hover:border-primary/40 hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98]`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-background/80 backdrop-blur text-foreground shadow-sm">
                  <Icon size={18} />
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full text-[10px] font-bold bg-background/90 text-foreground border border-border">
                    {tile.count}
                  </span>
                  <ChevronRight size={16} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
              <div className="mt-4">
                <p className="text-sm lg:text-base font-semibold text-foreground">{tile.label}</p>
                <p className="text-[11px] lg:text-xs text-muted-foreground mt-0.5 line-clamp-2">{tile.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default LibraryHubScreen;
