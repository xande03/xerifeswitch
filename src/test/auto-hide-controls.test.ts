import { describe, it, expect, beforeEach } from "vitest";
import {
  AUTOHIDE_OPTS,
  AUTOHIDE_DEFAULT,
  readAutoHideMs,
  GLYPH_COVER_MS,
  glyphCoverActive,
  autoHideDelayMs,
} from "@/lib/autoHideControls";

/**
 * Fonte única do "segundos determinados" do auto-hide dos controles do player
 * de vídeo (overlay inline DO Index + FullscreenOverlay). Regra: o timer SEMPRE
 * arma — pausado inclusive — e todas as superfícies usam ESTE mesmo valor.
 */
describe("autoHideControls — segundos determinados do auto-hide", () => {
  beforeEach(() => {
    localStorage.removeItem("demus-fs-autohide-ms");
  });

  it("sem preferência salva cai no default", () => {
    expect(readAutoHideMs()).toBe(AUTOHIDE_DEFAULT);
    expect(AUTOHIDE_DEFAULT).toBe(3500);
  });

  it("valor válido do localStorage é respeitado (cada passo das opções)", () => {
    for (const ms of AUTOHIDE_OPTS) {
      localStorage.setItem("demus-fs-autohide-ms", String(ms));
      expect(readAutoHideMs()).toBe(ms);
    }
  });

  it("valor fora das opções ou inválido cai no default", () => {
    for (const bad of ["4000", "0", "-1", "abc", "NaN", "999999"]) {
      localStorage.setItem("demus-fs-autohide-ms", bad);
      expect(readAutoHideMs()).toBe(AUTOHIDE_DEFAULT);
    }
    localStorage.setItem("demus-fs-autohide-ms", "");
    expect(readAutoHideMs()).toBe(AUTOHIDE_DEFAULT);
  });

  it("opções cobrem os intervalos esperados (2s–8s)", () => {
    expect([...AUTOHIDE_OPTS]).toEqual([2000, 3500, 5000, 8000]);
  });
});

/**
 * Janela do glifo central do YouTube (medida em lab: some sozinho em ~5s;
 * janela segura = 6500ms). O lease do auto-hide e o CenterGlyphCover usam a
 * MESMA contagem — controles e disco somem juntos, nunca sobra o glifo.
 */
describe("janela do glifo — lease do auto-hide e cobertura", () => {
  const NOW = 1_000_000;

  it("glyphPaintAt zerado/ausente = sem janela", () => {
    expect(glyphCoverActive(0, NOW)).toBe(false);
    expect(glyphCoverActive(null, NOW)).toBe(false);
    expect(glyphCoverActive(undefined, NOW)).toBe(false);
  });

  it("janela aberta por GLYPH_COVER_MS a partir da pintura", () => {
    expect(glyphCoverActive(NOW - 100, NOW)).toBe(true);
    expect(glyphCoverActive(NOW - GLYPH_COVER_MS + 1, NOW)).toBe(true);
    expect(glyphCoverActive(NOW - GLYPH_COVER_MS, NOW)).toBe(false); // borda: expirada
    expect(glyphCoverActive(NOW - GLYPH_COVER_MS - 1, NOW)).toBe(false);
    // ~5s medidos no lab: dentro da janela
    expect(glyphCoverActive(NOW - 5000, NOW)).toBe(true);
  });

  it("sem glifo pendente o delay é EXATAMENTE os segundos determinados", () => {
    expect(autoHideDelayMs(3500, 0, NOW)).toBe(3500);
    expect(autoHideDelayMs(2000, null, NOW)).toBe(2000);
    expect(autoHideDelayMs(8000, NOW - 9000, NOW)).toBe(8000); // janela já expirou
  });

  it("com glifo pendente o delay nunca esconde antes do fim da janela", () => {
    // Pintura agora: piso = janela inteira (6500) mesmo com preferência 2000
    expect(autoHideDelayMs(2000, NOW, NOW)).toBe(GLYPH_COVER_MS);
    // Restam 4000ms de janela < 3500?? não: 4000 > 3500 → piso na janela
    expect(autoHideDelayMs(3500, NOW - 2500, NOW)).toBe(GLYPH_COVER_MS - 2500);
    // Preferência LONGA (8000) vence a janela restante curta
    expect(autoHideDelayMs(8000, NOW - 1000, NOW)).toBe(8000);
    // Nunca valor negativo
    expect(autoHideDelayMs(1000, NOW - GLYPH_COVER_MS - 5000, NOW)).toBe(1000);
  });
});
