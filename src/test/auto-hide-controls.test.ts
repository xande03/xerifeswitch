import { describe, it, expect, beforeEach } from "vitest";
import { AUTOHIDE_OPTS, AUTOHIDE_DEFAULT, readAutoHideMs } from "@/lib/autoHideControls";

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
