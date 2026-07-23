# Correção: Reprodução em Segundo Plano no iOS

## Problema Identificado

O player estava iniciando automaticamente mesmo quando o usuário clicava em pausar na tela bloqueada ou em segundo plano. Isso acontecia devido a conflitos entre:

1. Lógica interna que tentava "adivinhar" quando o usuário pausou
2. Falta de integração adequada com a MediaSession API do iOS
3. Auto-resume agressivo ao retornar para o app

## Mudanças Implementadas

### 1. Novo Hook: `useMediaSession.ts`

Criado hook dedicado para gerenciar a MediaSession API, que é a interface padrão do iOS para controles de mídia em segundo plano e tela bloqueada.

**Funcionalidades:**
- Registra metadata da música (título, artista, álbum, artwork)
- Configura handlers para play, pause, next, previous, seek
- Atualiza o estado de reprodução (playing/paused)
- Atualiza a posição de reprodução

**Importante:** Os handlers do MediaSession agora são a fonte única de verdade para ações do usuário na tela bloqueada.

### 2. Correções no `useYouTubePlayer.ts`

#### Mudança 1: Remoção da lógica problemática
```typescript
// ANTES (PROBLEMÁTICO):
if (paused && isHidden && shouldBePlayingRef.current && !userPausedRef.current) {
  console.info('[YT] Paused while hidden — treating as user pause');
  markUserPausedIntent();
  playerRef.current?.pauseVideo?.();
  return;
}

// DEPOIS (CORRETO):
// Não intercepta pausas em segundo plano
// Deixa o MediaSession API lidar com isso
```

#### Mudança 2: Detecção de pausa do usuário apenas quando visível
```typescript
if (paused && !isHidden && shouldBePlayingRef.current && !userPausedRef.current) {
  const timeSincePause = Date.now() - pauseTimestampRef.current;
  if (timeSincePause < 500) {
    console.info('[YT] Paused while visible (user action)');
    markUserPausedIntent();
    return;
  }
}
```

#### Mudança 3: Auto-resume mais conservador
```typescript
// Aumentado o tempo de guarda de 2.5s para 5s
if (timeSincePause > 5000) {
  // Só retoma se passou tempo suficiente desde a última pausa
}
```

#### Mudança 4: Remoção da lógica de AudioFocus problemática
```typescript
// ANTES:
if (document.visibilityState === 'hidden' && shouldBePlayingRef.current && !userPausedRef.current) {
  console.info('[AudioFocus] Lost while hidden — treating as user pause');
  markUserPausedIntent();
  playerRef.current?.pauseVideo?.();
  return;
}

// DEPOIS:
// Apenas registra a perda de foco, não marca como pausa do usuário
console.info('[AudioFocus] Lost — pausing silently (not marking as user pause)');
```

### 3. Integração no `Index.tsx`

O hook `useMediaSession` já estava sendo chamado, mas agora usa a implementação correta que:
- Respeita as ações do usuário na tela bloqueada
- Não cria conflitos com a lógica interna do player
- Fornece feedback visual correto no iOS

## Como Testar

### Teste 1: Tela Bloqueada
1. Abra o app e inicie uma música
2. Bloqueie a tela do iPhone
3. Na tela bloqueada, clique em PAUSE
4. ✅ A música deve pausar e permanecer pausada
5. Clique em PLAY na tela bloqueada
6. ✅ A música deve retomar

### Teste 2: Segundo Plano
1. Abra o app e inicie uma música
2. Vá para outro app (sem bloquear a tela)
3. Abra o Control Center e pause a música
4. ✅ A música deve pausar e permanecer pausada
5. Retorne ao app de música
6. ✅ A música deve continuar pausada (não iniciar automaticamente)

### Teste 3: Navegação entre Músicas
1. Inicie uma música
2. Bloqueie a tela
3. Use os controles de next/previous na tela bloqueada
4. ✅ Deve trocar de música corretamente

### Teste 4: Seek (Avançar/Retroceder)
1. Inicie uma música
2. Bloqueie a tela
3. Use os controles de seek na tela bloqueada
4. ✅ Deve avançar/retroceder corretamente

## Logs de Debug

Para verificar o comportamento, abra o Safari Web Inspector conectado ao iPhone e observe os logs:

- `[MediaSession] Play action triggered by OS` - Usuário clicou em play na tela bloqueada
- `[MediaSession] Pause action triggered by OS` - Usuário clicou em pause na tela bloqueada
- `[MediaSession] Playback state set to: playing/paused` - Estado atualizado
- `[YT] Paused while visible (user action)` - Pausa detectada enquanto app visível
- `[AudioFocus] Lost — pausing silently` - Perda de foco de áudio (não marca como pausa do usuário)

## Próximos Passos

1. Testar no dispositivo iOS real
2. Verificar comportamento com diferentes apps em segundo plano
3. Testar com chamadas telefônicas (deve pausar e não retomar automaticamente)
4. Testar com notificações de áudio (deve pausar temporariamente e retomar)

## Arquivos Modificados

- ✅ `src/hooks/useMediaSession.ts` (NOVO)
- ✅ `src/hooks/useYouTubePlayer.ts` (MODIFICADO)
- ✅ Build e sync com iOS concluídos

## Notas Técnicas

### Por que o MediaSession API é importante?

O iOS usa o MediaSession API como a interface padrão para controles de mídia. Quando o usuário interage com os controles na tela bloqueada ou no Control Center, o iOS chama os handlers registrados no MediaSession. Se não houver handlers adequados, o iOS pode tentar controlar o player diretamente, causando conflitos.

### Por que remover a lógica de "adivinhar" pausas?

A lógica anterior tentava detectar quando o usuário pausou baseando-se em eventos de visibilidade e estado do player. Isso criava race conditions onde:
1. Usuário pausa na tela bloqueada → MediaSession chama onPause
2. YouTube iframe também dispara evento de pause
3. Lógica interna "adivinha" que foi pausa do usuário
4. Ao retornar, lógica tenta retomar porque "não foi pausa do usuário"

A solução é confiar apenas no MediaSession API para ações do usuário em segundo plano.
