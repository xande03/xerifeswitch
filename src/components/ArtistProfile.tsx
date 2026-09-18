import { useState, useEffect } from "react";
import { ArrowLeft, Loader2, Play, Pause, SkipForward, SkipBack, MoreHorizontal, Users, Disc3, Music2, ChevronRight, ChevronDown, X, Heart, ListPlus, Shuffle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import BlurImage from "@/components/BlurImage";
import { hdThumbnail } from "@/lib/utils";
import { formatDuration } from "@/data/mockSongs";
import type { Song } from "@/data/mockSongs";
import { createFunctionHeadersWithIp, createFunctionUrl } from "@/lib/backendConfig";
import { useArtistAvatars } from "@/hooks/useArtistAvatars";

interface ArtistProfileProps {
  artistName: string;
  artistImage?: string;
  onBack: () => void;
  onPlaySong: (song: Song, albumQueue?: Song[]) => void;
  currentPlayingSong?: Song | null;
  isPlaying?: boolean;
  currentTime?: number;
  duration?: number;
  onTogglePlay?: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  onExpand?: () => void;
}

interface AlbumItem {
  title: string;
  subtitle: string;
  browseId: string;
  pageType: string;
  cover: string;
}

interface ArtistData {
  name: string;
  description: string;
  subscriberCount: string;
  thumbnail: string;
  topSongs: Song[];
  topSongsBrowseId?: string;
  albums: AlbumItem[];
  singles: AlbumItem[];
  features: AlbumItem[];
}

interface AlbumTrack {
  id: string;
  youtubeId: string;
  title: string;
  artist: string;
  cover: string;
  duration: number;
}

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0, 0, 0.2, 1] as const } },
};

function ArtistTopSongs({
  songs: initialSongs,
  fullBrowseId,
  artistName,
  onPlaySong,
}: {
  songs: Song[];
  fullBrowseId?: string;
  artistName: string;
  onPlaySong: (s: Song, queue?: Song[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [songs, setSongs] = useState<Song[]>(initialSongs);
  const [loadingAll, setLoadingAll] = useState(false);
  const [fetchedFull, setFetchedFull] = useState(false);

  useEffect(() => {
    setSongs(initialSongs);
    setFetchedFull(false);
  }, [initialSongs]);

  const loadFullCatalog = async () => {
    if (!fullBrowseId || fetchedFull || loadingAll) return;
    setLoadingAll(true);
    try {
      const headers = await createFunctionHeadersWithIp();
      const res = await fetch(createFunctionUrl("youtube-album-tracks", { browseId: fullBrowseId }), { headers });
      const data = await res.json();
      const tracks: any[] = data?.tracks || [];
      if (tracks.length > 0) {
        const merged: Song[] = tracks.map((t) => ({
          id: t.id || `yt-${t.youtubeId}`,
          youtubeId: t.youtubeId,
          title: t.title,
          artist: t.artist || artistName,
          album: t.album || t.title,
          cover: t.cover || "",
          duration: t.duration || 0,
          votes: 0,
          isDownloaded: false,
        }));
        // Dedupe by youtubeId, preferindo ordem do catálogo completo
        const seen = new Set<string>();
        const combined: Song[] = [];
        for (const s of [...merged, ...initialSongs]) {
          if (seen.has(s.youtubeId)) continue;
          seen.add(s.youtubeId);
          combined.push(s);
        }
        setSongs(combined);
        setFetchedFull(true);
      }
    } finally {
      setLoadingAll(false);
    }
  };

  const handleToggle = async () => {
    if (!expanded && !fetchedFull && fullBrowseId) {
      await loadFullCatalog();
    }
    setExpanded((v) => !v);
  };

  const visible = expanded ? songs : songs.slice(0, 10);
  const canLoadMore = !!fullBrowseId && !fetchedFull;
  const totalLabel = fetchedFull ? songs.length : (canLoadMore ? `${songs.length}+` : `${songs.length}`);

  return (
    <motion.section variants={fadeUp} className="px-4">
      <h3 className="text-base font-bold text-foreground mb-3 flex items-center gap-2">
        <Music2 size={16} className="text-primary" />
        Músicas Populares
        <span className="text-xs font-normal text-muted-foreground">({totalLabel})</span>
      </h3>
      <div className="space-y-0.5">
        {visible.map((song, i) => (
          <button
            key={song.id}
            onClick={() => onPlaySong(song, songs)}
            className="w-full flex items-center gap-3 py-2.5 hover:bg-accent/50 active:bg-accent rounded-lg transition-colors px-1"
          >
            <span className="text-sm font-medium w-5 text-center text-muted-foreground">{i + 1}</span>
            <BlurImage src={hdThumbnail(song.cover)} alt={song.album} className="w-11 h-11 rounded-md flex-shrink-0" />
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium text-foreground truncate">{song.title}</p>
              <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
            </div>
            <span className="text-xs text-muted-foreground font-mono flex-shrink-0">
              {song.duration > 0 ? formatDuration(song.duration) : ""}
            </span>
          </button>
        ))}
      </div>
      {(songs.length > 10 || canLoadMore) && (
        <button
          onClick={handleToggle}
          disabled={loadingAll}
          className="mt-3 text-sm font-semibold text-primary hover:underline flex items-center gap-1.5 disabled:opacity-60"
        >
          {loadingAll ? (
            <><Loader2 size={14} className="animate-spin" /> Carregando catálogo completo...</>
          ) : expanded ? (
            "Ver menos"
          ) : canLoadMore ? (
            `Ver todas as músicas do catálogo`
          ) : (
            `Ver todas as ${songs.length} músicas`
          )}
        </button>
      )}
    </motion.section>
  );
}

const ArtistProfile = ({ artistName, artistImage, onBack, onPlaySong, currentPlayingSong, isPlaying = false, currentTime = 0, duration = 0, onTogglePlay, onNext, onPrev, onExpand }: ArtistProfileProps) => {

  const [artistData, setArtistData] = useState<ArtistData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAlbum, setSelectedAlbum] = useState<AlbumItem | null>(null);
  const [albumTracks, setAlbumTracks] = useState<AlbumTrack[]>([]);
  const [albumLoading, setAlbumLoading] = useState(false);
  const [showFullBio, setShowFullBio] = useState(false);
  const [expandedSection, setExpandedSection] = useState<"albums" | "singles" | "features" | null>(null);

  // Avatar oficial (canal do artista/banda) resolvido a cada 6h e usado como
  // fallback fresco caso o `thumbnail` da YT Music venha desatualizado ou vazio.
  const freshAvatars = useArtistAvatars([artistName]);
  const freshAvatar = freshAvatars[artistName];

  useEffect(() => {
    setLoading(true);
    // Bucket de 6h no cachebust para evitar HTTP cache preso em avatares/banners antigos
    const bucket = Math.floor(Date.now() / (6 * 60 * 60 * 1000));
    createFunctionHeadersWithIp().then(headers => {
      fetch(createFunctionUrl("youtube-artist-info", { name: artistName, _b: String(bucket) }), { headers })
        .then((r) => r.json())
        .then((data) => {
          setArtistData({
            ...data,
            topSongs: (data.topSongs || []).map((s: any) => ({
              ...s, votes: 0, isDownloaded: false,
            })),
          });
          setLoading(false);
        })
        .catch(() => setLoading(false));
    });
  }, [artistName]);

  const handleAlbumClick = (album: AlbumItem) => {
    if (!album.browseId) return;
    setSelectedAlbum(album);
    setAlbumLoading(true);
    setAlbumTracks([]);

    createFunctionHeadersWithIp().then(headers => {
      fetch(createFunctionUrl("youtube-album-tracks", { browseId: album.browseId }), { headers })
        .then((r) => r.json())
        .then((data) => {
          setAlbumTracks(data.tracks || []);
          setAlbumLoading(false);
        })
        .catch(() => setAlbumLoading(false));
    });
  };

  const albumTracksAsSongs = (tracks: AlbumTrack[]): Song[] =>
    tracks.map((t) => ({
      id: t.id,
      youtubeId: t.youtubeId,
      title: t.title,
      artist: t.artist || artistName,
      album: selectedAlbum?.title || t.title,
      cover: t.cover || selectedAlbum?.cover || "",
      duration: t.duration,
      votes: 0,
      isDownloaded: false,
    }));

  const handlePlayTrack = (track: AlbumTrack) => {
    const songs = albumTracksAsSongs(albumTracks);
    const song = songs.find((s) => s.youtubeId === track.youtubeId) || songs[0];
    // Keep album open — pass album queue so parent can wire next/prev
    onPlaySong(song, songs);
  };

  const isTrackPlaying = (track: AlbumTrack) =>
    currentPlayingSong?.youtubeId === track.youtubeId;

  // Preferência: thumbnail em alta res da YT Music → avatar oficial fresco do canal → prop inicial
  const thumbnail = artistData?.thumbnail || freshAvatar || artistImage;

  return (
    <div className="pb-8 relative">
      {/* Album Detail Overlay */}
      <AnimatePresence>
        {selectedAlbum && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="frame-inset fixed inset-0 z-40 bg-background"
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="h-full flex flex-col"
            >
              {/* Album header */}
              <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-background/90 backdrop-blur-md" style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}>
                <button onClick={() => setSelectedAlbum(null)} className="flex items-center gap-1.5 text-foreground/90 hover:text-foreground transition-colors">
                  <ArrowLeft size={20} />
                  <span className="text-sm font-medium">Voltar</span>
                </button>
              </div>

              <div
                className="flex-1 overflow-y-auto overscroll-contain px-4"
                style={{ paddingBottom: 'calc(var(--mobile-footer-h, 8rem) + env(safe-area-inset-bottom) + 1.5rem)' }}
              >
                {/* Album cover + info — Spotify-style centered layout */}
                <div className="flex flex-col items-center mb-4 mt-2">
                  <div className="w-64 h-64 sm:w-72 sm:h-72 rounded-xl overflow-hidden shadow-2xl mb-5">
                    <img src={hdThumbnail(selectedAlbum.cover)} alt={selectedAlbum.title} className="w-full h-full object-cover" />
                  </div>
                  <h2 className="text-xl font-bold text-foreground text-center leading-tight">{selectedAlbum.title}</h2>
                  <p className="text-sm text-muted-foreground text-center mt-1">{selectedAlbum.subtitle || artistName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {albumTracks.length > 0 ? `${albumTracks.length} faixas` : ""}
                  </p>
                </div>

                {/* Action buttons row — centered */}
                <div className="flex items-center justify-center gap-4 mb-6">
                  <button className="w-10 h-10 rounded-full bg-accent/60 flex items-center justify-center active:scale-90 transition-transform" title="Favoritar">
                    <Heart size={20} className="text-foreground/80" />
                  </button>
                  <button className="w-10 h-10 rounded-full bg-accent/60 flex items-center justify-center active:scale-90 transition-transform" title="Adicionar à playlist">
                    <ListPlus size={20} className="text-foreground/80" />
                  </button>

                  {/* Shuffle */}
                  <button className="w-10 h-10 rounded-full bg-accent/60 flex items-center justify-center active:scale-90 transition-transform" title="Aleatório">
                    <Shuffle size={18} className="text-foreground/80" />
                  </button>

                  {/* Play all — green accent */}
                  {albumTracks.length > 0 && (
                    <button
                      onClick={() => albumTracks[0] && handlePlayTrack(albumTracks[0])}
                      className="w-12 h-12 rounded-full bg-primary flex items-center justify-center active:scale-90 transition-transform shadow-lg"
                      title="Reproduzir tudo"
                    >
                      <Play size={22} fill="currentColor" className="text-primary-foreground ml-0.5" />
                    </button>
                  )}
                </div>

                {albumLoading ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <Loader2 size={24} className="text-primary animate-spin" />
                    <p className="text-xs text-muted-foreground">Carregando faixas...</p>
                  </div>
                ) : (
                  <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-0.5">
                    {albumTracks.map((track, i) => {
                      const playing = isTrackPlaying(track);
                      return (
                        <motion.button
                          key={track.id}
                          variants={fadeUp}
                          onClick={() => handlePlayTrack(track)}
                          className={`w-full flex items-center gap-3 py-3 rounded-lg transition-colors px-1 ${
                            playing ? "bg-primary/10 ring-1 ring-primary/20" : "hover:bg-accent/50 active:bg-accent"
                          }`}
                        >
                          {playing ? (
                            <div className="w-5 flex justify-center">
                              <div className="flex items-end gap-[2px] h-4">
                                <span className="w-[3px] bg-primary rounded-full animate-pulse" style={{ height: "60%", animationDelay: "0ms" }} />
                                <span className="w-[3px] bg-primary rounded-full animate-pulse" style={{ height: "100%", animationDelay: "150ms" }} />
                                <span className="w-[3px] bg-primary rounded-full animate-pulse" style={{ height: "40%", animationDelay: "300ms" }} />
                              </div>
                            </div>
                          ) : (
                            <span className="text-sm font-medium w-5 text-center text-muted-foreground">{i + 1}</span>
                          )}
                          <div className="w-10 h-10 rounded-md overflow-hidden flex-shrink-0">
                            <img src={hdThumbnail(track.cover || selectedAlbum.cover)} alt={track.title} className="w-full h-full object-cover" />
                          </div>
                          <div className="flex-1 min-w-0 text-left">
                            <p className={`text-sm font-medium truncate ${playing ? "text-primary" : "text-foreground"}`}>{track.title}</p>
                            <p className="text-xs text-muted-foreground truncate">{track.artist || artistName}</p>
                          </div>
                          <span className="text-xs text-muted-foreground font-mono flex-shrink-0">
                            {track.duration > 0 ? formatDuration(track.duration) : ""}
                          </span>
                        </motion.button>
                      );
                    })}
                  </motion.div>
                )}
              </div>

              {/* Mini player space — deixa o MiniPlayer global aparecer sobre este overlay via pb-28 abaixo */}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero banner */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="relative w-full aspect-[3/2] overflow-hidden"
      >
        {thumbnail ? (
          <img src={hdThumbnail(thumbnail)} alt={artistName} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-secondary" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />

        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-3" style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}>
          <button onClick={onBack} className="flex items-center gap-1.5 text-foreground/90 hover:text-foreground transition-colors">
            <ArrowLeft size={20} />
            <span className="text-sm font-medium">Voltar</span>
          </button>
          <button className="w-8 h-8 rounded-full bg-background/30 backdrop-blur-sm flex items-center justify-center">
            <MoreHorizontal size={18} className="text-foreground/90" />
          </button>
        </div>

        {/* Artist info overlay */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="absolute bottom-0 left-0 right-0 px-4 pb-5"
        >
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-1">Artista</p>
          <h1 className="text-2xl font-bold text-foreground">{artistData?.name || artistName}</h1>
          <div className="flex items-center gap-1.5 mt-1">
            <Users size={12} className="text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              {artistData?.subscriberCount || (loading ? "Carregando..." : "")}
            </p>
          </div>
        </motion.div>
      </motion.div>

      {/* Play button */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3, duration: 0.3 }}
        className="px-4 -mt-2 relative z-10"
      >
        <button
          onClick={() => artistData?.topSongs?.[0] && onPlaySong(artistData.topSongs[0])}
          disabled={!artistData?.topSongs?.length}
          className="flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-primary-foreground text-sm font-bold active:scale-95 transition-transform disabled:opacity-50"
        >
          <Play size={18} fill="currentColor" className="ml-0.5" />
          Reproduzir
        </button>
      </motion.div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 size={24} className="text-primary animate-spin" />
          <p className="text-xs text-muted-foreground">Carregando perfil de {artistName}...</p>
        </div>
      ) : artistData ? (
        <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-6 mt-6">
          {/* Bio */}
          {artistData.description && (
            <motion.section variants={fadeUp} className="px-4">
              <h3 className="text-base font-bold text-foreground mb-2">Sobre</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {showFullBio ? artistData.description : artistData.description.slice(0, 200)}
                {artistData.description.length > 200 && (
                  <button
                    onClick={() => setShowFullBio(!showFullBio)}
                    className="text-primary font-medium ml-1"
                  >
                    {showFullBio ? "Ver menos" : "...Ver mais"}
                  </button>
                )}
              </p>
            </motion.section>
          )}

          {/* Popular songs */}
          {artistData.topSongs.length > 0 && (
            <ArtistTopSongs
              songs={artistData.topSongs}
              fullBrowseId={artistData.topSongsBrowseId}
              artistName={artistData.name || artistName}
              onPlaySong={onPlaySong}
            />
          )}


          {/* Albums */}
          {artistData.albums.length > 0 && (
            <motion.section variants={fadeUp}>
              <button
                onClick={() => setExpandedSection(expandedSection === "albums" ? null : "albums")}
                className="flex items-center justify-between px-4 mb-3 w-full"
              >
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <Disc3 size={16} className="text-primary" />
                  Álbuns
                  <span className="text-xs font-normal text-muted-foreground">({artistData.albums.length})</span>
                </h3>
                <motion.div animate={{ rotate: expandedSection === "albums" ? 90 : 0 }} transition={{ duration: 0.2 }}>
                  <ChevronRight size={18} className="text-muted-foreground" />
                </motion.div>
              </button>
              <AnimatePresence mode="wait">
                {expandedSection === "albums" ? (
                  <motion.div
                    key="albums-grid"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3, ease: [0, 0, 0.2, 1] }}
                    className="grid grid-cols-2 sm:grid-cols-3 gap-3 px-4 pb-2 overflow-hidden"
                  >
                    {artistData.albums.map((album) => (
                      <button
                        key={album.browseId || album.title}
                        onClick={() => handleAlbumClick(album)}
                        className="group active:scale-95 transition-transform text-left"
                      >
                        <div className="w-full aspect-square rounded-xl overflow-hidden mb-1.5 relative bg-secondary">
                          {album.cover && <img src={hdThumbnail(album.cover)} alt={album.title} className="w-full h-full object-cover" />}
                          <div className="absolute inset-0 bg-background/0 group-hover:bg-background/20 transition-colors flex items-center justify-center">
                            <div className="w-10 h-10 rounded-full bg-primary/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
                              <Play size={16} className="text-primary-foreground ml-0.5" fill="currentColor" />
                            </div>
                          </div>
                        </div>
                        <p className="text-xs font-medium text-foreground truncate">{album.title}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{album.subtitle}</p>
                      </button>
                    ))}
                  </motion.div>
                ) : (
                  <motion.div key="albums-scroll" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide">
                    {artistData.albums.slice(0, 6).map((album) => (
                      <button
                        key={album.browseId || album.title}
                        onClick={() => handleAlbumClick(album)}
                        className="flex-shrink-0 w-[130px] sm:w-[150px] group active:scale-95 transition-transform text-left"
                      >
                        <div className="w-full aspect-square rounded-xl overflow-hidden mb-1.5 relative bg-secondary">
                          {album.cover && <img src={hdThumbnail(album.cover)} alt={album.title} className="w-full h-full object-cover" />}
                          <div className="absolute inset-0 bg-background/0 group-hover:bg-background/20 transition-colors flex items-center justify-center">
                            <div className="w-10 h-10 rounded-full bg-primary/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
                              <Play size={16} className="text-primary-foreground ml-0.5" fill="currentColor" />
                            </div>
                          </div>
                        </div>
                        <p className="text-xs font-medium text-foreground truncate">{album.title}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{album.subtitle}</p>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.section>
          )}

          {/* Singles */}
          {artistData.singles.length > 0 && (
            <motion.section variants={fadeUp}>
              <button
                onClick={() => setExpandedSection(expandedSection === "singles" ? null : "singles")}
                className="flex items-center justify-between px-4 mb-3 w-full"
              >
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <Music2 size={16} className="text-primary" />
                  Singles e EPs
                  <span className="text-xs font-normal text-muted-foreground">({artistData.singles.length})</span>
                </h3>
                <motion.div animate={{ rotate: expandedSection === "singles" ? 90 : 0 }} transition={{ duration: 0.2 }}>
                  <ChevronRight size={18} className="text-muted-foreground" />
                </motion.div>
              </button>
              <AnimatePresence mode="wait">
                {expandedSection === "singles" ? (
                  <motion.div
                    key="singles-grid"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3, ease: [0, 0, 0.2, 1] }}
                    className="grid grid-cols-2 sm:grid-cols-3 gap-3 px-4 pb-2 overflow-hidden"
                  >
                    {artistData.singles.map((single) => (
                      <button
                        key={single.browseId || single.title}
                        onClick={() => handleAlbumClick(single)}
                        className="group active:scale-95 transition-transform text-left"
                      >
                        <div className="w-full aspect-square rounded-xl overflow-hidden mb-1.5 relative bg-secondary">
                          {single.cover && <img src={hdThumbnail(single.cover)} alt={single.title} className="w-full h-full object-cover" />}
                        </div>
                        <p className="text-xs font-medium text-foreground truncate">{single.title}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{single.subtitle}</p>
                      </button>
                    ))}
                  </motion.div>
                ) : (
                  <motion.div key="singles-scroll" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide">
                    {artistData.singles.slice(0, 6).map((single) => (
                      <button
                        key={single.browseId || single.title}
                        onClick={() => handleAlbumClick(single)}
                        className="flex-shrink-0 w-[130px] sm:w-[150px] group active:scale-95 transition-transform text-left"
                      >
                        <div className="w-full aspect-square rounded-xl overflow-hidden mb-1.5 relative bg-secondary">
                          {single.cover && <img src={hdThumbnail(single.cover)} alt={single.title} className="w-full h-full object-cover" />}
                        </div>
                        <p className="text-xs font-medium text-foreground truncate">{single.title}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{single.subtitle}</p>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.section>
          )}

          {/* Features / Appears on */}
          {artistData.features.length > 0 && (
            <motion.section variants={fadeUp}>
              <button
                onClick={() => setExpandedSection(expandedSection === "features" ? null : "features")}
                className="flex items-center justify-between px-4 mb-3 w-full"
              >
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <Users size={16} className="text-primary" />
                  Participações
                  <span className="text-xs font-normal text-muted-foreground">({artistData.features.length})</span>
                </h3>
                <motion.div animate={{ rotate: expandedSection === "features" ? 90 : 0 }} transition={{ duration: 0.2 }}>
                  <ChevronRight size={18} className="text-muted-foreground" />
                </motion.div>
              </button>
              <AnimatePresence mode="wait">
                {expandedSection === "features" ? (
                  <motion.div
                    key="features-grid"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3, ease: [0, 0, 0.2, 1] }}
                    className="grid grid-cols-2 sm:grid-cols-3 gap-3 px-4 pb-2 overflow-hidden"
                  >
                    {artistData.features.map((feat) => (
                      <button
                        key={feat.browseId || feat.title}
                        onClick={() => handleAlbumClick(feat)}
                        className="group active:scale-95 transition-transform text-left"
                      >
                        <div className="w-full aspect-square rounded-xl overflow-hidden mb-1.5 relative bg-secondary">
                          {feat.cover && <img src={hdThumbnail(feat.cover)} alt={feat.title} className="w-full h-full object-cover" />}
                        </div>
                        <p className="text-xs font-medium text-foreground truncate">{feat.title}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{feat.subtitle}</p>
                      </button>
                    ))}
                  </motion.div>
                ) : (
                  <motion.div key="features-scroll" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide">
                    {artistData.features.slice(0, 6).map((feat) => (
                      <button
                        key={feat.browseId || feat.title}
                        onClick={() => handleAlbumClick(feat)}
                        className="flex-shrink-0 w-[130px] sm:w-[150px] group active:scale-95 transition-transform text-left"
                      >
                        <div className="w-full aspect-square rounded-xl overflow-hidden mb-1.5 relative bg-secondary">
                          {feat.cover && <img src={hdThumbnail(feat.cover)} alt={feat.title} className="w-full h-full object-cover" />}
                        </div>
                        <p className="text-xs font-medium text-foreground truncate">{feat.title}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{feat.subtitle}</p>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.section>
          )}
        </motion.div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 gap-2">
          <p className="text-sm text-muted-foreground">Não foi possível carregar o perfil</p>
          <button onClick={onBack} className="text-primary text-sm font-medium">Voltar</button>
        </div>
      )}
    </div>
  );
};

export default ArtistProfile;
