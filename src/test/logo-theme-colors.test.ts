import { describe, it, expect } from "vitest";
import { LOGO_THEME_COLORS, logoColorsForTheme } from "@/lib/logoThemeColors";

// ids oferecidos pelo seletor "Cor do ícone" (HeaderMenu COLOR_OPTIONS)
const SELECTOR_IDS = [
  "default",
  "ambient",
  "artist-exclusive",
  "genre-rock",
  "genre-jazz",
  "red",
  "blue",
  "purple",
  "green",
  "orange",
  "pink",
];

const HEX = /^#[0-9a-f]{6}$/i;

describe("logoThemeColors — estrela do app segue a cor selecionada", () => {
  it("toda opção do seletor tem um gradiente definido", () => {
    for (const id of SELECTOR_IDS) {
      const pair = LOGO_THEME_COLORS[id];
      expect(pair, `faltando ${id}`).toBeTruthy();
      expect(pair.from).toMatch(HEX);
      expect(pair.to).toMatch(HEX);
      expect(pair.from).not.toBe(pair.to);
    }
  });

  it("casos do pedido: verde → gradiente verde, vermelho → gradiente vermelho", () => {
    expect(logoColorsForTheme("green")).not.toEqual(logoColorsForTheme("red"));
    expect(logoColorsForTheme("green").from).toBe("#2dd47c");
    expect(logoColorsForTheme("red").from).toBe("#ff5c5c");
    // e nenhum dos dois vira o azul da marca
    expect(logoColorsForTheme("green")).not.toEqual(LOGO_THEME_COLORS.brand);
    expect(logoColorsForTheme("red")).not.toEqual(LOGO_THEME_COLORS.brand);
  });

  it("fallback: desconhecido/undefined usa o tema base do app (verde default)", () => {
    expect(logoColorsForTheme("nao-existe")).toEqual(LOGO_THEME_COLORS.default);
    expect(logoColorsForTheme(undefined)).toEqual(LOGO_THEME_COLORS.default);
  });
});
