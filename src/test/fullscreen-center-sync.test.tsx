import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import React from "react";
import FullscreenOverlay from "@/components/FullscreenOverlay";

/**
 * REGRA DE OURO DO CENTRO (unificada 2026-09-18 — fim da "figura sem ação"):
 *
 * No fullscreen de vídeo, o conjunto central (disco-base + botão grande do app)
 * existe SEMPRE em modo vídeo e obedece AO MESMO estado (showControls):
 * - Visível: disco + botão COM AÇÃO REAL — PAUSE quando tocando (toque =
 *   pausar), PLAY quando pausado (toque = reproduzir). Nunca um disco nu
 *   ("desenho" sem ação) nem um botão fantasma.
 * - Minimizado (4 s sem toque, tocando de verdade): o conjunto esmaece JUNTO
 *   com todos os controles (opacity-0 + pointer-events-none) — nada visível
 *   nem clicável our no centro.
 *
 * O keepOpen mantém os controles abertos em todo estado em que o YouTube
 * desenha chrome central (pausado, cue, buffering, travado/live), então nunca
 * há vazamento do botão do YT: sempre que a máscara é necessária, o disco
 * (com o botão em cima) está lá.
 */

const song = {
  id: "v1",
  title: "Test Song",
  artist: "Test Artist",
  album: "Test",
  duration: 180,
  albumArt: "",
  videoId: "abc",
} as any;

function makeProps(overrides: Partial<React.ComponentProps<typeof FullscreenOverlay>> = {}) {
  return {
    song,
    isPlaying: false,
    currentTime: 0,
    duration: 180,
    progress: 0,
    onTogglePlay: vi.fn(),
    onNext: vi.fn(),
    onPrev: vi.fn(),
    onSeek: vi.fn(),
    onExit: vi.fn(),
    videoMode: true,
    ...overrides,
  };
}

/** O disco opaco de máscara do botão central do YouTube (base do botão do app). */
function queryMaskDisc() {
  return document.querySelector(".rounded-full.bg-black.w-24");
}

/** O container do conjunto central (disco + botão) — esmaece com showControls. */
function queryCenterSetContainer() {
  return queryMaskDisc()?.parentElement ?? null;
}

/** O botão central grande do app (Pause quando tocando / Play quando pausado). */
function queryBigCenterButton() {
  return document.querySelector(
    'button[aria-label="Reproduzir"].rounded-full.bg-white\\/15, button[aria-label="Pausar"].rounded-full.bg-white\\/15',
  );
}

/** O transporte do rodapé (w-14, bg-white/20) — visível ou oculto via opacidade do container. */
function queryTransportPlayPause() {
  return document.querySelector('button.w-14.rounded-full.bg-white\\/20');
}

/** O container do rodapé no estado OCULTO (opacity-0) — específico (barra inferior). */
function queryHiddenBottomControls() {
  return document.querySelector('.bg-gradient-to-t.opacity-0');
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  cleanup();
  document.getElementById("yt-player")?.remove();
});

describe("FullscreenOverlay — centro sincronizado com os controles", () => {
  it("pausado + idle: disco de máscara + botão play visíveis (controles keepOpen)", () => {
    act(() => {
      render(<FullscreenOverlay {...makeProps({ isPlaying: false, videoSurfaceIdle: true })} />);
    });
    expect(queryMaskDisc()).not.toBeNull();
    expect(queryBigCenterButton()).not.toBeNull();
    // keepOpen: mesmo avançando o tempo, os controles NÃO escondem enquanto pausado
    act(() => { vi.advanceTimersByTime(10000); });
    expect(queryMaskDisc()).not.toBeNull();
    expect(queryBigCenterButton()).not.toBeNull();
    expect(queryCenterSetContainer()?.className).toContain("opacity-100");
  });

  it("tocando de verdade: após o auto-hide o conjunto central esmaece JUNTO — nada visível nem clicável no centro", () => {
    act(() => {
      render(
        <FullscreenOverlay
          {...makeProps({ isPlaying: true, videoSurfaceIdle: false, surfaceBuffering: false })}
        />,
      );
    });
    // Visível: botão central = PAUSE com ação (nunca figura sem ação)
    expect(queryBigCenterButton()?.getAttribute("aria-label")).toBe("Pausar");
    expect(queryBigCenterButton()?.className).toContain("pointer-events-auto");
    // keepOpen caiu: o auto-hide (4 s) minimiza TODOS os controles JUNTOS
    act(() => { vi.advanceTimersByTime(4000); });
    // O conjunto central esmaeceu junto: montado, porém INVISÍVEL e SEM AÇÃO
    expect(queryMaskDisc()).not.toBeNull();
    expect(queryCenterSetContainer()?.className).toContain("opacity-0");
    const btn = queryBigCenterButton();
    expect(btn).not.toBeNull();
    expect(btn?.className).toContain("pointer-events-none");
    // O transporte do rodapé também minimiza junto (mesmo estado: opacity-0)
    expect(queryTransportPlayPause()).not.toBeNull(); // montado, porém
    expect(queryHiddenBottomControls()).not.toBeNull(); // oculto (opacity-0)
  });

  it("tocando + superfície travada (live/stuck): botão central PAUSE com AÇÃO — nunca um disco nu (figura sem ação)", () => {
    act(() => {
      render(
        <FullscreenOverlay
          {...makeProps({ isPlaying: true, videoSurfaceIdle: true, surfaceBuffering: false })}
        />,
      );
    });
    // keepOpen (idle): controles (e conjunto central) ficam de pé para sempre
    act(() => { vi.advanceTimersByTime(10000); });
    const btn = queryBigCenterButton();
    expect(btn).not.toBeNull(); // PAUSE sobre o disco — nada de "desenho" solto
    expect(btn?.getAttribute("aria-label")).toBe("Pausar");
    expect(btn?.className).toContain("pointer-events-auto"); // COM AÇÃO
    expect(queryCenterSetContainer()?.className).toContain("opacity-100");
  });

  it("buffering (estado real do embed): controles continuam de pé — nada minimiza pela metade", () => {
    act(() => {
      render(
        <FullscreenOverlay
          {...makeProps({ isPlaying: true, videoSurfaceIdle: false, surfaceBuffering: true })}
        />,
      );
    });
    act(() => { vi.advanceTimersByTime(10000); });
    // Buffering = superfície ainda sem reprodução confirmada: keepOpen seguro
    // (o último frame pintado pode conter o botão central do YouTube) — o
    // conjunto central (disco + botão COM AÇÃO) fica de pé cobrindo.
    expect(queryTransportPlayPause()).not.toBeNull();
    expect(queryHiddenBottomControls()).toBeNull(); // NÃO ocultos
    expect(queryCenterSetContainer()?.className).toContain("opacity-100");
    const btn = queryBigCenterButton();
    expect(btn).not.toBeNull();
    expect(btn?.className).toContain("pointer-events-auto");
  });

  it("nenhum estado renderiza resíduo do antigo flash anti-bezel (fantasma sem ação)", () => {
    act(() => {
      render(
        <FullscreenOverlay
          {...makeProps({ isPlaying: true, videoSurfaceIdle: false, surfaceBuffering: false })}
        />,
      );
    });
    act(() => { vi.advanceTimersByTime(200); }); // janela do antigo flash (900ms)
    expect(document.querySelector(".xerife-bezel-flash")).toBeNull();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(document.querySelector(".xerife-bezel-flash")).toBeNull();
  });
});
