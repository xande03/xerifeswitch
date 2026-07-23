# Como Testar no iOS

## Pré-requisitos

- Mac com Xcode instalado
- iPhone conectado via cabo USB
- Conta Apple Developer (pode ser gratuita)
- Safari no Mac

## Passo 1: Abrir o Projeto no Xcode

```bash
# No terminal, na pasta do projeto:
npx cap open ios
```

Isso abrirá o Xcode automaticamente com o projeto iOS.

## Passo 2: Configurar Assinatura

1. No Xcode, selecione o projeto "App" na barra lateral esquerda
2. Selecione o target "App"
3. Vá para a aba "Signing & Capabilities"
4. Em "Team", selecione sua conta Apple Developer
5. Se não tiver, clique em "Add Account..." e faça login

## Passo 3: Conectar o iPhone

1. Conecte o iPhone ao Mac via cabo USB
2. No iPhone, quando aparecer "Confiar neste computador?", toque em "Confiar"
3. Digite a senha do iPhone se solicitado
4. No Xcode, no topo, selecione seu iPhone como destino (ao lado do botão Play)

## Passo 4: Build e Executar

1. Clique no botão Play (▶️) no Xcode ou pressione Cmd+R
2. Aguarde o build (pode demorar alguns minutos na primeira vez)
3. O app será instalado e aberto automaticamente no iPhone

## Passo 5: Confiar no Desenvolvedor (Primeira Vez)

Se aparecer erro "Desenvolvedor não confiável":

1. No iPhone, vá em: Ajustes > Geral > Gerenciamento de Dispositivo
2. Toque no seu perfil de desenvolvedor
3. Toque em "Confiar em [seu email]"
4. Confirme
5. Volte ao Xcode e execute novamente

## Passo 6: Habilitar Web Inspector

### No iPhone:
1. Ajustes > Safari > Avançado
2. Ative "Web Inspector"

### No Mac:
1. Safari > Preferências > Avançado
2. Marque "Mostrar menu Desenvolver na barra de menus"

## Passo 7: Conectar o Safari Web Inspector

1. Com o app aberto no iPhone
2. No Mac, abra o Safari
3. Menu Desenvolver > [Nome do seu iPhone] > [Nome do App]
4. Isso abrirá o Web Inspector conectado ao app

## Passo 8: Executar os Testes

### Teste 1: Pause na Tela Bloqueada

1. No app, inicie uma música
2. Bloqueie o iPhone (botão lateral)
3. Na tela bloqueada, você verá os controles de mídia
4. Clique no botão de pause
5. **Verificar:** Música deve pausar

**No Safari Web Inspector (Console):**
```
[MediaSession] Pause action triggered by OS
[Player] pause() called - marking user pause intent
[Player] markUserPausedIntent called
```

6. Clique no botão de play
7. **Verificar:** Música deve retomar

**No Safari Web Inspector (Console):**
```
[MediaSession] Play action triggered by OS
[Player] play() called - clearing user pause flag
```

### Teste 2: Retornar ao App (Pausado)

1. Com a música pausada
2. Desbloqueie o iPhone
3. Abra o app
4. **Verificar:** Música deve permanecer pausada (NÃO iniciar sozinha)

**No Safari Web Inspector (Console):**
```
[Visibility] App became visible
[Visibility] User has paused - not auto-resuming
```

### Teste 3: Segundo Plano

1. Inicie uma música
2. Vá para a tela inicial (sem bloquear)
3. Abra o Control Center (deslize de cima para baixo)
4. Pause a música nos controles
5. **Verificar:** Música deve pausar
6. Volte ao app de música
7. **Verificar:** Música deve continuar pausada

### Teste 4: Navegação (Next/Previous)

1. Inicie uma música
2. Bloqueie o iPhone
3. Na tela bloqueada, clique em "próxima"
4. **Verificar:** Deve trocar para a próxima música
5. Clique em "anterior"
6. **Verificar:** Deve voltar para a música anterior

### Teste 5: Chamada Telefônica

1. Inicie uma música
2. Peça para alguém te ligar (ou use outro telefone)
3. **Verificar:** Música deve pausar automaticamente
4. Atenda a chamada
5. Encerre a chamada
6. **Verificar:** Música NÃO deve retomar automaticamente
7. Manualmente, dê play
8. **Verificar:** Música deve retomar normalmente

## Comandos Úteis no Console

### Ver Estado Atual
```javascript
// Cole no console do Safari Web Inspector
console.log({
  isPlaying: playerState.isPlaying,
  isHidden: document.visibilityState === 'hidden',
  mediaSessionState: navigator.mediaSession.playbackState
});
```

### Simular Play/Pause
```javascript
// Simular play da tela bloqueada
navigator.mediaSession.setActionHandler('play')();

// Simular pause da tela bloqueada
navigator.mediaSession.setActionHandler('pause')();
```

### Filtrar Logs
No console do Safari Web Inspector, use o filtro:
- `[Player]` - Ver apenas logs do player
- `[MediaSession]` - Ver apenas logs da MediaSession
- `[YT]` - Ver apenas logs do YouTube
- `[Visibility]` - Ver apenas logs de visibilidade

## Problemas Comuns

### "Could not launch [App]"
**Solução:** Desconecte e reconecte o iPhone, depois tente novamente.

### "Developer Mode Required"
**Solução (iOS 16+):**
1. Ajustes > Privacidade e Segurança > Modo de Desenvolvedor
2. Ative o Modo de Desenvolvedor
3. Reinicie o iPhone
4. Confirme quando solicitado

### App não aparece no menu Desenvolver do Safari
**Solução:**
1. Verifique se Web Inspector está ativado no iPhone
2. Feche e abra o Safari no Mac
3. Desconecte e reconecte o iPhone

### Música não toca
**Solução:**
1. Verifique se o volume do iPhone não está no mínimo
2. Verifique se o modo silencioso não está ativado
3. Tente tocar uma música diferente

## Checklist de Validação

Após executar todos os testes, marque:

- [ ] Pause na tela bloqueada funciona
- [ ] Play na tela bloqueada funciona
- [ ] Música não inicia sozinha ao abrir app (se estava pausada)
- [ ] Música continua ao abrir app (se estava tocando)
- [ ] Next/Previous funcionam na tela bloqueada
- [ ] Controles no Control Center funcionam
- [ ] Chamada telefônica pausa a música
- [ ] Música não retoma após chamada (usuário controla)
- [ ] Logs aparecem corretamente no Safari Web Inspector
- [ ] Não há erros no console

## Próximos Passos

Se todos os testes passarem:
1. ✅ Marcar issue como resolvido
2. ✅ Fazer commit das mudanças
3. ✅ Fazer deploy para produção

Se algum teste falhar:
1. ❌ Anotar qual teste falhou
2. ❌ Copiar os logs do console
3. ❌ Reportar o problema com detalhes

## Suporte

Se precisar de ajuda:
1. Verifique os logs no Safari Web Inspector
2. Consulte `GARANTIAS_IMPLEMENTADAS.md` para entender o comportamento esperado
3. Consulte `TEST_PLAYBACK_CONTROLS.md` para cenários detalhados
4. Consulte `FIX_BACKGROUND_PLAYBACK.md` para detalhes técnicos
