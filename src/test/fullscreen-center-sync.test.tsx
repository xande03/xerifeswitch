import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import React from "react";
import FullscreenOverlay from "@/components/FullscreenOverlay";

/**
 * REGRA DE OURO DO CENTRO v3 (2026-09-18 — "remover o círculo meio transparente
 * com duas barras do meio do player"):
 *
 * - TOCANDO: NADA nosso no centro — nem botão, nem círculo. O vídeo fica limpo.
 *   (O play/pause enquanto toca fica no transporte do rodapé.)
 * - PAUSADO: disco-base + botão PLAY (com ação) — retomar + cobrir o botão
 *   central do próprio YouTube.
 * - TRAVADO/BUFFERING (superfície real): SÓ o disco preto (cobre o bezel
 *   congelado do YouTube) — SEM símbolo de pause no centro.
 * - Flash anti-bezel (transição play↔pause): disco puro por 900ms.
 * - Tudo esmaece JUNTO com os controles (4s) quando tocando de verdade.
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
  return document.querySelector(".rounded-full.bg-black.w-\\[84px\\]");
}

/** O container do conjunto central (disco + botão) — esmaece com showControls. */
function queryCenterSetContainer() {
  return queryMaskDisc()?.parentElement ?? null;
}

/** O botão central grande do app (AGORA só existe pausado: Play). */
function queryBigCenterButton() {
  return document.querySelector('button[aria-label="Reproduzir"].rounded-full.bg-white\\/15');
}

/** O botão de pause central — NÃO deve existir em estado nenhum. */
function queryCenterPauseButton() {
  return document.querySelector('button[aria-label="Pausar"].rounded-full.bg-white\\/15');
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
  it("pausado + idle: disco + botão PLAY visíveis (retomar + cobrir o YouTube)", () => {
    act(() => {
      render(<FullscreenOverlay {...makeProps({ isPlaying: false, videoSurfaceIdle: true })} />);
    });
    expect(queryMaskDisc()).not.toBeNull();
    expect(queryBigCenterButton()).not.toBeNull();
    expect(queryCenterPauseButton()).toBeNull();
    // keepOpen: mesmo avançando o tempo, os controles NÃO escondem enquanto pausado
    act(() => { vi.advanceTimersByTime(10000); });
    expect(queryMaskDisc()).not.toBeNull();
    expect(queryBigCenterButton()).not.toBeNull();
    expect(queryCenterSetContainer()?.className).toContain("opacity-100");
  });

  it("TOCANDO: NADA no centro — sem círculo, sem pause, vídeo limpo (antes e depois do auto-hide)", () => {
    act(() => {
      render(
        <FullscreenOverlay
          {...makeProps({ isPlaying: true, videoSurfaceIdle: false, surfaceBuffering: false })}
        />,
      );
    });
    // Com os controles VISÍVEIS tocando: centro 100% limpo
    expect(queryBigCenterButton()).toBeNull(); // sem botão de play/pause no centro
    expect(queryCenterPauseButton()).toBeNull(); // sem símbolo de pause
    expect(queryCenterSetContainer()?.className).toContain("opacity-0"); // conjunto invisível
    // O controle fica no transporte do rodapé
    expect(queryTransportPlayPause()).not.toBeNull();
    // Após o auto-hide (4s): continua limpo + rodapé esmaece junto
    act(() => { vi.advanceTimersByTime(4000); });
    expect(queryBigCenterButton()).toBeNull();
    expect(queryCenterSetContainer()?.className).toContain("opacity-0");
    expect(queryHiddenBottomControls()).not.toBeNull(); // rodapé oculto (opacity-0)
  });

  it("tocando + superfície travada (live/stuck): SÓ o disco (cobre bezel do YouTube) — SEM símbolo de pause", () => {
    act(() => {
      render(
        <FullscreenOverlay
          {...makeProps({ isPlaying: true, videoSurfaceIdle: true, surfaceBuffering: false })}
        />,
      );
    });
    act(() => { vi.advanceTimersByTime(10000); });
    // keepOpen (idle): controles de pé, disco cobrindo o bezel congelado do YouTube
    expect(queryCenterSetContainer()?.className).toContain("opacity-100");
    expect(queryMaskDisc()).not.toBeNull();
    // Mas NENHUM símbolo de pause no centro (pedido do usuário)
    expect(queryCenterPauseButton()).toBeNull();
    expect(queryBigCenterButton()).toBeNull();
  });

  it("buffering (estado real do embed): controles de pé + disco cobrindo — nada minimiza pela metade", () => {
    act(() => {
      render(
        <FullscreenOverlay
          {...makeProps({ isPlaying: true, videoSurfaceIdle: false, surfaceBuffering: true })}
        />,
      );
    });
    act(() => { vi.advanceTimersByTime(10000); });
    expect(queryTransportPlayPause()).not.toBeNull();
    expect(queryHiddenBottomControls()).toBeNull(); // NÃO ocultos
    expect(queryCenterSetContainer()?.className).toContain("opacity-100"); // disco cobrindo
    expect(queryCenterPauseButton()).toBeNull(); // sem símbolo
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
