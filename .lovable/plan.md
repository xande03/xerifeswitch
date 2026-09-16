## Objetivo

Refinar o modo Áudio↔Vídeo do Xerife Music para que a alternância seja instantânea (<200ms), o clipe exibido corresponda ao momento exato da música em execução, e o realinhamento seja garantido continuamente em segundo plano — sem interrupções audíveis.

## Contexto atual

Hoje o app tem **um único player YouTube IFrame** (`useYouTubePlayer` → `#yt-player`) que fornece áudio e vídeo. Quando o usuário aciona "modo vídeo", `Index.tsx` reposiciona esse iframe sobre `#music-video-anchor`. Quando o `videoId` memorizado do clipe difere do `song.youtubeId`, chamamos `loadVideo(newId)` — o que **reinicia a reprodução do zero**, quebra a continuidade e não respeita a posição do áudio nem eventuais introduções do clipe (falas, animação, contagem).

## Melhorias

### 1. Layered UI + player sempre montado (troca visual instantânea)
- `#music-video-anchor` já existe. Vamos garantir que o iframe do YT esteja **sempre carregado** (buffer aquecido) desde o início da faixa, e que o modo Áudio apenas **oculte visualmente** o iframe (opacity/pointer-events), não o descarregue. Áudio segue saindo do próprio iframe.
- No modo Áudio a Camada A (capa/visualizador) fica visível por cima; no modo Vídeo a Camada B (iframe) é revelada. Sem remount → alternância <200ms.

### 2. Matriz de alinhamento por faixa (`videoTimelineOffset`)
Estender `src/lib/videoClipMemory.ts`:
```ts
type Entry = { videoId: string; offsetMs: number; ts: number };
export function getClipOffset(songId): number;
export function setClipOffset(songId, offsetMs): void;
```
Persiste em `localStorage` (mesmo store LRU 300 entradas). Default `0`. Pode ser ajustado por controle fino no UI (ver §5) ou detectado automaticamente (heurística: se o clipe oficial tem `duration - song.duration > 8s`, sugere offset positivo a validar).

### 3. Sincronização preservando áudio contínuo
Novo helper `syncVideoToAudio(audioTime)` em `NowPlayingView` (quando `isMusicVideoMode`):
- Ao entrar no modo Vídeo **sem trocar o videoId**: nenhum seek — vídeo já está em sync (mesmo iframe).
- Ao entrar no modo Vídeo **trocando para clipe memorizado**: em vez de `loadVideo` cru, usar novo `loadVideoAt(videoId, startSeconds)` no `useYouTubePlayer` que chama `player.loadVideoById({ videoId, startSeconds: audioTime + offset })`. Preserva o instante de reprodução.
- Se o clipe oficial não existir (upload de áudio + capa estática), permanece no vídeo atual e mostra capa como fallback visual.

### 4. Observador de drift passivo (500ms / tolerância 50ms)
`useEffect` em `NowPlayingView` enquanto `isMusicVideoMode`:
- A cada 500ms compara `player.getCurrentTime()` com um "relógio de áudio" mantido pela nossa `SeekBar` (`playerState.currentTime`).
- Se |Δ| > 50ms **e** o vídeo ativo é o clipe memorizado (não a própria track), aplica `seekTo(audioTime + offset, true)` de forma discreta.
- Ignora quando `player.getPlayerState() === BUFFERING` para não brigar com rede.

### 5. Pré-carregamento silencioso
Novo `preloadClip(videoId)` em `useYouTubePlayer`:
- Cria um `<iframe>` oculto `youtube-nocookie.com/embed/{id}?autoplay=0&mute=1&start=0` com `loading="eager"` e o remove quando o modo Vídeo for ativado (ou 60s depois). Aquece cache HTTP/CDN do YouTube.
- Disparado 1× por faixa quando `song.id` muda e existe `memorizedClip` diferente do `youtubeId`.

### 6. Crossfade curto na troca de vídeo (opcional, ativo por padrão)
Quando a troca de `videoId` for necessária (item 3), aplicar em ~180ms:
- Rampa `setVolume(current→0)` no player atual → `loadVideoAt(...)` → rampa `0→current` após `onStateChange = PLAYING`.
- Se `prefers-reduced-motion` estiver ativo, pular crossfade (troca dura mas instantânea).

### 7. Controle de offset manual (UI mínima)
No painel "Tocando agora" em modo Vídeo, adicionar um mini-ajuste discreto (semelhante ao Sync das letras): botões `−0.5s` / `Sync ±X.Xs` / `+0.5s` que gravam via `setClipOffset(song.id, ms)`.

## Arquivos afetados

- `src/lib/videoClipMemory.ts` — adicionar `offsetMs`, getters/setters.
- `src/hooks/useYouTubePlayer.ts` — expor `loadVideoAt(videoId, startSeconds)`, `preloadClip(videoId)`, `getCurrentTimeRaw()`.
- `src/components/NowPlayingView.tsx` — usar `loadVideoAt` ao alternar clipes, drift watcher 500/50, preload no mount da faixa, controles de offset, garantir que o iframe permaneça montado em modo Áudio (só visualmente oculto).
- `src/pages/Index.tsx` — expor `loadVideoAt` no callback `onPlayRelated`/switch; garantir que trocas de modo não desmontem o container do player.

## Critérios de aceite

1. Primeira frame no modo Vídeo aparece em <200ms (nenhum remount).
2. Alternar Áudio→Vídeo→Áudio mantém posição de reprodução sem "pular".
3. Trocar para o clipe memorizado retoma exatamente em `audioTime + offset`, com crossfade audível suave (sem estalo).
4. Drift entre vídeo e áudio nunca excede 50ms por mais de 1s em condições normais de rede.
5. Ajuste manual de offset persiste por faixa (`localStorage`) e é reaplicado em reproduções futuras.

---

## Status de implementacao (2026-09-16)

| Item | Estado | Observacao |
|---|---|---|
| 1. Layered UI, iframe sempre montado | ✅ | `#music-video-anchor` + camadas em `NowPlayingView` |
| 2. Matriz de offset por faixa | ✅ | `videoClipMemory.ts`: `getClipOffset` / `setClipOffset`, LRU 300 |
| 3. `loadVideoAt` preservando audioTime | ✅ | + vies de handshake do IFrame medido por UA em `Index.tsx` (`onSwapClipAt`) |
| 4. Observador de drift | ✅ **adaptado** | ver nota abaixo |
| 5. Preload silencioso | ✅ | `preloadClip(videoId)`, auto-remove em 60s, exposto via `onPreloadClip` |
| 6. Crossfade na troca | ✅ | dentro de `loadVideoAt` (rampa 15% → load → volta), respeita `prefers-reduced-motion` |
| 7. Controle manual de offset | ✅ | botoes +/-0.5s no painel "Tocando agora" |

### Nota sobre o item 4 (por que nao e um loop de 500ms comparando audio x video)

O plano supunha dois relogios independentes. Na arquitetura real do Xerife Music o
audio **e** o video: um unico iframe do YouTube IFrame API. Um watcher perpuo que
compara `player.getCurrentTime()` com o relogio derivado do mesmo player so obtem
o proprio numero de volta (no-op) e, se aplicar `seekTo`, provoca stall de buffer
audivel — o contrario do objetivo.

O desvio real acontece no **pouso**: `loadVideoById({ startSeconds })` ancora no
keyframe mais proximo e as vezes devolve 0 no primeiro instante. Entao o item 4 foi
implementado como **guard de pouso pos-swap**:

- `src/lib/clipSyncGuard.ts` — politica pura (tolerancia 250ms, janela 6s,
  maximo 2 correcoes, cede ao seek do usuario, ignora `BUFFERING`).
- `useYouTubePlayer` — `startClipSyncWatch` no instante do load, `runClipSyncCheck`
  no primeiro `PLAYING` e num polling de 500ms so enquanto ha alvo pendente.

Tolerancia maior que os 50ms originais de proposito: o IFrame API so expoe tempo com
granularidade de polling e o proprio seek tem latencia de rede; abaixo de ~250ms o
"salto" nao e percebido e o custo de corrigir (rebuffer) e maior que o ganho.
