# Teste de Controles de Reprodução

## Cenários de Teste Implementados

### 1. Play/Pause Básico (App Visível)

**Estado Inicial:**
- App aberto e visível
- Música tocando

**Ações:**
1. Clicar em pause no app
2. Verificar que `userPausedRef.current = true`
3. Verificar que `shouldBePlayingRef.current = false`
4. Verificar que `pauseTimestampRef.current` foi atualizado
5. Clicar em play no app
6. Verificar que `userPausedRef.current = false`
7. Verificar que `shouldBePlayingRef.current = true`
8. Verificar que `pauseTimestampRef.current = 0`

**Resultado Esperado:**
✅ Música pausa e retoma corretamente
✅ Estados internos corretos

### 2. Pause na Tela Bloqueada

**Estado Inicial:**
- App em segundo plano
- Tela bloqueada
- Música tocando

**Ações:**
1. Clicar em pause nos controles da tela bloqueada
2. MediaSession chama `onPause()`
3. `onPause()` chama `pause()`
4. `pause()` chama `markUserPausedIntent()`
5. `markUserPausedIntent()` define `userPausedRef.current = true`
6. YouTube iframe dispara evento `PAUSED`
7. `onStateChange` detecta `isHidden = true`
8. `onStateChange` IGNORA o evento (retorna early)

**Logs Esperados:**
```
[MediaSession] Pause action triggered by OS
[Player] pause() called - marking user pause intent
[Player] markUserPausedIntent called { wasUserPaused: false, wasShouldBePlaying: true }
[YT onStateChange] { state: 'PAUSED', isHidden: true, userPaused: true, shouldBePlaying: false }
[YT] Paused while hidden - ignoring (MediaSession will handle)
```

**Resultado Esperado:**
✅ Música pausa
✅ `userPausedRef.current = true`
✅ Não há conflito entre MediaSession e YouTube events

### 3. Play na Tela Bloqueada (Após Pause)

**Estado Inicial:**
- App em segundo plano
- Tela bloqueada
- Música pausada (usuário pausou)
- `userPausedRef.current = true`

**Ações:**
1. Clicar em play nos controles da tela bloqueada
2. MediaSession chama `onPlay()`
3. `onPlay()` chama `play()`
4. `play()` define `userPausedRef.current = false`
5. `play()` define `pauseTimestampRef.current = 0`
6. `play()` chama `playerRef.current.playVideo()`
7. YouTube iframe dispara evento `PLAYING`
8. `onStateChange` verifica `userPausedRef.current = false`
9. `onStateChange` permite reprodução

**Logs Esperados:**
```
[MediaSession] Play action triggered by OS
[Player] play() called - clearing user pause flag
[YT onStateChange] { state: 'PLAYING', isHidden: true, userPaused: false, shouldBePlaying: true }
```

**Resultado Esperado:**
✅ Música retoma
✅ `userPausedRef.current = false`
✅ Reprodução continua em segundo plano

### 4. Retornar ao App (Música Pausada)

**Estado Inicial:**
- App em segundo plano
- Música pausada pelo usuário
- `userPausedRef.current = true`

**Ações:**
1. Abrir o app (trazer para foreground)
2. `visibilitychange` event dispara
3. `handleVisibility` detecta `visibilityState = 'visible'`
4. Verifica `userPausedRef.current = true`
5. NÃO chama `playVideo()`

**Logs Esperados:**
```
[Visibility] App became visible
[Visibility] User has paused - not auto-resuming
```

**Resultado Esperado:**
✅ Música permanece pausada
✅ Não inicia automaticamente

### 5. Retornar ao App (Música Tocando)

**Estado Inicial:**
- App em segundo plano
- Música tocando
- `userPausedRef.current = false`
- `shouldBePlayingRef.current = true`

**Ações:**
1. Abrir o app (trazer para foreground)
2. `visibilitychange` event dispara
3. `handleVisibility` detecta `visibilityState = 'visible'`
4. Verifica `userPausedRef.current = false`
5. Verifica `timeSincePause > 5000`
6. Chama `playVideo()` após 300ms

**Logs Esperados:**
```
[Visibility] App became visible
[Visibility] Resuming playback on foreground
[YT onStateChange] { state: 'PLAYING', isHidden: false, userPaused: false, shouldBePlaying: true }
```

**Resultado Esperado:**
✅ Música continua tocando
✅ Transição suave

### 6. Pause Rápido Seguido de Play (Race Condition)

**Estado Inicial:**
- App visível
- Música tocando

**Ações:**
1. Clicar em pause
2. `pauseTimestampRef.current = Date.now()` (ex: 1000)
3. Imediatamente clicar em play (dentro de 500ms)
4. `pauseTimestampRef.current = 0`
5. YouTube pode disparar evento `PAUSED` atrasado
6. `onStateChange` verifica `timeSincePause = Date.now() - 0 = grande`
7. `onStateChange` NÃO marca como user pause

**Resultado Esperado:**
✅ Música retoma corretamente
✅ Não fica travada em pause

### 7. Timeout de Pause (10 segundos)

**Estado Inicial:**
- Música pausada há 11 segundos
- `userPausedRef.current = true`
- `pauseTimestampRef.current = Date.now() - 11000`

**Ações:**
1. Usuário clica em play (ou sistema tenta play)
2. YouTube dispara evento `PLAYING`
3. `onStateChange` verifica `userPausedRef.current = true`
4. `onStateChange` verifica `timeSincePause = 11000 > 10000`
5. `onStateChange` limpa flag: `userPausedRef.current = false`
6. Permite reprodução

**Logs Esperados:**
```
[YT onStateChange] { state: 'PLAYING', isHidden: false, userPaused: true, shouldBePlaying: true }
[YT] Clearing old pause flag - been too long
```

**Resultado Esperado:**
✅ Música retoma
✅ Flag de pause antigo é limpo

## Verificação de Estados

### Estados Críticos a Monitorar:

1. **userPausedRef.current**
   - `true` = Usuário pausou explicitamente
   - `false` = Usuário não pausou (ou flag foi limpo)

2. **shouldBePlayingRef.current**
   - `true` = Sistema espera que esteja tocando
   - `false` = Sistema espera que esteja pausado

3. **pauseTimestampRef.current**
   - `0` = Sem pause recente
   - `> 0` = Timestamp do último pause

### Invariantes:

- Se `userPausedRef.current = true`, então `shouldBePlayingRef.current = false`
- Se `pauseTimestampRef.current = 0`, então não há pause pendente
- Se `document.visibilityState = 'hidden'`, eventos de pause do YouTube são ignorados

## Como Executar os Testes

### No Navegador Desktop:
1. Abrir DevTools (F12)
2. Ir para Console
3. Filtrar logs por `[Player]`, `[YT]`, `[MediaSession]`
4. Executar ações manualmente
5. Verificar logs

### No iOS (Safari Web Inspector):
1. Conectar iPhone ao Mac
2. Abrir Safari > Develop > [iPhone] > [App]
3. Ir para Console
4. Executar ações no iPhone
5. Verificar logs no Mac

### Comandos de Debug no Console:

```javascript
// Ver estado atual
console.log({
  userPaused: userPausedRef.current,
  shouldBePlaying: shouldBePlayingRef.current,
  pauseTimestamp: pauseTimestampRef.current,
  timeSincePause: Date.now() - pauseTimestampRef.current
});

// Forçar play
play();

// Forçar pause
pause();

// Simular MediaSession play
navigator.mediaSession.setActionHandler('play')();

// Simular MediaSession pause
navigator.mediaSession.setActionHandler('pause')();
```

## Checklist de Validação

- [ ] Pause no app visível funciona
- [ ] Play no app visível funciona
- [ ] Pause na tela bloqueada funciona
- [ ] Play na tela bloqueada funciona
- [ ] Música não inicia sozinha ao abrir app (se estava pausada)
- [ ] Música continua ao abrir app (se estava tocando)
- [ ] Next/Previous funcionam na tela bloqueada
- [ ] Seek funciona na tela bloqueada
- [ ] Não há race conditions em pause/play rápidos
- [ ] Timeout de 10s limpa flag de pause antigo
- [ ] Logs aparecem corretamente no console
