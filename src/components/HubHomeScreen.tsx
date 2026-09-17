import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Music, MonitorPlay, Play, Clock, Sparkles, ChevronRight, Headphones, Film } from "lucide-react";
import { getHistory, getLastPlayback, type HistoryEntry } from "@/lib/localStorage";
import { hdThumbnail } from "@/lib/utils";
import Logo from "@/components/Logo";
import AdSlot from "@/components/AdSlot";

export interface HubMusicItem {
  id: string;
  youtubeId: string;
  title: string;
  artist: string;
  album: string;
  cover: string;
  duration: number;
}

export interface HubVideoItem {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  lengthSeconds: number;
}

interface HubHomeScreenProps {
  onEnterMusic: () => void;
  onEnterVideo: () => void;
  onPlayMusic: (song: HubMusicItem) => void;
  onPlayVideo: (video: HubVideoItem) => void;
  greeting?: string;
}

function isVideoEntry(e: HistoryEntry): boolean {
  return e.type === "video" || (e.songId?.startsWith("yt-") && !e.album);
}

const HubHomeScreen = ({ onEnterMusic, onEnterVideo, onPlayMusic, onPlayVideo, greeting }: HubHomeScreenProps) => {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener("demus:history-updated", bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener("demus:history-updated", bump);
      window.removeEventListener("storage", bump);
    };
  }, []);

  const { musicHistory, videoHistory } = useMemo(() => {
    const all = getHistory();
    const music: HistoryEntry[] = [];
    const video: HistoryEntry[] = [];
    for (const e of all) {
      if (e.type === "video") video.push(e);
      else if (e.type === "music") music.push(e);
      else if (e.songId?.startsWith("yt-")) video.push(e);
      else music.push(e);
    }
    return { musicHistory: music.slice(0, 12), videoHistory: video.slice(0, 12) };
  }, [tick]);

  const lastPlayback = useMemo(() => getLastPlayback(), [tick]);

  const relatedMusic = useMemo(() => {
    // "related" = older-than-most-recent music history (shuffled a bit)
    if (musicHistory.length <= 4) return [] as HistoryEntry[];
    return [...musicHistory].slice(3, 12);
  }, [musicHistory]);
  const relatedVideos = useMemo(() => {
    if (videoHistory.length <= 4) return [] as HistoryEntry[];
    return [...videoHistory].slice(3, 12);
  }, [videoHistory]);

  const musicToItem = (e: HistoryEntry): HubMusicItem => ({
    id: e.songId, youtubeId: e.youtubeId, title: e.title, artist: e.artist,
    album: e.album, cover: e.cover, duration: e.duration,
  });
  const videoToItem = (e: HistoryEntry): HubVideoItem => ({
    videoId: e.youtubeId, title: e.title, channel: e.artist,
    thumbnail: e.cover, lengthSeconds: e.duration,
  });

  const hasAny = musicHistory.length + videoHistory.length > 0;

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }}
      className="space-y-6 pb-8"
    >
      {/* Header (mobile only) */}
      <motion.div
        variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
        className="px-4 pt-2 lg:hidden"
      >
        <h1 className="text-2xl sm:text-3xl font-black italic tracking-tight text-foreground">
          {greeting || "Bem-vindo ao"} <span className="text-primary">Xerife Switch</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Retome de onde parou ou entre em um dos módulos.
        </p>
      </motion.div>

      {/* Slot de anúncio hospedado ("Recomendado") — in-visit, sem anúncios
          das músicas: nunca dentro do player; ocupa o corredor do feed. */}
      <div className="px-3 sm:px-4">
        <AdSlot slot="feed-home" variant="row" className="mt-4" />
      </div>


      {/* Entry cards */}
      <motion.section
        variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}
        className="px-3 sm:px-4 grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4"
      >
        <button
          onClick={onEnterMusic}
          className="group relative overflow-hidden rounded-3xl p-5 sm:p-6 text-left bg-gradient-to-br from-[hsl(142_55%_45%/0.18)] to-[hsl(142_55%_45%/0.04)] border border-[hsl(142_55%_45%/0.35)] hover:border-[hsl(142_55%_45%/0.6)] transition-all active:scale-[0.98] shadow-lg"
        >
          <div className="flex items-center gap-4">
            <span className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[hsl(142_55%_45%/0.2)] text-[hsl(142_60%_55%)] flex items-center justify-center">
              <Music size={26} />
            </span>
            <div className="flex-1">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold lg:hidden">Módulo</p>
              <h2 className="text-lg sm:text-xl font-black italic text-foreground">Xerife Music</h2>
              <p className="text-xs text-muted-foreground mt-0.5 lg:hidden">Playlists, favoritos e busca de músicas</p>
            </div>


            <ChevronRight className="text-muted-foreground group-hover:translate-x-1 transition-transform" />
          </div>
        </button>
        <button
          onClick={onEnterVideo}
          className="group relative overflow-hidden rounded-3xl p-5 sm:p-6 text-left bg-gradient-to-br from-[hsl(0_78%_54%/0.18)] to-[hsl(0_78%_54%/0.04)] border border-[hsl(0_78%_54%/0.35)] hover:border-[hsl(0_78%_54%/0.6)] transition-all active:scale-[0.98] shadow-lg"
        >
          <div className="flex items-center gap-4">
            <span className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[hsl(0_78%_54%/0.2)] text-[hsl(0_78%_62%)] flex items-center justify-center">
              <MonitorPlay size={26} />
            </span>
            <div className="flex-1">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold lg:hidden">Módulo</p>
              <h2 className="text-lg sm:text-xl font-black italic text-foreground">Xerife Videos</h2>
              <p className="text-xs text-muted-foreground mt-0.5 lg:hidden">Recomendados, explorar e assistidos</p>
            </div>


            <ChevronRight className="text-muted-foreground group-hover:translate-x-1 transition-transform" />
          </div>
        </button>
      </motion.section>

      {/* Continue where you left off */}
      {lastPlayback?.song && (
        <motion.section
          variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}
          className="px-3 sm:px-4"
        >
          <div className="flex items-center gap-2 mb-3">
            <Clock size={18} className="text-primary" />
            <h2 className="text-sm sm:text-base font-black italic text-foreground uppercase tracking-wider">Continuar</h2>
          </div>
          <button
            onClick={() => {
              const s = lastPlayback.song;
              if (s.type === "video" || String(s.id).startsWith("yt-")) {
                onPlayVideo({ videoId: s.youtubeId, title: s.title, channel: s.artist, thumbnail: s.cover, lengthSeconds: s.duration });
              } else {
                onPlayMusic({ id: s.id, youtubeId: s.youtubeId, title: s.title, artist: s.artist, album: s.album, cover: s.cover, duration: s.duration });
              }
            }}
            className="w-full flex items-center gap-3 sm:gap-4 p-2.5 sm:p-3 rounded-2xl bg-card hover:bg-accent/50 border border-border/40 transition-colors active:scale-[0.99] text-left"
          >
            <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden flex-shrink-0 shadow-md">
              <img src={hdThumbnail(lastPlayback.song.cover)} alt="" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                <Play size={22} className="text-white" fill="currentColor" />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm sm:text-base font-bold text-foreground truncate">{lastPlayback.song.title}</p>
              <p className="text-xs text-muted-foreground truncate">{lastPlayback.song.artist}</p>
            </div>
          </button>
        </motion.section>
      )}

      {/* Ouvidas recentemente */}
      {musicHistory.length > 0 && (
        <motion.section variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}>
          <div className="flex items-center justify-between px-3 sm:px-4 mb-3">
            <div className="flex items-center gap-2">
              <Headphones size={18} className="text-primary" />
              <h2 className="text-sm sm:text-base font-black italic text-foreground uppercase tracking-wider">Ouvidas recentemente</h2>
            </div>
            <button onClick={onEnterMusic} className="text-[11px] font-bold text-primary hover:underline">VER TUDO</button>
          </div>
          <div className="flex gap-3 overflow-x-auto scrollbar-hide px-3 sm:px-4 pb-1">
            {musicHistory.map((e) => (
              <button
                key={`m-${e.songId}-${e.playedAt}`}
                onClick={() => onPlayMusic(musicToItem(e))}
                className="flex-shrink-0 w-[130px] sm:w-[150px] group text-left active:scale-95 transition-transform"
              >
                <div className="w-full aspect-square rounded-2xl overflow-hidden mb-2 relative shadow-md">
                  <img src={hdThumbnail(e.cover)} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                    <Play size={20} className="text-white opacity-0 group-hover:opacity-100" fill="currentColor" />
                  </div>
                </div>
                <p className="text-xs font-bold text-foreground truncate">{e.title}</p>
                <p className="text-[10px] text-muted-foreground truncate">{e.artist}</p>
              </button>
            ))}
          </div>
        </motion.section>
      )}

      {/* Vistas recentemente */}
      {videoHistory.length > 0 && (
        <motion.section variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}>
          <div className="flex items-center justify-between px-3 sm:px-4 mb-3">
            <div className="flex items-center gap-2">
              <Film size={18} className="text-primary" />
              <h2 className="text-sm sm:text-base font-black italic text-foreground uppercase tracking-wider">Vistas recentemente</h2>
            </div>
            <button onClick={onEnterVideo} className="text-[11px] font-bold text-primary hover:underline">VER TUDO</button>
          </div>
          <div className="flex gap-3 overflow-x-auto scrollbar-hide px-3 sm:px-4 pb-1">
            {videoHistory.map((e) => (
              <button
                key={`v-${e.youtubeId}-${e.playedAt}`}
                onClick={() => onPlayVideo(videoToItem(e))}
                className="flex-shrink-0 w-[220px] sm:w-[260px] group text-left active:scale-95 transition-transform"
              >
                <div className="w-full aspect-video rounded-xl overflow-hidden mb-2 relative shadow-md bg-secondary">
                  <img src={hdThumbnail(e.cover)} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                    <Play size={26} className="text-white opacity-0 group-hover:opacity-100" fill="currentColor" />
                  </div>
                </div>
                <p className="text-xs font-bold text-foreground line-clamp-2">{e.title}</p>
                <p className="text-[10px] text-muted-foreground truncate mt-0.5">{e.artist}</p>
              </button>
            ))}
          </div>
        </motion.section>
      )}

      {/* Related (music) */}
      {relatedMusic.length > 0 && (
        <motion.section variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}>
          <div className="flex items-center gap-2 px-3 sm:px-4 mb-3">
            <Sparkles size={18} className="text-primary" />
            <h2 className="text-sm sm:text-base font-black italic text-foreground uppercase tracking-wider">Relacionados · Música</h2>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3 px-3 sm:px-4">
            {relatedMusic.map((e) => (
              <button
                key={`rm-${e.songId}-${e.playedAt}`}
                onClick={() => onPlayMusic(musicToItem(e))}
                className="group text-left active:scale-95 transition-transform"
              >
                <div className="w-full aspect-square rounded-xl overflow-hidden mb-1.5 shadow-sm">
                  <img src={hdThumbnail(e.cover)} alt="" className="w-full h-full object-cover" />
                </div>
                <p className="text-[11px] font-bold text-foreground truncate">{e.title}</p>
                <p className="text-[10px] text-muted-foreground truncate">{e.artist}</p>
              </button>
            ))}
          </div>
        </motion.section>
      )}

      {/* Related (video) */}
      {relatedVideos.length > 0 && (
        <motion.section variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}>
          <div className="flex items-center gap-2 px-3 sm:px-4 mb-3">
            <Sparkles size={18} className="text-primary" />
            <h2 className="text-sm sm:text-base font-black italic text-foreground uppercase tracking-wider">Relacionados · Vídeos</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 px-3 sm:px-4">
            {relatedVideos.map((e) => (
              <button
                key={`rv-${e.youtubeId}-${e.playedAt}`}
                onClick={() => onPlayVideo(videoToItem(e))}
                className="group text-left active:scale-95 transition-transform"
              >
                <div className="w-full aspect-video rounded-lg overflow-hidden mb-1.5 shadow-sm bg-secondary">
                  <img src={hdThumbnail(e.cover)} alt="" className="w-full h-full object-cover" />
                </div>
                <p className="text-[11px] font-bold text-foreground line-clamp-2">{e.title}</p>
                <p className="text-[10px] text-muted-foreground truncate">{e.artist}</p>
              </button>
            ))}
          </div>
        </motion.section>
      )}

      {/* Empty state */}
      {!hasAny && (
        <motion.div
          variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
          className="mx-4 mt-2 p-6 rounded-2xl border border-dashed border-border/60 text-center"
        >
          <p className="text-sm text-muted-foreground">
            Comece ouvindo uma música ou assistindo um vídeo. Suas atividades recentes vão aparecer aqui.
          </p>
        </motion.div>
      )}
    </motion.div>
  );
};

export default HubHomeScreen;
