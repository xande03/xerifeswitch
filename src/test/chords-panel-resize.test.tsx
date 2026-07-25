import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import ChordsPanel from "@/components/ChordsPanel";

vi.mock("@/lib/chords", () => ({
  fetchChords: vi.fn(async () => ({
    chords: "C  G  Am  F\nLetra da música de teste",
    key: "C",
    capo: 0,
    source: "test",
    url: "https://example.com/cifra",
  })),
  transposeChords: (c: string) => c,
  cifraClubFallbackUrl: () => "https://www.cifraclub.com.br/",
  invalidateChordsCache: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const LEVELS = [22, 55, 85];
const STORAGE_KEY = "xerife:chords-panel-height";

function getBody() {
  return screen.getByTestId("chords-body") as HTMLElement;
}

/** Altura atual em vh, exposta via data-attribute (jsdom não resolve min()/calc()). */
function currentVh(): number {
  return Number(getBody().getAttribute("data-height-vh"));
}

function drag(handle: HTMLElement, deltaY: number) {
  // window.innerHeight padrão do jsdom = 768
  fireEvent.pointerDown(handle, { clientY: 400, pointerId: 1 });
  fireEvent.pointerMove(handle, { clientY: 400 - deltaY, pointerId: 1 });
  fireEvent.pointerUp(handle, { clientY: 400 - deltaY, pointerId: 1 });
}

async function renderPanel() {
  const utils = render(<ChordsPanel artist="Artista" title="Música" resizable />);
  await waitFor(() => expect(screen.getByTestId("chords-body")).toBeInTheDocument());
  const handle = screen.getByRole("separator");
  return { ...utils, handle };
}

beforeEach(() => {
  localStorage.clear();
  // jsdom não implementa pointer capture
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

describe("Módulo de cifra — redimensionamento", () => {
  it("inicia no nível padrão", async () => {
    await renderPanel();
    expect(currentVh()).toBe(LEVELS[1]);
  });

  it("arrastar para cima expande até o nível máximo", async () => {
    const { handle } = await renderPanel();
    drag(handle, 250); // ~32vh para cima
    await waitFor(() => expect(currentVh()).toBe(LEVELS[2]));
  });

  it("arrastar para baixo minimiza", async () => {
    const { handle } = await renderPanel();
    drag(handle, -250);
    await waitFor(() => expect(currentVh()).toBe(LEVELS[0]));
  });

  it("encaixa sempre em um dos 3 níveis, mesmo em posição intermediária", async () => {
    const { handle } = await renderPanel();
    drag(handle, 80); // ~10vh -> posição intermediária
    await waitFor(() => expect(LEVELS).toContain(currentVh()));
  });

  it("duplo clique alterna entre expandido e minimizado", async () => {
    const { handle } = await renderPanel();
    fireEvent.doubleClick(handle);
    await waitFor(() => expect(currentVh()).toBe(LEVELS[2]));
    fireEvent.doubleClick(handle);
    await waitFor(() => expect(currentVh()).toBe(LEVELS[0]));
  });

  it("teclado (setas) percorre os níveis", async () => {
    const { handle } = await renderPanel();
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    await waitFor(() => expect(currentVh()).toBe(LEVELS[2]));
    fireEvent.keyDown(handle, { key: "ArrowDown" });
    await waitFor(() => expect(currentVh()).toBe(LEVELS[1]));
  });

  it("persiste a preferência de altura e restaura ao remontar", async () => {
    const { handle, unmount } = await renderPanel();
    drag(handle, 250);
    await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).toBe(String(LEVELS[2])));
    unmount();

    await renderPanel();
    expect(currentVh()).toBe(LEVELS[2]);
  });

  it("modo expandido nunca ultrapassa a viewport (clamp) e mantém altura mínima", async () => {
    const { handle } = await renderPanel();
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    await waitFor(() => expect(currentVh()).toBe(LEVELS[2]));
    expect(getBody().getAttribute("data-level")).toBe("2");
    expect(getBody().style.minHeight).toBe("8rem");
    // conteúdo continua rolável, sem corte
    expect(getBody().className).toContain("overflow-y-auto");
  });
});
