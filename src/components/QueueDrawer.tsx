import { X, Play, GripVertical, ListMusic } from "lucide-react";
import { Song, formatDuration } from "@/data/mockSongs";
import { hdThumbnail } from "@/lib/utils";
import BlurImage from "@/components/BlurImage";
import { motion, AnimatePresence, Reorder, useDragControls } from "framer-motion";
import { useRef } from "react";

interface QueueDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentSong: Song;
  queue: Song[];
  onPlayFromQueue: (song: Song, index: number) => void;
  onRemoveFromQueue: (index: number) => void;
  onClearQueue: () => void;
  onReorder: (newQueue: Song[]) => void;
}

const QueueItem = ({
  song,
  index,
  onPlay,
  onRemove,
}: {
  song: Song;
  index: number;
  onPlay: () => void;
  onRemove: () => void;
}) => {
  const dragControls = useDragControls();

  return (
    <Reorder.Item
      value={song}
      dragListener={false}
      dragControls={dragControls}
      className="flex items-center gap-2 px-4 py-2 hover:bg-secondary/50 transition-colors group bg-background"
      whileDrag={{ scale: 1.02, boxShadow: "0 8px 24px rgba(0,0,0,0.2)", zIndex: 50 }}
    >
      <button
        onPointerDown={(e) => dragControls.start(e)}
        className="p-1 text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
      >
        <GripVertical size={16} />
      </button>
      <span className="text-xs text-muted-foreground w-5 text-center font-mono flex-shrink-0">
        {index + 1}
      </span>
      <button
        onClick={onPlay}
        className="flex items-center gap-3 flex-1 min-w-0"
      >
        <div className="relative w-10 h-10 rounded-md overflow-hidden flex-shrink-0 group-hover:ring-1 ring-primary/30 transition-all">
          <img
            src={hdThumbnail(song.cover)}
            alt={song.album}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-background/0 group-hover:bg-background/40 flex items-center justify-center transition-colors">
            <Play
              size={14}
              className="text-foreground opacity-0 group-hover:opacity-100 transition-opacity ml-0.5"
              fill="currentColor"
            />
          </div>
        </div>
        <div className="min-w-0 text-left">
          <p className="text-sm font-medium text-foreground truncate">{song.title}</p>
          <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
        </div>
      </button>
      <span className="text-[11px] text-muted-foreground font-mono flex-shrink-0">
        {formatDuration(song.duration)}
      </span>
      <button
        onClick={onRemove}
        className="p-1.5 text-muted-foreground/50 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
        title="Remover da fila"
      >
        <X size={14} />
      </button>
    </Reorder.Item>
  );
};

const QueueDrawer = ({
  isOpen,
  onClose,
  currentSong,
  queue,
  onPlayFromQueue,
  onRemoveFromQueue,
  onClearQueue,
  onReorder,
}: QueueDrawerProps) => {
  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 300 }}
      className="fixed inset-0 z-[55] bg-background flex flex-col"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <ListMusic size={20} className="text-primary" />
          <h2 className="text-base font-bold text-foreground">Fila de reprodução</h2>
          <span className="text-xs text-muted-foreground">({queue.length})</span>
        </div>
        <div className="flex items-center gap-2">
          {queue.length > 0 && (
            <button
              onClick={onClearQueue}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded-md hover:bg-destructive/10"
            >
              Limpar
            </button>
          )}
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-secondary transition-colors"
          >
            <X size={20} className="text-foreground" />
          </button>
        </div>
      </div>

      {/* Now playing */}
      <div className="px-4 py-3 bg-primary/5 border-b border-border flex-shrink-0">
        <p className="text-[10px] font-medium text-primary uppercase tracking-wider mb-2">Tocando agora</p>
        <div className="flex items-center gap-3">
          <BlurImage
            src={hdThumbnail(currentSong.cover)}
            alt={currentSong.album}
            className="w-12 h-12 rounded-lg flex-shrink-0"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground truncate">{currentSong.title}</p>
            <p className="text-xs text-muted-foreground truncate">{currentSong.artist}</p>
          </div>
          <span className="text-xs text-muted-foreground font-mono flex-shrink-0">
            {formatDuration(currentSong.duration)}
          </span>
        </div>
      </div>

      {/* Queue list */}
      <div className="flex-1 overflow-y-auto">
        {queue.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <ListMusic size={48} className="opacity-20" />
            <p className="text-sm">A fila está vazia</p>
            <p className="text-xs text-muted-foreground/60">
              Músicas relacionadas serão adicionadas automaticamente
            </p>
          </div>
        ) : (
          <div className="py-1">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">
              A seguir — arraste para reordenar
            </p>
            <Reorder.Group
              axis="y"
              values={queue}
              onReorder={onReorder}
              className="list-none"
            >
              {queue.map((song, index) => (
                <QueueItem
                  key={`${song.youtubeId}-${index}`}
                  song={song}
                  index={index}
                  onPlay={() => onPlayFromQueue(song, index)}
                  onRemove={() => onRemoveFromQueue(index)}
                />
              ))}
            </Reorder.Group>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default QueueDrawer;
