import { useEffect, useState } from "react";
import { extractThemeFromImage, type ColorTheme } from "@/lib/ambientTheme";
import { hdThumbnail } from "@/lib/utils";

export interface AmbientStyle {
  /** Full matte gradient string, ready for `background-image` */
  gradient: string;
  /** Solid deep tone; useful for solid surfaces */
  solid: string;
  /** Foreground color that contrasts against the matte */
  foreground: string;
  mutedForeground: string;
  foregroundHsl: string;
  mutedForegroundHsl: string;
  theme: ColorTheme | null;
}

const DEFAULT: AmbientStyle = {
  gradient: "",
  solid: "hsl(var(--background))",
  foreground: "hsl(var(--foreground))",
  mutedForeground: "hsl(var(--muted-foreground))",
  foregroundHsl: "var(--foreground)",
  mutedForegroundHsl: "var(--muted-foreground)",
  theme: null,
};

export const AMBIENT_ENABLED_KEY = "demus-ambient-bg-enabled";
export const AMBIENT_EVENT = "demus:ambient-enabled-changed";

export function readAmbientEnabled(): boolean {
  return false;
}
export function setAmbientEnabled(_enabled: boolean) {
  // Ambient background feature removed.
}

function useAmbientEnabled(): boolean {
  const [enabled, setEnabled] = useState<boolean>(false);

  useEffect(() => {
    const onEv = (e: Event) => setEnabled(!!(e as CustomEvent).detail);
    const onStorage = (e: StorageEvent) => {
      if (e.key === AMBIENT_ENABLED_KEY) setEnabled(readAmbientEnabled());
    };
    window.addEventListener(AMBIENT_EVENT, onEv as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(AMBIENT_EVENT, onEv as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return enabled;
}

/**
 * Extract a matte "fosca" theme from the given cover URL.
 * Result is memoised per URL in localStorage so revisiting an album is instant.
 * Honors the user's ambient-background preference (toggle in the tools menu).
 */
export function useAmbientTheme(coverUrl?: string | null): AmbientStyle {
  const [style, setStyle] = useState<AmbientStyle>(DEFAULT);
  const enabled = useAmbientEnabled();

  useEffect(() => {
    let alive = true;
    if (!enabled || !coverUrl) { setStyle(DEFAULT); return; }
    const url = hdThumbnail(coverUrl);
    extractThemeFromImage(url).then((theme) => {
      if (!alive) return;
      setStyle({
        gradient: `linear-gradient(180deg, ${theme.muted} 0%, ${theme.deep} 55%, ${theme.deep} 100%)`,
        solid: theme.deep,
        foreground: theme.foreground,
        mutedForeground: theme.mutedForeground,
        foregroundHsl: theme.foregroundHsl,
        mutedForegroundHsl: theme.mutedForegroundHsl,
        theme,
      });
    }).catch(() => setStyle(DEFAULT));
    return () => { alive = false; };
  }, [coverUrl, enabled]);

  return enabled ? style : DEFAULT;
}
