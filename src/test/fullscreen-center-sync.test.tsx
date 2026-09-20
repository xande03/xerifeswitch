import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import React from "react";
import FullscreenOverlay from "@/components/FullscreenOverlay";

/**
 * REGRA DE OURO DO CENTRO — v6 (2026-09-19, padrão-ouro "Alse Switch"):
 * "Camada de Sobreposição Unificada com Temporizador de Inatividade":
 *
 *  1. ESTADO ÚNICO (showControls): barra superior, barra inferior E o
 *     transporte central (Anterior / Play-Pause / Próxima) compartilham o
 *     mesmo boolean — aparecem juntos e somem juntos (fade 300ms).
 *  2. AUTO-HIDE: sem interação por 4s, tudo some suavemente.
 *  3. TOQUE NA SUPERFÍCIE: visível -> esconde; oculto -> revela + reinicia
 *     o timer (handleSurfaceClick).
 *  4. PROTEÇÃO CONTRA CLIQUES ACIDENTAIS: oculto = opacity-0 +
 *     pointer-events-none — vídeo 100% limpo; qualquer toque vai direto
 *     para a superfície.
 *  5. ISOLAMENTO (stopPropagation): clicar em qualquer controle não fecha
 *     os controles.
 *
 * keepOpen (pausado/idle/buffering em modo vídeo): tudo permanece de pé —
 * e o PLAY CENTRAL cobre o bezel de pausa do YouTube (substitui o disco de
 * capa v5, removido).
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

/** Disco de capa do estado pausado (v5) — REMOVIDO na v6. */
function queryPausedDisc() {
  return document.querySelector("[data-paused-cover-disc]");
}

/** Transporte central unificado (v6) — linha prev/play/next. */
function queryCentralCluster() {
  return document.querySelector("[data-central-transport]");
}

/** Botão central Play/Pause (w-16, bg-white/20 — distinto do rodapé w-14). */
function queryCentralPlayPause() {
  return document.querySelector('button[aria-label="Pausar"].w-16, button[aria-label="Reproduzir"].w-16');
}

/** O transporte do rodapé (w-14, bg-white/20). */
function queryTransportPlayPause() {
  return document.querySelector("button.w-14.rounded-full.bg-white\\/20");
}

/** O container do rodapé no estado OCULTO (opacity-0). */
function queryHiddenBottomControls() {
  return document.querySelector(".bg-gradient-to-t.opacity-0");
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

describe("FullscreenOverlay — padrão-ouro: camada unificada com transporte central (v6)", () => {
  it("pausado + idle: transporte central visível (play cobre o bezel) e inerte ao toque-fantasma; rodapé de pé (keepOpen)", () => {
    act(() => {
      render(<FullscreenOverlay {...makeProps({ isPlaying: false, videoSurfaceIdle: true })} />);
    });
    expect(queryMaskDisc()).toBeNull();
    expect(queryPausedDisc()).toBeNull(); // v5 removido
    const cluster = queryCentralCluster();
    expect(cluster).not.toBeNull();
    expect(cluster!.className).not.toContain("pointer-events-none"); // clicável
    expect(queryCentralPlayPause()).not.toBeNull(); // play central presente
    expect(cluster!.querySelectorAll("button").length).toBe(3); // prev/play/next
    expect(queryTransportPlayPause()).not.toBeNull(); // rodapé também
    expect(queryHiddenBottomControls()).toBeNull(); // visível
    act(() => { vi.advanceTimersByTime(10000); });
    expect(queryHiddenBottomControls()).toBeNull(); // keepOpen: continua visível
    expect(queryCentralCluster()).not.toBeNull(); // central segue de pé
  });

  it("TOCANDO: tudo visível no início; após 4s tudo some JUNTO (centro limpo, pointer-events-none)", () => {
    act(() => {
      render(
        <FullscreenOverlay
          {...makeProps({ isPlaying: true, videoSurfaceIdle: false, surfaceBuffering: false })}
        />,
      );
    });
    expect(queryCentralPlayPause()).not.toBeNull(); // central visível
    expect(queryTransportPlayPause()).not.toBeNull();
    expect(queryHiddenBottomControls()).toBeNull();
    act(() => { vi.advanceTimersByTime(4000); });
    const cluster = queryCentralCluster();
    expect(cluster).not.toBeNull(); // ainda no DOM...
    expect(cluster!.className).toContain("pointer-events-none"); // ...mas INERTE
    expect(queryCentralPlayPause()).not.toBeNull(); // botão no DOM (opacity-0 no container)
    expect(queryHiddenBottomControls()).not.toBeNull(); // rodapé esmaeceu junto
  });

  it("tocando + travado (live/stuck): transporte central de pé (keepOpen cobre o bezel congelado)", () => {
    act(() => {
      render(
        <FullscreenOverlay
          {...makeProps({ isPlaying: true, videoSurfaceIdle: true, surfaceBuffering: false })}
        />,
      );
    });
    act(() => { vi.advanceTimersByTime(10000); });
    const cluster = queryCentralCluster();
    expect(cluster).not.toBeNull();
    expect(cluster!.className).not.toContain("pointer-events-none"); // clicável
    expect(queryCentralPlayPause()).not.toBeNull();
    expect(queryHiddenBottomControls()).toBeNull(); // controles visíveis
  });

  it("buffering: controles de pé (keepOpen) — central e rodapé visíveis, sem disco", () => {
    act(() => {
      render(
        <FullscreenOverlay
          {...makeProps({ isPlaying: true, videoSurfaceIdle: false, surfaceBuffering: true })}
        />,
      );
    });
    act(() => { vi.advanceTimersByTime(10000); });
    expect(queryCentralPlayPause()).not.toBeNull();
    expect(queryTransportPlayPause()).not.toBeNull();
    expect(queryMaskDisc()).toBeNull();
    expect(queryPausedDisc()).toBeNull();
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
