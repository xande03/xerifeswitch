/**
 * Gradiente da estrela do logo (`colorFrom` → `colorTo`) derivado da cor que o
 * usuário escolheu no menu de configurações ("Cor do ícone", prop `colorTheme`).
 *
 * Cada par espelha a amostra do seletor em `HeaderMenu` (e o `--primary`
 * correspondente em `src/index.css`): o topo do gradiente é a cor viva do tema
 * e a base um tom mais escuro da mesma família — o app todo segue a cor no
 * "símbolo" do app, incluíndo o ícone do topo.
 */
export const LOGO_THEME_COLORS: Record<string, { from: string; to: string }> = {
  /** Verde Escuro (Padrão) — default; azul da marca quando legado/desconhecido */
  default: { from: "#34c36c", to: "#1e7a48" },
  /** Ambiente (Capa) — rosa→violeta, eco da amostra gradiente do seletor */
  ambient: { from: "#ec4899", to: "#8b5cf6" },
  /** Exclusivo: Xerife — dourado */
  "artist-exclusive": { from: "#eab308", to: "#a16207" },
  /** Rock Experience — vermelho quente */
  "genre-rock": { from: "#ef4444", to: "#991b1b" },
  /** Jazz Smooth — azul (≈ gradiente original da marca) */
  "genre-jazz": { from: "#3b82f6", to: "#1e3a8a" },
  red: { from: "#ff5c5c", to: "#cc0000" },
  blue: { from: "#4d94ff", to: "#1e3a8a" },
  purple: { from: "#a855f7", to: "#5b21b6" },
  green: { from: "#2dd47c", to: "#158a4d" },
  orange: { from: "#fb8c2f", to: "#c2410c" },
  pink: { from: "#f061b5", to: "#be185d" },
};

/** Par {from,to} da estrela para um `colorTheme` — cai no tema base do app
 *  ("default", verde escuro) se o id for desconhecido, ecoando o mesmo
 *  comportamento do CSS (`--primary` raiz), que não conhece `data-theme`
 *  inválidos. */
export function logoColorsForTheme(colorTheme?: string): { from: string; to: string } {
  return LOGO_THEME_COLORS[colorTheme ?? ""] ?? LOGO_THEME_COLORS.default;
}
