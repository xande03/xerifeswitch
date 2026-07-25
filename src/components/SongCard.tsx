import { useState } from "react";
import { Download, DownloadCloud, ThumbsUp, Check, MoreVertical, Plus, Music2, Share2, ListPlus } from "lucide-react";
import BlurImage from "@/components/BlurImage";
import { Song } from "@/data/mockSongs";
import { motion } from "framer-motion";
import { hdThumbnail } from "@/lib/utils";
import ChordsSheet from "@/components/ChordsSheet";
import { ShareModal } from "@/components/ShareModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SongCardProps {
  song: Song;
  isActive: boolean;
  onSelect: (song: Song) => void;
  onVote?: (song: Song) => void;
  onDownload?: (song: Song) => void;
  onAddToPlaylist?: (song: Song) => void;
  showVotes?: boolean;
  hasVoted?: boolean;
}

const SongCard = ({ song, isActive, onSelect, onVote, onDownload, onAddToPlaylist, showVotes = false, hasVoted = false }: SongCardProps) => {
  const [chordsOpen, setChordsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  return (
  <>
  <motion.div
    layout
    transition={{ type: "spring", stiffness: 400, damping: 35 }}
    className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors group ${
      isActive ? "bg-accent" : "hover:bg-accent/50 active:bg-accent"
    }`}
  >
    <button
      onClick={() => onSelect(song)}
      className="relative w-11 h-11 rounded flex-shrink-0 overflow-hidden touch-manipulation active:scale-95 transition-transform"
      style={{ WebkitTapHighlightColor: 'transparent' }}
      aria-label={`Tocar ${song.title}`}
    >
      <BlurImage src={hdThumbnail(song.cover)} alt={song.album} className="w-full h-full pointer-events-none" />
      {isActive && (
        <div className="absolute inset-0 bg-background/50 flex items-center justify-center pointer-events-none">
          <div className="flex gap-[2px]">
            {[1,2,3].map(i => (
              <div key={i} className="w-[3px] h-3 bg-primary rounded-full animate-pulse" style={{ animationDelay: `${i*0.15}s` }} />
            ))}
          </div>
        </div>
      )}
    </button>
    <button onClick={() => onSelect(song)} className="flex-1 text-left min-w-0">
      <p className={`text-sm font-normal truncate ${isActive ? "text-primary" : "text-foreground"}`}>
        {song.title}
      </p>
      <p className="text-xs text-muted-foreground truncate">
        {song.artist} • {song.album}
      </p>
    </button>
    <div className="flex items-center gap-1 flex-shrink-0">
      {showVotes && onVote && (
        <button
          onClick={() => onVote(song)}
          disabled={hasVoted}
          className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-colors ${
            hasVoted
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {hasVoted ? <Check size={14} /> : <ThumbsUp size={14} />}
          <span>{song.votes}</span>
        </button>
      )}
      {/* Cifra — sempre visível */}
      <button
        onClick={() => setChordsOpen(true)}
        title="Ver cifra"
        aria-label={`Ver cifra de ${song.title}`}
        className="p-1.5 rounded-full text-muted-foreground hover:text-primary transition-colors"
      >
        <Music2 size={16} />
      </button>
      {onDownload && (
        <button
          onClick={() => onDownload(song)}
          title="Download"
          className={`p-1.5 rounded-full transition-colors ${
            song.isDownloaded ? "text-primary" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {song.isDownloaded ? <Download size={16} /> : <DownloadCloud size={16} />}
        </button>
      )}
      {onAddToPlaylist && (
        <button
          onClick={() => onAddToPlaylist(song)}
          title="Adicionar à playlist"
          className="p-1.5 rounded-full text-muted-foreground hover:text-primary transition-colors"
        >
          <Plus size={16} />
        </button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={`Mais opções para ${song.title}`}
            className="p-1 rounded-full text-muted-foreground hover:text-foreground transition-colors"
          >
            <MoreVertical size={16} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52 z-50 bg-popover">
          <DropdownMenuItem onClick={() => setShareOpen(true)} className="gap-2">
            <Share2 size={15} /> Compartilhar
          </DropdownMenuItem>
          {onAddToPlaylist && (
            <DropdownMenuItem onClick={() => onAddToPlaylist(song)} className="gap-2">
              <ListPlus size={15} /> Adicionar à playlist
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setChordsOpen(true)} className="gap-2">
            <Music2 size={15} /> Ver cifra
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </motion.div>

  <ChordsSheet
    open={chordsOpen}
    onOpenChange={setChordsOpen}
    artist={song.artist}
    title={song.title}
  />
  <ShareModal open={shareOpen} onOpenChange={setShareOpen} song={song} isVideo={false} />
  </>
  );
};

export default SongCard;
