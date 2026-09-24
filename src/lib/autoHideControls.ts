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

/**
 * JANELA DO GLIFO CENTRAL DO YOUTUBE (medida em lab real, controls=0 +
 * pointer-events:none): a cada play/resume/seek o embed PINTA um indicador
 * central (⏸/▶, círculo translúcido de ~16% da largura do player) que some
 * SOZINHO em ~5 s — mesmo sem eventos de pointer. 6500 ms = fade ~5 s +
 * margem de jitter/troxe de rede. Durante essa janela o app mantém:
 *  - o disco opaco CenterGlyphCover (esconde o glifo por construção);
 *  - o lease do auto-hide dos controles (somem JUNTOS com o disco/glifo).
 * Assim nunca há "dois botões de pause" nem "botão de pause sobrando" após
 * a minimização.
 */
export const GLYPH_COVER_MS = 6500;

/** TRUE enquanto a janela do glifo (contada a partir de glyphPaintAt) está aberta. */
export function glyphCoverActive(glyphPaintAt: number | null | undefined, now: number): boolean {
  if (!glyphPaintAt) return false;
  return now - glyphPaintAt < GLYPH_COVER_MS;
}

/**
 * Delay do auto-hide: os "segundos determinados" (preferência do usuário) com
 * PISO na ponta da janela do glifo — revelações disparadas por uma transição
 * (play/seek/load) nunca escondem os controles antes do glifo do YouTube sumir.
 * Sem glifo pendente, devolve exatamente o valor determinado.
 */
export function autoHideDelayMs(userMs: number, glyphPaintAt: number | null | undefined, now: number): number {
  if (!glyphPaintAt) return userMs;
  const remaining = glyphPaintAt + GLYPH_COVER_MS - now;
  return Math.max(userMs, remaining);
}
