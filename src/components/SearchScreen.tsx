import { useState, useRef, useEffect } from "react";
import HorizontalScroll from "./HorizontalScroll";
import { Search, X, Loader2, User, Disc3, Clock, Trash2 } from "lucide-react";
import { getSearchSuggestions, searchYouTubeMusic } from "@/lib/youtubeSearch";
import { useArtistAvatars } from "@/hooks/useArtistAvatars";
import { getSearchHistory, type SearchHistoryEntry } from "@/lib/localStorage";
import SongCard from "./SongCard";
import ChordsPanel from "./ChordsPanel";

import type { Song } from "@/data/mockSongs";


type MusicFilter = "all" | "songs" | "artists" | "albums";

interface SearchScreenProps {
  currentSongId: string;
  onSelect: (song: Song) => void;
  onArtistClick?: (name: string, image?: string) => void;
  onAddToPlaylist?: (song: Song) => void;
}

const GENRES = [
  { label: "Pop", gradient: "from-pink-500 to-rose-600" },
  { label: "Hip Hop", gradient: "from-violet-500 to-purple-700" },
  { label: "Rock", gradient: "from-red-600 to-red-800" },
  { label: "Eletrônica", gradient: "from-blue-500 to-blue-700" },
  { label: "R&B", gradient: "from-teal-500 to-emerald-700" },
  { label: "Sertanejo", gradient: "from-amber-500 to-orange-600" },
  { label: "Funk", gradient: "from-green-500 to-green-700" },
  { label: "MPB", gradient: "from-cyan-500 to-cyan-700" },
  { label: "Jazz", gradient: "from-indigo-500 to-indigo-700" },
  { label: "Reggaeton", gradient: "from-orange-500 to-red-600" },
  { label: "Gospel", gradient: "from-yellow-500 to-amber-600" },
  { label: "Pagode", gradient: "from-lime-500 to-green-600" },
];

const FILTERS: { id: MusicFilter; label: string }[] = [
  { id: "songs", label: "Músicas" },
  { id: "all", label: "Tudo" },
  { id: "albums", label: "Álbuns" },
  { id: "artists", label: "Artistas" },
];

const SearchScreen = ({ currentSongId, onSelect, onArtistClick, onAddToPlaylist }: SearchScreenProps) => {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<MusicFilter>("songs");
  const [results, setResults] = useState<Song[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [history, setHistory] = useState<SearchHistoryEntry[]>(() => getSearchHistory());
  const [chordsSong, setChordsSong] = useState<Song | null>(null);
  const suggestTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Token que identifica a última busca disparada. Requests antigos são descartados
  // ao comparar com o valor atual — evita "race conditions" ao digitar rapidamente.
  const searchTokenRef = useRef(0);

  useEffect(() => {
    const refresh = () => setHistory(getSearchHistory());
    window.addEventListener("demus:search-history-updated", refresh);
    return () => window.removeEventListener("demus:search-history-updated", refresh);
  }, []);

  // Debounce + cancelamento de busca: dispara ao mudar query/filter,
  // aguarda 400ms de inatividade e ignora respostas de requests obsoletos.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      // Cancela qualquer request pendente e limpa a lista imediatamente
      searchTokenRef.current++;
      setResults([]);
      setLoading(false);
      return;
    }

    const token = ++searchTokenRef.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const { recordSearchQuery } = await import("@/lib/localStorage");
        recordSearchQuery(q);
      } catch {}
      // Sempre busca como "songs" para termos metadados de artista/álbum;
      // as abas "artists" e "albums" são derivadas client-side desses resultados.
      const apiFilter = "songs";
      try {
        const res = await searchYouTubeMusic(q, apiFilter);
        if (token !== searchTokenRef.current) return; // request obsoleto
        setResults(res.map((s) => ({ ...s, type: "music" as const })));
      } catch {
        if (token !== searchTokenRef.current) return;
        setResults([]);
      } finally {
        if (token === searchTokenRef.current) setLoading(false);
      }
    }, 400);

    return () => {
      clearTimeout(timer);
    };
  }, [query, filter]);

  const handleInput = (val: string) => {
    setQuery(val);
    if (val.length >= 2) {
      setShowSuggestions(true);
      if (suggestTimeoutRef.current) clearTimeout(suggestTimeoutRef.current);
      suggestTimeoutRef.current = setTimeout(async () => {
        setSuggestions(await getSearchSuggestions(val));
      }, 500);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSuggestionClick = (term: string) => {
    setQuery(term);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleGenreClick = (genre: string) => {
    setQuery(genre);
  };

  const handleFilterChange = (f: MusicFilter) => {
    setFilter(f);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowSuggestions(false);
  };

  // Título das faixas — usado para excluir "artistas" que na verdade são nomes de músicas
  const titleSet = new Set(results.map((s) => s.title.toLowerCase().trim()));
  const norm = (s: string) => s.toLowerCase().trim();
  const q = norm(query);

  // Score de relevância: match exato > começa com > contém > outros
  const relevanceScore = (value: string) => {
    const v = norm(value);
    if (!q) return 0;
    if (v === q) return 100;
    if (v.startsWith(q)) return 75;
    if (v.includes(q)) return 50;
    return 0;
  };

  // Artistas: apenas nomes que aparecem como artista em pelo menos uma faixa,
  // não são "Desconhecido" e não coincidem com o título de nenhuma música do resultado.
  const uniqueArtists = [
    ...new Set(
      results
        .map((s) => s.artist)
        .filter((a) => a && a !== "Desconhecido" && !titleSet.has(norm(a)))
    ),
  ].sort((a, b) => relevanceScore(b) - relevanceScore(a));

  // Álbuns: exige nome de álbum diferente do título da faixa e diferente do nome do artista.
  const uniqueAlbums = [
    ...new Set(
      results
        .filter((s) => {
          const album = norm(s.album);
          const title = norm(s.title);
          const artist = norm(s.artist);
          return album && album !== title && album !== artist;
        })
        .map((s) => `${s.album}|||${s.artist}|||${s.cover}`)
    ),
  ].sort((a, b) => {
    const [albumA, artistA] = a.split("|||");
    const [albumB, artistB] = b.split("|||");
    const scoreA = Math.max(relevanceScore(albumA), relevanceScore(artistA));
    const scoreB = Math.max(relevanceScore(albumB), relevanceScore(artistB));
    return scoreB - scoreA;
  });

  const artistAvatars = useArtistAvatars(uniqueArtists.slice(0, 10));

  const showFilteredResults = !loading && results.length > 0;

  // Painel de cifra persistente: clicar na mesma música fecha, em outra apenas troca o conteúdo.
  const handleOpenChords = (song: Song) => {
    setChordsSong((cur) => (cur?.id === song.id ? null : song));
  };



  return (
    <div className="px-4 space-y-4">
      {/* Title */}
      <h1 className="text-2xl font-bold text-foreground lg:hidden">Buscar</h1>

      {/* Search bar */}
      <form onSubmit={handleSubmit}>
        <div className="relative">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            onFocus={() => query.length >= 2 && setShowSuggestions(true)}
            placeholder="Buscar músicas, artistas, álbuns..."
            className="w-full pl-10 pr-9 py-3 rounded-lg bg-secondary text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(""); setResults([]); setSuggestions([]); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Suggestions */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="mt-1 bg-card rounded-xl border border-border shadow-lg overflow-hidden z-10 relative">
            {suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSuggestionClick(s)}
                className="w-full text-left px-4 py-2.5 text-sm text-foreground hover:bg-accent transition-colors flex items-center gap-2"
              >
                <Search size={14} className="text-muted-foreground flex-shrink-0" />
                <span className="truncate">{s}</span>
              </button>
            ))}
          </div>
        )}
      </form>

      {/* Filter chips — visible when there's a query */}
      {query.length >= 2 && (
        <HorizontalScroll className="flex gap-2">
          {FILTERS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => handleFilterChange(id)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                filter === id
                  ? "bg-foreground text-background"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </HorizontalScroll>
      )}

      {/* Recent searches (shown when no query) */}
      {results.length === 0 && !loading && query.length < 2 && history.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-bold text-foreground flex items-center gap-1.5">
              <Clock size={16} /> Buscas recentes
            </h2>
            <button
              type="button"
              onClick={async () => {
                const { clearSearchHistory } = await import("@/lib/localStorage");
                clearSearchHistory();
              }}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <Trash2 size={12} /> Limpar
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {history.slice(0, 12).map((h) => (
              <div
                key={h.q}
                className="group flex items-center gap-1 pl-3 pr-1 py-1.5 rounded-full bg-secondary text-sm text-foreground"
              >
                <button
                  type="button"
                  onClick={() => handleSuggestionClick(h.q)}
                  className="flex items-center gap-1.5"
                >
                  <Clock size={12} className="text-muted-foreground" />
                  <span className="truncate max-w-[10rem]">{h.q}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Remover ${h.q}`}
                  onClick={async () => {
                    const { removeSearchQuery } = await import("@/lib/localStorage");
                    removeSearchQuery(h.q);
                  }}
                  className="p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-background/50"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Genre grid (shown when no search) */}
      {results.length === 0 && !loading && query.length < 2 && (
        <div>
          <h2 className="text-base font-bold text-foreground mb-3">Navegar por Gêneros</h2>
          <div className="grid grid-cols-2 gap-3">
            {GENRES.map((genre) => (
              <button
                key={genre.label}
                onClick={() => handleGenreClick(genre.label)}
                className={`bg-gradient-to-br ${genre.gradient} rounded-xl px-4 py-5 text-left active:scale-[0.97] transition-transform`}
              >
                <span className="text-sm font-bold text-white">{genre.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 size={24} className="text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Buscando...</p>
        </div>
      )}

      {/* Results */}
      {showFilteredResults && (
        <div className="lg:flex lg:items-start lg:gap-5">
          <div className="space-y-5 min-w-0 flex-1">
          {/* Artists section */}
          {(filter === "all" || filter === "artists") && uniqueArtists.length > 0 && (
            <div>
              {filter === "all" && <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-1.5"><User size={14} /> Artistas</h3>}
              <HorizontalScroll className="flex gap-3 pb-1">
                {uniqueArtists.slice(0, 10).map((artist) => {
                  const fallbackCover = results.find(s => s.artist.toLowerCase().includes(artist.toLowerCase()))?.cover
                    || results[0]?.cover;
                  const cover = artistAvatars[artist] || fallbackCover;
                  return (
                    <button
                      key={artist}
                      onClick={() => onArtistClick?.(artist, cover)}
                      className="flex flex-col items-center gap-1.5 flex-shrink-0 w-20 active:scale-95 transition-transform touch-manipulation"
                    >
                      <div className="w-16 h-16 rounded-full overflow-hidden bg-secondary">
                        {cover && <img src={cover} alt={artist} className="w-full h-full object-cover" loading="lazy" />}
                      </div>
                      <span className="text-[11px] text-foreground truncate w-full text-center">{artist}</span>
                    </button>
                  );
                })}
              </HorizontalScroll>

            </div>
          )}

          {/* Albums section */}
          {(filter === "all" || filter === "albums") && uniqueAlbums.length > 0 && (
            <div>
              {filter === "all" && <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-1.5"><Disc3 size={14} /> Álbuns</h3>}
              <HorizontalScroll className="flex gap-3 pb-1">
                {uniqueAlbums.slice(0, 10).map((raw) => {
                  const [album, artist, cover] = raw.split("|||");
                  return (
                    <button
                      key={raw}
                      onClick={() => {
                        const song = results.find(s => s.album === album);
                        if (song) onSelect(song);
                      }}
                      className="flex flex-col items-center gap-1.5 flex-shrink-0 w-28 active:scale-95 transition-transform text-left"
                    >
                      <div className="w-28 h-28 rounded-xl overflow-hidden bg-secondary">
                        {cover && <img src={cover} alt={album} className="w-full h-full object-cover" />}
                      </div>
                      <span className="text-[11px] font-medium text-foreground truncate w-full">{album}</span>
                      <span className="text-[10px] text-muted-foreground truncate w-full -mt-1">{artist}</span>
                    </button>
                  );
                })}
              </HorizontalScroll>
            </div>
          )}

          {/* Songs */}
          {(filter === "all" || filter === "songs") && (
            <div>
              {filter === "all" && results.length > 0 && <h3 className="text-sm font-semibold text-muted-foreground mb-2">Músicas</h3>}
              {results.map((song) => (
                <div key={song.id}>
                  <SongCard
                    song={song}
                    isActive={song.id === currentSongId}
                    onSelect={onSelect}
                    onAddToPlaylist={onAddToPlaylist}
                    onOpenChords={handleOpenChords}
                    chordsActive={chordsSong?.id === song.id}
                  />
                  {/* Inline (mobile/tablet) */}
                  {chordsSong?.id === song.id && (
                    <div className="lg:hidden mt-2 mb-3 rounded-xl border border-border bg-card overflow-hidden animate-in fade-in slide-in-from-top-1 motion-reduce:animate-none">
                      <ChordsPanel
                        key={`${song.artist}::${song.title}`}
                        artist={song.artist}
                        title={song.title}
                        showHeading={false}
                        resizable
                        onClose={() => setChordsSong(null)}
                      />

                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          </div>

          {/* Coluna lateral persistente (desktop) */}
          {chordsSong && (
            <aside className="hidden lg:flex flex-col w-[380px] xl:w-[440px] flex-shrink-0 sticky top-4 max-h-[calc(100vh-6rem)] rounded-xl border border-border bg-card overflow-hidden animate-in fade-in slide-in-from-right-2 motion-reduce:animate-none">
              <ChordsPanel
                key={`${chordsSong.artist}::${chordsSong.title}`}
                artist={chordsSong.artist}
                title={chordsSong.title}
                onClose={() => setChordsSong(null)}
                resizable
                className="flex-1 min-h-0"
              />
            </aside>
          )}
        </div>
      )}


      {/* Empty state */}
      {!loading && query.length >= 2 && results.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-2">
          <Search size={32} className="text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Nenhum resultado encontrado</p>
        </div>
      )}
    </div>
  );
};

export default SearchScreen;