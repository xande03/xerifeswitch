# Status do Xerife Music

Atualizado em 2026-09-16 (2ª revisão). **Todos os itens abaixo foram medidos neste checkout**, não
copiados de relatórios de sessão (o histórico de `*_FINAL.md` / `*_CONCLUIDO.md` da raiz
ficou em [`docs/history/`](docs/history/) e contém afirmações vencidas).

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
   O parser da função nova foi validado contra o YouTube real fora do deploy: itens hoje vêm
   como `lockupViewModel` (a mesma migração que quebrou `relatedVideos`), e a coleta +
   paginação retornaram 200 faixas em 2 requisições numa playlist pública real.

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
- **CI de deploy das functions**: ⚠️ **quebrado**. `.github/workflows/deploy-edge-functions.yml`
  exige `SUPABASE_ACCESS_TOKEN`, e o repositório tem **zero** secrets configurados
  (`GET /actions/secrets` → `total_count: 0`). As três últimas execuções falharam
  (2026-07-28). Enquanto isso, mexer em `supabase/functions/**` no `main` **não** chega em
  produção.

## Bugs conhecidos (todos confirmados por medição; estado de cada um indicado)

1. **`relatedVideos` sempre vazio → autoplay de relacionada quebrado.**
   *Corrigido no repositório, NÃO deployado.* Causa: `youtube-video-info` lia só
   `compactVideoRenderer`, e o YouTube entrega `lockupViewModel` hoje (as 6 instâncias
   Invidious listadas como fonte primária estão mortas/bloqueadas: TLS, NXDOMAIN,
   `403 Endpoint disabled`, `401` — logo o fallback nunca recebia relacionadas).
   O parser agora vive em [`supabase/functions/_shared/innertubeRelated.ts`](supabase/functions/_shared/innertubeRelated.ts),
   coberto por `src/test/innertube-related.test.ts` com **payload real capturado** do
   `/youtubei/v1/next`. Medido após o fix, ao vivo: 15 relacionadas com título, canal,
   duração e thumbnail para `dQw4w9WgXcQ`, `9bZkp7q19f0` e `JGwWNGJdvx8` (antes: 0).
   `npm run verify:edge` hoje acusa ❌ nisso — é o estado correto até o deploy.
2. **Deploy bloqueado**: adicione o secret para o CI conseguir publicar.
   ```bash
   gh secret set SUPABASE_ACCESS_TOKEN --repo xande03/xerifeswitch   # valor do dashboard Supabase
   ```
   Sem isso, qualquer mudança em `supabase/functions/**` fica presa no repositório.
3. **`ai-chat` existe na nuvem, não no repo** — está deployada e responde 200, mas não há
   `supabase/functions/ai-chat/`. Está fora do versionamento e do deploy automático
   (nenhum código em `src/` a invoca hoje).
   Simétrico: **`youtube-playlist` existe no repo, não na nuvem** (nova na sessão
   2026-09-16; aguardando o mesmo deploy do item 2).
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
