import { Play, Maximize, Plus, Eye, Clock, MoreVertical } from "lucide-react";
import type { VideoResult } from "@/lib/youtubeGeneralSearch";
import { hdThumbnail } from "@/lib/utils";
import BlurImage from "@/components/BlurImage";

interface VideoCardProps {
  video: VideoResult;
  onPlay: (video: VideoResult) => void;
  onChannelClick?: (channelName: string, channelThumbnail?: string, channelId?: string, channelUrl?: string) => void;
  onFullscreen?: (video: VideoResult) => void;
  onAddToPlaylist?: (video: any) => void;
  viewMode?: 'grid' | 'list' | 'large';
}

const VideoCard = ({ video, onPlay, onChannelClick, onFullscreen, onAddToPlaylist, viewMode = 'grid' }: VideoCardProps) => {
  // ── Large card mode ──
  if (viewMode === 'large') {
    return (
      <div className="group/card w-full rounded-2xl overflow-hidden bg-card/60 hover:bg-card border border-border/30 hover:border-border/60 transition-all duration-300 hover:shadow-2xl hover:shadow-primary/5">
        {/* Expanded thumbnail */}
        <div className="relative w-full aspect-[16/9] cursor-pointer overflow-hidden group/thumb" onClick={() => onPlay(video)}>
          <BlurImage src={hdThumbnail(video.thumbnail)} alt={video.title} className="w-full h-full object-cover transition-transform duration-700 group-hover/thumb:scale-105" />
          
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover/thumb:opacity-100 transition-opacity duration-300" />

          {/* Duration / Live Badge */}
          {video.isLive ? (
            <span className="absolute bottom-3 left-3 bg-red-600 text-white text-xs font-bold px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-lg">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> AO VIVO
            </span>
          ) : video.duration && (
            <span className="absolute bottom-3 right-3 bg-black/80 backdrop-blur-md text-white text-xs font-semibold px-2.5 py-1 rounded-lg border border-white/10">
              {video.duration}
            </span>
          )}

          {/* Center Play */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-primary/90 text-primary-foreground flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 scale-75 group-hover/thumb:scale-100 transition-all duration-300 shadow-2xl shadow-primary/30">
              <Play size={28} className="ml-1" fill="currentColor" />
            </div>
          </div>

          {/* Top-right actions */}
          <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover/thumb:opacity-100 transition-all z-10">
            {onFullscreen && (
              <button
                onClick={(e) => { e.stopPropagation(); onFullscreen(video); }}
                className="w-9 h-9 rounded-lg bg-black/50 backdrop-blur-md text-white flex items-center justify-center hover:bg-primary transition-all"
                title="Tela cheia"
              >
                <Maximize size={15} />
              </button>
            )}
            {onAddToPlaylist && (
              <button
                onClick={(e) => { e.stopPropagation(); onAddToPlaylist?.({ id: `yt-${video.videoId}`, ...video }); }}
                className="w-9 h-9 rounded-lg bg-black/50 backdrop-blur-md text-white flex items-center justify-center hover:bg-primary transition-all"
                title="Adicionar à playlist"
              >
                <Plus size={17} />
              </button>
            )}
          </div>
        </div>

        {/* Info section */}
        <div className="p-4 lg:p-5 space-y-3">
          <div className="flex gap-3">
            {/* Channel avatar */}
            <button
              onClick={() => onChannelClick?.(video.channel, video.channelThumbnail, video.channelId, video.channelUrl)}
              className="flex-shrink-0 active:scale-90 transition-transform"
            >
              {video.channelThumbnail ? (
                <img src={video.channelThumbnail} alt={video.channel} className="w-10 h-10 rounded-full object-cover border-2 border-border" loading="lazy" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary">
                  {video.channel.charAt(0)}
                </div>
              )}
            </button>

            <div className="min-w-0 flex-1">
              {/* Title */}
              <h3 
                onClick={() => onPlay(video)} 
                className="font-semibold text-foreground text-base lg:text-lg line-clamp-2 leading-snug cursor-pointer hover:text-primary transition-colors"
              >
                {video.title}
              </h3>

              {/* Channel + meta */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
                <button
                  onClick={() => onChannelClick?.(video.channel, video.channelThumbnail, video.channelId, video.channelUrl)}
                  className="text-xs text-muted-foreground hover:text-primary transition-colors font-medium"
                >
                  {video.channel}
                </button>
                {(video.views || video.publishedTime) && (
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60">
                    {video.views && (
                      <span className="flex items-center gap-1">
                        <Eye size={11} />
                        {video.views}
                      </span>
                    )}
                    {video.publishedTime && (
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        {video.publishedTime}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Description placeholder */}
          <p className="text-xs text-muted-foreground/50 leading-relaxed line-clamp-2">
            Assista a este conteúdo no Xerife Switch — vídeo em alta definição com áudio masterizado para a melhor experiência.
          </p>
        </div>
      </div>
    );
  }

  // ── Grid / List modes ──
  // GRID = YouTube mobile style (full-bleed thumb, bold 2-line title, avatar + meta row, ⋮ menu)
  if (viewMode === 'grid') {
    return (
      <div className="group/card w-full">
        {/* Full-width 16:9 thumbnail */}
        <div
          className="relative w-full aspect-video bg-muted overflow-hidden sm:rounded-xl cursor-pointer"
          onClick={() => onPlay(video)}
        >
          <BlurImage
            src={hdThumbnail(video.thumbnail)}
            alt={video.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover/card:scale-[1.02]"
          />

          {video.isLive ? (
            <span className="absolute bottom-1.5 left-1.5 bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-white animate-pulse" /> AO VIVO
            </span>
          ) : video.duration && (
            <span className="absolute bottom-1.5 right-1.5 bg-black/85 text-white text-[11px] font-medium px-1.5 py-0.5 rounded">
              {video.duration}
            </span>
          )}

          {/* Hover play (desktop) */}
          <div className="absolute inset-0 hidden sm:flex items-center justify-center bg-black/0 group-hover/card:bg-black/15 transition-colors">
            <div className="w-14 h-14 rounded-full bg-primary/90 text-primary-foreground flex items-center justify-center opacity-0 group-hover/card:opacity-100 scale-90 group-hover/card:scale-100 transition-all shadow-2xl">
              <Play size={22} className="ml-0.5" fill="currentColor" />
            </div>
          </div>

          {onFullscreen && (
            <button
              onClick={(e) => { e.stopPropagation(); onFullscreen(video); }}
              className="absolute top-2 right-2 w-8 h-8 rounded-lg bg-black/50 backdrop-blur-md text-white items-center justify-center opacity-0 group-hover/card:opacity-100 hover:bg-primary transition-all z-10 hidden sm:flex"
              title="Tela cheia"
            >
              <Maximize size={14} />
            </button>
          )}
        </div>

        {/* Info row: avatar + title/meta + ⋮ — YouTube mobile proportions */}
        <div className="flex gap-3 px-3 sm:px-2 pt-3 pb-4">
          <button
            onClick={(e) => { e.stopPropagation(); onChannelClick?.(video.channel, video.channelThumbnail, video.channelId, video.channelUrl); }}
            className="flex-shrink-0 active:scale-90 transition-transform"
            aria-label={video.channel}
          >
            {video.channelThumbnail ? (
              <img
                src={video.channelThumbnail}
                alt={video.channel}
                className="w-9 h-9 rounded-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-muted-foreground">
                {video.channel.charAt(0).toUpperCase()}
              </div>
            )}
          </button>

          <div className="min-w-0 flex-1" onClick={() => onPlay(video)}>
            <h3 className="font-semibold text-foreground text-[15px] leading-[1.3] line-clamp-2 cursor-pointer">
              {video.title}
            </h3>
            <div className="mt-1 flex flex-wrap items-center text-[12.5px] text-muted-foreground leading-tight">
              <button
                 onClick={(e) => { e.stopPropagation(); onChannelClick?.(video.channel, video.channelThumbnail, video.channelId, video.channelUrl); }}
                className="truncate max-w-[60%] hover:text-foreground transition-colors"
              >
                {video.channel}
              </button>
              {video.views && (<><span className="mx-1.5 opacity-60">·</span><span>{video.views}</span></>)}
              {video.publishedTime && (<><span className="mx-1.5 opacity-60">·</span><span>{video.publishedTime}</span></>)}
            </div>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onAddToPlaylist?.({ id: `yt-${video.videoId}`, ...video });
            }}
            className="flex-shrink-0 -mr-1 -mt-1 w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-accent active:scale-90 transition"
            title="Mais opções"
            aria-label="Mais opções"
          >
            <MoreVertical size={18} />
          </button>
        </div>
      </div>
    );
  }

  // LIST mode (unchanged compact layout for desktop search/lists)
  return (
    <div className="group/card w-full rounded-2xl flex flex-row gap-3 sm:gap-4 items-start bg-card/40 hover:bg-card/80 p-2 sm:p-3 border border-border/40 hover:shadow-xl hover:shadow-primary/5 active:scale-[0.99] transition-all duration-300">
      <div className="relative flex-shrink-0 cursor-pointer overflow-hidden rounded-xl bg-muted group/thumb w-40 sm:w-56 md:w-64 lg:w-72 aspect-video" onClick={() => onPlay(video)}>
        <BlurImage src={hdThumbnail(video.thumbnail)} alt={video.title} className="w-full h-full object-cover transition-transform duration-500 group-hover/thumb:scale-105" />
        {video.isLive ? (
          <span className="absolute bottom-2 left-2 bg-red-600 text-white text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-white animate-pulse" /> AO VIVO
          </span>
        ) : video.duration && (
          <span className="absolute bottom-2 right-2 bg-black/70 backdrop-blur-md text-white text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-md border border-white/10">
            {video.duration}
          </span>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover/thumb:bg-black/20 transition-all flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-primary/90 text-primary-foreground flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 scale-90 group-hover/thumb:scale-100 transition-all shadow-2xl">
            <Play size={20} className="ml-0.5" fill="currentColor" />
          </div>
        </div>
        {onFullscreen && (
          <button
            onClick={(e) => { e.stopPropagation(); onFullscreen(video); }}
            className="absolute top-2 right-2 w-8 h-8 rounded-lg bg-black/40 backdrop-blur-md text-white flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 hover:bg-primary transition-all z-10"
            title="Tela cheia"
          >
            <Maximize size={14} />
          </button>
        )}
      </div>

      <div className="flex flex-1 gap-2.5 sm:gap-3 min-w-0 py-0.5">
        <div className="min-w-0 flex-1 flex flex-col">
          <h3
            onClick={() => onPlay(video)}
            className="font-semibold text-foreground line-clamp-2 leading-snug cursor-pointer hover:text-primary transition-colors text-sm sm:text-base lg:text-lg mb-1"
          >
            {video.title}
          </h3>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 sm:mt-2">
            <button
              onClick={() => onChannelClick?.(video.channel, video.channelThumbnail, video.channelId, video.channelUrl)}
              className="flex items-center gap-1.5 group/author shrink-0"
            >
              {video.channelThumbnail && (
                <img src={video.channelThumbnail} className="w-4 h-4 rounded-full border border-border sm:hidden" alt="" />
              )}
              <span className="text-[11px] sm:text-xs text-muted-foreground group-hover/author:text-primary transition-colors truncate max-w-[120px] sm:max-w-none">
                {video.channel}
              </span>
            </button>
            {(video.views || video.publishedTime) && (
              <div className="flex items-center text-[10px] sm:text-[11px] text-muted-foreground/70 whitespace-nowrap">
                <span className="hidden sm:inline mx-1.5 opacity-30">•</span>
                <span>{video.views}</span>
                {video.publishedTime && <span className="mx-1">•</span>}
                <span>{video.publishedTime}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoCard;
