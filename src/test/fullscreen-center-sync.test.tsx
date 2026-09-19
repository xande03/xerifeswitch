import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import React from "react";
import FullscreenOverlay from "@/components/FullscreenOverlay";

/**
 * REGRA DE OURO DO CENTRO — v5 (2026-09-19, escolha do usuário):
 * "Centro do vídeo 100% limpo ENQUANTO TOCANDO": nenhuma overlay central do
 * app durante a reprodução — nem botão Play/Pause central, nem flash, nem
 * disco. O play/pause em qualquer estado fica SOMENTE nos controles do Xerife
 * (transporte do rodapé / barra inferior).
 *
 * EXCEÇÃO ÚNICA (aprovada pelo usuário após o bezel de pausa do YouTube
 * persistir congelado em device real mesmo com os micro-seeks de repaint):
 * o DISCO DE CAPA DO ESTADO PAUSADO ([data-paused-cover-disc]) — discreto,
 * sem ícones, pointer-events-none — cobre o bezel cross-origin do YouTube
 * APENAS enquanto pausado/travado e some no instante em que retoma.
 *
 * O que permanece (e é testado):
 * - Transporte do rodapé com Play/Pause (w-14) — a única forma de controlar.
 * - keepOpen: controles visíveis quando pausado/idle/buffering; auto-hide (4s)
 *   quando tocando de verdade.
 * - Disco de pausa: presente+inerte quando pausado/travado; AUSENTE quando
 *   tocando, buffering (spinner do YT) ou finalizado (capa opaca própria).
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

/** Disco de capa do estado pausado (exceção v5) — deve ser INERTE. */
function queryPausedDisc() {
  return document.querySelector("[data-paused-cover-disc]");
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
  it("pausado + idle: disco de capa cobre o bezel (inerte); rodapé visível (keepOpen)", () => {
    act(() => {
      render(<FullscreenOverlay {...makeProps({ isPlaying: false, videoSurfaceIdle: true })} />);
    });
    expect(queryMaskDisc()).toBeNull();
    expect(queryBigCenterButton()).toBeNull(); // nenhum BOTÃO central
    const disc = queryPausedDisc();
    expect(disc).not.toBeNull(); // disco de capa presente (exceção v5)
    expect(disc!.className).toContain("pointer-events-none"); // inerte (jsdom não computa classes tailwind)
    expect(disc!.querySelector("button")).toBeNull(); // sem botão dentro
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
    expect(queryPausedDisc()).toBeNull(); // centro limpo enquanto TOCANDO
    expect(queryTransportPlayPause()).not.toBeNull();
    expect(queryHiddenBottomControls()).toBeNull(); // ainda visível
    act(() => { vi.advanceTimersByTime(4000); });
    expect(queryMaskDisc()).toBeNull();
    expect(queryBigCenterButton()).toBeNull();
    expect(queryPausedDisc()).toBeNull(); // continua limpo após auto-hide
    expect(queryHiddenBottomControls()).not.toBeNull(); // esmaeceu junto
  });

  it("tocando + travado (live/stuck): disco cobre o bezel congelado; controles de pé (keepOpen)", () => {
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
    expect(queryPausedDisc()).not.toBeNull(); // superfície parada = cobrir
    expect(queryHiddenBottomControls()).toBeNull(); // controles visíveis
  });

  it("buffering: controles de pé (keepOpen) e centro limpo (spinner do YT, sem disco)", () => {
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
    expect(queryPausedDisc()).toBeNull(); // buffering: não cobrir o spinner
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
