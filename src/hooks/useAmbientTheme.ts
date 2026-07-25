import { useEffect, useState, useCallback } from "react";
import { extractThemeFromImage, applyAmbientTheme, type ColorTheme } from "@/lib/ambientTheme";

/**
 * Fundo dinâmico (opcional) para o player "Tocando agora".
 *
 * O usuário ativa/desativa pelo botão de fundo no player. A preferência é
 * persistida em localStorage e sincronizada entre componentes/abas por evento.
 *
 * Estratégia visual (alta performance / GPU):
 *  - camada 1: capa em BAIXA RESOLUÇÃO com blur pesado (`blurSrc`)
 *  - camada 2: mesh gradient derivado das cores dominantes (`gradient`)
 *  - camada 3: overlay escuro para garantir legibilidade
 */

const STORAGE_KEY = "xerife:dynamic-bg-enabled";
const EVENT = "xerife:dynamic-bg-changed";

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
  const [style, setStyle] = useState<AmbientStyle>(DEFAULT);

  useEffect(() => {
    if (!enabled || !coverUrl) {
      setStyle(DEFAULT);
      return;
    }
    let cancelled = false;
    const small = lowResCover(coverUrl);
    extractThemeFromImage(small || coverUrl)
      .then((theme) => {
        if (cancelled) return;
        applyAmbientTheme(theme);
        setStyle({
          gradient: buildMesh(theme),
          solid: theme.deep,
          foreground: theme.foreground,
          mutedForeground: theme.mutedForeground,
          foregroundHsl: theme.foregroundHsl,
          mutedForegroundHsl: theme.mutedForegroundHsl,
          blurSrc: small || coverUrl,
          theme,
          enabled: true,
        });
      })
      .catch(() => {
        if (!cancelled) setStyle(DEFAULT);
      });

    return () => { cancelled = true; };
  }, [coverUrl, enabled]);

  return style;
}
