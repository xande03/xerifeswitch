import { describe, it, expect } from "vitest";
import { formatRelativePtBR } from "../../supabase/functions/_shared/ptbrRelative";

const NOW = new Date("2026-09-16T15:00:00Z").getTime();
const back = (ms: { s?: number; m?: number; h?: number; d?: number }) =>
  NOW - (ms.s ?? 0) * 1000 - (ms.m ?? 0) * 60_000 - (ms.h ?? 0) * 3_600_000 - (ms.d ?? 0) * 86_400_000;

describe("formatRelativePtBR", () => {
  it("escala segundos → minutos → horas → dias → semanas → meses → anos", () => {
    expect(formatRelativePtBR(back({ s: 20 }), NOW)).toBe("agora mesmo");
    expect(formatRelativePtBR(back({ m: 1 }), NOW)).toBe("há 1 minuto");
    expect(formatRelativePtBR(back({ m: 42 }), NOW)).toBe("há 42 minutos");
    expect(formatRelativePtBR(back({ h: 2 }), NOW)).toBe("há 2 horas");
    expect(formatRelativePtBR(back({ d: 1 }), NOW)).toBe("há 1 dia");
    expect(formatRelativePtBR(back({ d: 4 }), NOW)).toBe("há 4 dias");
    expect(formatRelativePtBR(back({ d: 9 }), NOW)).toBe("há 1 semana");
    expect(formatRelativePtBR(back({ d: 21 }), NOW)).toBe("há 3 semanas");
    expect(formatRelativePtBR(back({ d: 40 }), NOW)).toBe("há 1 mês");
    expect(formatRelativePtBR(back({ d: 190 }), NOW)).toBe("há 6 meses");
    expect(formatRelativePtBR(back({ d: 400 }), NOW)).toBe("há 1 ano");
    expect(formatRelativePtBR(back({ d: 800 }), NOW)).toBe("há 2 anos");
  });

  it("nunca retorna unidade em outro idioma e trata futuro como 'agora mesmo'", () => {
    expect(formatRelativePtBR(NOW + 60_000, NOW)).toBe("agora mesmo");
    for (const ms of [10_000, 3_600_000, 86_400_000, 86_400_000 * 400]) {
      expect(formatRelativePtBR(NOW - ms, NOW)).not.toMatch(/\bago\b|منذ|hace/i);
    }
  });

  it("produz formato reconhecido pelo parser de ordenação (VideoComments)", () => {
    const re = /(\d+)\s*(segundo|minuto|hora|dia|semana|m[eê]s|ano)/i;
    expect("há 3 dias").toMatch(re);
    expect(formatRelativePtBR(back({ d: 3 }), NOW)).toBe("há 3 dias");
    expect(formatRelativePtBR(back({ d: 3 }), NOW)).toMatch(re);
  });
});
