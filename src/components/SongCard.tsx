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

/** Slug a string to cifraclub.com.br URL format */
function toCifraSlug(s: string): string {
  if (!s) return "";
  return s.toLowerCase()
    .replace(/\(.*?\)/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function openCifraClub(song: Song) {
  const mainArtist = song.artist.split(/[,&\/]|feat\.|ft\./i)[0].trim();
  const artistSlug = toCifraSlug(mainArtist);
  const titleSlug = toCifraSlug(song.title);
  if (artistSlug && titleSlug) {
    window.open(`https://www.cifraclub.com.br/${artistSlug}/${titleSlug}/`, '_blank', 'noopener');
  } else {
    window.open(`https://www.cifraclub.com.br/?q=${encodeURIComponent(song.artist + ' ' + song.title)}`, '_blank', 'noopener');
  }
}

const SongCard = ({ song, isActive, onSelect, onVote, onDownload, onAddToPlaylist, showVotes = false, hasVoted = false }: SongCardProps) => (
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
      {/* Buscar Cifra button — next to download */}
      <button
        onClick={() => openCifraClub(song)}
        title="Buscar Cifra"
        className="p-1.5 rounded-full text-muted-foreground hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
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
      <button className="p-1 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity">
        <MoreVertical size={16} />
      </button>
    </div>
  </motion.div>
);

export default SongCard;
