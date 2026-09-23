/**
 * Tempo de auto-hide dos controles do player de vídeo — FONTE ÚNICA para o
 * overlay inline (Index.tsx) e o fullscreen (FullscreenOverlay), garantindo
 * que "os segundos determinados" sejam os MESMOS nas duas superfícies.
 *
 * ALSE-STYLE: o timer SEMPRE arma — pausado inclusive. Minimizar é decisão
 * do usuário (toque) ou do tempo, nunca do estado da reprodução. Após o
 * delay, TODOS os controles minimizam JUNTOS e a tela fica limpa.
 *
 * Preferência persistida em localStorage "demus-fs-autohide-ms"; sem valor
 * (ou inválido) cai no default. Aceita apenas os passos de AUTOHIDE_OPTS.
 */
export const AUTOHIDE_OPTS = [2000, 3500, 5000, 8000] as const;
export const AUTOHIDE_DEFAULT = 3500;

export function readAutoHideMs(): number {
  try {
    const raw = localStorage.getItem("demus-fs-autohide-ms");
    if (raw == null || raw === "") return AUTOHIDE_DEFAULT;
    const n = Number(raw);
    if (!Number.isFinite(n) || !(AUTOHIDE_OPTS as readonly number[]).includes(n)) return AUTOHIDE_DEFAULT;
    return n;
  } catch {
    return AUTOHIDE_DEFAULT;
  }
}
