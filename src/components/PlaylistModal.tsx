import { useState } from "react";
import { X, Plus, Music, ListMusic, Check, Trash2 } from "lucide-react";
import { Playlist, savePlaylist, deletePlaylist } from "@/lib/localStorage";
import { motion, AnimatePresence } from "framer-motion";
import { Song } from "@/data/mockSongs";

interface PlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  playlists: Playlist[];
  onUpdate: () => void;
  onSelectPlaylist?: (playlist: Playlist) => void;
  mode?: "manage" | "add";
  songToAdd?: Song | null;
  onSongAdded?: () => void;
}

export const PlaylistModal = ({ 
  isOpen, 
  onClose, 
  playlists, 
  onUpdate, 
  onSelectPlaylist,
  mode = "manage",
  songToAdd,
  onSongAdded
}: PlaylistModalProps) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");

  const handleCreate = () => {
    if (!newPlaylistName.trim()) return;
    const newPlaylist: Playlist = {
      id: `pl-${Date.now()}`,
      name: newPlaylistName,
      songs: mode === "add" && songToAdd ? [songToAdd] : [],
      createdAt: Date.now()
    };
    savePlaylist(newPlaylist);
    setNewPlaylistName("");
    setIsCreating(false);
    onUpdate();
    if (mode === "add" && songToAdd) {
      onSongAdded?.();
    }
  };

  const handleAddToPlaylist = (playlist: Playlist) => {
    if (!songToAdd) return;
    const updated = { ...playlist, songs: [...playlist.songs] };
    if (!updated.songs.some(s => s.id === songToAdd.id)) {
      updated.songs.push(songToAdd);
      savePlaylist(updated);
      onUpdate();
      onSongAdded?.();
    }
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Deseja excluir esta playlist?")) {
      deletePlaylist(id);
      onUpdate();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-card border border-border w-full max-w-md rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[80vh]"
      >
        <div className="p-6 flex items-center justify-between border-b border-border">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <ListMusic className="text-primary" />
            {mode === "add" ? "Adicionar à Playlist" : "Minhas Playlists"}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-accent rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isCreating ? (
            <div className="p-4 bg-secondary rounded-2xl space-y-4 animate-in fade-in slide-in-from-top-2">
              <input 
                autoFocus
                type="text" 
                placeholder="Nome da playlist" 
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <div className="flex gap-2">
                <button 
                  onClick={() => setIsCreating(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-background transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleCreate}
                  className="flex-1 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-primary/20 transition-transform active:scale-95"
                >
                  Criar
                </button>
              </div>
            </div>
          ) : (
            <button 
              onClick={() => setIsCreating(true)}
              className="w-full flex items-center gap-3 p-4 border-2 border-dashed border-border rounded-2xl text-muted-foreground hover:text-primary hover:border-primary/50 transition-all active:scale-[0.98]"
            >
              <Plus size={24} />
              <span className="font-bold">Criar nova playlist</span>
            </button>
          )}

          <div className="space-y-2 pt-2">
            {playlists.length === 0 ? (
              <div className="py-12 text-center space-y-3 opacity-30">
                <Music size={48} className="mx-auto" />
                <p className="text-sm font-medium">Nenhuma playlist criada</p>
              </div>
            ) : (
              playlists.sort((a,b) => b.createdAt - a.createdAt).map((playlist) => (
                <button 
                  key={playlist.id}
                  onClick={() => mode === "add" ? handleAddToPlaylist(playlist) : onSelectPlaylist?.(playlist)}
                  className="w-full flex items-center justify-between p-4 bg-secondary/50 hover:bg-accent rounded-2xl transition-all group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                      <ListMusic size={24} />
                    </div>
                    <div className="text-left">
                      <p className="font-bold text-foreground">{playlist.name}</p>
                      <p className="text-xs text-muted-foreground">{playlist.songs.length} itens</p>
                    </div>
                  </div>
                  {mode === "add" ? (
                    playlist.songs.some(s => s.id === songToAdd?.id) ? (
                      <Check size={20} className="text-primary" />
                    ) : (
                      <Plus size={20} className="text-muted-foreground group-hover:text-primary" />
                    )
                  ) : (
                    <button 
                      onClick={(e) => handleDelete(playlist.id, e)}
                      className="p-2 opacity-0 group-hover:opacity-100 hover:text-destructive transition-all"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
