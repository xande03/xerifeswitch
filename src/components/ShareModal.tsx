import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Share2, Copy, Check, MessageCircle, Send } from "lucide-react";
import { Song } from "@/data/mockSongs";
import { useState } from "react";

interface ShareModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  song: Song | null;
  isVideo: boolean;
}

export const ShareModal = ({ open, onOpenChange, song, isVideo }: ShareModalProps) => {
  const [copied, setCopied] = useState(false);

  if (!song) return null;

  const youtubeUrl = `https://www.youtube.com/watch?v=${song.youtubeId}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(youtubeUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
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

  const shareWhatsApp = () => {
    const text = `🎵 ${song.title} - ${song.artist}\n${youtubeUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const shareTelegram = () => {
    const text = `🎵 ${song.title} - ${song.artist}`;
    window.open(`https://t.me/share/url?url=${encodeURIComponent(youtubeUrl)}&text=${encodeURIComponent(text)}`, '_blank');
  };

  const shareNative = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${song.title} - ${song.artist}`,
          text: `🎵 ${song.title} - ${song.artist}`,
          url: youtubeUrl,
        });
      } catch {}
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setCopied(false); }}>
      <DialogContent className="sm:max-w-md w-[92vw] rounded-2xl p-5 bg-card border-border fixed bottom-4 top-auto left-1/2 -translate-x-1/2 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="text-primary" />
            Compartilhar {isVideo ? "Vídeo" : "Música"}
          </DialogTitle>
          <DialogDescription className="pt-2 truncate">
            {song.title} - {song.artist}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 flex flex-col gap-4">
          {/* YouTube Link */}
          <div className="flex items-center gap-2 bg-secondary/50 rounded-xl p-3">
            <input
              readOnly
              value={youtubeUrl}
              className="flex-1 bg-transparent text-sm text-foreground font-mono truncate outline-none"
            />
            <button
              onClick={handleCopy}
              className="flex-shrink-0 p-2 rounded-lg bg-primary text-primary-foreground transition-all active:scale-95"
            >
              {copied ? <Check size={18} /> : <Copy size={18} />}
            </button>
          </div>

          {copied && (
            <p className="text-xs text-primary text-center font-medium">Link copiado!</p>
          )}

          {/* Share buttons */}
          <div className="flex gap-3 justify-center">
            <button
              onClick={shareWhatsApp}
              className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-[#25D366]/10 hover:bg-[#25D366]/20 transition-colors active:scale-95"
            >
              <MessageCircle size={28} className="text-[#25D366]" />
              <span className="text-[11px] font-medium text-foreground">WhatsApp</span>
            </button>

            <button
              onClick={shareTelegram}
              className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-[#0088cc]/10 hover:bg-[#0088cc]/20 transition-colors active:scale-95"
            >
              <Send size={28} className="text-[#0088cc]" />
              <span className="text-[11px] font-medium text-foreground">Telegram</span>
            </button>

            {typeof navigator.share === 'function' && (
              <button
                onClick={shareNative}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors active:scale-95"
              >
                <Share2 size={28} className="text-primary" />
                <span className="text-[11px] font-medium text-foreground">Mais</span>
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
