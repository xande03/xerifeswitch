/**
 * Xerife Music — alinhamento do clipe após troca de vídeo no modo Áudio↔Vídeo.
 *
 * Contexto arquitetural (importante para entender o porquê deste módulo):
 * aqui o ÁUDIO e o VÍDEO são o MESMO elemento — um único iframe do YouTube
 * IFrame API. Portanto não existem dois relógios independentes que possam
 * "desandar" um do outro: um watcher perpétuo de drift entre áudio e vídeo
 * seria no-op (lê o mesmo número duas vezes) e, se aplicasse `seekTo`, brigaria
 * com o player causando stalls de buffer audíveis.
 *
 * O desvio real acontece na TROCA de clipe: `player.loadVideoById({ startSeconds })`
 * não honra o segundo pedido — o YouTube ancora em um keyframe próximo e pode
 * ainda devolver 0 no primeiro instante. É isso que este guard corrige, de forma
 * pontual e com orçamento limitado de tentativas.
 *
 * Mantido como função pura para ser verificável em teste unitário (sem IFrame).
 */

export interface ClipSyncInput {
  /** Segundos onde queríamos estar (audioTime + offset do clipe). null = nada pendente. */
  pendingTargetSec: number | null;
  /** Tempo lido diretamente do IFrame neste instante. */
  observedSec: number;
  isBuffering: boolean;
  /** Tempo decorrido desde o load, em ms. */
  elapsedMs: number;
  /** Correções já aplicadas neste ciclo de troca. */
  correctionsUsed: number;
  /** O usuário mexeu no seek depois do load — rendimento total ao usuário. */
  userSeekedSince?: boolean;
  /** Desvio máximo aceitável, em ms. */
  toleranceMs?: number;
  /** Janela de correção após o load, em ms. */
  windowMs?: number;
  /** Máximo de seeks corretivos por troca. */
  maxCorrections?: number;
}

export type SyncVerdict =
  | { action: "seek"; targetSec: number; reason: "drift" | "not-landed" }
  | {
      action: "none";
      reason:
        | "no-pending"
        | "window-closed"
        | "user-seeked"
        | "buffering"
        | "converged"
        | "budget-exhausted"
        | "not-playable";
      /** true quando o ciclo deve ser encerrado (para o polling e limpa o pending). */
      done: boolean;
    };

export const CLIP_SYNC_DEFAULTS = {
  /**
   * Tolerância maior que os 50ms do plano original: o IFrame API só expõe
   * getCurrentTime() com resolução de ~1 quadrinho de polling e o próprio seek
   * tem latência de rede. Corrigir desvios de 50ms geraria mais stalls do que
   * benefício perceptível — 250ms fica abaixo do limiar auditivo de "salto".
   */
  toleranceMs: 250,
  /** Fora desta janela o clipe já está estabilizado; não mexemos mais. */
  windowMs: 6000,
  /** Orçamento baixo de propósito: 2 seeks corretores por troca. */
  maxCorrections: 2,
} as const;

/** Desvio absoluto entre onde pedimos e onde o player está, em ms. */
export function clipSyncDriftMs(pendingTargetSec: number, observedSec: number): number {
  return Math.abs(observedSec - pendingTargetSec) * 1000;
}

/**
 * Decide se devemos aplicar um seek corretivo discreto.
 * Ordem das guardas importa: as que encerram o ciclo vêm antes das que apenas
 * pulam um tick, para que o polling não fique vivo indefinidamente.
 */
export function evaluateClipSync(input: ClipSyncInput): SyncVerdict {
  const toleranceMs = input.toleranceMs ?? CLIP_SYNC_DEFAULTS.toleranceMs;
  const windowMs = input.windowMs ?? CLIP_SYNC_DEFAULTS.windowMs;
  const maxCorrections = input.maxCorrections ?? CLIP_SYNC_DEFAULTS.maxCorrections;

  const target = input.pendingTargetSec;
  if (target == null || !Number.isFinite(target)) {
    return { action: "none", reason: "no-pending", done: true };
  }
  if (input.userSeekedSince) {
    // Intenção do usuário vence qualquer correção automática.
    return { action: "none", reason: "user-seeked", done: true };
  }
  if (input.elapsedMs > windowMs) {
    return { action: "none", reason: "window-closed", done: true };
  }
  if (input.isBuffering) {
    // Não brigar com a rede: espera estabilizar e reavaliamos no próximo tick.
    return { action: "none", reason: "buffering", done: false };
  }
  if (!Number.isFinite(input.observedSec) || input.observedSec < 0) {
    return { action: "none", reason: "not-playable", done: false };
  }

  const driftMs = clipSyncDriftMs(target, input.observedSec);
  if (driftMs <= toleranceMs) {
    return { action: "none", reason: "converged", done: true };
  }
  if (input.correctionsUsed >= maxCorrections) {
    return { action: "none", reason: "budget-exhausted", done: true };
  }

  // O player ignorou o startSeconds por completo (ex.: ainda no frame 0 do
  // vídeo anterior). Neste caso o seek é obrigatório mesmo com alvo 0.
  const notLanded = target === 0 && input.observedSec > toleranceMs / 1000;
  return {
    action: "seek",
    targetSec: Math.max(0, target),
    reason: notLanded ? "not-landed" : "drift",
  };
}
