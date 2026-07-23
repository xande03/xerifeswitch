import { useCallback, useEffect, useState } from "react";

/**
 * Central theme controller.
 * - Persists user choice in localStorage("demus-theme") = "dark" | "light".
 * - If no saved value, respects OS preference on first load.
 * - Applies/removes `.light` on <html> and stays in sync across tabs
 *   and across every component that uses the hook (via `storage` and
 *   a custom "demus:theme-changed" event).
 */

export const THEME_STORAGE_KEY = "demus-theme";
export const THEME_EVENT = "demus:theme-changed";

export type ThemeMode = "dark" | "light";

function safeGet(): string | null {
  try { return localStorage.getItem(THEME_STORAGE_KEY); } catch { return null; }
}
function safeSet(v: ThemeMode) {
  try { localStorage.setItem(THEME_STORAGE_KEY, v); } catch {}
}

export function readInitialTheme(): ThemeMode {
  const saved = safeGet();
  if (saved === "light" || saved === "dark") return saved;
  // First run: honor OS preference.
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  return "dark";
}

export function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  root.classList.toggle("light", mode === "light");
  // Hint browser UI (form controls, scrollbars) so they follow the theme.
  root.style.colorScheme = mode;
}

export function setTheme(mode: ThemeMode) {
  safeSet(mode);
  applyTheme(mode);
  try { window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: mode })); } catch {}
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof document === "undefined") return "dark";
    return document.documentElement.classList.contains("light") ? "light" : "dark";
  });

  useEffect(() => {
    const onEvt = (e: Event) => {
      const next = (e as CustomEvent<ThemeMode>).detail;
      if (next === "light" || next === "dark") setThemeState(next);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== THEME_STORAGE_KEY) return;
      const next: ThemeMode = e.newValue === "light" ? "light" : "dark";
      applyTheme(next);
      setThemeState(next);
    };
    // If user has never chosen a theme, follow OS changes live.
    const mq = window.matchMedia?.("(prefers-color-scheme: light)");
    const onOs = (e: MediaQueryListEvent) => {
      if (safeGet()) return; // user override wins
      const next: ThemeMode = e.matches ? "light" : "dark";
      applyTheme(next);
      setThemeState(next);
    };

    window.addEventListener(THEME_EVENT, onEvt as EventListener);
    window.addEventListener("storage", onStorage);
    mq?.addEventListener?.("change", onOs);
    return () => {
      window.removeEventListener(THEME_EVENT, onEvt as EventListener);
      window.removeEventListener("storage", onStorage);
      mq?.removeEventListener?.("change", onOs);
    };
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === "light" ? "dark" : "light");
  }, [theme]);

  const set = useCallback((m: ThemeMode) => setTheme(m), []);

  return { theme, isDark: theme === "dark", isLight: theme === "light", toggle, setTheme: set };
}
