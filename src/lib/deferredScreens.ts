/**
 * Telas/overlays pesados carregados sob demanda.
 *
 * O Xerife Music tem UMA rota (`/` -> Index.tsx, ~3500 linhas) e Index importa
 * tudo estaticamente, entao o bundle inicial carregava ate o que so aparece
 * depois de um clique (fila, PiP, overlay fullscreen, tela de podcast de 120KB
 * de fonte). Aqui esses modulos viram chunks async, com tres regras:
 *
 *  1. So adiamos o que depende de acao do usuario. Componentes montados com prop
 *     `open` (modais, PiPDiagnostics) ficam fora: adia-los suspenderia o PRIMEIRO
 *     paint.
 *  2. `prefetchDeferredScreens()` roda quando a fila do browser fica ociosa,
 *     baixando tudo em paralelo apos o primeiro paint. Assim o chunk ja esta em
 *     cache quando o usuario clica - sem flash de loading na primeira interacao.
 *  3. Os specifiers de import() vivem SO aqui: `lazy(loadX)` e o prefetch usam a
 *     mesma funcao, entao o Vite gera um unico chunk e a promise fica memoizada
 *     (zero request duplicado).
 */
import { lazy } from "react";

export const loadPodcastScreen = () => import("@/components/PodcastScreen");
export const loadExploreScreen = () => import("@/components/ExploreScreen");
export const loadSearchScreen = () => import("@/components/SearchScreen");
export const loadChannelProfile = () => import("@/components/ChannelProfile");
export const loadArtistProfile = () => import("@/components/ArtistProfile");
export const loadQueueDrawer = () => import("@/components/QueueDrawer");
export const loadFloatingPiP = () => import("@/components/FloatingPiPPlayer");
export const loadFullscreenOverlay = () => import("@/components/FullscreenOverlay");

export const LazyPodcastScreen = lazy(loadPodcastScreen);
export const LazyExploreScreen = lazy(loadExploreScreen);
export const LazySearchScreen = lazy(loadSearchScreen);
export const LazyChannelProfile = lazy(loadChannelProfile);
export const LazyArtistProfile = lazy(loadArtistProfile);
export const LazyQueueDrawer = lazy(loadQueueDrawer);
export const LazyFloatingPiPPlayer = lazy(loadFloatingPiP);
export const LazyFullscreenOverlay = lazy(loadFullscreenOverlay);

const allLoaders = [
  loadPodcastScreen,
  loadExploreScreen,
  loadSearchScreen,
  loadChannelProfile,
  loadArtistProfile,
  loadQueueDrawer,
  loadFloatingPiP,
  loadFullscreenOverlay,
];

let prefetched = false;

/** Aquece os chunks adidos. Idempotente; falhas sao engolidas (rede instavel). */
export function prefetchDeferredScreens(): void {
  if (prefetched || typeof window === "undefined") return;
  prefetched = true;
  allLoaders.forEach((load) => {
    try { void load().catch(() => {}); } catch { /* modulo indisponivel: segue */ }
  });
}

/** Agenda o prefetch para a hora em que a main thread estiver livre. */
export function schedulePrefetchOnIdle(): () => void {
  if (typeof window === "undefined") return () => {};
  const w = window as unknown as {
    requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(() => prefetchDeferredScreens(), { timeout: 3000 });
    return () => { try { w.cancelIdleCallback?.(id); } catch { /* ja executou */ } };
  }
  const id = window.setTimeout(prefetchDeferredScreens, 1500);
  return () => window.clearTimeout(id);
}
