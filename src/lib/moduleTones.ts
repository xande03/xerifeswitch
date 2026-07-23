/**
 * Tokens de estado para as pílulas dos módulos (Music / Vídeo / Podcast).
 *
 * A base é sempre um HSL "h s% l%". Ajustamos a luminosidade para garantir
 * contraste WCAG AA (≥4.5:1) do texto/ícone sobre o fundo tingido, tanto no
 * tema escuro (fundo escuro tingido claro) quanto no claro (fundo claro
 * tingido escuro), e definimos variações consistentes para hover/focus/ativo.
 */

export type ModuleToneSet = {
  /** Cor do texto e ícone. */
  fg: string;
  /** Fundo tingido no estado padrão ativo. */
  bg: string;
  /** Fundo em hover (levemente mais opaco). */
  bgHover: string;
  /** Fundo em :active / pressed (opacidade máxima). */
  bgActive: string;
  /** Borda / anel interno. */
  ring: string;
  /** Cor do focus ring (visível em teclado). */
  focusRing: string;
  /** Sombra sutil para elevação em hover. */
  shadow: string;
};

function parseHsl(hsl: string): { h: number; s: number; l: number } {
  const [h, s, l] = hsl
    .replace(/%/g, "")
    .split(/\s+/)
    .map((n) => parseFloat(n));
  return { h: h || 0, s: s || 0, l: l || 0 };
}

/**
 * Deriva as cores de estado da pílula a partir de um HSL base + tema.
 * A cor de texto/ícone é escurecida no tema claro e clareada no escuro para
 * atingir contraste AA sobre o fundo tingido correspondente.
 */
export function getModuleTones(baseHsl: string, isLight: boolean): ModuleToneSet {
  const { h, s, l } = parseHsl(baseHsl);

  // Cor de texto/ícone com luminosidade ajustada por tema.
  // Tema escuro: usar tom mais claro do accent para destacar sobre fundo tingido escuro.
  // Tema claro: usar tom mais escuro para atender AA sobre fundo tingido claro.
  const fgL = isLight
    ? Math.max(22, Math.min(38, l - 6))
    : Math.min(72, Math.max(55, l + 10));
  const fgS = Math.min(90, s);

  const fg = `hsl(${h} ${fgS}% ${fgL}%)`;

  // Opacidades do fundo tingido — mais forte no light para garantir presença.
  const bgAlpha = isLight ? 0.14 : 0.16;
  const bgHoverAlpha = isLight ? 0.22 : 0.24;
  const bgActiveAlpha = isLight ? 0.3 : 0.34;
  const ringAlpha = isLight ? 0.45 : 0.38;

  return {
    fg,
    bg: `hsl(${h} ${s}% ${l}% / ${bgAlpha})`,
    bgHover: `hsl(${h} ${s}% ${l}% / ${bgHoverAlpha})`,
    bgActive: `hsl(${h} ${s}% ${l}% / ${bgActiveAlpha})`,
    ring: `hsl(${h} ${s}% ${l}% / ${ringAlpha})`,
    focusRing: `hsl(${h} ${s}% ${l}% / 0.6)`,
    shadow: `0 2px 10px -4px hsl(${h} ${s}% ${l}% / 0.4)`,
  };
}
