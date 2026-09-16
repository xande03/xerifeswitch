# Xerife Music 🤠

App de música, vídeos e podcasts que usa o YouTube como catálogo: o mesmo
[IFrame do YouTube](https://developers.google.com/youtube/iframe_api_reference)
fornece o áudio e o vídeo, com letras, acordes, fila inteligente, PiP, MediaSession
(tela de bloqueio) e shell nativo iOS/Android via Capacitor.

- **Front**: React 18 + Vite + TypeScript + Tailwind/shadcn-ui
- **Back**: Supabase (10 Edge Functions em `supabase/functions/`) + cache/rate-limit próprios
- **Nativo**: Capacitor 8 (`android/`, `ios/`), servindo `dist/` local
- **Telas**: um único roteador com o `Index.tsx` como casca; `Music` / `Videos` / `Podcasts`
  são módulos alternados por [`useModuleMode`](src/hooks/useModuleMode.ts)
  (`?module=podcast`, sincronizado com `<html data-module>` para pintar o accent certo
  antes do React montar)

## Começar

```bash
npm ci
npm run dev        # http://localhost:8080
npm run check      # typecheck + testes + build + e2e de layout + smoke do bundle
```

O backend aponta para o projeto Supabase `hvslfbcsokurljstmtip` por padrão
([`src/lib/backendConfig.ts`](src/lib/backendConfig.ts)); sobrescreva com
`VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` se precisar de outro ambiente.

## Onde olhar

| Assunto | Lugar |
|---|---|
| **Estado atual, verificações e bugs conhecidos** | [`STATUS.md`](STATUS.md) |
| Comandos rápidos | [`COMANDOS_RAPIDOS.md`](COMANDOS_RAPIDOS.md) |
| Rodar no celular / emulador | [`COMO_EXECUTAR_APP.md`](COMO_EXECUTAR_APP.md), [`COMO_TESTAR_NO_IOS.md`](COMO_TESTAR_NO_IOS.md) |
| Áudio em background e controles da tela bloqueada | [`SOLUCAO_PROXY_AUDIO.md`](SOLUCAO_PROXY_AUDIO.md), [`scripts/patch-capacitor-music-controls.cjs`](scripts/patch-capacitor-music-controls.cjs) |
| Edge Functions (deploy, TTL, cache) | [`DEPLOY_SETUP.md`](DEPLOY_SETUP.md), [`GUIA_EDGE_FUNCTIONS_OTIMIZADAS.md`](GUIA_EDGE_FUNCTIONS_OTIMIZADAS.md) |
| Heartbeat anti-pausa do Supabase | [`SUPABASE_HEARTBEAT_SETUP.md`](SUPABASE_HEARTBEAT_SETUP.md), [`migrations/001_create_app_heartbeat.sql`](supabase/migrations/001_create_app_heartbeat.sql) |
| Histórico de sessões de trabalho (congelado) | [`docs/history/`](docs/history/) |

## Estrutura

```
src/
  pages/Index.tsx        # casca do app: player, modos, navegação (~3.4k linhas)
  components/            # 52 telas/painéis (NowPlayingView, PodcastScreen, ...)
  hooks/                 # useYouTubePlayer, useMediaSession, useModuleMode, ...
  lib/                   # 38 módulos: indexadoDB, videoClipMemory, clipSyncGuard, ...
  test/                  # vitest + fixtures de payloads reais
supabase/functions/      # Edge Functions (Deno); _shared/ tem código testável
e2e/                     # checks de layout rodando no Chromium
scripts/                 # smoke do bundle, verificador das functions, patch Capacitor
```

## Convenções que valem a pena conhecer

- **Não copie classes de componente para um teste.** O e2e do `#music-video-anchor` lê o
  `className` do fonte e deriva as expectativas dele; a versão anterior, que duplicava as
  classes, quebrou sozinha quando o layout mudou.
- **Telas pesadas entram por [`src/lib/deferredScreens.ts`](src/lib/deferredScreens.ts)**
  (lazy + prefetch em `requestIdleCallback`). Componentes montados com prop `open`
  (modais, diagnostics) ficam estáticos de propósito — adi-los custaria o primeiro paint.
- **Trocar clipe no modo Vídeo usa `loadVideoAt`**, não `loadVideo`: o YouTube ancora em
  keyframe, e o [`clipSyncGuard`](src/lib/clipSyncGuard.ts) corrige o pouso com no máximo
  2 seeks discretos.
- `npm run lint` hoje falha com ~99 erros **legados** do Lovable
  (`no-explicit-any`, `no-empty`); por isso não está no `npm run check`.
