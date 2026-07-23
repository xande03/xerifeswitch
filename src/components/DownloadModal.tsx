import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Download, Copy, Check, ExternalLink } from "lucide-react";
import { Song } from "@/data/mockSongs";
import { useState } from "react";

interface DownloadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  song: Song | null;
  isVideo: boolean;
  onSuccess?: () => void;
}

export const DownloadModal = ({ open, onOpenChange, song, isVideo, onSuccess }: DownloadModalProps) => {
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [quality, setQuality] = useState<'320' | '192' | '128'>('320');


  if (!song) return null;

  const youtubeUrl = `https://www.youtube.com/watch?v=${song.youtubeId}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(youtubeUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const input = document.createElement("input");
      input.value = youtubeUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleGoToDownload = () => {
    // Redireciona ao ytmp3 com o link já preenchido no campo
    const target = `https://freeytmp3.org/?url=${encodeURIComponent(youtubeUrl)}`;
    window.open(target, '_blank', 'noopener');
    onSuccess?.();
    onOpenChange(false);
  };

  const handleSmartDownload = async () => {
    setIsDownloading(true);
    setTimeout(() => {
      setIsDownloading(false);
      handleGoToDownload();
    }, 500);
  };


  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setCopied(false); }}>
      <DialogContent
        className="w-[calc(100vw-2rem)] max-w-md sm:max-w-md mx-auto rounded-2xl bg-card border-border overflow-y-auto"
        style={{
          paddingTop: "max(1rem, env(safe-area-inset-top))",
          paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
          paddingLeft: "max(1rem, env(safe-area-inset-left))",
          paddingRight: "max(1rem, env(safe-area-inset-right))",
          maxHeight: "calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 2rem)",
        }}
      >
        <DialogHeader className="space-y-1.5 text-center sm:text-left">
          <DialogTitle className="flex items-center justify-center sm:justify-start gap-2 text-base sm:text-lg">
            <Download className="text-primary" size={20} />
            <span className="truncate">Download de {isVideo ? "Vídeo" : "Música"}</span>
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm line-clamp-2">
            {song.title} — {song.artist}
          </DialogDescription>
        </DialogHeader>

        <div className="py-3 sm:py-4 flex flex-col gap-3 sm:gap-4 w-full mx-auto">
          {/* Link do conteúdo */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-foreground">Link do {isVideo ? "vídeo" : "áudio"}:</p>
            <div className="flex items-center gap-2 bg-secondary/50 rounded-xl p-2 sm:p-3 min-w-0">
              <input
                readOnly
                value={youtubeUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 min-w-0 bg-transparent text-xs sm:text-sm text-foreground font-mono truncate outline-none"
              />
              <button
                onClick={handleCopy}
                title="Copiar link"
                className="flex-shrink-0 p-1.5 sm:p-2 rounded-lg bg-primary text-primary-foreground transition-all active:scale-95"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
            {copied && (
              <p className="text-xs text-primary font-medium">Link copiado!</p>
            )}
          </div>

          {/* Qualidade */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-foreground">Qualidade:</p>
            <div className="flex gap-2">
              {(['320', '192', '128'] as const).map((q) => (
                <button
                  key={q}
                  onClick={() => setQuality(q)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${
                    quality === q
                      ? "bg-primary border-primary text-primary-foreground"
                      : "bg-secondary/30 border-white/5 text-muted-foreground"
                  }`}
                >
                  {q}kbps
                </button>
              ))}
            </div>
          </div>

          {/* Confirmar e redirecionar */}
          <div className="space-y-2 pt-2">
            <button
              onClick={handleSmartDownload}
              disabled={isDownloading}
              className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-bold transition-all active:scale-95 shadow-lg shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {isDownloading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <ExternalLink size={20} />
              )}
              {isDownloading ? "Abrindo ytmp3..." : "Confirmar e baixar no ytmp3"}
            </button>
            <p className="text-[11px] text-muted-foreground text-center">
              O link já será colado automaticamente no campo do site.
            </p>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
};
