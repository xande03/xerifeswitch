# Status do Xerife Music

Atualizado em 2026-09-24 (10ª revisão). **Todos os itens abaixo foram medidos neste checkout**, não
copiados de relatórios de sessão (o histórico de `*_FINAL.md` / `*_CONCLUIDO.md` da raiz
ficou em [`docs/history/`](docs/history/) e contém afirmações vencidas).

## Sessão 2026-09-24 (3) — "no Netlify os controles nunca minimizam": interacting preso + cadeia de BUFFERING

Reporte: no localhost/preview os controles minimizam e a tela fica limpa; no deploy
Netlify (<https://xerifeswitch.netlify.app/>) **não minimizam totalmente** e o botão de
pause fica no centro. O bundle do Netlify foi conferido: é o código mais recente (marcadores
`flush pending load` / `data-center-glyph-cover` presentes). Reproduzido contra o próprio
deploy com Playwright — DUAS causas confirmadas, ambas corrigidas:

1. **`videoOverlayInteractingRef` travava em TRUE** (experimento `lab/repro-stuck.mjs`
   contra o deploy): qualquer `pointerdown` na barra inferior cujo `pointerup` não chega
   (evento comido, janela/unmount no meio do press) deixava TODO `revealVideoOverlay()`
   futuro retornar **sem armar o timer** — auto-hide morto até recarregar (ov=1 aos 12s,
   estava 0 antes do down; toggle manual ainda funcionava). Correção: **fail-safe**
   `INTERACTING_FAILSAFE_MS=2500` (`autoHideControls`) — durante a interação sticky
   instala listeners de `pointerup`/`pointercancel`/`pointermove`/`blur` **em nível de
   janela** + teto por inatividade; ao disparar limpa o flag e re-arma o hide normal.
   Pós-fix: mesmo cenário → ov=0 aos 12s ✓.
2. **Oscilações BUFFERING↔PLAYING re-armavam o lease em cadeia** (experimento
   `lab/repro-buffer.mjs`, rede 400kbps): cada `onStateChange` PLAYING/BUFFERING
   refreshava `glyphPaintAt` → efeito de re-reveal do Index re-armava `max(userMs, janela)`
   infinitamente enquanto a rede oscilava (12 amostras com ov>0.5 em 40s; com
   micro-buffering contínuo, nunca escondia). Correção: **split de stamps** — novo campo
   `actionGlyphPaintAt` no hook, renovado SÓ por ações (play/seek/load/correção do
   guard/troca de qualidade/pending-flush); `onStateChange` renova só `glyphPaintAt`
   (disco CenterGlyphCover continua cobrindo QUALQUER pintura). Lease e re-reveal dos
   controles agora usam `actionGlyphPaintAt`. Pós-fix: 6 bufferings em 40s → **ov=0 em
   100% das amostras** ✓; disco liga/desliga com as pinturas ✓.
   Observação: isto ajusta a regra anterior "qualquer pintura re-revela controles" —
   pinturas de SISTEMA (rede) renovam só a cobertura; ações do usuário renovam disco+lease.

Medido neste checkout: `npm run check` ✅ (typecheck + **117 testes**/20 arquivos + build +
e2e:anchor 16 combinações + smoke, exit 0). Validações A/B pós-fix nos `lab/repro-*.mjs`
com `TARGET=http://localhost:5173/`.

## Sessão 2026-09-24 (2) — "botão de pause ainda sobra": player morto no preview + seeks/stamps faltando

Reporte pós-fix: a minimização completa só acontecia uma vez; depois, com os controles
ocultos, **o botão de pause central continuava aparecendo** durante a reprodução; pausado,
tudo eschia. Reproduzido ao vivo com Playwright contra o dev server (sessão Xerife Vídeos +
`xerife:auto-play-video`):

1. **No preview (dev/StrictMode) o player do YouTube nascia MORTO**: o effect de criação
   rodava 2×; a 2ª construção partia do iframe deixado pela 1ª (alvo inválido) e
   `playerRef` ficava apontando para um player cujo `onReady` nunca dispara. A API atual
   só anexa `loadVideoById`/`playVideo` **na instância, no onReady** — então `loadVideo`
   era **descartado em silêncio** (nem state atualizava) e o vídeo nunca tocava. Correção
   em [`useYouTubePlayer`](src/hooks/useYouTubePlayer.ts): guarda "um player só" +
   recriação de div limpa se o slot virou iframe; **`destroy()` removido do cleanup**
   (mataria a sessão inteira no StrictMode/HMR); **fila `pendingLoadRef`**: `loadVideo`/
  `loadVideoAt` chamados antes do ready são aplicados no flush do `onReady` (antes perdidos).
2. **Eventos que pintam o glifo sem stamp de `glyphPaintAt`** (disco não cobria → "botão de
   pause fantasma" com controles já ocultos — encaixe exato no "só minimizou uma vez"):
   - **seek de correção do guard de sincronia** (`runClipSyncCheck` → `p.seekTo` direto;
     `windowMs` 6s + folga 2s > janela `GLYPH_COVER_MS` 6,5s do load ⇒ correções tardias
     caíam FORA da janela);
   - **re-seek de confirmação** do wrapper `seekTo` (+250ms);
   - **reload de troca de qualidade** (`loadVideoById` no trick da qualidade).
   Todos agora fazem `setState({ glyphPaintAt: Date.now() })`.
3. **Validação ao vivo (roteiro Playwright)**: `onReady` ✓, `[YT] Loading new video` ✓,
   `PLAYING` ✓; disc=1 + controles visíveis juntos até ~6s; somem **juntos** no fade
   (ov 1→0.54→0 com disc=0); **18 s seguidos de centro 100% limpo** (sem glifo/disco/botão);
   pausa revela controles e re-esconde em ~3,5 s; frames conferidos numericamente e
   visualmente (janela = 1 botão unificado; steady = vídeo limpo).

Medido neste checkout: `npm run check` ✅ (typecheck + **117 testes**/20 arquivos + build +
e2e:anchor 16 combinações + smoke, exit 0).

## Sessão 2026-09-24 — "dois botões de pause sobrepostos": causa raiz medida em lab + disco transitório + lease do auto-hide

Reporte com screenshot: dois botões de pause sobrepostos no centro do player (um atrás do
outro) e, após a minimização dos controles, "sobrava" um botão de pause no meio do vídeo.

1. **Causa raiz medida em LAB real** (novo `lab/` — embed `controls=0` +
   `pointer-events:none` via Playwright contra o YouTube ao vivo, screenshots 1 fps):
   - A cada **play/resume/seek/load** o embed pinta um indicador central (círculo
     translúcido + ⏸/▶, **~16% da largura do player**, centro ~5px acima do eixo) que some
     **SOZINHO em ~5 s** — mesmo **sem** eventos de pointer (a tese antiga de que o
     auto-hide "nunca dispara" valia para o overlay de PAUSA, não para o feedback de
     transição). `r01–r04` com glifo, `r05` limpo; idem `t01–t04`/`t05` no play inicial.
   - Overlay de **pausa** (▶) **não** some sem interação (p01–p15 idênticos) — mas isso
     já é coberto pelo `PausedVideoPoster`.
   - Com os controles visíveis, o glifo (~85px + offset) **sangrava ao redor** do nosso
     botão opaco de 88/96px = DOIS botões. Com os controles ocultos (auto-hide 3,5 s <
     glifo ~5 s), o glifo **sozava** por ~1,5 s = "botão de pause apenas".
2. **Correção**:
   - **`glyphPaintAt`** no [`useYouTubePlayer`](src/hooks/useYouTubePlayer.ts): timestamp de
     toda transição que pinta o glifo (eventos PLAYING/BUFFERING, `play()`, `seekTo()`,
     `loadVideo`/`loadVideoAt` — inclusive seeks mid-playing da troca de clipe, que NÃO
     mudam `isPlaying` e por isso não re-armavam nada antes).
   - **`CenterGlyphCover`** (novo componente): disco opaco `#161616` **transitório**
     (26% da largura, min 112px/max 240px, `aspect-square`, inerte) — cobre o glifo por
     construção durante a janela. **SEM blur** (a lente fosca permanente segue banida pelo
     v10): ele só existe durante a janela e some junto com o glifo. No inline vive em
     z-[209] (mútuo exclusivo com o poster); no fullscreen em z-[204] via prop
     `glyphCover`.
   - **Lease do auto-hide** ([`autoHideControls`](src/lib/autoHideControls.ts)
     `autoHideDelayMs`): delay = `max(segundosDeterminados, fimDaJanela(GLYPH_COVER_MS=6500))`
     — controles e disco **somem juntos**; nunca sobra glifo nem disco. Toque no vídeo
     durante a janela também respeita o piso da janela; disco NÃO depende do estado dos
     controles (mesmo forcando o hide, o disco cobre até o glifo sumir).
   - Efeito em `glyphPaintAt` no Index: seeks programáticos mid-playing re-armam controles
     (a troca de clipe volta a mostrar transporte junto com a pintura).
3. **Cobertura validada no lab** (fase5): anel a 55px do centro = `#161616` com disco
   (glifo totalmente coberto, raio do disco ~69px > extensão máxima do glifo ~55px);
   após 6500 ms centro = conteúdo do vídeo (limpo). Um único botão unificado
   (disco+botão fundidos, mesma cor) durante a janela.
4. **Nada muda fora da janela**: steady-state de reprodução sem transições = centro 100%
   limpo, sem elemento algum (invariante v10 preservado — `center-video-fully-visible`
   continua verde com `glyphCover` default false).

Medido neste checkout após as mudanças: `npm run check` ✅ (typecheck + **117 testes** em
20 arquivos + build + e2e:anchor 16 combinações + smoke).

## Sessão 2026-09-23 (2) — auto-hide definitivo dos controles do player de vídeo (fim do keepOpen-pausado)

Pedido: **TODOS os controles/botões de reprodução do player de vídeo minimizarem após os
segundos determinados, em qualquer estado, para a tela ficar limpa.**

1. **Causa raiz**: o overlay inline do [`Index.tsx`](src/pages/Index.tsx) mantinha
   `keepOpen = expanded && playerMode === "video" && !isPlaying` — **pausado, os controles
   ficavam visíveis para sempre** (barra inferior, transporte central, voltar, QualityBadge,
   gradiente). Tocando já escondia (timer 4 s), mas pausado nunca. O fullscreen
   ([`FullscreenOverlay`](src/components/FullscreenOverlay.tsx)) já se comportava certo
   (auto-hide SEMPRE arma — coberto por `fullscreen-center-sync.test.tsx`).
2. **Correção — `keepOpen` removido**: o efeito de overlay agora chama `revealVideoOverlay()`
   em QUALQUER transição de `isPlaying`/abertura do painel → o timer **sempre arma**, tocando
   ou pausado. Ao terminar o delay, todos os controles minimizam **JUNTOS**
   (opacity-0 + pointer-events-none). O toque na superfície continua fazendo toggle e rearma.
   Pausado oculto = tela limpa com o **poster** (`PausedVideoPoster`) cobrindo o bezel do
   YouTube — sem chrome.
3. **Fonte única dos segundos determinados**: novo
   [`src/lib/autoHideControls.ts`](src/lib/autoHideControls.ts) (`AUTOHIDE_OPTS`
   2000/3500/5000/8000 ms, default **3500**, localStorage `demus-fs-autohide-ms`) — o overlay
   inline deixou de usar 4000 ms hardcoded e passa a ler o MESMO valor do fullscreen
   (as duas superfícies agora sincronizadas). Coberto pelo novo
   `src/test/auto-hide-controls.test.ts` (4 testes).
4. **Sem risco do bug antigo do Netlify** ("botão de pause sempre ativo"): no
   [`useYouTubePlayer`](src/hooks/useYouTubePlayer.ts) `isPlaying = playing || buffering`,
   então oscilações BUFFERING↔PLAYING não re-executam o efeito nem limpam o timer — só
   transições reais de play/pause/fim revelam de novo.

Medido neste checkout após as mudanças: `npm run check` ✅ (typecheck + **106 testes** em
19 arquivos + build + e2e:anchor 16 combinações + smoke).

## Sessão 2026-09-18 (2) — causa raiz do branding do YouTube encontrado e corrigido (slot interno)

O masking anunciado nas sessões anteriores **nunca chegou a ser aplicado**. Causa raiz
comprovada no código-fonte real da API (`www-widgetapi.js`):

1. **`new YT.Player(id)` SUBSTITUI o elemento alvo pelo `<iframe>`**
   (`parentNode.replaceChild(iframe, alvo)`, copiando os atributos — inclusive o `id`).
   O alvo era a própria caixa estilizada `#yt-player`, que virava o iframe; o seletor
   CSS `#yt-player iframe` (descendente) **não casava com nada** e todo o esquema de
   faixas (±64/72px) era geometria morta. O React continuava atualizando o div
   desanexado, mascarando o bug.
2. **Correção — slot interno como alvo** (`Index.tsx`): `#yt-player` volta a ser a
   caixa 16:9 estável (`overflow: hidden`) e um slot vazio `#yt-player-slot` dentro
   dela é quem vai para `useYouTubePlayer("yt-player-slot")`. DOM pós-init:
   `#yt-player > iframe#yt-player-slot` — StrictMode seguro (o `destroy()` da API
   devolve o slot ao lugar).
3. **Máscara por overflow finalmente ativa** (`index.css`): `#yt-player > #yt-player-slot,
   #yt-player > iframe` nasce **240px mais alto e sobe 120px** — faixas internas de
   chrome (título/avatar no topo; share/"Mais vídeos"/logo na base) ficam FORA do
   retângulo visível permanentemente, antes/durante/pausado/finalizado, sem timers.
   O vídeo (16:9 centralizado no iframe) ocupa exatamente a caixa visível: zero zoom,
   zero corte. **`pointer-events: none` no iframe** — nenhum toque chega ao YouTube;
   100% dos comandos passam pelos controles do Xerife (JS API).
4. **Fullscreen do YouTube desativado de vez**: `fs: 0` nos playerVars; a API força
   `allowfullscreen=""` na criação e o `onReady` antigo RE-ADICIONAVA — agora remove o
   atributo e apaga o token `fullscreen` do `allow`. Tela cheia é exclusivamente do
   `#yt-fullscreen-container` do app (nativa ou pseudo). A regra CSS que resetava o
   iframe para `inset:0/100%` em fullscreen (desmascarava na pausa) foi removida;
   máscara vale também em tela cheia.
5. **PiP flutuante** (`FloatingPiPPlayer`) alinhado à mesma geometria (±120px).
6. **Validado no Chromium com reprodução real do YouTube** (o bloqueio de rede não
   se aplica ao player): DOM pós-init confirmado (`iframe` dentro da caixa, id
   `yt-player-slot`, `allowfullscreen` ausente, `allow` sem `fullscreen`); rail
   830×467 (16:9 exato) com iframe 707px = caixa+240 e offset −120px; fullscreen
   800×450 (16:9 exato) com mesma geometria; `pointer-events: none` computado;
   elemento no centro do vídeo é a UI do app (não o iframe). Ponto 2 (ilha):
   pílula fora do DOM com painel de reprodução aberto (música e vídeo) e de volta
   ao navegar para outro painel/módulo — reconfirmado.

Medido neste checkout após as mudanças: `npm run typecheck` ✅, `npm run test`
**89 testes** ✅, `npm run build` ✅.

## Sessão 2026-09-18 — player de vídeo 100% limpo + ilha do player oculta durante reprodução

1. **Só existem os controles do Xerife no player de vídeo** (voltar ao painel,
   prev/play/next, seekbar, CC, tela cheia, PiP, trocar clipe). O que faltava foi
   eliminado nesta sessão:
   - **Legendas desligadas por padrão** — `loadCaptionsPref` retornava `true` sem
     preferência salva: todo vídeo nascia legendado. Agora o default é OFF; quem
     quiser liga pelo botão CC (a escolha persiste em `demus_captions_enabled`).
   - **Legendas re-forçadas a cada troca de vídeo** (`loadVideo`/`loadVideoAt`,
     imediato + timeout 1,2 s): o YouTube reseta os módulos `captions`/`cc` do
     player no load — sem isso elas "renasciam" mesmo desligadas. playerVars
     ganharam `cc_lang_pref: "pt"` + `hl: "pt-BR"` (CC ligado vem em português).
   - **Botão play vermelho central do embed mascarado**: pausado/finalizado/pré-play
     o YouTube desenha o botão play no CENTRO do iframe — o overflow masking
     (±72px) só cobre topo/base. Disco preto opaco permanente (z-212,
     `pointer-events-none`) no player principal e no fullscreen; em reprodução a
     máscara sai e o vídeo fica 100% limpo. No fullscreen, o disco ganha o botão
     play do app por cima (alvo grande de reprodução).
   - **PiP nativo (Document PiP) sem controles do YouTube**: `controls=1` → `0`,
     `loop=1&playlist=<id>` (endscreen nunca chega) e iframe `pointer-events:none`.
     O PiP flutuante (`FloatingPiPPlayer`) também ganhou `loop` — o preview reinicia
     em vez de mostrar "Mais vídeos".
2. **Ilha do player (pílula desktop) oculta ao reproduzir**: `DesktopPlayerIsland`
   agora renderiza somente com `!expanded` (antes só saía de cena no modo vídeo).
   Ao clicar em uma música ou vídeo, o painel cheio assume e a pílula não flutua
   mais POR CIMA do `NowPlayingView` (`z-80 > z-50`) duplicando o transporte. Ela
   volta automaticamente quando o usuário vai para outro painel ou módulo (voltar,
   artista/canal, biblioteca, trocar módulo, PiP) — todos esses caminhos fecham o
   painel (`expanded=false`).
3. **Validado no Chromium** (1440×900): pílula sai do DOM ao expandir o painel de
   música e volta ao recolher; página de vídeo abre sem pílula e com a máscara
   central no DOM; botão CC presente e desligado por padrão. (Observação: a rede do
   ambiente bloqueia YouTube/Invidious — reprodução real medida apenas pelos
   checks abaixo.)

Medido neste checkout após as mudanças: `npm run typecheck` ✅, `npm run test`
**89 testes** ✅, `npm run build` ✅, `npm run e2e:anchor` ✅ (16 combinações),
`npm run smoke` ✅. Commit `7622c19`.

## Sessão 2026-09-17 — desktop sem sidebar: ilha dinâmica no topo + player flutuante

Layout desktop (≥lg/1024) redesenhado conforme o preview aprovado:

1. **A sidebar lateral sai de cena em lg+** (`hidden md:flex lg:hidden` no
   [`DesktopSidebar`](src/components/DesktopSidebar.tsx)) — entre 768 e 1023px ela
   continua exatamente como antes (rail/mini-rail). Mobile/tablet (<md) intocado.
2. **Ilha dinâmica** ([`DesktopTopIsland`](src/components/DesktopTopIsland.tsx)) no
   centro do header do topo (`hidden lg:flex`): pílula `bg-card/90 backdrop-blur`
   com **o trio de módulos nas suas cores** (Music verde / Vídeos vermelho /
   Podcast roxo — ícone sempre, label no ativo em xl), divisor e **as mesmas
   sessões de antes** (Início, Buscar, Favoritas, Biblioteca, Histórico, Playlists)
   com badge de curtidos preservado; rótulo completo no item ativo e em todos os
   itens a partir de `xl`. Usa as mesmas fontes de dados (`musicTabs/videoTabs/
   podcastTabs` exportadas da sidebar) e os mesmos handlers do app
   (`handleNavChange`, `handleSwitch`) — **nenhum conteúdo foi removido**.
3. **Player reposicionado**: o painel que morava na base da sidebar (capa/thumb,
   transporte, liker/cifra/vídeo/download/share, barra de progresso) agora flutua
   numa **cápsula centralizada na base** (`fixed bottom-4`, w-320px, card blur,
   z-[80]) em lg+. O JSX do player foi extraído para consts
   (`sidebarPlayerExpandedNode/sidebarPlayerCollapsedNode`) e é reusado nos dois
   lugares sem duplicar lógica. O conteúdo ganha `lg:pb=[400px]` de clearance
   para a cápsula não cobrir o fim das listas.
4. **Also nesta sessão** (commits anteriores do dia): transição de módulo com
   wipe + anéis/partículas em parallax no `ModuleSwitcher`, mascaramento
   permanente fail-closed do branding do iframe do YouTube no player, correções
   de comentários (tradução pt-BR, datas), overlay do player oculto por padrão.

Medido neste checkout após as mudanças: `npm run typecheck` ✅, `npm run test`
**89 testes** ✅, `npm run build` ✅.

## Sessão 2026-09-16 (noite) — comentários em pt-BR e overlay minimizado no player

1. **Painel de comentários do Xerife Videos em português** (edge `youtube-video-info`):
   - **Datas em pt-BR:** o texto relativo do Invidious chegava **no locale da instância**
     (observado: árabe no inv.nadeko.net — a URL `/api/v1/comments` não honra `hl`).
     A função agora usa o epoch determinístico `published` →
     [`supabase/functions/_shared/ptbrRelative.ts`](supabase/functions/_shared/ptbrRelative.ts)
     (`formatRelativePtBR`, coberto por `src/test/ptbr-relative.test.ts`). No caminho innertube
     (quando o `/next` responde), o `hl: "pt"` do contexto já entrega pt-BR.
   - **Tradução automática para pt-BR:** novo `translateTextsPtBR` (MyMemory, endpoint público
     amigável a datacenter — o `gtx` do Google Tradutor devolve "Sorry" para bot). Concorrência
     4, timeout 4 s, falha mantém o original. Quando traduz, o comentário carrega
     `originalContent` + `lang`; a UI mostra o toggle **"Ver original · traduzido
     automaticamente / Ver tradução"** (`CommentBody` em
     [`src/components/VideoComments.tsx`](src/components/VideoComments.tsx)).
   - **Mais comentários:** 2 páginas em ambos os caminhos (Invidious `continuation` e
     continuation-token do engagement panel do `/next`) → **40 comentários** por vídeo.
   - **Bonus:** entities HTML do `contentHtml` decodificadas ANTES de traduzir (`&#39;` → `'`).
   - **Medido ao vivo pós-deploy** (`?videoId=dQw4w9WgXcQ&debug=1`): 15 related (via
     approx-search, pois o `/next` deu 403 no nó), **40 comments, translatedCount: 40**,
     datas "há 1 ano"/"há 4 semanas", zero entities pendentes, `translateMs` ≈ 6 s na 1ª carga
     (cache de 15 min absorve as demais).
2. **Overlay do player começa oculto e só toggle por toque** ([`src/pages/Index.tsx`](src/pages/Index.tsx)):
   - Efeito único por `[isPlaying, expanded, playerMode]`: pausado/pré-play/finalizado →
     controles visíveis (play/seek/tempo); **tocando → ocultos** (antes abria visível por 4 s
     e ainda re-exibia por 4 s ao retomar após pausa).
   - Toque em qualquer área do player = toggle (tap catcher). **Guarda anti-duplicado**
     (`videoOverlayTapGuardRef`): dois toques < 300 ms contam como um — fim do esconde/mostra
     fantasma em toque acidental.
3. **CI:** medido `Deploy Edge Functions` success (runs 35110019754 attempt 2 — a attempt 1
   falhou em `supabase/setup-cli` por erro transitório do GitHub Actions, re-run resolveu —
   e 35111062938). Função `youtube-video-info` versão nova ao vivo confirmada via
   Management API (`updated_at` = hora do deploy).

## Sessão 2026-09-16 — três features entregues

Medido neste checkout após as mudanças: `npm run check` ✅ (typecheck + **83 testes** em
13 arquivos + build + e2e:anchor + smoke).

1. **Letras junto das cifras** — o `ChordsSheet` ("Cifra e letra", aberto do player ou do
   menu ⋯ do card) agora tem abas **Cifra | Letra**. A aba Letra
   ([`src/components/LyricsPanel.tsx`](src/components/LyricsPanel.tsx)) reusa o pipeline já
   existente (`fetchLyrics` → Edge Function `fetch-lyrics` → LRCLIB → fallbacks) e, quando
   aberta a partir do player, destaca a linha atual com auto-scroll (letra sincronizada).
2. **Estatísticas de escuta (estilo "Wrapped")** — tile "Estatísticas" na Biblioteca.
   [`src/lib/listeningStats.ts`](src/lib/listeningStats.ts) agrega segundos por faixa/artista
   por dia (localStorage, poda >400 dias); [`src/hooks/useListeningTracker.ts`](src/hooks/useListeningTracker.ts)
   conta só reprodução real (delta ≤2,5 s tocando — seek e pausa não contam), com flush a
   cada 15 s, na troca de faixa e ao esconder a página. Tela
   [`src/components/ListeningStatsScreen.tsx`](src/components/ListeningStatsScreen.tsx) com
   períodos (Hoje/7d/30d/Sempre), módulos (Músicas/Vídeos/Podcasts), top faixas (clique toca)
   e top artistas. Coberto por `src/test/listening-stats.test.ts` (9 testes).
3. **Importar playlist do YouTube** — botão "Importar" em Minhas Playlists
   ([`src/components/ImportPlaylistDialog.tsx`](src/components/ImportPlaylistDialog.tsx)):
   cola o link, pré-visualiza e salva em `demus_playlists` (localStorage). Cliente em
   [`src/lib/youtubePlaylist.ts`](src/lib/youtubePlaylist.ts). **Atenção ao deploy**:
   a função dedicada [`supabase/functions/youtube-playlist/`](supabase/functions/youtube-playlist/index.ts)
   é **nova, ainda não deployada** (bloqueio do secret — item 2 abaixo). Até lá o cliente cai
   no fallback `youtube-album-tracks?browseId=VL<id>`, que funciona para conteúdo do YouTube
   Music (medido ao vivo: playlists só do youtube.com retornam vazio pelo caminho antigo).
   O parser da função nova foi validado contra o YouTube real: itens hoje vêm
   como `lockupViewModel` (a mesma migração que quebrou `relatedVideos`), e a coleta +
   paginação retornaram 200 faixas em 2 requisições numa playlist pública real.
   **UPDATE (mesmo dia, pós-deploy):** `youtube-playlist` está no ar — medido ao vivo pós-deploy:
   `POST {playlistId: "PL0ao6…", maxPages: 3}` → título "Samba e Pagode 2026…", 200 faixas
   com duração/artista/capa via parser `web`.

## Sessão 2026-09-16 (tarde) — deploy destravado e relatedVideos no ar

1. **CI de deploy consertado**: secret `SUPABASE_ACCESS_TOKEN` criado no repositório e o
   workflow ganhou `workflow_dispatch` (deploy manual pela UI/API do GitHub). As três runs
   desta sessão terminaram em `success`. Todas as 11 funções do repo estão deployadas
   (confirmado via Management API: 12 funções ativas no projeto, incl. `youtube-playlist`).
2. **Causa raiz real do `relatedVideos: 0` descoberta** (só aparecia no runtime, nunca no
   sandbox): o YouTube devolve **HTTP 403 "Sorry…"** para o endpoint `/youtubei/v1/next`
   quando a chamada sai de **IP de datacenter** (Supabase Edge), enquanto `/search` e
   `/browse` respondem normalmente da mesma rede — por isso `youtube-general-search`/
   `youtube-playlist` funcionavam e o `/next` não. Diagnóstico feito com a flag `?debug=1`
   adicionada à `youtube-video-info` (bypassa o cache e devolve `__debug` com o que o
   runtime vê).
3. **Defesa em dois níveis** deployada e medida ao vivo: (a) mantido o `/next` com parser
   `lockupViewModel` — passa quando o nó de saída tem reputação boa; (b) **NOVO fallback**
   `approxRelatedFromSearch`: oEmbed público (artista+título) → `youtubei /search` →
   `parseVideoItemsList`, excluindo o próprio vídeo. Resultado medido ao vivo pós-deploy:
   **15 relacionadas + 20 comentários** para `dQw4w9WgXcQ`, `9bZkp7q19f0` e `JGwWNGJdvx8`;
   `npm run verify:edge` → **🎉 TODAS AS VERIFICAÇÕES PASSARAM** (incl. youtube-video-info
   com relatedVideos ≥ 1). Observação: a instância Invidious `inv.nadeko.net` voltou ao ar
   e hoje serve comentários (caminho parcial do Invidious ativo).
4. `parseVideoItemsList` agora ignora lockups de canal/playlist (`contentType` ≠ VIDEO),
   evitando falsos positivos quando o parser roda sobre resultados de **busca**.

## Verificações

| Checagem | Comando | Resultado |
|---|---|---|
| Tipos | `npm run typecheck` | ✅ limpo |
| Testes unitários | `npm run test` | ✅ 83/83 em 13 arquivos |
| Build de produção | `npm run build` | ✅ sem avisos de ciclo |
| E2E de layout do anchor | `npm run e2e:anchor` | ✅ 16 combinações (4 ramagens × 4 breakpoints × rotação), contra o CSS real do build |
| Smoke do bundle | `npm run smoke` | ✅ mount + deep-link + dedupe de chunks |
| Tudo acima em sequência | `npm run check` | ✅ |
| Backend no ar | `curl /functions/v1/youtube-trending` | ✅ HTTP 200 com catálogo do dia |
| Lint | `npm run lint` | ❌ 99 erros **pré-existentes** (`no-explicit-any`, `no-empty`) em legado do Lovable; por isso está fora do `check` |

## Bundle

`1 chunk → 2 chunks + 9 async`:

- antes: `index.js` 1.354 kB (388 kB gzip)
- depois: `index.js` 431 kB (120 kB gzip) + `vendor.js` 769 kB (230 kB gzip); os chunks
  das telas adiadas (≈173 kB) são baixados em `requestIdleCallback`
  ([`src/lib/deferredScreens.ts`](src/lib/deferredScreens.ts))

## Deploy

- **Supabase** (`hvslfbcsokurljstmtip`): projeto **ATIVO**. As 10 Edge Functions do repo
  existem no domínio; `scripts/verify-edge-functions.js` (`npm run verify:edge`) confirma
  `youtube-general-search` (inclusive `sort=date`), `youtube-search` e `youtube-video-info`
  respondendo 200 com dados reais.
- **Lovable (web)**: o projeto foi **despublicado**. `xerifehub.lovable.app` e
  `e2889fd9-….lovableproject.com` respondem `404 Project not found`. Por isso o
  `canonical` foi removido de `index.html` e o `server.url` foi removido de
  `capacitor.config.ts` — o shell nativo agora serve `dist/` local (antes abria a página de
  erro da Lovable).
- **CI de deploy das functions**: ✅ **funcionando**. `SUPABASE_ACCESS_TOKEN` configurado
  como secret do repositório (2026-09-16); o workflow também aceita `workflow_dispatch`
  (deploy manual) e dispara ao mexer no próprio yml. Runs desta sessão: 3× `success`.

## Bugs conhecidos (todos confirmados por medição; estado de cada um indicado)

1. **`relatedVideos` sempre vazio → autoplay de relacionada quebrado.** ✅ **RESOLVIDO EM
   PRODUÇÃO** (2026-09-16). Duas causas empilhadas: (a) `youtube-video-info` lia só
   `compactVideoRenderer` e o YouTube entrega `lockupViewModel` (parser em
   [`supabase/functions/_shared/innertubeRelated.ts`](supabase/functions/_shared/innertubeRelated.ts),
   coberto por `src/test/innertube-related.test.ts` com payload real); (b) o YouTube dá
   **403 "Sorry" no `/next` para IPs de datacenter** — mitigado com o fallback
   oEmbed→`/search` (ver seção da sessão). Medido ao vivo: 15 relacionadas + 20 comentários
   em 3 vídeos; `verify:edge` verde.
2. **`ai-chat` existe na nuvem, não no repo** — está deployada e responde 200, mas não há
   `supabase/functions/ai-chat/`. Está fora do versionamento e do deploy automático
   (nenhum código em `src/` a invoca hoje). **Atenção**: o próximo deploy em massa do CI
   não a remove (o supabase só publica o que está no repo), mas ela segue sem backup
   versionado — vale trazer o código da nuvem para o repo quando alguém for mexer nela.
3. **Descrições de vídeo ainda podem vir vazias** (`description: ""` medido em
   `dQw4w9WgXcQ`): a fonte primária (`/next` e `/player`) sofre o mesmo bloqueio 403 de
   datacenter. Impacto baixo (descrição só é exibida em podcasts; a UI tem fallback) — por
   isso ficou sem mitigação nesta sessão.
4. Falso negativo corrigido no verificador: `youtube-search`/`youtube-video-info` eram
   chamados com parâmetro **no corpo**, e as funções lêem da **query string** — o que
   produzia `200 OK` para uma chamada vaziosa (verde mentiroso) e `400` para o caso certo.
   Agora o script manda query string e só considera OK se a lista vier com itens.

 

## Como trabalhar aqui

```bash
npm ci
npm run dev            # vite em :8080
npm run check          # typecheck + testes + build + e2e + smoke
npm run verify:edge    # sonda as Edge Functions em produção
npm run cap:sync       # build + npx cap sync (iOS/Android servem dist/)
scripts/push-main.sh "mensagem"  # commit + push direto na main (helper da sessão)
```

Guias mantidos na raiz: [`COMANDOS_RAPIDOS.md`](COMANDOS_RAPIDOS.md),
[`COMO_EXECUTAR_APP.md`](COMO_EXECUTAR_APP.md), [`COMO_TESTAR_NO_IOS.md`](COMO_TESTAR_NO_IOS.md),
[`DEPLOY_SETUP.md`](DEPLOY_SETUP.md), [`SUPABASE_HEARTBEAT_SETUP.md`](SUPABASE_HEARTBEAT_SETUP.md),
[`GUIA_EDGE_FUNCTIONS_OTIMIZADAS.md`](GUIA_EDGE_FUNCTIONS_OTIMIZADAS.md),
[`SOLUCAO_PROXY_AUDIO.md`](SOLUCAO_PROXY_AUDIO.md), [`QUICK_REFERENCE.md`](QUICK_REFERENCE.md).
