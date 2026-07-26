/**
 * Ciclo de atualização de conteúdo da tela de Início do Xerife Music.
 *
 * As seções personalizadas (Sugestões/Destaques, Ouvir novamente e Top 10)
 * são "congeladas" dentro de uma janela de 5 dias. Quando o ciclo vira, os
 * caches são considerados expirados e o conteúdo é recalculado a partir do
 * que o usuário pesquisou no módulo Explorar (localStorage) e do histórico.
 */

export const CYCLE_MS = 5 * 24 * 60 * 60 * 1000; // 5 dias

/** Identificador da janela de 5 dias atual. Muda a cada 5 dias. */
export function getCycleId(ts: number = Date.now()): number {
  return Math.floor(ts / CYCLE_MS);
}

/** true quando o timestamp pertence ao ciclo atual de 5 dias. */
export function isSameCycle(ts: number): boolean {
  return getCycleId(ts) === getCycleId();
}
