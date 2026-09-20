import { hdThumbnail } from "@/lib/utils";

interface PausedVideoPosterProps {
  /** Capa/thumbnail da faixa (poster exibido enquanto pausado) */
  cover?: string;
  /** z-index: acima do iframe e das máscaras, abaixo do tap catcher/controles */
  zIndexClass?: string;
}

/**
 * POSTER DO ESTADO PAUSADO (v8, 2026-09-20 — solução definitiva do bezel):
 * O YouTube desenha um bezel de pausa (círculo + duas barras ⏸) DENTRO do
 * iframe (cross-origin). Em alguns devices ele CONGELA na camada pintada e
 * sobrevive a micro-seeks (seekTo), transforms e até ao reflow — nada do lado
 * de fora do iframe consegue garantidamente apagá-lo.
 *
 * Solução: enquanto a superfície está PAUSADA ou travada, cobrimos a área do
 * vídeo com o POSTER (thumbnail da própria faixa) — um elemento 100% nosso.
 * O bezel não pode aparecer onde o iframe não está visível. Ao retomar
 * (play), o poster sai instantaneamente e o vídeo ao vivo volta.
 *
 * Regras:
 *  - Só quando pausado/travado (!isPlaying || videoSurfaceIdle).
 *  - Nunca: tocando (vídeo ao vivo), buffering (spinner do YT), finalizado
 *    (capa opaca própria), vídeo nativo/offline (sem bezel).
 *  - pointer-events-none: toques seguem para o tap catcher (revelar
 *    controles), e o transporte central/rodapé ficam por cima.
 */
const PausedVideoPoster = ({
  cover,
  zIndexClass = "z-[209]",
}: PausedVideoPosterProps) => (
  <div
    data-paused-poster
    aria-hidden
    className={`absolute inset-0 ${zIndexClass} pointer-events-none bg-black animate-in fade-in duration-150`}
  >
    {cover ? (
      <img
        src={hdThumbnail(cover)}
        alt=""
        draggable={false}
        className="w-full h-full object-cover"
      />
    ) : null}
  </div>
);

export default PausedVideoPoster;
