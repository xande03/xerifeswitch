import { useEffect, useState, useCallback, useMemo } from "react";
import {
  extractThemeFromImage,
  applyAmbientTheme,
  adaptThemeToMode,
  getCachedTheme,
  type ColorTheme,
} from "@/lib/ambientTheme";
import { useTheme } from "@/hooks/useTheme";

/**
 * Fundo dinâmico (opcional) para o player "Tocando agora".
 *
 * - preferência (on/off) e intensidade do overlay persistidas em localStorage
 * - cores extraídas ficam em cache por faixa (memória + localStorage), então
 *   a troca de fundo é instantânea quando a faixa já foi vista
 * - as próximas faixas da fila têm cores/imagem pré-carregadas em background
 * - o matte e o contraste se adaptam ao tema claro/escuro do app
 */

const STORAGE_KEY = "xerife:dynamic-bg-enabled";
const EVENT = "xerife:dynamic-bg-changed";
const OVERLAY_KEY = "xerife:dynamic-bg-overlay";
const OVERLAY_EVENT = "xerife:dynamic-bg-overlay-changed";

export const DEFAULT_OVERLAY = 35;

export interface AmbientStyle {
  /** Mesh gradient (background-image) derivado das cores da capa */
  gradient: string;
  /** Cor sólida de base */
  solid: string;
  foreground: string;
  mutedForeground: string;
  foregroundHsl: string;
  mutedForegroundHsl: string;
  /** URL da capa em baixa resolução, para a camada desfocada */
  blurSrc: string | null;
  /** Gradiente do overlay de legibilidade, já ajustado à intensidade e ao tema */
  overlay: string;
  /** true quando as cores vieram do cache (transição pode ser instantânea) */
  fromCache: boolean;
  theme: ColorTheme | null;
  enabled: boolean;
}

const DEFAULT: AmbientStyle = {
  gradient: "",
  solid: "hsl(var(--background))",
  foreground: "hsl(var(--foreground))",
  mutedForeground: "hsl(var(--muted-foreground))",
  foregroundHsl: "var(--foreground)",
  mutedForegroundHsl: "var(--muted-foreground)",
  blurSrc: null,
  overlay: "",
  fromCache: false,
  theme: null,
  enabled: false,
};

export function readAmbientEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAmbientEnabled(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch { /* ignore */ }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: enabled }));
  }
}

/** Hook de controle do toggle (usado pelo botão no player). */
export function useAmbientEnabled(): [boolean, (v: boolean) => void] {
  const [enabled, setEnabled] = useState(readAmbientEnabled);

  useEffect(() => {
    const sync = () => setEnabled(readAmbientEnabled());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const toggle = useCallback((v: boolean) => setAmbientEnabled(v), []);
  return [enabled, toggle];
}

// ---------------------------------------------------------------- overlay ----

export function readOverlayIntensity(): number {
  try {
    const raw = Number(localStorage.getItem(OVERLAY_KEY));
    if (Number.isFinite(raw) && raw >= 0 && raw <= 100) return raw;
  } catch { /* ignore */ }
  return DEFAULT_OVERLAY;
}

export function setOverlayIntensity(value: number) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  try { localStorage.setItem(OVERLAY_KEY, String(v)); } catch { /* ignore */ }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OVERLAY_EVENT, { detail: v }));
  }
}

/** Controle da intensidade do overlay de legibilidade (0–100). */
export function useOverlayIntensity(): [number, (v: number) => void] {
  const [value, setValue] = useState(readOverlayIntensity);

  useEffect(() => {
    const sync = () => setValue(readOverlayIntensity());
    window.addEventListener(OVERLAY_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(OVERLAY_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return [value, useCallback((v: number) => setOverlayIntensity(v), [])];
}

/**
 * Overlay adaptado ao tema: no escuro escurecemos o fundo, no claro
 * clareamos (véu branco) — em ambos os casos o texto continua legível.
 */
export function buildOverlay(intensity: number, isLightMode: boolean): string {
  const k = Math.max(0, Math.min(100, intensity)) / 100;
  if (k === 0) return "";
  const c = isLightMode ? "255,255,255" : "0,0,0";
  const top = (isLightMode ? 0.55 : 0.62) * k;
  const mid = (isLightMode ? 0.28 : 0.3) * k;
  const bottom = (isLightMode ? 0.85 : 1) * k;
  return `linear-gradient(180deg, rgba(${c},${top.toFixed(3)}) 0%, rgba(${c},${mid.toFixed(3)}) 45%, rgba(${c},${bottom.toFixed(3)}) 100%)`;
}

// --------------------------------------------------------------- prefetch ----

/** Reduz a capa para uma variante pequena — menos CPU/RAM na extração e no blur. */
export function lowResCover(url?: string | null): string | null {
  if (!url) return null;
  const yt = url.match(/(https?:\/\/i9?\.ytimg\.com\/vi\/[^/]+\/)[^./]+\.(jpg|webp)/);
  if (yt) return `${yt[1]}mqdefault.${yt[2]}`;
  if (/googleusercontent\.com|ggpht\.com/.test(url)) {
    return url.replace(/=s\d+(-c)?/, "=s160").replace(/=w\d+-h\d+/, "=w160-h160");
  }
  return url;
}

const prefetched = new Set<string>();

/**
 * Pré-carrega as cores e a imagem desfocada de uma capa. Chamado para as
 * próximas faixas da fila, de modo que ao avançar a transição já esteja pronta.
 */
export function prefetchAmbientTheme(coverUrl?: string | null) {
  const small = lowResCover(coverUrl);
  if (!small || prefetched.has(small)) return;
  prefetched.add(small);
  // decodifica a imagem pequena (aquece o cache HTTP do navegador)
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = small;
  } catch { /* ignore */ }
  if (!getCachedTheme(small)) {
    extractThemeFromImage(small).catch(() => { /* ignore */ });
  }
}

/** Lê as próximas capas da smart queue / fila de álbum persistidas. */
function readUpcomingCovers(limit = 3): string[] {
  const out: string[] = [];
  const pull = (key: string) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      for (const item of parsed.slice(0, limit)) {
        const cover = item?.cover || item?.thumbnail || item?.image;
        if (typeof cover === "string" && cover) out.push(cover);
      }
    } catch { /* ignore */ }
  };
  pull("demus_smart_queue");
  pull("demus_album_queue");
  return out.slice(0, limit);
}

/** Aquece o fundo das próximas faixas da fila (silencioso, em background). */
export function useAmbientPrefetch(enabled: boolean, currentCover?: string | null, extraCovers?: (string | null | undefined)[]) {
  useEffect(() => {
    if (!enabled) return;
    const t = window.setTimeout(() => {
      const covers = [...(extraCovers ?? []).filter(Boolean) as string[], ...readUpcomingCovers()];
      covers.slice(0, 4).forEach(prefetchAmbientTheme);
    }, 400);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, currentCover, (extraCovers ?? []).join("|")]);
}

// ------------------------------------------------------------------- style ---

function buildMesh(theme: ColorTheme): string {
  return [
    `radial-gradient(120% 90% at 15% 0%, ${theme.primary} 0%, transparent 60%)`,
    `radial-gradient(110% 80% at 85% 10%, ${theme.secondary} 0%, transparent 62%)`,
    `radial-gradient(120% 100% at 50% 100%, ${theme.accent} 0%, transparent 65%)`,
    `linear-gradient(180deg, ${theme.muted} 0%, ${theme.deep} 100%)`,
  ].join(", ");
}

export function useAmbientTheme(coverUrl?: string | null): AmbientStyle {
  const [enabled] = useAmbientEnabled();
  const [overlayIntensity] = useOverlayIntensity();
  const { isLight } = useTheme();

  const small = useMemo(() => lowResCover(coverUrl), [coverUrl]);

  // Cache sincrônico: se já extraímos as cores desta faixa, o fundo aparece
  // imediatamente (sem esperar decodificação/extração).
  const [raw, setRaw] = useState<ColorTheme | null>(() => (enabled ? getCachedTheme(small) : null));
  const [fromCache, setFromCache] = useState<boolean>(() => !!(enabled && getCachedTheme(small)));

  useEffect(() => {
    if (!enabled || !small) {
      setRaw(null);
      setFromCache(false);
      return;
    }
    const cached = getCachedTheme(small);
    if (cached) {
      setRaw(cached);
      setFromCache(true);
      return;
    }
    let cancelled = false;
    setFromCache(false);
    extractThemeFromImage(small)
      .then((theme) => { if (!cancelled) setRaw(theme); })
      .catch(() => { if (!cancelled) setRaw(null); });
    return () => { cancelled = true; };
  }, [small, enabled]);

  // Pré-carrega as próximas faixas da fila.
  useAmbientPrefetch(enabled, small);

  return useMemo<AmbientStyle>(() => {
    if (!enabled || !raw || !small) return DEFAULT;
    const theme = adaptThemeToMode(raw, isLight);
    applyAmbientTheme(theme);
    return {
      gradient: buildMesh(theme),
      solid: theme.deep,
      foreground: theme.foreground,
      mutedForeground: theme.mutedForeground,
      foregroundHsl: theme.foregroundHsl,
      mutedForegroundHsl: theme.mutedForegroundHsl,
      blurSrc: small,
      overlay: buildOverlay(overlayIntensity, isLight),
      fromCache,
      theme,
      enabled: true,
    };
  }, [enabled, raw, small, isLight, overlayIntensity, fromCache]);
}
