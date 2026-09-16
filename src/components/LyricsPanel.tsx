import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCcw, Music2, AlignLeft } from "lucide-react";
import { fetchLyrics, invalidateLyricsCache, type LyricsResult } from "@/lib/lyrics";

export interface LyricsPanelProps {
  artist: string;
  title: string;
  album?: string;
  duration?: number;
  /** Tempo atual da reprodução (s). Quando informado e a letra for
   *  sincronizada, a linha ativa é destacada com auto-scroll. */
  currentTime?: number;
  className?: string;
}

/**
 * Painel de letra (sincronizada ou estática) pensado para ficar ao lado das
 * cifras (ChordsSheet). Consome o pipeline já existente em `lib/lyrics`:
 * Edge Function `fetch-lyrics` → LRCLIB direto → fallbacks públicos.
 */
const LyricsPanel = ({
  artist,
  title,
  album,
  duration,
  currentTime,
  className = "",
}: LyricsPanelProps) => {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<LyricsResult | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const prevActiveRef = useRef(-1);

  const load = useCallback(
    async (skipCache = false) => {
      setLoading(true);
      if (skipCache) invalidateLyricsCache(artist, title, album);
      const r = await fetchLyrics(artist, title, { album, duration, skipCache });
      setResult(r);
      setLoading(false);
    },
    [artist, title, album, duration],
  );

  useEffect(() => {
    prevActiveRef.current = -1;
    void load(false);
  }, [load]);

  const hasTime = typeof currentTime === "number" && Number.isFinite(currentTime);
  const synced = Boolean(result?.synced) && hasTime;

  const activeIdx = useMemo(() => {
    if (!result?.synced || !hasTime || !result.lines.length) return -1;
    const t = currentTime as number;
    // Última linha cuja timestamp <= t
    let lo = 0, hi = result.lines.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (result.lines[mid].time <= t) { ans = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    return ans;
  }, [result, currentTime, hasTime]);

  // Auto-scroll suave quando a linha ativa muda
  useEffect(() => {
    if (!synced || activeIdx < 0 || activeIdx === prevActiveRef.current) return;
    prevActiveRef.current = activeIdx;
    lineRefs.current[activeIdx]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeIdx, synced]);

  return (
    <div className={`flex flex-col min-h-0 ${className}`}>
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-y-auto px-5 py-4 overscroll-contain"
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <Loader2 className="animate-spin" size={22} />
            <p className="text-xs">Procurando letra…</p>
          </div>
        ) : !result || result.lines.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-3">
            <Music2 size={36} strokeWidth={1.2} className="opacity-40" />
            <div>
              <p className="text-sm font-medium text-foreground/80">Letra não encontrada</p>
              <p className="text-xs mt-1 opacity-70">Não achamos a letra desta faixa nas fontes públicas.</p>
            </div>
            <button
              onClick={() => void load(true)}
              className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-secondary hover:bg-secondary/70 text-secondary-foreground transition-colors"
            >
              <RefreshCcw size={12} /> Tentar novamente
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1.5 mb-3 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/80">
              <AlignLeft size={12} />
              {result.synced ? (hasTime ? "Letra sincronizada" : "Letra sincronizada (toque para acompanhar)") : "Letra"}
            </div>
            <div className={result.synced ? "space-y-2.5" : "space-y-1.5"}>
              {result.lines.map((line, i) => {
                const active = synced && i === activeIdx;
                const past = synced && i < activeIdx;
                return (
                  <p
                    key={`${line.time}-${i}`}
                    ref={(el) => { lineRefs.current[i] = el; }}
                    className={
                      active
                        ? "text-base font-bold text-primary leading-snug transition-all"
                        : past
                          ? "text-sm text-muted-foreground/60 leading-relaxed transition-all"
                          : result.synced
                            ? "text-sm font-medium text-foreground/85 leading-relaxed transition-all"
                            : "text-sm text-foreground/85 leading-relaxed"
                    }
                  >
                    {line.text}
                  </p>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default LyricsPanel;
