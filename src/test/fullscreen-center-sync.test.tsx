import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import React from "react";
import FullscreenOverlay from "@/components/FullscreenOverlay";

/**
 * REGRA DE OURO DO CENTRO (bug "botão de pause que não minimiza junto"):
 *
 * No fullscreen de vídeo, TUDO que existe no centro — o disco de máscara do
 * botão central do YouTube, o botão play grande do app e o transporte — obedece
 * AO MESMO estado (showControls). Com os controles minimizados, NÃO pode
 * restar nenhum círculo/botão nosso no centro ("presente porém sem ação").
 *
 * O keepOpen mantém os controles abertos em todo estado em que o YouTube
 * desenha chrome central (pausado, cue, buffering, travado), então nunca há
 * vazamento do botão do YT: sempre que a máscara é necessária, os controles
 * (e o disco) estão lá.
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

/** O disco opaco de máscara do botão central do YouTube. */
function queryMaskDisc() {
  return document.querySelector(".rounded-full.bg-black.w-24");
}

/** O botão play grande do app (sobre o disco, no estado pausado/cue). */
function queryBigCenterButton() {
  return document.querySelector('button[aria-label="Reproduzir"].rounded-full.bg-white\\/15');
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
  });

  it("tocando de verdade: após o auto-hide NÃO sobra NENHUM círculo nosso no centro", () => {
    act(() => {
      render(
        <FullscreenOverlay
          {...makeProps({ isPlaying: true, videoSurfaceIdle: false, surfaceBuffering: false })}
        />,
      );
    });
    // keepOpen caiu: o auto-hide (3,5 s) minimiza TODOS os controles
    act(() => { vi.advanceTimersByTime(4000); });
    // NADA nosso pode permanecer no centro com os controles minimizados
    expect(queryMaskDisc()).toBeNull();
    expect(queryBigCenterButton()).toBeNull();
    // O transporte do rodapé também minimiza junto (mesmo estado: opacity-0)
    expect(queryTransportPlayPause()).not.toBeNull(); // montado, porém
    expect(queryHiddenBottomControls()).not.toBeNull(); // oculto (opacity-0)
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
    // (o último frame pintado pode conter o botão central do YouTube).
    // O disco em si não é necessário (idle=false), mas os controles ficam.
    expect(queryTransportPlayPause()).not.toBeNull();
    expect(queryHiddenBottomControls()).toBeNull(); // NÃO ocultos
    expect(queryMaskDisc()).toBeNull();
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
