import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import React from "react";
import FullscreenOverlay from "@/components/FullscreenOverlay";

/**
 * VÍDEO 100% VISÍVEL — v10 (2026-09-21, "sombra fosca no meio do player"):
 * a CenterChromeShield (lente backdrop-blur-2xl + bg-black/25, w-32) que
 * ficava PERMANENTE no centro durante a reprodução foi REMOVIDA a pedido do
 * usuário — o vídeo do player deve aparecer TOTALMENTE visível, sem nenhum
 * círculo de desfoque/sombra sobre o centro.
 *
 * Contrato travado aqui:
 *  1. Reprodução real (fullscreen, vídeo): centro 100% LIMPO — nem lente
 *     fosca, nem poster, nem QUALQUER elemento backdrop-blur-2xl no DOM.
 *  2. Pausado/travado: PausedVideoPoster cobre o iframe (estado complementar
 *     — único elemento central permitido fora da reprodução real).
 *  3. Finalizado: capa opaca de fim assume (nem poster nem lente).
 *  4. A prop chromeShield NÃO existe mais: o overlay não aceita lente.
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

function queryShield() {
  return document.querySelector("[data-center-chrome-shield]");
}

function queryPausedPoster() {
  return document.querySelector("[data-paused-poster]");
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

describe("Vídeo 100% visível — lente fosca banida do centro", () => {
  it("tocando (reprodução real): centro 100% LIMPO — sem lente, sem poster, sem backdrop-blur-2xl", () => {
    act(() => {
      render(
        <FullscreenOverlay
          {...makeProps({ isPlaying: true, videoSurfaceIdle: false, surfaceBuffering: false })}
        />,
      );
    });
    expect(queryShield()).toBeNull(); // a lente não existe mais
    expect(queryPausedPoster()).toBeNull(); // poster só no pausado/idle
    // NENHUM elemento com desfoque fosco cobre o vídeo (a CenterChromeShield
    // era o único backdrop-blur-2xl do codebase)
    expect(document.querySelector(".backdrop-blur-2xl")).toBeNull();
    // Sem transporte central no fullscreen (play/pause só na barra inferior)
    expect(document.querySelector("[data-central-transport]")).toBeNull();
  });

  it("buffering: também sem lente nem poster (spinner é do próprio embed)", () => {
    act(() => {
      render(
        <FullscreenOverlay
          {...makeProps({ isPlaying: true, videoSurfaceIdle: false, surfaceBuffering: true })}
        />,
      );
    });
    expect(queryShield()).toBeNull();
    expect(queryPausedPoster()).toBeNull();
    expect(document.querySelector(".backdrop-blur-2xl")).toBeNull();
  });

  it("pausado/travado: POSTER cobre (único elemento central fora da reprodução)", () => {
    act(() => {
      render(
        <FullscreenOverlay
          {...makeProps({ isPlaying: false, videoSurfaceIdle: true })}
        />,
      );
    });
    expect(queryPausedPoster()).not.toBeNull();
    expect(queryShield()).toBeNull();
  });

  it("finalizado: capa opaca de fim assume — nem poster nem lente", () => {
    act(() => {
      render(
        <FullscreenOverlay
          {...makeProps({ isPlaying: false, isEnded: true })}
        />,
      );
    });
    expect(queryShield()).toBeNull();
    expect(queryPausedPoster()).toBeNull();
    expect(document.querySelector(".z-\\[205\\]")).not.toBeNull();
  });
});
