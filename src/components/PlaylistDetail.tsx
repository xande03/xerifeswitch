import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Play, Shuffle, Pencil, Trash2, Check, X, ListMusic, ChevronUp, ChevronDown, MoreVertical, Music, Search } from "lucide-react";
import { motion } from "framer-motion";
import { Song } from "@/data/mockSongs";
import {
  Playlist,
  renamePlaylist,
  deletePlaylist,
  removeSongFromPlaylist,
  reorderPlaylistSongs,
  getPlaylists,
} from "@/lib/localStorage";
import BlurImage from "@/components/BlurImage";
import { useAmbientTheme } from "@/hooks/useAmbientTheme";


interface PlaylistDetailProps {
  playlist: Playlist;
  onBack: () => void;
  onUpdate: (next: Playlist | null) => void;
  onPlaySong: (song: Song, queue: Song[]) => void;
  currentSongId?: string;
}

export const PlaylistDetail = ({
  playlist,
  onBack,
  onUpdate,
  onPlaySong,
  currentSongId,
}: PlaylistDetailProps) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(playlist.name);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "title" | "artist">("all");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setNameDraft(playlist.name);
  }, [playlist.name]);

  useEffect(() => {
    if (isEditingName) inputRef.current?.focus();
  }, [isEditingName]);

  const songs = playlist.songs as Song[];
  const cover = useMemo(
    () => songs.find((s) => s?.cover)?.cover || "",
    [songs]
  );

  const refresh = () => {
    const updated = getPlaylists().find((p) => p.id === playlist.id);
    onUpdate(updated || null);
  };

  const handleSaveName = () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setNameDraft(playlist.name);
      setIsEditingName(false);
      return;
    }
    renamePlaylist(playlist.id, trimmed);
    setIsEditingName(false);
    refresh();
  };

  const handleDeletePlaylist = () => {
    if (!confirm(`Excluir a playlist "${playlist.name}"?`)) return;
    deletePlaylist(playlist.id);
    onUpdate(null);
    onBack();
  };

  const handlePlayAll = () => {
    if (songs.length === 0) return;
    onPlaySong(songs[0], songs.slice(1));
  };

  const handleShuffle = () => {
    if (songs.length === 0) return;
    const shuffled = [...songs].sort(() => Math.random() - 0.5);
    onPlaySong(shuffled[0], shuffled.slice(1));
  };

  const handleRemove = (songId: string) => {
    removeSongFromPlaylist(playlist.id, songId);
    setOpenMenu(null);
    refresh();
  };

  const handleMove = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= songs.length) return;
    reorderPlaylistSongs(playlist.id, index, target);
    setOpenMenu(null);
    refresh();
  };

  const ambient = useAmbientTheme(cover);
  const ambientActive = !!ambient.gradient;

  return (
    <div
      className="relative px-4 pb-32 space-y-6 -mx-4 rounded-b-3xl"
      style={
        ambientActive
          ? ({
              backgroundColor: ambient.solid,
              backgroundImage: ambient.gradient,
              transition: 'background-color 1s ease-in-out',
              paddingLeft: '1rem',
              paddingRight: '1rem',
              ['--foreground' as any]: ambient.foregroundHsl,
              ['--muted-foreground' as any]: ambient.mutedForegroundHsl,
              color: ambient.foreground,
            } as React.CSSProperties)
          : undefined
      }
    >

      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={18} /> Voltar
        </button>
        <button
          onClick={handleDeletePlaylist}
          className="p-2 rounded-full hover:bg-destructive/10 text-destructive transition-colors"
          aria-label="Excluir playlist"
        >
          <Trash2 size={18} />
        </button>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row items-center sm:items-end gap-5"
      >
        <div className="w-40 h-40 sm:w-48 sm:h-48 rounded-2xl overflow-hidden bg-primary/10 flex items-center justify-center shadow-xl shadow-primary/10 flex-shrink-0">
          {cover ? (
            <BlurImage src={cover} alt={playlist.name} className="w-full h-full object-cover" />
          ) : (
            <ListMusic size={64} className="text-primary" />
          )}
        </div>

        <div className="flex-1 min-w-0 text-center sm:text-left space-y-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-bold">
            Playlist
          </p>
          {isEditingName ? (
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveName();
                  if (e.key === "Escape") {
                    setNameDraft(playlist.name);
                    setIsEditingName(false);
                  }
                }}
                className="flex-1 bg-secondary border border-border rounded-xl px-4 py-2 text-2xl font-display font-bold focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                onClick={handleSaveName}
                className="p-2 rounded-full bg-primary text-primary-foreground"
                aria-label="Salvar"
              >
                <Check size={18} />
              </button>
              <button
                onClick={() => {
                  setNameDraft(playlist.name);
                  setIsEditingName(false);
                }}
                className="p-2 rounded-full hover:bg-accent"
                aria-label="Cancelar"
              >
                <X size={18} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 justify-center sm:justify-start">
              <h1 className="text-3xl sm:text-4xl font-display font-bold text-foreground truncate">
                {playlist.name}
              </h1>
              <button
                onClick={() => setIsEditingName(true)}
                className="p-2 rounded-full hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Renomear"
              >
                <Pencil size={16} />
              </button>
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            {songs.length} {songs.length === 1 ? "música" : "músicas"}
          </p>

          <div className="flex items-center gap-3 justify-center sm:justify-start pt-2">
            <button
              onClick={handlePlayAll}
              disabled={songs.length === 0}
              className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-full font-bold shadow-lg shadow-primary/30 disabled:opacity-40 transition-transform active:scale-95"
            >
              <Play size={18} fill="currentColor" /> Tocar
            </button>
            <button
              onClick={handleShuffle}
              disabled={songs.length === 0}
              className="flex items-center gap-2 px-5 py-3 bg-secondary text-foreground rounded-full font-bold disabled:opacity-40 transition-transform active:scale-95"
            >
              <Shuffle size={16} /> Aleatório
            </button>
          </div>
        </div>
      </motion.div>

      {songs.length > 0 && (
        <div className="space-y-2">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por título ou artista..."
              className="w-full bg-secondary border border-border rounded-full pl-9 pr-9 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-accent text-muted-foreground"
                aria-label="Limpar"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            {([
              { id: "all", label: "Tudo" },
              { id: "title", label: "Título" },
              { id: "artist", label: "Artista" },
            ] as const).map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                  filter === f.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1">
        {songs.length === 0 ? (
          <div className="py-16 text-center opacity-30">
            <Music size={48} className="mx-auto" />
            <p className="mt-3 text-sm">Adicione músicas a esta playlist</p>
          </div>
        ) : (() => {
          const q = query.trim().toLowerCase();
          const filtered = songs
            .map((song, index) => ({ song, index }))
            .filter(({ song }) => {
              if (!q) return true;
              const title = (song.title || "").toLowerCase();
              const artist = (song.artist || "").toLowerCase();
              if (filter === "title") return title.includes(q);
              if (filter === "artist") return artist.includes(q);
              return title.includes(q) || artist.includes(q);
            });

          if (filtered.length === 0) {
            return (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Nenhuma música encontrada para "{query}"
              </div>
            );
          }

          return filtered.map(({ song, index }) => {
            const isActive = song.id === currentSongId;
            const isMenuOpen = openMenu === song.id;
            return (
              <div
                key={`${song.id}-${index}`}
                className={`flex items-center gap-3 p-2 sm:p-3 rounded-2xl group hover:bg-secondary/60 transition-colors ${
                  isActive ? "bg-primary/10" : ""
                }`}
              >
                <span className="w-6 text-xs text-muted-foreground text-right">
                  {index + 1}
                </span>
                <button
                  onClick={() => onPlaySong(song, songs.slice(index + 1))}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left"
                >
                  <div className="w-11 h-11 rounded-lg overflow-hidden bg-secondary flex-shrink-0">
                    {song.cover ? (
                      <BlurImage src={song.cover} alt={song.title} className="w-full h-full object-cover" />
                    ) : (
                      <Music size={20} className="m-auto mt-3 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`font-semibold truncate text-sm ${isActive ? "text-primary" : "text-foreground"}`}>
                      {song.title}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
                  </div>
                </button>

                <div className="relative">
                  <button
                    onClick={() => setOpenMenu(isMenuOpen ? null : song.id)}
                    className="p-2 rounded-full hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Opções"
                  >
                    <MoreVertical size={18} />
                  </button>
                  {isMenuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-30"
                        onClick={() => setOpenMenu(null)}
                      />
                      <div className="absolute right-0 top-full mt-1 z-40 w-48 bg-popover border border-border rounded-xl shadow-xl overflow-hidden">
                        <button
                          onClick={() => handleMove(index, -1)}
                          disabled={index === 0}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-accent text-left disabled:opacity-40"
                        >
                          <ChevronUp size={16} /> Mover para cima
                        </button>
                        <button
                          onClick={() => handleMove(index, 1)}
                          disabled={index === songs.length - 1}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-accent text-left disabled:opacity-40"
                        >
                          <ChevronDown size={16} /> Mover para baixo
                        </button>
                        <button
                          onClick={() => handleRemove(song.id)}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-destructive/10 text-destructive text-left border-t border-border"
                        >
                          <Trash2 size={16} /> Remover
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          });
        })()}
      </div>
    </div>
  );
};
