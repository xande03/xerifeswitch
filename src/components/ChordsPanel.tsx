import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, ExternalLink, Minus, Plus, Copy, RefreshCcw, Play, Pause, X, Sun, Moon } from "lucide-react";
import { fetchChords, transposeChords, cifraClubFallbackUrl, invalidateChordsCache, type ChordsResult } from "@/lib/chords";
import { toast } from "sonner";

type ChordsTheme = "dark" | "light";
const THEME_KEY = "xerife:chords-theme";

function loadChordsTheme(): ChordsTheme {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === "light" || v === "dark") return v;
    return document.documentElement.classList.contains("light") ? "light" : "dark";
  } catch {
    return "dark";
  }
}

/** Deduz o tom original a partir do primeiro acorde da cifra. */
function guessKey(text: string): string | null {
  const m = text.match(/\b([A-G](?:#|b)?m?)\b/);
  return m ? m[1] : null;
}

export interface ChordsPanelProps {
  artist: string;
  title: string;
  /** Quando definido, exibe um botão de fechar no cabeçalho. */
  onClose?: () => void;
  /** Renderiza o cabeçalho com título/artista (desligado dentro do Sheet, que já tem título). */
  showHeading?: boolean;
  className?: string;
  /** Altura máxima da área de cifra (usado no modo inline). */
  bodyClassName?: string;
  /** Exibe a barra de arraste no topo para expandir/minimizar o módulo. */
  resizable?: boolean;
}

const CHORD_LINE_REGEX = /^(?:\s*(?:[A-G](?:#|b)?(?:m|maj|sus|dim|aug|add)?\d{0,2}(?:sus\d?|add\d)?(?:\/[A-G](?:#|b)?)?)\s*)+$/;

/** Níveis de altura (em vh) da área de cifra: minimizado, padrão, expandido. */
const HEIGHT_LEVELS = [22, 55, 85];
const HEIGHT_LEVEL_LABELS = ["Minimizado", "Padrão", "Expandido"];
const HEIGHT_STORAGE_KEY = "xerife:chords-panel-height";

function loadStoredHeight(): number {
  try {
    const raw = localStorage.getItem(HEIGHT_STORAGE_KEY);
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n)) {
      return HEIGHT_LEVELS.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a));
    }
  } catch { /* ignore */ }
  return HEIGHT_LEVELS[1];
}

function isChordLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 60) return false;
  return CHORD_LINE_REGEX.test(trimmed);
}

const ChordsPanel = ({
  artist,
  title,
  onClose,
  showHeading = true,
  className = "",
  bodyClassName = "",
  resizable = false,
}: ChordsPanelProps) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ChordsResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [semitones, setSemitones] = useState(0);
  const [fontSize, setFontSize] = useState(14);
  const [autoScroll, setAutoScroll] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState(1);
  const [heightVh, setHeightVh] = useState(() => loadStoredHeight());
  const [panelTheme, setPanelTheme] = useState<ChordsTheme>(() => loadChordsTheme());

  useEffect(() => {
    try { localStorage.setItem(THEME_KEY, panelTheme); } catch { /* ignore */ }
  }, [panelTheme]);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startY: number; startVh: number; lastY: number; lastT: number; velocity: number } | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  /** Espaço realmente disponível abaixo do topo da cifra (evita corte em qualquer tela). */
  const [maxPx, setMaxPx] = useState<number | null>(null);

  useEffect(() => {
    if (!resizable) return;
    const measure = () => {
      const el = bodyRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      setMaxPx(Math.max(140, window.innerHeight - top - 24));
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [resizable, heightVh, data, loading]);

  // Persiste a preferência de altura entre sessões de busca.
  useEffect(() => {
    if (dragging) return;
    try { localStorage.setItem(HEIGHT_STORAGE_KEY, String(heightVh)); } catch { /* ignore */ }
  }, [heightVh, dragging]);


  /** Encaixa no nível mais próximo, favorecendo o sentido do gesto (velocidade). */
  const snapTo = (vh: number, velocity = 0) => {
    let nearestIdx = 0;
    HEIGHT_LEVELS.forEach((lvl, i) => {
      if (Math.abs(lvl - vh) < Math.abs(HEIGHT_LEVELS[nearestIdx] - vh)) nearestIdx = i;
    });
    // velocity > 0 => puxando para cima (expandir); < 0 => para baixo (minimizar)
    if (Math.abs(velocity) > 0.35) {
      const dir = velocity > 0 ? 1 : -1;
      const target = HEIGHT_LEVELS[nearestIdx];
      if ((dir > 0 && vh > target) || (dir < 0 && vh < target)) {
        nearestIdx = Math.min(HEIGHT_LEVELS.length - 1, Math.max(0, nearestIdx + dir));
      }
    }
    setHeightVh(HEIGHT_LEVELS[nearestIdx]);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startVh: heightVh, lastY: e.clientY, lastT: performance.now(), velocity: 0 };
    setDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const now = performance.now();
    const dt = Math.max(1, now - d.lastT);
    // px/ms positivo quando puxa para cima
    d.velocity = (d.lastY - e.clientY) / dt;
    d.lastY = e.clientY;
    d.lastT = now;
    // Puxar para cima aumenta, puxar para baixo diminui.
    const deltaVh = ((d.startY - e.clientY) / window.innerHeight) * 100;
    if (!Number.isFinite(deltaVh)) return;
    setHeightVh(Math.min(92, Math.max(14, d.startVh + deltaVh)));
  };

  const handlePointerUp = () => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    setDragging(false);
    snapTo(heightVh, d.velocity);
  };

  /** Duplo clique alterna entre expandido e minimizado. */
  const handleToggle = () => {
    const idx = HEIGHT_LEVELS.indexOf(heightVh);
    setHeightVh(idx === HEIGHT_LEVELS.length - 1 ? HEIGHT_LEVELS[0] : HEIGHT_LEVELS[HEIGHT_LEVELS.length - 1]);
  };

  const activeLevel = HEIGHT_LEVELS.reduce(
    (best, lvl, i) => (Math.abs(lvl - heightVh) < Math.abs(HEIGHT_LEVELS[best] - heightVh) ? i : best),
    0,
  );



  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    setData(null);
    setSemitones(0);
    setAutoScroll(false);
    fetchChords(artist, title)
      .then((r) => {
        if (cancelled) return;
        if (r) setData(r);
        else setNotFound(true);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [artist, title]);

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
  const originalKey = useMemo(() => (data ? data.key || guessKey(data.chords) : null), [data]);
  const transposedKey = useMemo(() => {
    if (!originalKey) return null;
    return transposeChords(originalKey, semitones);
  }, [originalKey, semitones]);

  const rendered = useMemo(() => {
    if (!transposed) return null;
    return transposed.split("\n").map((line, i) => (
      <div key={i} className={isChordLine(line) ? "text-primary font-semibold" : "text-foreground"}>
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
    <div
      data-chords-theme={panelTheme}
      className={`flex flex-col min-h-0 bg-background text-foreground ${
        panelTheme === "light" ? "chords-scope-light" : "chords-scope-dark"
      } ${className}`}
    >
      {resizable && (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label={`Arraste para ajustar a altura da cifra (${HEIGHT_LEVEL_LABELS[activeLevel]})`}
          aria-valuenow={activeLevel + 1}
          aria-valuemin={1}
          aria-valuemax={HEIGHT_LEVELS.length}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onDoubleClick={handleToggle}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") { e.preventDefault(); setHeightVh(HEIGHT_LEVELS[Math.min(HEIGHT_LEVELS.length - 1, activeLevel + 1)]); }
            if (e.key === "ArrowDown") { e.preventDefault(); setHeightVh(HEIGHT_LEVELS[Math.max(0, activeLevel - 1)]); }
          }}
          tabIndex={0}
          className="w-full py-2.5 flex flex-col items-center justify-center gap-1 cursor-grab active:cursor-grabbing touch-none select-none group outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-t-xl"
        >
          <span
            className={`h-1.5 rounded-full transition-all duration-200 motion-reduce:transition-none ${
              dragging ? "w-16 bg-primary" : "w-10 bg-muted-foreground/40 group-hover:bg-muted-foreground/70"
            }`}
          />
          <span className="flex items-center gap-1" aria-hidden="true">
            {HEIGHT_LEVELS.map((_, i) => (
              <span
                key={i}
                className={`h-1 rounded-full transition-all duration-200 motion-reduce:transition-none ${
                  i === activeLevel ? "w-3 bg-primary/70" : "w-1 bg-muted-foreground/30"
                }`}
              />
            ))}
          </span>
        </div>

      )}
      <div className="p-4 pt-2 border-b border-border/60 space-y-2">

        {(showHeading || onClose) && (
          <div className="flex items-start gap-2">
            {showHeading && (
              <div className="min-w-0 flex-1">
                <p className="text-left text-base font-bold truncate">{title}</p>
                <p className="text-sm text-muted-foreground truncate">{artist}</p>
              </div>
            )}
            {onClose && (
              <button
                onClick={onClose}
                aria-label="Fechar cifra"
                className="ml-auto p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <X size={16} />
              </button>
            )}
          </div>
        )}

        {originalKey && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary text-foreground text-xs font-semibold">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Tom original</span>
              <span className="text-sm font-bold">{originalKey}</span>
            </div>
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
              semitones === 0 ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary"
            }`}>
              <span className="text-[10px] uppercase tracking-wide opacity-80">Tom atual</span>
              <span className="text-sm font-bold">{transposedKey ?? originalKey}</span>
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
      </div>

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
            onClick={() => setPanelTheme((t) => (t === "light" ? "dark" : "light"))}
            className="ml-auto w-8 h-8 rounded-lg bg-secondary hover:bg-secondary/80 flex items-center justify-center"
            title={panelTheme === "light" ? "Tema escuro da cifra" : "Tema claro da cifra"}
            aria-label="Alternar tema claro/escuro da cifra"
            aria-pressed={panelTheme === "light"}
          >
            {panelTheme === "light" ? <Moon size={14} /> : <Sun size={14} />}
          </button>

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
        data-height-vh={resizable ? Math.round(heightVh) : undefined}
        data-level={resizable ? activeLevel : undefined}
        className={`flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 font-mono leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${bodyClassName} ${!dragging ? "transition-[height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none" : ""}`}
        style={
          resizable
            ? {
                fontSize,
                // Altura do nível escolhido, limitada ao espaço realmente disponível
                // abaixo do módulo (medido em runtime) — nunca corta conteúdo.
                height: maxPx
                  ? `min(${heightVh}vh, ${Math.round(maxPx)}px)`
                  : `min(${heightVh}vh, calc(100vh - 13rem))`,
                minHeight: "8rem",
              }

            : { fontSize }
        }

      >
        {loading && (
          <div className="flex flex-col items-center justify-center h-full min-h-[8rem] gap-3 text-muted-foreground">
            <Loader2 className="animate-spin" size={28} />
            <p className="text-sm">Buscando cifra…</p>
          </div>
        )}

        {!loading && notFound && (
          <div className="flex flex-col items-center justify-center h-full min-h-[8rem] gap-3 text-center px-6">
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
    </div>
  );
};

export default ChordsPanel;
