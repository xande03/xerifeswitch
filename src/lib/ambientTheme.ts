import { getColor, getPalette } from 'colorthief';

export interface ColorTheme {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  /** Muted "fosca" tint derived from the dominant color (low saturation, medium-dark) */
  muted: string;
  /** Darker version of the dominant color, good for gradient bottoms */
  deep: string;
  /** Foreground color that contrasts against `muted` / `deep` */
  foreground: string;
  /** Softer variant of the foreground for secondary text */
  mutedForeground: string;
  /** Raw HSL tuples ("H S% L%") for shadcn-style token overrides */
  foregroundHsl: string;
  mutedForegroundHsl: string;
  /** true if the artwork is overall light, false if dark */
  isLight: boolean;
}


const CACHE_KEY = 'xerife:ambient-theme-cache:v1';
const CACHE_LIMIT = 120;

const themeCache = new Map<string, ColorTheme>(loadCache());

function loadCache(): [string, ColorTheme][] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(-CACHE_LIMIT);
  } catch { return []; }
}
function persistCache() {
  if (typeof localStorage === 'undefined') return;
  try {
    const entries = Array.from(themeCache.entries()).slice(-CACHE_LIMIT);
    localStorage.setItem(CACHE_KEY, JSON.stringify(entries));
  } catch { /* quota — ignore */ }
}


// --- color helpers -----------------------------------------------------------
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return [h, s, l];
}
function hslCss(h: number, s: number, l: number, a = 1) {
  return a >= 1
    ? `hsl(${h.toFixed(0)}, ${(s * 100).toFixed(0)}%, ${(l * 100).toFixed(0)}%)`
    : `hsla(${h.toFixed(0)}, ${(s * 100).toFixed(0)}%, ${(l * 100).toFixed(0)}%, ${a})`;
}

/** Build a CORS-safe proxied URL as fallback when the canvas gets tainted. */
function proxied(url: string): string {
  // weserv strips the scheme and serves through its own CORS-enabled origin.
  const stripped = url.replace(/^https?:\/\//, "");
  return `https://images.weserv.nl/?url=${encodeURIComponent(stripped)}&output=jpg&n=-1`;
}

/** Deterministic hue derived from the URL — used as absolute last-resort
 * so the ambient panel never falls back to plain black/white. */
function hueFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

async function tryExtract(url: string): Promise<{ d: number[]; p1: number[]; p2: number[] } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = url;
    img.onload = async () => {
      try {
        const palette: any = await getPalette(img, { count: 5 } as any);
        const dominant: any = await getColor(img);
        const toRgb = (c: any) => (Array.isArray(c) ? c : [c.r ?? c[0], c.g ?? c[1], c.b ?? c[2]]);
        resolve({
          d: toRgb(dominant),
          p1: toRgb(palette[1] ?? dominant),
          p2: toRgb(palette[2] ?? dominant),
        });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
  });
}

function buildTheme(d: number[], p1: number[], p2: number[]): ColorTheme {
  const [h, s, l] = rgbToHsl(d[0], d[1], d[2]);
  const mutedS = Math.min(s, 0.35);
  const mutedL = 0.22;
  const deepL = 0.12;
  const isLight = l > 0.6;

  const fgHsl = mutedL > 0.55
    ? `${h.toFixed(0)} ${Math.min(s, 0.2) * 100}% 12%`
    : `0 0% 96%`;
  const mfgHsl = mutedL > 0.55
    ? `${h.toFixed(0)} ${Math.min(s, 0.2) * 100}% 28%`
    : `0 0% 78%`;

  return {
    primary: `rgb(${d[0]}, ${d[1]}, ${d[2]})`,
    secondary: `rgb(${p1[0]}, ${p1[1]}, ${p1[2]})`,
    accent: `rgb(${p2[0]}, ${p2[1]}, ${p2[2]})`,
    background: `rgba(${d[0]}, ${d[1]}, ${d[2]}, 0.1)`,
    muted: hslCss(h, mutedS, mutedL),
    deep: hslCss(h, Math.min(s, 0.4), deepL),
    foreground: `hsl(${fgHsl})`,
    mutedForeground: `hsl(${mfgHsl})`,
    foregroundHsl: fgHsl,
    mutedForegroundHsl: mfgHsl,
    isLight,
  };
}

/** Parse "rgb(r, g, b)" back into a tuple. */
function parseRgb(css: string): [number, number, number] | null {
  const m = css.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/**
 * Reajusta o "matte" (muted/deep) e as cores de texto do tema para o modo
 * claro ou escuro. As cores dominantes (primary/secondary/accent) continuam
 * as mesmas — só a base e o contraste mudam.
 */
export function adaptThemeToMode(theme: ColorTheme, isLightMode: boolean): ColorTheme {
  const rgb = parseRgb(theme.primary);
  if (!rgb) return theme;
  const [h, s] = rgbToHsl(rgb[0], rgb[1], rgb[2]);

  const mutedS = isLightMode ? Math.min(s, 0.28) : Math.min(s, 0.35);
  const mutedL = isLightMode ? 0.88 : 0.22;
  const deepL = isLightMode ? 0.96 : 0.12;

  const fgHsl = isLightMode ? `${h.toFixed(0)} ${(Math.min(s, 0.2) * 100).toFixed(0)}% 12%` : `0 0% 96%`;
  const mfgHsl = isLightMode ? `${h.toFixed(0)} ${(Math.min(s, 0.2) * 100).toFixed(0)}% 30%` : `0 0% 78%`;

  return {
    ...theme,
    muted: hslCss(h, mutedS, mutedL),
    deep: hslCss(h, Math.min(s, isLightMode ? 0.22 : 0.4), deepL),
    foreground: `hsl(${fgHsl})`,
    mutedForeground: `hsl(${mfgHsl})`,
    foregroundHsl: fgHsl,
    mutedForegroundHsl: mfgHsl,
  };
}

/** Leitura sincrônica do cache (memória + localStorage) — usada para trocar
 * o fundo instantaneamente, sem esperar a extração. */
export function getCachedTheme(imageUrl?: string | null): ColorTheme | null {
  if (!imageUrl) return null;
  return themeCache.get(imageUrl) ?? null;
}


/** Last-resort theme derived from the URL hash — colored, never plain b/w. */
function themeFromUrlHash(imageUrl: string): ColorTheme {
  const h = hueFromString(imageUrl);
  const mutedL = 0.22;
  return {
    primary: hslCss(h, 0.45, 0.45),
    secondary: hslCss((h + 30) % 360, 0.35, 0.4),
    accent: hslCss((h + 60) % 360, 0.4, 0.45),
    background: "transparent",
    muted: hslCss(h, 0.28, mutedL),
    deep: hslCss(h, 0.32, 0.11),
    foreground: `hsl(0 0% 96%)`,
    mutedForeground: `hsl(0 0% 78%)`,
    foregroundHsl: `0 0% 96%`,
    mutedForegroundHsl: `0 0% 78%`,
    isLight: false,
  };
}

export async function extractThemeFromImage(imageUrl: string): Promise<ColorTheme> {
  if (themeCache.has(imageUrl)) return themeCache.get(imageUrl)!;

  // 1) Try direct fetch (works when the origin sends CORS headers).
  let rgb = await tryExtract(imageUrl);
  // 2) Retry through a CORS-safe proxy so canvas isn't tainted.
  if (!rgb) rgb = await tryExtract(proxied(imageUrl));

  const theme = rgb
    ? buildTheme(rgb.d, rgb.p1, rgb.p2)
    : themeFromUrlHash(imageUrl);

  themeCache.set(imageUrl, theme);
  persistCache();
  return theme;
}

function getDefaultTheme(): ColorTheme {
  return themeFromUrlHash("xerife-default");
}




export function applyAmbientTheme(theme: ColorTheme) {
  const root = document.documentElement;
  const isReduced =
    root.classList.contains('force-reduced-motion') ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  root.style.setProperty('transition', isReduced ? 'none' : 'all 1.5s ease-in-out');
  root.style.setProperty('--ambient-primary', theme.primary);
  root.style.setProperty('--ambient-secondary', theme.secondary);
  root.style.setProperty('--ambient-accent', theme.accent);
  root.style.setProperty('--ambient-bg', theme.background);
  root.style.setProperty('--ambient-muted', theme.muted);
  root.style.setProperty('--ambient-deep', theme.deep);
  root.style.setProperty('--ambient-fg', theme.foreground);
  root.style.setProperty('--ambient-fg-muted', theme.mutedForeground);
}

