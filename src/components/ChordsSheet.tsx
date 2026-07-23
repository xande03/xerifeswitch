import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Loader2, ExternalLink, Minus, Plus, Copy, RefreshCcw, Play, Pause } from "lucide-react";
import { fetchChords, transposeChords, cifraClubFallbackUrl, invalidateChordsCache, type ChordsResult } from "@/lib/chords";
import { toast } from "sonner";

interface ChordsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  artist: string;
  title: string;
}

const CHORD_LINE_REGEX = /^(?:\s*(?:[A-G](?:#|b)?(?:m|maj|sus|dim|aug|add)?\d{0,2}(?:sus\d?|add\d)?(?:\/[A-G](?:#|b)?)?)\s*)+$/;

function isChordLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 60) return false;
  return CHORD_LINE_REGEX.test(trimmed);
}

const ChordsSheet = ({ open, onOpenChange, artist, title }: ChordsSheetProps) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ChordsResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [semitones, setSemitones] = useState(0);
  const [fontSize, setFontSize] = useState(14);
  const [autoScroll, setAutoScroll] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState(1); // px/frame ~
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    setData(null);
    setSemitones(0);
    fetchChords(artist, title)
      .then((r) => {
        if (cancelled) return;
        if (r) setData(r);
        else setNotFound(true);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [open, artist, title]);

  // Auto-scroll loop
  useEffect(() => {
    if (!autoScroll || !bodyRef.current) return;
    let raf = 0;
    let last = performance.now();
    const step = (t: number) => {
      const dt = t - last;
      last = t;
      const el = bodyRef.current;
      if (el) {
        el.scrollTop += (scrollSpeed * dt) / 32;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) setAutoScroll(false);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [autoScroll, scrollSpeed]);

  const transposed = useMemo(() => (data ? transposeChords(data.chords, semitones) : ""), [data, semitones]);
  const transposedKey = useMemo(() => {
    if (!data?.key) return null;
    return transposeChords(data.key, semitones);
  }, [data?.key, semitones]);

  const rendered = useMemo(() => {
    if (!transposed) return null;
    return transposed.split("\n").map((line, i) => (
      <div
        key={i}
        className={isChordLine(line) ? "text-primary font-semibold" : "text-foreground"}
      >
        {line || "\u00A0"}
      </div>
    ));
  }, [transposed]);

  const handleCopy = async () => {
    if (!transposed) return;
    try {
      await navigator.clipboard.writeText(transposed);
      toast.success("Cifra copiada");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const handleRetry = () => {
    invalidateChordsCache(artist, title);
    setLoading(true);
    setNotFound(false);
    fetchChords(artist, title, { skipCache: true })
      .then((r) => (r ? setData(r) : setNotFound(true)))
      .finally(() => setLoading(false));
  };

  const externalUrl = data?.url || cifraClubFallbackUrl(artist, title);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg flex flex-col p-0 bg-background border-l border-border"
      >
        <SheetHeader className="p-4 border-b border-border/60 space-y-2">
          <div>
            <SheetTitle className="text-left text-lg font-bold truncate">{title}</SheetTitle>
            <p className="text-sm text-muted-foreground truncate">{artist}</p>
          </div>

          {/* Cabeçalho de tonalidade: sempre visível quando temos o tom original */}
          {data?.key && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary text-foreground text-xs font-semibold">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Tom original</span>
                <span className="text-sm font-bold">{data.key}</span>
              </div>
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                semitones === 0
                  ? "bg-muted text-muted-foreground"
                  : "bg-primary/15 text-primary"
              }`}>
                <span className="text-[10px] uppercase tracking-wide opacity-80">Tom atual</span>
                <span className="text-sm font-bold">{transposedKey ?? data.key}</span>
                {semitones !== 0 && (
                  <span className="text-[10px] font-normal opacity-80">
                    ({semitones > 0 ? `+${semitones}` : semitones} semitom{Math.abs(semitones) > 1 ? "s" : ""})
                  </span>
                )}
              </div>
            </div>
          )}

          {data && (
            <div className="flex flex-wrap gap-2 pt-1 text-xs">
              {data.capo != null && data.capo > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-secondary text-foreground/80 font-medium">
                  Capotraste: {data.capo}ª casa
                </span>
              )}
              <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground uppercase tracking-wide">
                {data.source}
              </span>
            </div>
          )}
        </SheetHeader>

        {/* Toolbar */}
        {data && !loading && (
          <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-border/60 bg-card/40">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setSemitones((s) => s - 1)}
                className="w-8 h-8 rounded-lg bg-secondary hover:bg-secondary/80 flex items-center justify-center"
                title="Transpor -1"
                aria-label="Transpor um semitom abaixo"
              >
                <Minus size={14} />
              </button>
              <span className="min-w-[3rem] text-center text-xs font-mono">
                {semitones > 0 ? `+${semitones}` : semitones}
              </span>
              <button
                onClick={() => setSemitones((s) => s + 1)}
                className="w-8 h-8 rounded-lg bg-secondary hover:bg-secondary/80 flex items-center justify-center"
                title="Transpor +1"
                aria-label="Transpor um semitom acima"
              >
                <Plus size={14} />
              </button>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setFontSize((f) => Math.max(11, f - 1))}
                className="w-8 h-8 rounded-lg bg-secondary hover:bg-secondary/80 text-xs font-bold"
                title="Diminuir fonte"
                aria-label="Diminuir tamanho da fonte"
              >
                A-
              </button>
              <button
                onClick={() => setFontSize((f) => Math.min(22, f + 1))}
                className="w-8 h-8 rounded-lg bg-secondary hover:bg-secondary/80 text-sm font-bold"
                title="Aumentar fonte"
                aria-label="Aumentar tamanho da fonte"
              >
                A+
              </button>
            </div>

            <button
              onClick={() => setAutoScroll((v) => !v)}
              className={`h-8 px-2 rounded-lg flex items-center gap-1 text-xs font-medium ${
                autoScroll ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-secondary/80"
              }`}
              title="Auto-scroll"
              aria-pressed={autoScroll}
            >
              {autoScroll ? <Pause size={12} /> : <Play size={12} />}
              Auto-scroll
            </button>
            {autoScroll && (
              <input
                type="range"
                min={0.5}
                max={4}
                step={0.5}
                value={scrollSpeed}
                onChange={(e) => setScrollSpeed(Number(e.target.value))}
                className="w-20"
                aria-label="Velocidade do auto-scroll"
              />
            )}

            <button
              onClick={handleCopy}
              className="ml-auto w-8 h-8 rounded-lg bg-secondary hover:bg-secondary/80 flex items-center justify-center"
              title="Copiar"
              aria-label="Copiar cifra"
            >
              <Copy size={14} />
            </button>
            <a
              href={externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-8 h-8 rounded-lg bg-secondary hover:bg-secondary/80 flex items-center justify-center"
              title="Abrir no site original"
              aria-label="Abrir cifra no site original"
            >
              <ExternalLink size={14} />
            </a>
          </div>
        )}

        {/* Body */}
        <div
          ref={bodyRef}
          data-testid="chords-body"
          className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 font-mono leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
          style={{ fontSize }}
        >
          {loading && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <Loader2 className="animate-spin" size={28} />
              <p className="text-sm">Buscando cifra…</p>
            </div>
          )}

          {!loading && notFound && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
              <p className="text-base font-semibold text-foreground">Cifra não encontrada</p>
              <p className="text-sm text-muted-foreground max-w-xs">
                Não conseguimos localizar uma cifra para <strong>{title}</strong> — {artist}.
                Você pode tentar novamente ou abrir uma busca no Cifra Club.
              </p>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleRetry}
                  className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center gap-1 hover:bg-primary/90"
                >
                  <RefreshCcw size={14} /> Tentar novamente
                </button>
                <a
                  href={cifraClubFallbackUrl(artist, title)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-9 px-3 rounded-lg bg-secondary text-foreground text-sm font-medium flex items-center gap-1 hover:bg-secondary/80"
                >
                  <ExternalLink size={14} /> Cifra Club
                </a>
              </div>
            </div>
          )}

          {!loading && data && rendered}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ChordsSheet;
