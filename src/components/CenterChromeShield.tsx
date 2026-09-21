/**
 * ESCUDO DO CHROME CENTRAL DO YOUTUBE (v9, 2026-09-21 — "dois botões de pause
 * sobrepostos"): mesmo com controls=0, o embed do YouTube pinta um indicador
 * central de play/pause (círculo escuro translúcido + glifo branco) DENTRO do
 * iframe a cada transição de estado (play, pausa, seek, recuperação de stall).
 * Como o tap-catcher do app impede que qualquer evento de pointer chegue ao
 * iframe, o auto-hide interno do YouTube nunca dispara e o indicador CONGELA
 * visível — o "segundo botão" que aparecia sobreposto ao transporte central
 * do app (nosso botão é bg translúcido: o glifo congelado sangrava através).
 *
 * Cross-origin: NADA dentro do iframe pode ser apagado por DOM/CSS e nenhuma
 * API oficial esconde esse indicador — as únicas "soluções" por API (micro-
 * seeks, hard-reset, mute/unmute) REPAINTAM o chrome e CORTAM o áudio
 * (exatamente o que os commits 270c087/91ed891 removeram).
 *
 * Solução: lente de vidro fosco PERMANENTE durante a reprodução real,
 * centrada no mesmo eixo do transporte central, com raio maior que o
 * indicador do YT + offset de geometria entre iframe e container:
 *  - backdrop-blur-2xl (40px) dissolve o glifo de ~23px num brilho ambiente
 *    imperceptível; o tint bg-black/25 + ring suave fazem a lente parecer
 *    intencional (vidro), nunca um "botão fantasma".
 *  - SEM glifo/botão nosso dentro: o centro continua limpo (Regra de Ouro).
 *  - pointer-events-none: toques seguem para o tap-catcher (revelar controles).
 *  - Só existe quando a superfície YT está de fato visível reproduzindo/
 *    buffering: pausado/travado = PausedVideoPoster cobre tudo; vídeo
 *    nativo (Piped) = sem chrome do YT, sem lente; fim = capa opaca.
 *  - z-index configurável: z-[208] no overlay do Index (abaixo do poster
 *    209 / tap-catcher 210), z-[204] no fullscreen (abaixo das barras).
 */
const CenterChromeShield = ({
  zIndexClass = "z-[208]",
}: {
  zIndexClass?: string;
}) => (
  <div
    data-center-chrome-shield
    aria-hidden
    className={`absolute left-1/2 top-1/2 ${zIndexClass} w-32 h-32 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/25 ring-1 ring-white/10 shadow-[0_0_60px_rgba(0,0,0,0.35)] backdrop-blur-2xl pointer-events-none transition-opacity duration-300`}
  />
);

export default CenterChromeShield;
