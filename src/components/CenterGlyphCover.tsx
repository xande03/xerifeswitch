/**
 * DISCO DE COBERTURA DO GLIFO CENTRAL (v11, 2026-09-24 — "dois botões de
 * pause sobrepostos", retorno do report com screenshot):
 *
 * Medido em lab real (embed controls=0 + pointer-events:none): a cada
 * play/resume/seek o YouTube pinta um indicador central (círculo translúcido
 * + glifo ⏸/▶, ~16% da largura do player, centro ~5px acima do eixo) que
 * some SOZINHO em ~5 s, mas DURANTE essa janela:
 *  - com os controles visíveis, sangrava AO REDOR do nosso botão opaco de
 *    88/96px (glifo maior + offset) = DOIS botões de pause sobrepostos;
 *  - depois do auto-hide dos controles, SOZAVA como "botão de pause" fantasma
 *    no meio do vídeo limpo.
 *
 * Solução: disco opaco #161616 (mesma linguagem do nosso botão central),
 * sem ícone, SEM blur (a lente fosca permanente foi rejeitada — este disco é
 * TRANSITÓRIO: só existe durante a janela do glifo e some junto com ele).
 *  - 26% da largura do player (cobre ~16% + offset com folga), com min/max
 *    para players pequenos/grandes.
 *  - pointer-events-none + aria-hidden: inerte; os toques seguem para o
 *    tap-catcher (z-210).
 *  - z-[209] no overlay inline (mesma faixa do PausedVideoPoster — os dois
 *    estados são mutuamente exclusivos: pausado = poster, janela de glifo =
 *    disco); z-[204] no fullscreen.
 */
const CenterGlyphCover = ({
  zIndexClass = "z-[209]",
}: {
  zIndexClass?: string;
}) => (
  <div
    data-center-glyph-cover
    aria-hidden
    className={`absolute left-1/2 top-1/2 ${zIndexClass} w-[26%] min-w-[112px] max-w-[240px] aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#161616] ring-1 ring-white/10 shadow-[0_10px_36px_rgba(0,0,0,0.5)] pointer-events-none`}
  />
);

export default CenterGlyphCover;
