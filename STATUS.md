# Status do Xerife Music

Atualizado em 2026-10-03 (23ª revisão). **Todos os itens abaixo foram medidos neste checkout**, não
copiados de relatórios de sessão (o histórico de `*_FINAL.md` / `*_CONCLUIDO.md` da raiz
ficou em [`docs/history/`](docs/history/) e contém afirmações vencidas).

## Sessão 2026-10-03 (23ª) — logos DOS CANAIS reais e aparentes no Xerife Vídeos + OBS de pausa

OBS vinculante reafirmada: o projeto Supabase **pode ficar pausado livremente (a cada7
dias); só o usuário retira a pausa, manualmente** — nenhum mecanismo automático existe
ou será criado (já verificado: zero pulsos/heartbeats).

- **Problema**: cards do Xerife Vídeos mostravam a inicial do canal no lugar do logo.
  Causa: `youtube-trending` (fonte da seção "Em alta") retornava **0/30** com
  `channelThumbnail`; `general-search` (favoritos/busca) já retornava **10/10** ✓;
  a UI (VideoCard grid/lista/large) já sabia renderizar a imagem — faltava o dado.
- **Fix na edge `youtube-trending`**: extração de `channelId` (browseId UC do artista,
  nos runs do charts/fallback,30/30) + enriquecimento **paralelo (≤24, timeout5s)**
  via innertube WEB `browse` → `metadata.channelMetadataRenderer.avatar` (mesma
  técnica da general-search). Best-effort: falha = "" → UI usa inicial.
  **Resultado:27/30 com logo real, resposta1,4s (cache30min)**.
- **Client**: `VideoHomeScreen` passa `channelId` no mapeamento do trending;
  `Song` ganhou `channelThumbnail?` e o favoritar do `VideoInfoBar` prefere
  `song.channelThumbnail || song.cover` (logo real quando existe);
  favoritos via `ChannelProfile` já salvavam o avatar real.
- `check EXIT=0` (typecheck0, vitest74/74, build, e2e, SMOKE).

## Sessão 2026-10-02/03 (22ª) — NOVO PROJETO SUPABASE + fim de TODO pulso de egress

Pedido: "faça a importação e deixe sem pulso (egress)… NÃO QUERO que haja pulso de
envio; permitindo que o usuário retire a pausa do projeto do supabase manualmente."

- **Estado constatado**: o projeto antigo `fiohpfxftzcadkwkvzuz` está **FORA DO AR**
  (HTTP000; API dá404 — pausado/removido pelo usuário) → produção sem backend.
  Projeto novo: `weamuevzsndznanrjndb` (URL/key novas). PAT antigo ``~/.supabase-pat` (token fora do repo)…` perdeu
  acesso (lista `[]`; deploy =403 `edge_functions_read`) → usuário forneceu PAT novo
  (``~/.supabase-pat` (token fora do repo)`, gravado em `~/.supabase-pat` **600**).
- **Remoção total de pulsos (commit `cbd6c1d`)**: eliminados — poll de3min + focus/
  visibility do `useTrendingVideos`; poll horário do `useTrendingMusic`; poll de2min +
  focus/visibility do `useAutoRefreshChannel` (mantida só a carga no mount); auto-
  refresh do painel Canais do `ExploreScreen` (tick a cada90s com até12 buscas).
  Varredura final: **NENHUM `setInterval` com rede restante**; heartbeats = apenas
  localStorage (NÃO contam egress); `checkForNewBuild`/SW do `main.tsx` batem no
  **Netlify** (não Supabase) e permanecem. **Nunca existiu função `app_heartbeat`**
  (repo semelhante; lista de funções = só as11 feature).
- **Migração (11/11 funções)**: `fetch-lyrics`, `fetch-chords`, `youtube-video-info`,
  `youtube-search`, `youtube-general-search`, `youtube-album-tracks`,
  `youtube-artist-info`, `youtube-download`, `youtube-playlist`, `youtube-trending`,
  `podcast-search` → deploy todas para `weamuevzsndznanrjndb` (CLI `--project-ref`).
- **Config trocada**: `.env` (3 vars), `lib/backendConfig.ts` (fallbacks),
  `integrations/supabase/client.ts`, `supabase/config.toml`; zero `fiohpfx` em código
  (só história do STATUS). `check EXIT=0`.
- **Validação no projeto novo**: trending/search/general-search/podcast com resultados;
  chords `POST` = `source:ug` ✓; lyrics sincronizadas ✓; **video-info9,4s com
  related=15, comments=40 traduzidos para pt-BR** (campo `lang` = idioma ORIGINAL,
  conteúdo traduzido). Colab/tableaus e `myhealth`: vazios/infra do usuário, não Cloud.

## Sessão 2026-10-02 (21ª) — auditoria "sem furos": video-info era ineficaz (29s × aborto de15s) e comentários nunca chegavam

Pedido: "revise se está tudo em ordem, bem ajustado e em pleno funcionamento, sem furos".

- **Auditoria geral (tudo limpo)**:11 funções ACTIVE só no `fiohpfx…`; zero referências
  ao Alse (`wjtt…`/chave `rWBamy9F8`) e ao projeto antigo (`hcdqv`) em repo+bundle;
  PAT em `~/.supabase-pat` **chmod600** e fora do repo; senha do DB fora do repo;
  PostgREST/Storage/EuFunctions: chaves cruzadas recebem **401 nos dois sentidos**;
  DB (via Management API — o5432 é bloqueado no sandbox): PostgreSQL17.11, **0 tabelas
  em `public`**, 0 heartbeat/keepalive,0 usuários auth (login é local), única função SQL
  = `rls_auto_enable` do plataforma; `edge-function` (legado Alse) segue fora do projeto.
  Harness **PROD 16/16** (`repro-port.mjs` na Netlify) + matriz edge **11/11**.
- **FURO encontrado**: `youtube-video-info` levava **~29s em todos os vídeos** (loop
  SEQUENCIAL de6 instâncias ×6s com puffyan/fdn mortos + serial desc/página2) enquanto
  o client aborta em **15s** (`AbortController` do `lib/youtubeVideoInfo.ts`) →
  comentários, descrição e relacionados da edge **nunca eram entregues** ao app (o rail
  só funcionava pelo preenchimento por busca do NPV). Chamadores diretos
  (VideoInfoBar, ExploreScreen, Index) também ficavam sem dados.
- **Correção (3 iterações medidas)**: paralelização total + caps por fonte; depois
  merge INCREMENTAL (responde assim que `related+comments` existirem em qualquer
  combinação — sem esperar instâncias mortas); `approxRelatedFromSearch` disparado no
  **t0** (hoje nenhuma fonte devolve `related` direto: vídeo403 nas instâncias +
  `/next` barrado no datacenter); página2 de comentários + descrição + tradução
  **pt-BR em paralelo no pós** (tradução de40 textos = ~3,8s); innertube/instâncias com
  `AbortSignal` (8s/6s/6s). Client: aborto **15s →20s** (folga).
- **Medido antes → depois**: `29,3s / 30,6s / 29,5s` → **`9,9s / 9,0s / 9,0s`** típico
  (todas <15s; pior caso limitado a ~12s), related=15, comments=40, translated=40.
  Descrição continua vazia nos testes = **bug conhecido #3** (player/next403 de
  datacenter) — UI usa fallback `song.description` (inalterado).
- **Validação UI ao vivo (produção)**: `scripts/check-comments-prod.mjs` (viewport
  mobile390×844) → clicar "Discussão" → **40 comentários renderizados em5,1s —
  PASS**. `npm run check` **EXIT=0**.
- Infra do sandbox: wipes recorrentes derrubaram `node_modules`/`.git/config`/libs do
  chromium de novo — restaurados (PAT mudou de644→**600**).

## Sessão 2026-10-02 (20ª) — fullscreen derrubava o app (#426): FullscreenOverlay lazy montado sem Suspense

Reporte: "quando clico para colocar em fullscreen do Player de vídeo, aparece esta tela
[Opa, o Xerife tropeçou] … Minified React error #426".

- **Diagnóstico**: #426 = "A component suspended while responding to synchronous input".
  A fusão da19ª trocou o bloco FS do Index para o estilo Alse (`<FullscreenOverlay/>`
  direto, **sem `<Suspense>`**), mas a substituição do import era um replace silencioso
  que NÃO casou — o `Index.tsx` continuou com `LazyFullscreenOverlay as FullscreenOverlay`
  (barrel `@/lib/deferredScreens`). Resultado: o clique em "Tela Cheia" montava um
  `lazy()` sem boundary durante um evento síncrono → React lança #426 → ErrorBoundary.
  No Xerife pré-port isso não crashava porque o call site era envolto em `<Suspense>`.
- **Fix**: import direto `import FullscreenOverlay from "@/components/FullscreenOverlay"`
  (verbatim do Alse, linha71 deles); o alias lazy do barrel ficou órfão (sem uso).
- **Prova causal (red/green)**: revertendo SÓ o import para o lazy, o harness reproduz
  exatamente o reporte (ErrorBoundary visível + FS não monta, **12/16**); com o fix,
  **PORT CONTRACT: PASS (16/16)** — novo trecho no `scripts/repro-port.mjs`: entra em
  fullscreen (botão "Tela Cheia"), afirma ausência de ErrorBoundary/#426, FS overlay com
  transporte próprio (aria-label Voltar/Pausar), e saída limpa.
- **Validação**: `npm run check` **EXIT=0** (typecheck0, vitest74/74, build, e2e, SMOKE).
  Nota: o `SyntaxError '<'` do dev segue sendo o `cast_sender.js` do gstatic (pré-existente).

## Sessão 2026-10-02 (19ª) — import EXATO do player do Alse Switch (transporte central volta ao overlay)

Pedido: "entenda como funciona o Player e importe exatamente como funciona no projeto enviado
(Alse Switch), neste (Xerife Switch)". Decisões ask_user vinculantes: **escopo=full** (motor
`useYouTubePlayer` + todos os componentes do player + orquestração do Index, preservando
features Xerife), **glifo=exato** (sem disco/poster — aceita o ⏸ do embed), **edge=importar**.

- **Stage1 (cópias Alse→Xerife, CRLF→LF)**: `useYouTubePlayer.ts` (2038L), `FullscreenOverlay`,
  `MiniPlayer`, `SeekBar`, `SidebarPlayer`, `PlayerControls`, `FloatingPiPPlayer`,
  `NowPlayingView` + novos `DesktopFloatingPlayer`/`resumePositions`. Depois: reinjeção das
  features Xerife no NPV (bloco `PodcastDescriptionPanel`+helpers, `requireDescription` no
  fetch de podcast, background-then com description) e badge `song.isDownloaded` no
  `PlayerControls`.
- **Fusão do Index.tsx (o coração do "exato")**: `revealVideoOverlay` verbatim do Alse
  (auto-hide **4000ms** fixo, sem leases/fail-safe/glyph); efeito **keepOpen** verbatim
  (Alse L866): no pausado/buffering/até-start limpa o timer pendente e força
  `setShow(true)` (controles ficam visíveis ENQUANTO pausado), no resume chama
  `revealVideoOverlay()` para reiniciar a contagem; bloco overlay + call do
  `FullscreenOverlay` copiados do Alse (tap-catcher alterna, transporte central
  ⏮/⏸▶/⏭ exclusivo de play/pause, bottom bar SEM botão play). A primeira versão
  injetada do keepOpen estava ERRADA (guardas inventadas) — corrigida para o
  verbatim após reler L866; o harness passou de 9/10 para **10/10**.
- **Ilha minimizada**: `DesktopPlayerIsland` → `DesktopFloatingPlayer` (Alse) renderizado no
  header ao lado de configurações, gated por `!expanded` (mesma regra do Alse); removidos
  `DesktopPlayerIsland.tsx` e `DesktopPlayer.tsx` (órfão até no Alse).
- **Removidos** (comportamentos v11–v14 superados): `CenterGlyphCover`, `PausedVideoPoster`,
  `lib/autoHideControls`, `lib/clipSyncGuard` + **7 testes órfãos** (`center-glyph-cover`,
  `center-video-fully-visible`, `fullscreen-center-sync`, `auto-hide-controls`,
  `clip-sync-guard`, `clip-sync-player`, `floating-pip-clean`). Invariantes v7/v14
  (`data-central-transport`, "play só na bottom bar", disco fixo) estão oficialmente
  superadas pela ordem "exatamente como Alse".
- **Edge Functions (decisão "importar", executada com rede de segurança)**:
  - **Importadas do Alse** (contratos idênticos ao client, verificados campo a campo):
    `_shared/serverCache.ts` (não cachear vazios), `_shared/rateLimiter.ts` (IP real via
    proxy headers, ignora ranges privados), `youtube-general-search` (1088L, com
    `variety`/`channelTab`/`playlistId` opcionais que o client Xerife não envia = aditivo),
    `youtube-search`, `youtube-artist-info`, `youtube-album-tracks`.
  - **MANTIDAS as do Xerife, com motivo**: `fetch-chords`/`podcast-search`/`youtube-download`
    (fixes live-tested da task3 — o `podcast-search` do Alse ainda faz **4 buscas paralelas**,
    exatamente o padrão que a task3 removeu por causar bloqueio de egress do YouTube);
    `youtube-video-info` (contrato do client: `description` p/ painel de podcast +
    `originalContent`/tradução pt-BR dos comentários); `youtube-playlist` (só Xerife);
    `fetch-lyrics`/`youtube-trending` (diff = só branding). `edge-function` (legado Alse)
    não existe no projeto e não foi trazida.
  - **Deploy das11 funções no `fiohpfx…` + matriz live:11/11 PASS** — chords
    `Cássia Eller–Malandragem` = `ug/2931 chars/tab958126` (**idêntico ao baseline da task3**),
    lyrics lrclib2182, podcast5+continuation, gen-search18+continuation (sort=date),
    search20, artist-info ok, album-tracks100, trending30, video-info related15+comments40,
    playlist100 (source=web), download tunnel URL.
- **Validação**: `npm run typecheck` **0 erros**; vitest **74/74** (13 arquivos);
  `npm run check` **EXIT=0** (build + e2e + SMOKE); harness `scripts/repro-port.mjs`
  (viewport1117×619/dpr2/touch, seeds + `xerife:auto-play-video`) = **PORT CONTRACT: PASS
  (10/10)**: sem disco/poster, transporte central visível, auto-hide ~4s tocando,
  keepOpen >4.5s pausado, bottom bar sem play; screenshot conferido. Greps do bundle:
  `center-glyph-cover`=0, `paused-poster`=0, `autoHideControls`=0, `clipSyncGuard`=0,
  `app_heartbeat`=0, `fiohpfx`≥1, `hcdqv`=0, `Playback resumed`/pílula Alse presentes.
- **Não regressões observadas**: o `SyntaxError: Unexpected token '<'` do dev server é o
  `cast_sender.js` do gstatic devolvendo HTML no sandbox (inline do `index.html`, intocado —
  pré-existente). `PodcastDescriptionPanel` compilado e no bundle (strings "Descrição"/
  "episódio" presentes).

## Sessão 2026-10-02 (18ª) — ⏸ ainda aparecia com vídeo tocando: disco fixo (v14)

Reporte seguinte à17ª: "o símbolo de pause ainda está no centro aparecendo quando o vídeo
ainda está em reprodução. Mas quando ele para o botão (símbolo de pause), some. Corrija
isso para sempre sumir. Edite o círculo opaco do meio".

- **Diagnóstico**: a v13 cobria o ⏸ congelado do embed só com controles visíveis (ou na
  janela de6,5s). Depois do auto-hide a barra some, a janela expira e o disco também — mas
  o glifo congelado do YouTube continua dentro do iframe cross-origin (indetectável) →
  ⏸ branco sobre o vídeo TOCANDO com a tela "limpa". O estado pausado ficava coberto pelo
  `PausedVideoPoster` (por isso "quando ele para, some").
- **Correção (v14) — disco do meio cobre durante TODA a reprodução**:
  - `Index.tsx` (inline): gate `((isPlaying && !videoSurfaceIdle) || surfaceBuffering)`
    sob `!nativeVideoActive && !isEnded` — sem depender de `glyphCoverOn`/`showVideoOverlayControls`;
  - `FullscreenOverlay.tsx`: gate idem; prop `glyphCover` (janela) **substituída** por
    `nativeVideoActive` (superfície offline não tem glifo → nunca rende disco);
  - removidos o espelho/mirror `glyphCoverOn` + timer + `glyphPaintAtRef` do Index (mortos);
    `actionGlyphPaintAt` segue intacto (lease dos controles);
  - invariantes: pausado/idle → poster (disco exige `isPlaying && !idle`), buffering → disco,
    fim/nativo → nada; **nenhum blur** (lente fosca v10 segue banida — disco é opaco).
- **Testes**: contrato do `center-glyph-cover` reescrito para v14 (8 casos: tocando SEMPRE,
  controles ocultos SEMPRE, pausado=poster, buffering, fim, música, **nativo sem disco**,
  componente isolado); suíte alvo **30/30**.
- **Validação visual** (repro-v14,3 contextos reais, landscape1117×619):
  `V14 CONTRACT: PASS` — (1) tocando + barra oculta → `cover=true` (★ estado do reporte);
  (2) tap → controles visíveis → `cover=true`; (3) pausa → `cover=false` + `poster=true`.
  `npm run check` **EXIT=0** (118/118 + build + e2e + SMOKE).

## Sessão 2026-10-02 (17ª) — ⏸ central ainda presente (glifo congelado do embed além da janela)

Pedido (com screenshot `image-1.png`): "no player de vídeos do xerife videos e modo vídeo do
xerife music e xerife podcast ainda está com o botão ou símbolo de pause/play… entenda e
corrija". A imagem mostra o player INLINE em landscape (barra inferior nova da16ª visível:
⏮ ⏸ ⏭ 0:32 seek CC ⤢), vídeo tocando, controles visíveis e um **⏸ branco centralizado**.

- **Diagnóstico**: não era botão nosso (transporte central foi removido na16ª e os testes
  garantem `[data-central-transport]` null) nem poster (`PausedVideoPoster` é capa pura).
  É o **glifo de pause do próprio embed do YouTube** — docs internos do
  `CenterGlyphCover` já alertam que ele "some sozinho em ~5 s, mas CONGELA em alguns
  devices". O disco `CenterGlyphCover` só cobre a janela `GLYPH_COVER_MS=6500` iniciada em
  `glyphPaintAt` (load/seek/play); o tap que re-revela os controles **não re-arma essa
  janela** (só `actionGlyphPaintAt` de ações re-arma o lease dos controles). Screenshot =
  controles visíveis + tocando + janela expirada → disco ausente → ⏸ congelado exposto.
- **Correção (v13)** — o disco agora também rende **enquanto os controles estão visíveis**:
  - `Index.tsx` (overlay inline): gate
    `(((glyphCoverOn || showVideoOverlayControls) && isPlaying && !videoSurfaceIdle) || surfaceBuffering)`;
  - `FullscreenOverlay.tsx`: gate
    `(((glyphCover || showControls) && isPlaying && !videoSurfaceIdle) || surfaceBuffering)`.
  Invariantes preservados: pausado → poster (disco exige `isPlaying`), buffering → disco,
  fim/nativo → nada, **controles ocultos + janela expirada → centro 100% limpo** (v10).
  Comentários/docs do componente e contrato dos testes atualizados para v13.
- **Testes**: `center-glyph-cover` adaptado — "janela expirada" agora é cenário de DOIS
  casos: controles visíveis → disco PRESENTE (novo, cobre o glifo congelado) e controles
  ocultos (auto-hide 3500ms) → disco AUSENTE. Suíte alvo **30/30**.
- **Validação visual** (Playwright, mobile landscape1117×619, janela expirada + tap nos3
  contextos reais: Xerife Vídeos via dispatch, Podcast via aba+pill, Music via ilha →
  "Expandir player" → pill "Vídeo" — NUNCA dispatch direto no music, o force-audio do NPV
  derruba o modo): em TODOS `cover=true` com barra visível (disco #161616 no centro, sem
  ⏸) e `cover=false` após auto-hide (centro limpo). Fullscreen também validado (disco
  presente com barra). `npm run check` **EXIT=0** (118/118 + build + e2e + SMOKE).

## Sessão 2026-10-02 (16ª) — controles duplicados no player de vídeo (Xerife Vídeos / modo vídeo do Music e Podcast)

Pedido: "revise… controles de reprodução duplicados no player de vídeo, deixando botões ao
centro… entenda, revise e corrija".

- **Reproduzido** (Playwright, screenshots em3 contextos): o overlay do Index renderizava ao
  mesmo tempo o **transporte central** [⏮ ▶(96px) ⏭] **E** a barra inferior
  [⏯ | tempo | seek | CC | FS] → **dois botões de pause simultâneos**, um fixo no centro.
  Em tela estreita a barra inferior ainda cabia, mas a duplicação era generalizada (rail,
  música e podcast usam o MESMO overlay).
- **Correção** (`src/pages/Index.tsx`): transporte central **REMOVIDO** — play/pause existe
  somente na barra inferior (mesma regra de ouro já imposta pelos testes
  `fullscreen-center-sync` / `center-video-fully-visible` para o fullscreen: "nenhum
  transporte central"). **prev/next movidos para a barra inferior** (transporte completo
  preservado); duração total escondida abaixo de `sm` p/ folga no mobile. Comentários
  obsoletos atualizados. Bezel/glifo do YouTube segue coberto por `PausedVideoPoster`
  (pausado) e `CenterGlyphCover` (janela do glifo) — independentes dos controles.
- **Validação**: dumps DOM nos3 contextos (`central-transport =0`, conjunto único na
  barra; auto-hide e retap OK) + screenshots desktop e360px; toggle real "Vídeo" do music
  (`data-video-mode=true`, mesmas8888) OK. `npm run check` **EXIT=0** (117/117 + build +
  e2e + SMOKE).

## Sessão 2026-10-02 (15ª) — reparo dos3 upstreams externos (`fetch-chords`, `podcast-search`, `youtube-download`)

Pedido: "sim. Repare a aça o comit". As três falhas eram **externas** (confirmado na14ª) e foram
corrigidas nas Edge Functions + redeploy no projeto `fiohpfx…`:

- **`fetch-chords`** — causa dupla: (1) regex do `data-content` esperava a ordem antiga de
  atributos (`… id="js-store"`), mas a UG serve `class="js-store" data-content="…"`; (2) o JSON
  de busca vem com aninhamento variante (`store.store.page.data.results` no edge) — agora
  extração **recursiva** (`deepFindUg`). Além disso a página de **tab é SSR** e expõe
  `tab_view.wiki_tab.content` com a cifra **real** → a função agora devolve o conteúdo
  convertido (`[ch]X[/ch]`→`X`, `[tab]` removido, entidades `&aacute;`→`á` decodificadas) em vez
  de placeholder. Ordem das fontes: **UG primeiro** (única viva), vagalume (503)/cifraclub (403)
  ficam como fallback.
- **`podcast-search`** — instâncias: **`invidious.f5.si` primeira** + header `User-Agent`
  (sem UA o f5 responde, mas outras bloqueiam) + guarda `Array.isArray`; timeouts4s→9s por
  instância e5s→14s no `fetchWithTimeout` (f5 leva ~1,5–6s do edge). **Bug real encontrado**:
  `generateContinuationToken` usava `Buffer.from()` — `Buffer` **não é global** no runtime edge →
  quando `final.length >= limit` (≥40 resultados) o token lançava, o `catch` devolvia
  `{results:[]}` — por isso buscas amplas retornavam vazias mesmo com20–40 itens coletados.
  Corrigido com `btoa(encodeURIComponent(…))`.
- **`youtube-download`** — cobalt oficial/comunidade hoje exige **JWT/turnstile**
  (`error.api.auth.jwt.missing` em quase todas as listas). Instâncias **sem auth** descobertas
  via `cobalt.directory`: **`rue-cobalt.xenon.zone` (funcional)** e `cobaltapi.cjs.nz` como
  segunda + `api.cobalt.tools` (oficial, caso mude) + descoberta best-effort em
  `cobalt.directory` (do edge o site responde **403 CF**, então a lista estática é o caminho
  real). Tunnel testado: POST→`{url}`, GET→`ACAO:*`, bytes MP3 ok.
- **Matriz final (invoke real, todos ✓)**: chords `Cássia Eller – Malandragem` = cifra real
  (`source:ug`,2931 chars, `tabs.ultimate-guitar.com/tab/958126`); podcast
  `?q=historia+do+brasil&fresh=true` = **40 results + continuation** (página2 =
  10 results ✓); download áudio e vídeo = `{url}` tunnel (GET baixa bytes ✓);
  `npm run check` **EXIT=0**. Função temporária `debug-upstream` (usada p/ diagnosticar via
  edge) **excluída** do projeto.

## Sessão 2026-10-02 — migração do backend para o projeto próprio "Xerife Switch" (`fiohpfx…`)

Pedido: migrar para o novo banco/projeto (credenciais do usuário), **sem nenhum
`app_heartbeat`/pulso**, mantendo liberação do projeto (pause) e **retirada de
pausa manual** pelo usuário via acessos dele.

- **Por quê**: o projeto antigo `hcdqv…` (Lovable) está **RESTRITO**
  (`exceed_egress_quota` — resposta real da API antiga) e o legado `hvslfb…`
  é só fallback; nenhum dos dois pertence à conta do usuário. Conta do usuário
  (PAT `sbp_…` validado) tem: `fiohpfx…` = **Xerife Switch** (novo, destino)
  e `aohoix…` = **Xerife Player**.
- **Config trocada**: `.env` (PROJECT_ID/URL/PUBLISHABLE_KEY),
  `src/integrations/supabase/client.ts`, fallback de `backendConfig.ts`,
  `supabase/config.toml` + docs ativos. Refs `hcdqv`/`hvslfb`: zero fora de
  `docs/history`.
- **`app_heartbeat` BANIDO**: migration `001_create_app_heartbeat.sql`
  deletada; nenhum código/table de pulso (sessão passada já tinha removido
  hook/UI). OBS do usuário cumprida — zero pulsos.
- **Edge Functions (11) implantadas** via CLI (`login`/`link`/`deploy`):
  fetch-chords, fetch-lyrics, podcast-search, youtube-{album-tracks,
  artist-info,download,general-search,playlist,search,trending,video-info}.
  **Nenhum secret necessário** (funções sem `Deno.env`), sem tabelas no DB
  (estado = localStorage do app). `ad-links` NÃO existe no repo (só no
  projeto antigo) → `adsEngine` degrada para o pool local (testado: 404 →
  fallback ok).
- **Smoke real no projeto novo (todos verificados por invoke)**:
  ✓ `youtube-trending`, ✓ `youtube-search?q=`, ✓ `fetch-lyrics` (body),
  ✓ `youtube-video-info`, ✓ `youtube-playlist` (body playlistId) — dados
  reais retornados.
- **Falhas EXTERNAS pré-existentes (não da migração — código é stateless)**:
  `fetch-chords` → `not_found` (vagalume **503**, cifraclub **403**);
  `podcast-search` → `[]` (invidious **403/401**); `youtube-download` →
  cobalt oficial exige **JWT** (`error.api.auth.jwt.missing`) e o instance
  alternativo com DNS morto. Correção desses upstreams = trabalho separado.
- **Pause/restore manual (OBS)**: `npm run supabase:list|pause|restore` →
  `scripts/supabase-release.mjs` lê `SUPABASE_ACCESS_TOKEN` ou `~/.supabase-pat`
  (PAT salva fora do repo, 600). Sem `app_heartbeat`, o Free também libera
  sozinho após 7 dias sem uso.

## Sessão 2026-09-25 — heartbeat removido por completo + liberação do projeto (egress a zero)

Pedido: "retire todo pulso enviado ao Supabase; deixe a remoção e a liberação
automática do projeto a partir dos acessos do usuário — para não consumir egress."

- **Pulso removido de ponta a ponta**: os pulsos já estavam desligados em
  runtime (histórico: 358GB de egress por polling de 5min/30s); agora os
  resíduos mortos também saíram — `src/hooks/useAppHeartbeat.ts`,
  `src/components/AppHeartbeatStatus.tsx` (render no HeaderMenu + import
  morto no DesktopSidebar) e `SUPABASE_HEARTBEAT_SETUP.md`. Grep final: zero
  referências. O `HEARTBEAT` do service worker e o `__bg_heartbeat` são
  LOCAIS (`postMessage`/localStorage) — não tocam a rede, ficaram.
- **Escopo (escolha do usuário): manter todas as features** — edge functions
  `fetch-lyrics`, `fetch-chords`, `youtube-download`, `youtube-playlist`,
  `ad-links` + camada `/functions/v1` continuam; egress só sob demanda de uso
  real. Sem nenhum acesso por 7 dias, o Free **pausa o projeto sozinho**
  (liberação automática por inatividade).
- **Liberação administrativa**: `scripts/supabase-release.mjs` —
  `list`/`pause`/`restore`/`delete` pela Management API a partir do acesso do
  usuário. Requer PAT do Supabase (`sbp_…`, dashboard → Account → Access
  Tokens); o token `ghp_…` enviado é do GitHub e a publishable key do `.env`
  não tem permissão de gestão. `delete` exige `CONFIRMAR_APAGAR=sim`
  (irreversível). Pendente: usuário fornecer o `sbp_` para eu executar
  pause/delete de fato.

## Sessão 2026-09-24 (5) — lógica do Alse aplicada ao painel: auto-hide do chrome (showFsControls ligado)

Pedido: aplicar ao Xerife o mesmo mecanismo de "tela limpa" do app Alse
(estado + timer + gate de fade), para o player de vídeo e os controles de
reprodução, nos contextos **modo vídeo** e **Xerife Vídeos**. Auditoria
primeiro: o overlay do player (Index + FullscreenOverlay) **já cobria** as 7
regras do Alse nos dois contextos (com N configurável do usuário); o gap real
era o `NowPlayingView` — `showFsControls`/`resetFsControlsTimer` existiam mas
estavam **mortos** (armavam em fullscreen e nunca gateavam nenhum elemento;
`chromeFade` nunca existiu no repo).

Mecanismo aplicado (N = **3000ms fixo**, escolha do usuário; overlay mantém os
segundos configuráveis):

1. **Escopo**: `chromeHidden = mode === "video" && isPlaying && !showFsControls`
   — arma SÓ em modo vídeo + tocando (escopo checado antes do timer, regra 6);
   áudio/lírica/pausado → chrome visível fixo.
2. **Ocultar**: fade 300ms `opacity-0 pointer-events-none` SOMENTE na barra
   superior mobile do painel (`[data-panel-top-bar]` — único chrome gateável
   em modo vídeo; o transporte/SeekBar do painel já era removido em modo vídeo
   e o rail Xerife Vídeos não tem barra no painel).
3. **Nunca ocultar** (regra 4): info (título/artista), action-bar
   (favoritar/ícones), `VideoInfoBar`, abas Recomendados/Discussão, descrição
   de podcast.
4. **Restaurar** (regra 5): `onPointerDown`/`onPointerMove` na raiz do painel;
   pausar mantém visível permanente até reproduzir de novo (divergência
   deliberada do overlay, onde pausado esconde a pedido — pôster toma conta).

Validação `lab/probe-panel-chrome.mjs` (mobile 390×844, fluxo real: card →
mini → painel → botão "Vídeo"): 6/6 — barra `1|auto` em t+0.5s; `0|none` em
t+4.5s sem interação com **info `1`** (nunca some); pointermove restaura
`1|auto`; pausar >3.6s mantém `1|auto`. `npm run check`: 117/117 + build +
e2e 16 combinações + SMOKE OK.

## Sessão 2026-09-24 (4) — "os símbolos ainda estão presentes": buffering descoberto

Reporte com 2 screenshots: um ⏸ branco solto no centro, SEM disco, SEM pôster, SEM
controles (fundo = frame congelado do vídeo). Causa medida em lab: durante
`surfaceBuffering` o disco (v11 exigia `!surfaceBuffering`) **E** o pôster (mesma
trava) ficavam fora AO MESMO TEMPO — o indicador central do iframe cross-origin
(spinner/⏸ do YouTube) aparecia sem nenhuma cobertura; com os controles já
ocultos, virava "símbolo fantasma". Agravante: o watchdog de stall marca
`videoSurfaceIdle` enquanto o tempo não avança (exatamente durante o buffering) e
também derrubava o disco — restando 0 coberturas mesmo com a janela do glifo
ainda aberta.

**Fix (v12)** — ramo de buffering, em `Index.tsx` + `FullscreenOverlay.tsx`:
disco rende por **estado** (`surfaceBuffering`) além da janela (`glyphCoverOn`),
ignorando `videoSurfaceIdle` e janela expirada; a saída PLAYING reabre a janela
via `glyphPaintAt` e cobre o repintar (~6,5s). Pôster segue dono exclusivo de
pausado; fim segue capa opaca; controles NÃO mudam (lease continua só em
`actionGlyphPaintAt` — oscilação de rede não estende controles). Contrato
travado no teste `center-glyph-cover.test.tsx` (buffering → disco presente).

Validação: `lab/repro-buffer-glyph.mjs` — pré-fix 6,5s de buffering = **100%
descoberto** (screenshot com spinner nu); pós-fix 4,5s = **0s descoberto**;
roda longa 90s @90kbps com buffering único de ~62s → disco presente **100% do
tempo** (muito além dos 6,5s da janela), prova pixel no miolo `(22,22,22)` com
0 px brancos. Baseline steady (Gap A): centro 0,00–0,03% de brilho — não
reproduzido no desktop (janela 6,5s > glifo do YT ~5s). `npm run check`:
117/117 testes, build, e2e 16 combinações, SMOKE OK.

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

- **Supabase** (`fiohpfxftzcadkwkvzuz`): projeto **ATIVO**. As 10 Edge Functions do repo
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
[`DEPLOY_SETUP.md`](DEPLOY_SETUP.md),
[`GUIA_EDGE_FUNCTIONS_OTIMIZADAS.md`](GUIA_EDGE_FUNCTIONS_OTIMIZADAS.md),
[`SOLUCAO_PROXY_AUDIO.md`](SOLUCAO_PROXY_AUDIO.md), [`QUICK_REFERENCE.md`](QUICK_REFERENCE.md).
