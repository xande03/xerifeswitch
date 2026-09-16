import { useEffect, useMemo, useState } from "react";
import {
  BarChart3, Clock3, Music2, Mic2, MonitorPlay, Headphones, Trash2, Play,
} from "lucide-react";
import {
  LISTEN_STATS_EVENT,
  clearListeningStats,
  formatListenTime,
  getStatsSummary,
  getTopArtists,
  getTopTracks,
  type StatsMediaType,
  type StatsRange,
} from "@/lib/listeningStats";

interface ListeningStatsScreenProps {
  /** Reproduzir uma faixa a partir do ranking (opcional). */
  onPlayTrack?: (track: {
    id: string;
    youtubeId: string;
    title: string;
    artist: string;
    cover: string;
    duration: number;
    type: StatsMediaType;
  }) => void;
}

const RANGE_OPTIONS: { id: StatsRange; label: string }[] = [
  { id: "today", label: "Hoje" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "all", label: "Sempre" },
];

const TYPE_OPTIONS: { id: StatsMediaType; label: string; icon: React.ElementType }[] = [
  { id: "music", label: "Músicas", icon: Music2 },
  { id: "video", label: "Vídeos", icon: MonitorPlay },
  { id: "podcast", label: "Podcasts", icon: Headphones },
];

const ListeningStatsScreen = ({ onPlayTrack }: ListeningStatsScreenProps) => {
  const [range, setRange] = useState<StatsRange>("7d");
  const [mediaType, setMediaType] = useState<StatsMediaType>("music");
  const [tick, setTick] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener(LISTEN_STATS_EVENT, bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener(LISTEN_STATS_EVENT, bump);
      window.removeEventListener("storage", bump);
    };
  }, []);

  const summary = useMemo(() => getStatsSummary(range, mediaType), [range, mediaType, tick]);
  const topTracks = useMemo(() => getTopTracks(range, mediaType, 10), [range, mediaType, tick]);
  const topArtists = useMemo(() => getTopArtists(range, mediaType, 8), [range, mediaType, tick]);
  const maxTrackSec = topTracks[0]?.sec ?? 1;
  const maxArtistSec = topArtists[0]?.sec ?? 1;

  const empty = summary.totalSec === 0;

  return (
    <div className="px-4 lg:px-8 py-2 space-y-5 pb-28">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-primary/15 text-primary">
          <BarChart3 size={18} />
        </span>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl lg:text-2xl font-display font-bold text-foreground leading-tight">Estatísticas</h1>
          <p className="text-xs text-muted-foreground">Seu Xerife em números — direto do seu aparelho</p>
        </div>
        {!empty && (
          <button
            onClick={() => {
              if (confirmClear) {
                clearListeningStats();
                setConfirmClear(false);
              } else {
                setConfirmClear(true);
                setTimeout(() => setConfirmClear(false), 3500);
              }
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${
              confirmClear
                ? "bg-destructive text-destructive-foreground"
                : "bg-secondary/70 text-muted-foreground hover:text-foreground"
            }`}
          >
            <Trash2 size={12} />
            {confirmClear ? "Confirmar?" : "Zerar"}
          </button>
        )}
      </div>

      {/* Filtros de módulo */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
        {TYPE_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = mediaType === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => setMediaType(opt.id)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${
                active
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-secondary/60 text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              <Icon size={13} />
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Filtros de período */}
      <div className="flex items-center gap-2 -mx-1 px-1">
        {RANGE_OPTIONS.map((opt) => {
          const active = range === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => setRange(opt.id)}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                active
                  ? "bg-foreground text-background"
                  : "bg-secondary/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {empty ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground opacity-40">
          <BarChart3 size={64} strokeWidth={1} />
          <p className="mt-4 text-sm font-medium">Sem dados neste período</p>
          <p className="text-xs mt-1">Ouça algumas faixas e volte aqui</p>
        </div>
      ) : (
        <>
          {/* Cards-resumo */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/25 to-primary/5 p-3.5">
              <Clock3 size={15} className="text-primary" />
              <p className="mt-2 text-base lg:text-lg font-bold text-foreground leading-none">
                {formatListenTime(summary.totalSec)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wide">ouvidos</p>
            </div>
            <div className="rounded-2xl border border-border bg-gradient-to-br from-violet-500/25 to-violet-500/5 p-3.5">
              <Music2 size={15} className="text-violet-400" />
              <p className="mt-2 text-base lg:text-lg font-bold text-foreground leading-none">{summary.uniqueTracks}</p>
              <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wide">faixas</p>
            </div>
            <div className="rounded-2xl border border-border bg-gradient-to-br from-amber-500/25 to-amber-500/5 p-3.5">
              <Mic2 size={15} className="text-amber-400" />
              <p className="mt-2 text-base lg:text-lg font-bold text-foreground leading-none">{summary.uniqueArtists}</p>
              <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wide">artistas</p>
            </div>
          </div>

          {/* Top faixas */}
          {topTracks.length > 0 && (
            <section className="space-y-2.5">
              <h2 className="text-sm font-bold text-foreground">Top {mediaType === "music" ? "músicas" : mediaType === "video" ? "vídeos" : "episódios"}</h2>
              <div className="space-y-1.5">
                {topTracks.map((t, i) => (
                  <button
                    key={t.id}
                    disabled={!onPlayTrack}
                    onClick={() =>
                      onPlayTrack?.({
                        id: t.id,
                        youtubeId: t.id.replace(/^(yt-|video-|pod-|podcast-)/, ""),
                        title: t.title,
                        artist: t.artist,
                        cover: t.cover,
                        duration: t.duration,
                        type: t.type,
                      })
                    }
                    className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-secondary/50 transition-colors text-left group disabled:cursor-default"
                  >
                    <span className="w-5 text-center text-xs font-bold text-muted-foreground tabular-nums">{i + 1}</span>
                    <div className="relative w-11 h-11 rounded-lg overflow-hidden bg-secondary shrink-0">
                      {t.cover ? (
                        <img src={t.cover} alt="" className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground"><Music2 size={16} /></div>
                      )}
                      {onPlayTrack && (
                        <span className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                          <Play size={14} fill="currentColor" />
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{t.title}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{t.artist}</p>
                      <div className="mt-1 h-1 rounded-full bg-secondary overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${Math.max(4, (t.sec / maxTrackSec) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-muted-foreground shrink-0 tabular-nums">
                      {formatListenTime(t.sec)}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Top artistas */}
          {topArtists.length > 0 && (
            <section className="space-y-2.5">
              <h2 className="text-sm font-bold text-foreground">Top artistas</h2>
              <div className="space-y-1.5">
                {topArtists.map((a, i) => (
                  <div key={a.artist} className="flex items-center gap-3 p-2">
                    <span className="w-5 text-center text-xs font-bold text-muted-foreground tabular-nums">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{a.artist}</p>
                      <div className="mt-1 h-1 rounded-full bg-secondary overflow-hidden">
                        <div
                          className="h-full rounded-full bg-amber-400 transition-all"
                          style={{ width: `${Math.max(4, (a.sec / maxArtistSec) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-muted-foreground shrink-0 tabular-nums">
                      {formatListenTime(a.sec)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
};

export default ListeningStatsScreen;
