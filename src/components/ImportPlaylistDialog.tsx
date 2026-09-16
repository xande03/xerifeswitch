import { useState } from "react";
import { Link2, Loader2, ListMusic, Music2, AlertCircle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { savePlaylist, type Playlist } from "@/lib/localStorage";
import { fetchYouTubePlaylist, type ImportedPlaylist } from "@/lib/youtubePlaylist";

interface ImportPlaylistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado depois de salvar — útil para abrir a playlist recém-criada. */
  onImported?: (playlist: Playlist) => void;
}

function newPlaylistId(): string {
  try {
    return `pl-${crypto.randomUUID()}`;
  } catch {
    return `pl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

const ImportPlaylistDialog = ({ open, onOpenChange, onImported }: ImportPlaylistDialogProps) => {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportedPlaylist | null>(null);

  const reset = () => {
    setUrl("");
    setLoading(false);
    setError(null);
    setPreview(null);
  };

  const handleFetch = async () => {
    if (!url.trim() || loading) return;
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      const result = await fetchYouTubePlaylist(url);
      setPreview(result);
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      setError(
        code === "invalid-url"
          ? "Cole um link válido de playlist do YouTube (com list= no endereço)."
          : code === "not-found" || code === "empty"
            ? "Não encontrei faixas nessa playlist. Ela é pública?"
            : "Falha ao buscar a playlist. Tente de novo em instantes.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleImport = () => {
    if (!preview) return;
    const playlist: Playlist = {
      id: newPlaylistId(),
      name: preview.title,
      createdAt: Date.now(),
      songs: preview.tracks.map((t) => ({
        ...t,
        album: "",
        votes: 0,
        isDownloaded: false,
      })),
    };
    savePlaylist(playlist);
    toast.success(`Playlist "${preview.title}" importada com ${preview.tracks.length} faixas`);
    onImported?.(playlist);
    onOpenChange(false);
    reset();
  };

  const cover = preview?.cover || preview?.tracks.find((t) => t.cover)?.cover || "";

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="sm:max-w-md bg-background border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 size={17} className="text-primary" />
            Importar playlist do YouTube
          </DialogTitle>
          <DialogDescription className="text-xs">
            Cole o link de uma playlist pública do YouTube ou YouTube Music. Ela fica salva neste aparelho.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-1">
          <div className="flex gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleFetch()}
              placeholder="https://www.youtube.com/playlist?list=…"
              autoFocus
              className="flex-1 min-w-0 h-10 px-3 rounded-xl bg-secondary/60 border border-border text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary/60 transition-colors"
            />
            <button
              onClick={handleFetch}
              disabled={loading || !url.trim()}
              className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-bold disabled:opacity-40 transition-opacity"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : "Buscar"}
            </button>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <p className="text-xs leading-snug">{error}</p>
            </div>
          )}

          {preview && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/40 border border-border">
                <div className="w-14 h-14 rounded-lg overflow-hidden bg-secondary shrink-0 flex items-center justify-center text-muted-foreground">
                  {cover ? (
                    <img src={cover} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <ListMusic size={22} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-foreground truncate">{preview.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {preview.tracks.length} {preview.tracks.length === 1 ? "faixa encontrada" : "faixas encontradas"}
                  </p>
                  {preview.source === "youtube-album-tracks" && preview.tracks.length >= 50 && (
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                      Playlists grandes podem vir parciais (primeira página).
                    </p>
                  )}
                </div>
              </div>

              <div className="max-h-40 overflow-y-auto rounded-xl border border-border divide-y divide-border/60">
                {preview.tracks.slice(0, 8).map((t) => (
                  <div key={t.id} className="flex items-center gap-2.5 px-3 py-2">
                    <div className="w-8 h-8 rounded overflow-hidden bg-secondary shrink-0 flex items-center justify-center text-muted-foreground">
                      {t.cover ? (
                        <img src={t.cover} alt="" className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <Music2 size={12} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{t.title}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{t.artist}</p>
                    </div>
                  </div>
                ))}
                {preview.tracks.length > 8 && (
                  <p className="px-3 py-2 text-[11px] text-muted-foreground text-center">
                    + {preview.tracks.length - 8} outras faixas
                  </p>
                )}
              </div>

              <button
                onClick={handleImport}
                className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-bold transition-opacity hover:opacity-90"
              >
                Importar playlist
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ImportPlaylistDialog;
