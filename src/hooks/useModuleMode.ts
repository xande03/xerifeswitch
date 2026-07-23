import { useCallback, useEffect, useState } from "react";

/**
 * Single source of truth for the "session module" (colored pill on the header
 * and the sidebar accent color).
 *
 *   - hub      → blue   (default landing)
 *   - music    → green  (Xerife Music)
 *   - video    → red    (Xerife Vídeos)
 *   - podcast  → purple (Xerife Podcasts)
 *
 * This hook owns:
 *   - `homeMode` (hub | music | video) and `podcastMode` (boolean overlay)
 *   - Derivation of the current `moduleKey` (never desyncs from state)
 *   - Persistence in `localStorage` (`demus-home-mode`, `demus-podcast-mode`)
 *   - Sync with the `?module=podcast` URL query
 *   - The `<html data-module="...">` attribute that drives CSS accent tokens
 *   - Back/forward navigation via `history.pushState` + `popstate`
 *
 * Any callsite that needs to change the session MUST go through the setters
 * exposed here — never mutate `localStorage` / `data-module` / the URL
 * directly. This is what guarantees that switching from Hub → Music / Vídeos /
 * Podcasts never leaves the previous accent color (e.g. blue) behind.
 */

export type HomeMode = "hub" | "music" | "video";
export type ModuleKey = "hub" | "music" | "video" | "podcast";

const HOME_KEY = "demus-home-mode";
const PODCAST_KEY = "demus-podcast-mode";

const deriveModuleKey = (homeMode: HomeMode, podcastMode: boolean): ModuleKey =>
  podcastMode ? "podcast" : homeMode;

const readInitialHomeMode = (): HomeMode => {
  try {
    const v = localStorage.getItem(HOME_KEY) as HomeMode | null;
    if (v === "hub" || v === "music" || v === "video") return v;
  } catch {}
  return "hub";
};

const readInitialPodcastMode = (): boolean => {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get("module") === "podcast") return true;
    return localStorage.getItem(PODCAST_KEY) === "1";
  } catch {
    return false;
  }
};

export function useModuleMode() {
  const [homeMode, setHomeModeState] = useState<HomeMode>(readInitialHomeMode);
  const [podcastMode, setPodcastModeState] = useState<boolean>(readInitialPodcastMode);

  const moduleKey = deriveModuleKey(homeMode, podcastMode);

  // Selecting Music / Vídeo explicitly disables the Podcast overlay so its
  // purple accent can never linger on top of green/red.
  const setHomeMode = useCallback((mode: HomeMode) => {
    setHomeModeState(mode);
    try { localStorage.setItem(HOME_KEY, mode); } catch {}
    setPodcastModeState(false);
    try { localStorage.setItem(PODCAST_KEY, "0"); } catch {}
  }, []);

  const setPodcastMode = useCallback((v: boolean) => {
    setPodcastModeState(v);
    try { localStorage.setItem(PODCAST_KEY, v ? "1" : "0"); } catch {}
  }, []);

  const setModule = useCallback((key: ModuleKey) => {
    if (key === "podcast") setPodcastMode(true);
    else setHomeMode(key);
  }, [setHomeMode, setPodcastMode]);

  // Reflect current module on <html data-module> so CSS swaps accent tokens.
  useEffect(() => {
    document.documentElement.setAttribute("data-module", moduleKey);
  }, [moduleKey]);

  // Sync ?module=podcast in the URL.
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const cur = url.searchParams.get("module");
      if (podcastMode) {
        if (cur !== "podcast") {
          url.searchParams.set("module", "podcast");
          window.history.replaceState(window.history.state, "", url.toString());
        }
      } else if (cur) {
        url.searchParams.delete("module");
        const search = url.searchParams.toString();
        window.history.replaceState(
          window.history.state,
          "",
          url.pathname + (search ? `?${search}` : "") + url.hash
        );
      }
    } catch {}
  }, [podcastMode]);

  // Push module changes onto history so back/forward restores the session.
  useEffect(() => {
    if (window.history.state?.xerifeModule !== moduleKey) {
      window.history.pushState({ xerifeModule: moduleKey }, "");
    }
  }, [moduleKey]);

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const mod = e.state?.xerifeModule as ModuleKey | undefined;
      if (!mod) return;
      if (mod === "podcast") {
        setPodcastModeState(true);
      } else {
        setPodcastModeState(false);
        setHomeModeState(mod);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return { homeMode, podcastMode, moduleKey, setHomeMode, setPodcastMode, setModule };
}
