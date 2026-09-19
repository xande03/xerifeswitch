import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import React from "react";
import FullscreenOverlay from "@/components/FullscreenOverlay";

/**
 * REGRA DE OURO DO CENTRO — v4 FINAL (2026-09-19, plano ChatGPT aplicado):
 * "Centro do vídeo 100% limpo": o Xerife NÃO renderiza NENHUM overlay central
 * — nem disco, nem botão Play/Pause central, nem flash anti-bezel. O
 * play/pause em qualquer estado fica SOMENTE nos controles do Xerife
 * (transporte do rodapé / barra inferior).
 *
 * O que permanece (e é testado):
 * - Transporte do rodapé com Play/Pause (w-14) — a única forma de controlar.
 * - keepOpen: controles visíveis quando pausado/idle/buffering; auto-hide (4s)
 *   quando tocando de verdade.
 * - O bezel que o próprio YouTube desenha dentro do iframe (cross-origin) não
 *   é alcançável por DOM/CSS — aceito como comportamento do embed.
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

/** Qualquer disco/círculo central do app. */
function queryMaskDisc() {
  return document.querySelector(".rounded-full.bg-black.w-\\[84px\\]");
}

/** Qualquer botão central grande (play ou pause). */
function queryBigCenterButton() {
  return document.querySelector('button[aria-label="Reproduzir"].rounded-full.bg-white\\/15, button[aria-label="Pausar"].rounded-full.bg-white\\/15');
}

/** O transporte do rodapé (w-14, bg-white/20) — o ÚNICO play/pause. */
function queryTransportPlayPause() {
  return document.querySelector('button.w-14.rounded-full.bg-white\\/20');
}

/** O container do rodapé no estado OCULTO (opacity-0). */
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

describe("FullscreenOverlay — centro 100% limpo (nenhum overlay central do app)", () => {
  it("pausado + idle: NADA do app no centro; controles do rodapé visíveis (keepOpen)", () => {
    act(() => {
      render(<FullscreenOverlay {...makeProps({ isPlaying: false, videoSurfaceIdle: true })} />);
    });
    expect(queryMaskDisc()).toBeNull();
    expect(queryBigCenterButton()).toBeNull();
    expect(queryTransportPlayPause()).not.toBeNull(); // play/pause do rodapé
    expect(queryHiddenBottomControls()).toBeNull(); // visível
    act(() => { vi.advanceTimersByTime(10000); });
    expect(queryHiddenBottomControls()).toBeNull(); // keepOpen: continua visível
  });

  it("TOCANDO: centro limpo antes e depois do auto-hide; rodapé esmaece após 4s", () => {
    act(() => {
      render(
        <FullscreenOverlay
          {...makeProps({ isPlaying: true, videoSurfaceIdle: false, surfaceBuffering: false })}
        />,
      );
    });
    expect(queryMaskDisc()).toBeNull();
    expect(queryBigCenterButton()).toBeNull();
    expect(queryTransportPlayPause()).not.toBeNull();
    expect(queryHiddenBottomControls()).toBeNull(); // ainda visível
    act(() => { vi.advanceTimersByTime(4000); });
    expect(queryMaskDisc()).toBeNull();
    expect(queryBigCenterButton()).toBeNull();
    expect(queryHiddenBottomControls()).not.toBeNull(); // esmaeceu junto
  });

  it("tocando + travado (live/stuck): centro limpo (sem disco) e controles de pé (keepOpen)", () => {
    act(() => {
      render(
        <FullscreenOverlay
          {...makeProps({ isPlaying: true, videoSurfaceIdle: true, surfaceBuffering: false })}
        />,
      );
    });
    act(() => { vi.advanceTimersByTime(10000); });
    expect(queryMaskDisc()).toBeNull();
    expect(queryBigCenterButton()).toBeNull();
    expect(queryHiddenBottomControls()).toBeNull(); // controles visíveis
  });

  it("buffering: controles de pé (keepOpen) e centro limpo", () => {
    act(() => {
      render(
        <FullscreenOverlay
          {...makeProps({ isPlaying: true, videoSurfaceIdle: false, surfaceBuffering: true })}
        />,
      );
    });
    act(() => { vi.advanceTimersByTime(10000); });
    expect(queryMaskDisc()).toBeNull();
    expect(queryBigCenterButton()).toBeNull();
    expect(queryHiddenBottomControls()).toBeNull();
  });

  it("nenhum estado renderiza resíduo do antigo flash anti-bezel (fantasma sem ação)", () => {
    act(() => {
      render(
        <FullscreenOverlay
          {...makeProps({ isPlaying: true, videoSurfaceIdle: false, surfaceBuffering: false })}
        />,
      );
    });
    act(() => { vi.advanceTimersByTime(200); });
    expect(document.querySelector(".xerife-bezel-flash")).toBeNull();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(document.querySelector(".xerife-bezel-flash")).toBeNull();
  });
});
