import { memo, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, SkipBack, SkipForward, Shuffle, Heart, Maximize2, X,
  Mic, Video, Download, Share2, Volume2, VolumeX,
} from "lucide-react";
import type { Song } from "@/data/mockSongs";
import { formatDuration } from "@/data/mockSongs";
import { hdThumbnail } from "@/lib/utils";
import SeekBar from "@/components/SeekBar";

/**
 * Player minimizado desktop (pedido 2026-09-25):
 *  - lg+ : vira uma PÍLULA na barra superior, ao lado do botão de
 *    configurações (slot `miniPlayerNode` do DesktopTopBar), com capa pequena
 *    + título do que está tocando. Um clique abre o POPUP ancorado abaixo da
 *    pílula com o card completo (seek, transporte, atalhos e volume) — as
 *    mesmas ferramentas de antes, nada some.
 *  - md–lg (sem TopBar): mantém a bolha flutuante + card fixo anteriores.
 * Regra de ouro preservada: fechar (X) NUNCA faz o player sumir — a pílula
 * permanece visível no header enquanto houver mídia carregada.
 */
interface Props {
  song: Song;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (p: number) => void;
  onExpand: () => void;
  isShuffled: boolean;
  onShuffle: () => void;
  isLiked: boolean;
  onLike: () => void;
  onLyrics: () => void;
  onVideo: () => void;
  onShare: () => void;
  volume: number;
  onVolumeChange: (v: number) => void;
}

const DesktopFloatingPlayer = memo(function DesktopFloatingPlayer(p: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Clique fora / Escape fecham o popup (somente lg+, onde ele é dropdown).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!window.matchMedia("(min-width: 1024px)").matches) return;
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const progress = p.duration > 0 ? p.currentTime / p.duration : 0;

  /** Card completo (figura 2): cabeçalho + seek + transporte + atalhos/volume. */
  const card = (wrapperClass: string) => (
    <div className={wrapperClass}>
      <div className="rounded-2xl bg-card/95 backdrop-blur-xl border border-border/50 shadow-2xl p-3 flex flex-col gap-2.5">
        {/* Cabeçalho: capa + título + expandir/fechar */}
        <div className="flex items-center gap-2.5">
          <button onClick={p.onExpand} className="w-12 h-12 rounded-xl overflow-hidden bg-secondary shrink-0 active:scale-95 transition-transform" title="Expandir player">
            <img src={hdThumbnail(p.song.cover)} alt="" className="w-full h-full object-cover" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold text-foreground truncate leading-tight">{p.song.title}</p>
            <p className="text-[11px] text-muted-foreground truncate mt-0.5">{p.song.artist}</p>
          </div>
          <button onClick={p.onExpand} title="Expandir" aria-label="Expandir player" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors">
            <Maximize2 size={14} />
          </button>
          <button onClick={() => setOpen(false)} title="Recolher na pílula" aria-label="Recolher player" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* Seek + tempos */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-muted-foreground/80 w-8 text-right tabular-nums">{formatDuration(p.currentTime)}</span>
          <SeekBar progress={progress} onSeek={p.onSeek} trackHeight="thin" className="flex-1" duration={p.duration} />
          <span className="text-[10px] font-mono text-muted-foreground/80 w-8 tabular-nums">{formatDuration(p.duration)}</span>
        </div>

        {/* Transporte */}
        <div className="flex items-center justify-center gap-2">
          <button onClick={p.onShuffle} title="Aleatório" className={`p-2 rounded-xl transition-colors ${p.isShuffled ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"}`}>
            <Shuffle size={15} />
          </button>
          <button onClick={p.onPrev} title="Anterior" className="p-2 rounded-xl text-foreground hover:bg-secondary/60 transition-colors active:scale-90">
            <SkipBack size={18} fill="currentColor" />
          </button>
          <button onClick={p.onTogglePlay} title={p.isPlaying ? "Pausar" : "Tocar"} className="w-11 h-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/30 hover:scale-105 active:scale-95 transition-transform">
            {p.isPlaying ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" className="ml-0.5" />}
          </button>
          <button onClick={p.onNext} title="Próxima" className="p-2 rounded-xl text-foreground hover:bg-secondary/60 transition-colors active:scale-90">
            <SkipForward size={18} fill="currentColor" />
          </button>
          <button onClick={p.onLike} title={p.isLiked ? "Remover dos favoritos" : "Favoritar"} className={`p-2 rounded-xl transition-colors ${p.isLiked ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"}`}>
            <Heart size={15} fill={p.isLiked ? "currentColor" : "none"} />
          </button>
        </div>

        {/* Pílula de atalhos e ferramentas + volume */}
        <div className="flex items-center gap-0.5 bg-secondary/50 border border-border/40 rounded-full px-1.5 py-1">
          <button onClick={p.onLyrics} title="Letra" className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <Mic size={13} />
          </button>
          <button onClick={p.onVideo} title="Modo vídeo" className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <Video size={13} />
          </button>
          <button onClick={p.onShare} title="Compartilhar" className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <Share2 size={13} />
          </button>
          <span className="flex-1" />
          <span className="text-muted-foreground mr-1">
            {p.volume === 0 ? <VolumeX size={13} /> : <Volume2 size={13} />}
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(p.volume * 100)}
            onChange={(e) => p.onVolumeChange(Number(e.target.value) / 100)}
            aria-label="Volume"
            className="w-16 accent-[hsl(var(--module-accent))] h-1 cursor-pointer"
          />
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* ── lg+: pílula no header (slot do DesktopTopBar) + popup ancorado ── */}
      <div className="hidden lg:block relative" ref={wrapRef}>
        <button
          onClick={() => setOpen((o) => !o)}
          title={`${p.song.title} — ${p.song.artist}`}
          aria-label="Mini player: abrir controles"
          aria-expanded={open}
          className={`group flex items-center gap-2 h-8 pl-1 pr-2.5 rounded-full border transition-all active:scale-95 ${
            open
              // Contorno neon branco (pedido 2026-09-25): aro claro + halo
              // suave; mais intenso com o popup aberto.
              ? "border-[hsl(var(--module-accent))] bg-[hsl(var(--module-accent)/0.16)] shadow-[0_0_0_1px_rgba(255,255,255,0.55),0_0_16px_rgba(255,255,255,0.40),inset_0_0_8px_rgba(255,255,255,0.10)]"
              : "border-border/50 bg-secondary/50 hover:border-[hsl(var(--module-accent)/0.6)] hover:bg-secondary/80 shadow-[0_0_0_1px_rgba(255,255,255,0.38),0_0_10px_rgba(255,255,255,0.26),inset_0_0_6px_rgba(255,255,255,0.08)]"
          }`}
        >
          <span className="relative w-6 h-6 rounded-md overflow-hidden ring-1 ring-white/20 shrink-0">
            <img src={hdThumbnail(p.song.cover)} alt="" className="w-full h-full object-cover" />
          </span>
          <span className="text-[11px] font-semibold text-foreground text-left truncate w-[3.5rem] xl:w-[9.5rem] 2xl:w-[14rem] leading-none">
            {p.song.title}
          </span>
          {p.isPlaying ? (
            <span className="flex items-end gap-[2px] h-[12px] shrink-0" aria-hidden>
              <span className="w-[2px] rounded-full animate-pulse bg-[hsl(var(--module-accent))]" style={{ height: 5, animationDelay: "0ms" }} />
              <span className="w-[2px] rounded-full animate-pulse bg-[hsl(var(--module-accent))]" style={{ height: 10, animationDelay: "150ms" }} />
              <span className="w-[2px] rounded-full animate-pulse bg-[hsl(var(--module-accent))]" style={{ height: 4, animationDelay: "300ms" }} />
            </span>
          ) : (
            <Play size={10} className="text-muted-foreground shrink-0" fill="currentColor" />
          )}
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              className="absolute right-0 top-[calc(100%+10px)] z-[95] w-[340px] origin-top-right"
            >
              {card("")}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── md–lg (sem TopBar): bolha flutuante + card fixo, como antes ── */}
      <div className="hidden md:block lg:hidden">
        {!open ? (
          <div className="fixed bottom-6 right-6 z-[85]">
            <button
              onClick={() => setOpen(true)}
              title="Abrir player"
              aria-label="Abrir player"
              className="group relative w-[76px] h-[76px] rounded-full active:scale-95 transition-transform duration-200 hover:scale-[1.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--module-accent))]"
              style={{ filter: "drop-shadow(0 12px 26px rgba(0,0,0,0.4))" }}
            >
              <span className="absolute inset-[7px] rounded-full overflow-hidden ring-1 ring-white/25">
                <img src={hdThumbnail(p.song.cover)} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                <span className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
              </span>
              <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 76 76" aria-hidden>
                <circle cx="38" cy="38" r={34} fill="none" stroke="hsl(var(--module-accent) / 0.22)" strokeWidth="3.5" />
                <circle
                  cx="38" cy="38" r={34} fill="none"
                  stroke="hsl(var(--module-accent))" strokeWidth="3.5" strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 34} strokeDashoffset={2 * Math.PI * 34 * (1 - progress)}
                  className="transition-[stroke-dashoffset] duration-300"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="w-9 h-9 rounded-full backdrop-blur-md bg-black/45 ring-1 ring-white/25 flex items-center justify-center text-white transition-colors group-hover:bg-black/65">
                  {p.isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
                </span>
              </span>
              {p.isPlaying && (
                <span className="absolute -top-0.5 -right-0.5 flex items-end gap-[2px] h-[18px] px-[5px] pb-[4px] pt-[5px] rounded-full bg-[hsl(var(--module-accent))] shadow-md">
                  <span className="w-[2px] bg-white rounded-full animate-pulse" style={{ height: 6, animationDelay: "0ms" }} />
                  <span className="w-[2px] bg-white rounded-full animate-pulse" style={{ height: 9, animationDelay: "150ms" }} />
                  <span className="w-[2px] bg-white rounded-full animate-pulse" style={{ height: 4, animationDelay: "300ms" }} />
                </span>
              )}
            </button>
          </div>
        ) : (
          card("fixed bottom-5 right-5 z-[85] w-[340px]")
        )}
      </div>
    </>
  );
});

export default DesktopFloatingPlayer;
