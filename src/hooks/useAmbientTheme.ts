import type { ColorTheme } from "@/lib/ambientTheme";

/**
 * Ambient background feature was removed from the app.
 *
 * This module is kept as a stable shim so callers (NowPlayingView,
 * PlaylistDetail) continue to compile and simply render the default
 * background — no cover-derived matte, no toggle, no persisted preference.
 */

export interface AmbientStyle {
  gradient: string;
  solid: string;
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

export function readAmbientEnabled(): boolean {
  return false;
}

export function setAmbientEnabled(_enabled: boolean) {
  // no-op: feature removed
}

export function useAmbientTheme(_coverUrl?: string | null): AmbientStyle {
  return DEFAULT;
}
