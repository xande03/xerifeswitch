import { hdThumbnail } from "@/lib/utils";

interface PausedCoverDiscProps {
  /** Capa do álbum / thumbnail do vídeo */
  cover?: string;
  /** Altura do disco (classe tailwind) — default 112px / 128px no sm+ */
  sizeClass?: string;
  /** z-index da camada (acima do iframe, abaixo dos controles do app) */
  zIndexClass?: string;
}

/**
 * DISCO DE CAPA DO ESTADO PAUSADO (regra v5, 2026-09-19 — escolha do usuário):
 * O YouTube desenha um "bezel" de pausa (círculo + duas barras ⏸) DENTRO do
 * iframe (cross-origin — impossível remover por DOM/CSS, e em navegadores
 * mobile reais ele congela na tela mesmo após os micro-seeks de repaint).
 * Última alternativa acordada: um disco DISCRETO com a capa/thumbnail cobre
 * o centro APENAS enquanto a superfície está pausada/travada — e some no
 * instante em que a reprodução retoma (junto com os controles).
 *
 * Regras:
 *  - NUNCA aparece enquanto o vídeo está tocando de verdade (centro limpo).
 *  - pointer-events-none: nenhum toque é capturado; o tap catcher por baixo
 *    continua mandando (mostrar/ocultar controles).
 *  - Sem ícones/botões — só a capa, anel sutil e sombra (discreto).
 */
const PausedCoverDisc = ({
  cover,
  sizeClass = "w-28 h-28 sm:w-32 sm:h-32",
  zIndexClass = "z-[212]",
}: PausedCoverDiscProps) => (
  <div
    data-paused-cover-disc
    aria-hidden
    className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none ${zIndexClass}`}
  >
    <div
      className={`${sizeClass} rounded-full overflow-hidden ring-1 ring-white/25 shadow-2xl shadow-black/70 bg-black/50 animate-in fade-in zoom-in-95 duration-200`}
    >
      {cover ? (
        <img src={hdThumbnail(cover)} alt="" className="w-full h-full object-cover opacity-95" draggable={false} />
      ) : null}
    </div>
  </div>
);

export default PausedCoverDisc;
