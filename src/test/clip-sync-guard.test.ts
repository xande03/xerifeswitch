/**
 * Guarda de alinhamento do clipe apos loadVideoAt.
 *
 * Cobre o criterio de aceite 3 do plano Audio<->Video ("trocar para o clipe
 * memorizado retoma exatamente em audioTime + offset") e as guardas que impedem
 * o watcher de brigar com o player.
 */
import { describe, it, expect } from "vitest";
import {
  evaluateClipSync,
  clipSyncDriftMs,
  CLIP_SYNC_DEFAULTS,
  type ClipSyncInput,
} from "@/lib/clipSyncGuard";

const base: ClipSyncInput = {
  pendingTargetSec: 30,
  observedSec: 34, // 4s de desvio -> pede correcao
  isBuffering: false,
  elapsedMs: 400,
  correctionsUsed: 0,
};

describe("clipSyncGuard", () => {
  it("mede o desvio em milissegundos", () => {
    expect(clipSyncDriftMs(30, 34)).toBeCloseTo(4000, 6);
    expect(clipSyncDriftMs(10, 10.2)).toBeCloseTo(200, 6);
  });

  it("pede seek quando o pouso passou da tolerancia", () => {
    const v = evaluateClipSync(base);
    expect(v.action).toBe("seek");
    if (v.action === "seek") expect(v.targetSec).toBe(30);
  });

  it("converge (e encerra o ciclo) quando esta dentro da tolerancia", () => {
    const v = evaluateClipSync({
      ...base,
      observedSec: 30 + CLIP_SYNC_DEFAULTS.toleranceMs / 2000,
    });
    expect(v).toEqual({ action: "none", reason: "converged", done: true });
  });

  it("nao briga com a rede: buffering apenas pula o tick", () => {
    const v = evaluateClipSync({ ...base, isBuffering: true });
    expect(v.action).toBe("none");
    if (v.action === "none") {
      expect(v.reason).toBe("buffering");
      expect(v.done).toBe(false); // ciclo continua, reavalia no proximo tick
    }
  });

  it("cede ao usuario: seek manual encerra o ciclo", () => {
    const v = evaluateClipSync({ ...base, userSeekedSince: true });
    expect(v).toEqual({ action: "none", reason: "user-seeked", done: true });
  });

  it("fecha a janela de observacao para nao corrigir para sempre", () => {
    const v = evaluateClipSync({
      ...base,
      elapsedMs: CLIP_SYNC_DEFAULTS.windowMs + 1,
    });
    expect(v).toEqual({ action: "none", reason: "window-closed", done: true });
  });

  it("respeita o orcamento de correcoes", () => {
    const exhausted = evaluateClipSync({
      ...base,
      correctionsUsed: CLIP_SYNC_DEFAULTS.maxCorrections,
    });
    expect(exhausted).toEqual({
      action: "none",
      reason: "budget-exhausted",
      done: true,
    });
    // uma correcao a menos ainda e permitida
    expect(evaluateClipSync({ ...base, correctionsUsed: 0 }).action).toBe("seek");
  });

  it("detecta o caso em que o startSeconds foi ignorado (pousou em 0)", () => {
    const v = evaluateClipSync({ ...base, pendingTargetSec: 0, observedSec: 8 });
    expect(v.action).toBe("seek");
    if (v.action === "seek") {
      expect(v.reason).toBe("not-landed");
      expect(v.targetSec).toBe(0);
    }
  });

  it("ignora alvo ausente ou nao finito", () => {
    expect(evaluateClipSync({ ...base, pendingTargetSec: null })).toEqual({
      action: "none",
      reason: "no-pending",
      done: true,
    });
    expect(evaluateClipSync({ ...base, pendingTargetSec: NaN }).action).toBe("none");
  });

  it("ignora leitura corrompida do player sem encerrar o ciclo", () => {
    const v = evaluateClipSync({ ...base, observedSec: Number.NaN });
    expect(v).toEqual({ action: "none", reason: "not-playable", done: false });
  });

  it("nunca devolve alvo negativo", () => {
    const v = evaluateClipSync({ ...base, pendingTargetSec: -3 });
    expect(v.action).toBe("seek");
    if (v.action === "seek") expect(v.targetSec).toBe(0);
  });

  it("converge na tolerancia minima do plano (50ms) quando configurada", () => {
    // O padrao do repo e mais conservador (250ms), mas a politica e parametrica:
    // com toleranceMs=50 um desvio de 30ms ainda e aceito.
    const v = evaluateClipSync({ ...base, observedSec: 30.03, toleranceMs: 50 });
    expect(v.action).toBe("none");
    if (v.action === "none") expect(v.reason).toBe("converged");
  });
});
