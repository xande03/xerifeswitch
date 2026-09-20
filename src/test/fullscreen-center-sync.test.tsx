import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act, fireEvent } from "@testing-library/react";
import React from "react";
import FullscreenOverlay from "@/components/FullscreenOverlay";

/**
 * REGRA DE OURO DO CENTRO — v8 (2026-09-20, poster do estado pausado):
 * Enquanto PAUSADO/travado, a área do vídeo é coberta pelo POSTER
 * ([data-paused-poster], thumbnail da faixa) — o bezel ⏸ do YouTube
 * (cross-origin, congela na camada pintada em alguns devices) não pode
 * aparecer onde o iframe não está visível. Ao dar play, poster sai na hora.
 * Demais regras v7 (Alse Switch) mantidas:
 *
 *  1. ESTADO ÚNICO (showControls): barra superior e barra inferior somem
 *     JUNTAS (fade 300ms). Play/Pause existe SOMENTE na barra inferior —
 *     nenhum transporte central no fullscreen (idem referência).
 *  2. AUTO-HIDE configurável (2000/3500/5000/8000ms, default 3500,
 *     localStorage "demus-fs-autohide-ms") — SEM keepOpen: aplica em
 *     QUALQUER estado, inclusive pausado/buffering.
 *  3. TOQUE NA SUPERFÍCIE SEMPRE ALTERNA — pausado incluso: o usuário
 *     SEMPRE consegue minimizar os controles clicando para minimizar
 *     (era o bug: keepOpen bloqueava o toque quando pausado).
 *  4. Oculto = opacity-0 + pointer-events-none — vídeo 100% limpo.
 *  5. stopPropagation nos controles (clicar neles não fecha nada).
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

/** Antigo disco preto central (v3) — não pode voltar. */
function queryMaskDisc() {
  return document.querySelector(".rounded-full.bg-black.w-\\[84px\\]");
}

/** Disco de capa do estado pausado (v5) — removido. */
function queryPausedDisc() {
  return document.querySelector("[data-paused-cover-disc]");
}

/** Poster do estado pausado (v8) — deve cobrir o vídeo e ser INERTE. */
function queryPausedPoster() {
  return document.querySelector("[data-paused-poster]");
}

/** Transporte central (v6) — REMOVIDO no fullscreen (referência: play/pause só no rodapé). */
function queryCentralCluster() {
  return document.querySelector("[data-central-transport]");
}

/** O transporte do rodapé (w-14, bg-white/20) — o ÚNICO play/pause. */
function queryTransportPlayPause() {
  return document.querySelector("button.w-14.rounded-full.bg-white\\/20");
}

/** O container do rodapé no estado OCULTO (opacity-0). */
function queryHiddenBottomControls() {
  return document.querySelector(".bg-gradient-to-t.opacity-0");
}

/** A superfície interativa (root do overlay — handleSurfaceClick). */
function querySurface() {
  return document.querySelector(".absolute.inset-0.z-\\[200\\]") as HTMLElement | null;
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.removeItem("demus-fs-autohide-ms");
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  cleanup();
  document.getElementById("yt-player")?.remove();
});

describe("FullscreenOverlay — comportamento Alse Switch (v7): toque sempre minimiza", () => {
  it("tocando: controles visíveis; após auto-hide tudo some JUNTO; sem transporte central", () => {
    act(() => {
      render(
        <FullscreenOverlay
          {...makeProps({ isPlaying: true, videoSurfaceIdle: false, surfaceBuffering: false })}
        />,
      );
    });
    expect(queryCentralCluster()).toBeNull(); // referência: sem centro no fullscreen
    expect(queryPausedPoster()).toBeNull(); // tocando: vídeo ao vivo, sem poster
    expect(queryTransportPlayPause()).not.toBeNull();
    expect(queryHiddenBottomControls()).toBeNull(); // visível
    act(() => { vi.advanceTimersByTime(4000); });
    expect(queryHiddenBottomControls()).not.toBeNull(); // esmaeceu (auto-hide 3500)
    expect(queryPausedPoster()).toBeNull(); // continua sem poster
    expect(queryMaskDisc()).toBeNull();
    expect(queryPausedDisc()).toBeNull();
  });

  it("PAUSADO: auto-hide aplica (sem keepOpen) — e o TOQUE sempre alterna", () => {
    act(() => {
      render(<FullscreenOverlay {...makeProps({ isPlaying: false, videoSurfaceIdle: true })} />);
    });
    expect(queryTransportPlayPause()).not.toBeNull();
    expect(queryHiddenBottomControls()).toBeNull(); // visível no início
    // POSTER cobrindo o iframe (bezel do YouTube jamais visível) — inerte
    const poster = queryPausedPoster();
    expect(poster).not.toBeNull();
    expect(poster!.className).toContain("pointer-events-none");

    // Toque na superfície com controles visíveis -> MINIMIZA (o bug era aqui:
    // o keepOpen bloqueava o toque quando pausado)
    act(() => { fireEvent.click(querySurface()!); });
    expect(queryHiddenBottomControls()).not.toBeNull(); // minimizou ✓
    expect(queryPausedPoster()).not.toBeNull(); // poster segue cobrindo o bezel ✓

    // Toque de novo (após a janela de double-tap) -> revela e rearma o timer
    act(() => { vi.advanceTimersByTime(400); });
    act(() => { fireEvent.click(querySurface()!); });
    expect(queryHiddenBottomControls()).toBeNull(); // visível ✓

    // Sem interação -> auto-hide minimiza de novo (mesmo pausado)
    act(() => { vi.advanceTimersByTime(4000); });
    expect(queryHiddenBottomControls()).not.toBeNull(); // minimizou ✓

    // Sem centro em nenhum momento
    expect(queryCentralCluster()).toBeNull();
    expect(queryMaskDisc()).toBeNull();
    expect(queryPausedDisc()).toBeNull();
  });

  it("buffering: auto-hide aplica normalmente (sem keepOpen)", () => {
    act(() => {
      render(
        <FullscreenOverlay
          {...makeProps({ isPlaying: true, videoSurfaceIdle: false, surfaceBuffering: true })}
        />,
      );
    });
    expect(queryHiddenBottomControls()).toBeNull();
    act(() => { vi.advanceTimersByTime(4000); });
    expect(queryHiddenBottomControls()).not.toBeNull(); // minimizou (antes ficava preso)
    expect(queryPausedPoster()).toBeNull(); // buffering: spinner do YT visível, sem poster
  });

  it("auto-hide configurável: valor do localStorage é respeitado (2000ms)", () => {
    localStorage.setItem("demus-fs-autohide-ms", "2000");
    act(() => {
      render(
        <FullscreenOverlay
          {...makeProps({ isPlaying: true, videoSurfaceIdle: false, surfaceBuffering: false })}
        />,
      );
    });
    act(() => { vi.advanceTimersByTime(1800); });
    expect(queryHiddenBottomControls()).toBeNull(); // ainda visível
    act(() => { vi.advanceTimersByTime(400); });
    expect(queryHiddenBottomControls()).not.toBeNull(); // minimizou em 2000ms
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
