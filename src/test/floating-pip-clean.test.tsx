import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import React from "react";
import FloatingPiPPlayer from "@/components/FloatingPiPPlayer";

/**
 * MINI PLAYER FLUTUANTE (vídeo minimizado) — LIMPO (2026-09-19):
 * "Player de vídeo limpo quando minimizado: sem botões e indicativos."
 *
 * Regras testadas:
 * 1. Com youtubeId (vídeo): NENHUM botão, título, barra de progresso ou
 *    overlay/tint sobre o vídeo — apenas o iframe mascarado (anti-branding).
 * 2. Clique simples (sem arrastar) reabre o player completo (onExpand).
 * 3. Arrastar (ponteiro anda >6px) NÃO expande — só move a janela.
 * 4. Fallback de áudio (sem youtubeId) mantém seus controles próprios.
 */

const song = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "s1",
  title: "Vídeo de teste",
  artist: "Canal Xerife",
  cover: "https://i.ytimg.com/vi/abc/hq720.jpg",
  youtubeId: "abc123XYZ",
  ...over,
}) as never;

const props = (s: never) => ({
  song: s,
  isPlaying: true,
  currentTime: 42,
  duration: 180,
  onTogglePlay: vi.fn(),
  onNext: vi.fn(),
  onPrev: vi.fn(),
  onExpand: vi.fn(),
  onClose: vi.fn(),
});

describe("FloatingPiPPlayer (vídeo minimizado) — limpo, sem botões/indicativos", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => cleanup());

  it("vídeo: não renderiza nenhum botão/overlay/indicativo", () => {
    const p = props(song());
    const { container } = render(<FloatingPiPPlayer {...p} />);
    // Nenhum botão no player de vídeo minimizado
    expect(container.querySelectorAll("button").length).toBe(0);
    // Nenhum overlay com fundo escurecido sobre o vídeo
    expect(container.querySelector(".bg-black\\/40")).toBeNull();
    // Sem barra de progresso (indicativo)
    expect(container.querySelectorAll("[style*='width']").length).toBe(0);
    // O iframe mascarado continua presente (anti-branding: 240px mais alto, top -120px)
    const iframe = container.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.className).toContain("pointer-events-none");
    expect(iframe?.style.top).toBe("-120px");
    expect(iframe?.style.height).toBe("calc(100% + 240px)");
    // Sem texto de título sobreposto
    expect(container.textContent).toBe("");
  });

  it("vídeo: clique simples (sem arrastar) reabre o player completo", () => {
    const p = props(song());
    const { container } = render(<FloatingPiPPlayer {...p} />);
    const video = container.querySelector(".aspect-video") as HTMLElement;
    // PointerEvent do jsdom descarta clientX/clientY do init — despachamos
    // MouseEvent com type "pointerdown/pointerup" para carregar coordenadas.
    video.dispatchEvent(new MouseEvent("pointerdown", { clientX: 100, clientY: 100, bubbles: true }));
    video.dispatchEvent(new MouseEvent("pointerup", { clientX: 100, clientY: 100, bubbles: true }));
    fireEvent.click(video, { clientX: 100, clientY: 100 });
    expect(p.onExpand).toHaveBeenCalledTimes(1);
    expect(p.onTogglePlay).not.toHaveBeenCalled();
  });

  it("vídeo: arrastar (anda >6px) NÃO expande — só move a janela", () => {
    const p = props(song());
    const { container } = render(<FloatingPiPPlayer {...p} />);
    const video = container.querySelector(".aspect-video") as HTMLElement;
    video.dispatchEvent(new MouseEvent("pointerdown", { clientX: 100, clientY: 100, bubbles: true }));
    video.dispatchEvent(new MouseEvent("pointermove", { clientX: 160, clientY: 130, bubbles: true }));
    video.dispatchEvent(new MouseEvent("pointerup", { clientX: 160, clientY: 130, bubbles: true }));
    fireEvent.click(video, { clientX: 160, clientY: 130 });
    expect(p.onExpand).not.toHaveBeenCalled();
  });

  it("fallback de áudio (sem youtubeId): mantém controles próprios", () => {
    const p = props(song({ youtubeId: "" }));
    const { container } = render(<FloatingPiPPlayer {...p} />);
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThan(0); // transporte próprio do fallback
    expect(container.querySelector("iframe")).toBeNull();
  });
});
