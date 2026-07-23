# 📱 COMO EXECUTAR O XERIFE MUSIC

## ✅ STATUS ATUAL

- ✅ Todas as atualizações da Lovable puxadas
- ✅ Sistema de Heartbeat implementado
- ✅ Controles de mídia nativos instalados
- ✅ `capacitor-music-controls-plugin@6.1.0` sincronizado
- ✅ Build completo (dist/)
- ✅ Sync iOS e Android completo
- ✅ Android Studio aberto
- ✅ Xcode pronto

---

## 🤖 EXECUTAR NO ANDROID

### Opção 1: Via Android Studio (RECOMENDADO)

O Android Studio já está aberto. Siga estes passos:

1. **Aguarde o Gradle Sync**
   - Android Studio está carregando o projeto
   - Aguarde a mensagem "Gradle sync finished"
   - Pode demorar 1-3 minutos na primeira vez

2. **Conecte um Dispositivo Android**
   - **Dispositivo físico:** Conecte via USB e ative "Depuração USB"
   - **Emulador:** Clique em "Device Manager" → Selecione um emulador

3. **Execute o App**
   - Clique no botão ▶️ (Play) no topo do Android Studio
   - Ou pressione **Shift+F10**
   - Aguarde o build e instalação (~2-5 minutos)

### Opção 2: Via Linha de Comando

Se preferir usar o terminal:

```bash
# Listar dispositivos disponíveis
npx cap run android --list

# Executar em dispositivo específico
npx cap run android --target=<DEVICE_ID>
```

**Dispositivos detectados:**
- Medium Phone API 36.1 (emulador)
- Television (1080p) (emulador)

---

## 🍎 EXECUTAR NO iOS

### Via Xcode (RECOMENDADO)

O Xcode já está aberto com o projeto. Siga estes passos:

1. **Conecte seu iPhone**
   - Conecte via USB ao Mac
   - Confie no computador se solicitado no iPhone

2. **Selecione o Dispositivo**
   - No topo do Xcode, clique no menu de dispositivos
   - Selecione seu iPhone (ou um simulador)

3. **Execute o App**
   - Clique no botão ▶️ (Play) no topo do Xcode
   - Ou pressione **Cmd+R**
   - Aguarde o build e instalação

4. **Se aparecer "Untrusted Developer"**
   - No iPhone: Settings → General → VPN & Device Management
   - Toque no seu certificado de desenvolvedor
   - Toque em "Trust"

### Via Linha de Comando

```bash
# Executar no iOS
npx cap run ios
```

---

## 🎯 O QUE TESTAR APÓS EXECUTAR

### 1. **Lock Screen Controls** (iOS e Android)

**Teste:**
1. Abra o app
2. Toque uma música qualquer
3. Bloqueie a tela do dispositivo
4. **Resultado esperado:**
   - ✅ Música continua tocando
   - ✅ Controles aparecem na lock screen
   - ✅ Capa do álbum visível
   - ✅ Botões Play/Pause/Next/Previous funcionam

### 2. **Notificação Persistente** (Android)

**Teste:**
1. Com música tocando
2. Minimize o app (botão Home)
3. Abaixe a barra de notificações
4. **Resultado esperado:**
   - ✅ Notificação com player visível
   - ✅ Capa do álbum na notificação
   - ✅ Título e artista corretos
   - ✅ Controles funcionam na notificação
   - ✅ Não pode ser removida enquanto toca

### 3. **Control Center** (iOS)

**Teste:**
1. Com música tocando
2. Swipe up (ou down em iPhones novos) para Control Center
3. **Resultado esperado:**
   - ✅ Player do Xerife Music visível
   - ✅ Capa do álbum grande
   - ✅ Controles completos
   - ✅ Barra de progresso (se disponível)

### 4. **Background Audio**

**Teste:**
1. Toque uma música
2. Minimize o app
3. Aguarde 5 minutos
4. **Resultado esperado:**
   - ✅ Música continua tocando
   - ✅ Não pausa automaticamente
   - ✅ App não é morto pelo sistema

### 5. **Headphone Controls**

**Teste:**
1. Conecte um fone de ouvido
2. Toque uma música
3. Use os botões do fone (play/pause/next)
4. **Resultado esperado:**
   - ✅ Controles do fone funcionam
   - ✅ Play/Pause responde
   - ✅ Next/Previous muda música (se disponível)

### 6. **Sistema de Heartbeat**

**Teste:**
1. Abra o app
2. Clique no ícone ⚙️ (Ferramentas) na sidebar
3. **Resultado esperado:**
   - ✅ Status do Servidor visível no topo
   - ✅ Hora local atualizando em tempo real
   - ✅ Última atualização do BD visível
   - ✅ Indicador verde pulsante
   - ✅ Status: ATIVO

**Console (DevTools):**
- Abra DevTools no navegador (F12)
- Console deve mostrar:
  ```
  [Heartbeat] ✅ Updated at [data/hora]
  ```
- A cada 5 minutos, novo log aparece

---

## 🔧 TROUBLESHOOTING

### Erro: "Plugin not found"

**Solução:**
```bash
npm install
npx cap sync
```

### Erro: Gradle sync failed (Android)

**Solução:**
1. File → Invalidate Caches → Invalidate and Restart
2. Aguarde reabrir e sincronizar novamente

### Erro: Code signing (iOS)

**Solução:**
1. No Xcode: App → Signing & Capabilities
2. Selecione seu Apple ID em "Team"
3. Xcode configurará automaticamente

### Áudio não continua em background

**Solução Android:**
1. Verificar permissões no AndroidManifest.xml
2. Verificar Foreground Service está ativo

**Solução iOS:**
1. Verificar Background Modes em Info.plist
2. Deve conter: `audio`

### Controles nativos não aparecem

**Solução:**
```bash
# Limpar build
rm -rf android/build ios/build

# Sync novamente
npx cap sync

# Reinstalar app no dispositivo
```

---

## 📊 INFORMAÇÕES DO PLUGIN

### capacitor-music-controls-plugin

**Versão instalada:** 6.1.0

**Funcionalidades:**
- ✅ Lock screen controls (iOS + Android)
- ✅ Notification player (Android)
- ✅ MPNowPlayingInfoCenter (iOS)
- ✅ Remote command handling
- ✅ Background audio keep-alive

**Compatibilidade:**
- iOS 13.0+
- Android API 21+ (Android 5.0+)

**Registrado em:**
- ✅ MainActivity.java (Android)
- ✅ Podfile (iOS)
- ✅ capacitor.config.ts

---

## 📱 DISPOSITIVOS TESTÁVEIS

### Android
- ✅ Medium Phone API 36.1 (emulador)
- ✅ Television 1080p (emulador)
- ✅ Qualquer dispositivo físico com USB debugging

### iOS
- ✅ iPhone simuladores (iOS 13+)
- ✅ Dispositivos físicos iPhone/iPad

---

## 🎵 RECURSOS NATIVOS IMPLEMENTADOS

### Android
```
✅ Foreground Service com notificação
✅ Notification media controls
✅ Wake lock (mantém CPU ativa)
✅ Audio focus management
✅ MediaSession integration
✅ Play/Pause/Next/Previous na notificação
```

### iOS
```
✅ MPNowPlayingInfoCenter
✅ Remote Command Center
✅ Background audio session
✅ Lock screen controls
✅ Control Center integration
✅ AirPlay ready
```

### Web (PWA)
```
✅ Media Session API
✅ Notification API
✅ Service Worker ready
✅ Background sync
```

---

## 🚀 COMANDOS ÚTEIS

### Build e Sync
```bash
# Build do projeto React
npm run build

# Sync com iOS e Android
npx cap sync

# Sync específico
npx cap sync android
npx cap sync ios
```

### Executar
```bash
# Android
npx cap open android    # Abre Android Studio
npx cap run android     # Executa direto

# iOS
npx cap open ios        # Abre Xcode
npx cap run ios         # Executa direto
```

### Debug
```bash
# Ver logs Android
npx cap run android --livereload

# Ver logs iOS
npx cap run ios --livereload
```

### Limpar Build
```bash
# Android
cd android
./gradlew clean

# iOS
cd ios
rm -rf DerivedData
```

---

## 📚 ARQUIVOS IMPORTANTES

### Configuração
- `capacitor.config.ts` - Configuração principal do Capacitor
- `android/app/src/main/AndroidManifest.xml` - Permissões Android
- `ios/App/App/Info.plist` - Configurações iOS

### Native Music Controls
- `src/lib/nativeMusicControls.ts` - API do plugin
- `src/hooks/useYouTubePlayer.ts` - Integração com player
- `src/hooks/useMediaSession.ts` - Media Session API

### Heartbeat System
- `supabase/migrations/001_create_app_heartbeat.sql` - SQL da tabela
- `src/hooks/useAppHeartbeat.ts` - Hook de atualização
- `src/components/AppHeartbeatStatus.tsx` - Componente visual

---

## 🎯 CHECKLIST DE TESTES

### Antes de Publicar
- [ ] Testar em iPhone físico
- [ ] Testar em Android físico
- [ ] Verificar lock screen controls
- [ ] Confirmar notificação persistente (Android)
- [ ] Testar Control Center (iOS)
- [ ] Verificar background audio (5+ minutos)
- [ ] Testar controles de fone de ouvido
- [ ] Confirmar heartbeat funcionando
- [ ] Verificar Edge Functions ativas
- [ ] Testar em diferentes versões de OS

### Performance
- [ ] App não trava
- [ ] Áudio não tem cortes
- [ ] Transições suaves
- [ ] Build size aceitável (~1MB gzip)
- [ ] Consumo de bateria razoável

---

## 📞 SUPORTE

### Links Úteis
- [Capacitor Docs](https://capacitorjs.com/docs)
- [Music Controls Plugin](https://github.com/gokhanakkurt/capacitor-music-controls-plugin)
- [Android Audio Focus](https://developer.android.com/guide/topics/media-apps/audio-focus)
- [iOS Background Audio](https://developer.apple.com/documentation/avfoundation/media_playback/creating_a_basic_video_player_ios_and_tvos)

### Documentação Local
- `ATUALIZACOES_LOVABLE_PUXADAS.md` - Detalhes das atualizações
- `ATUALIZACAO_HEARTBEAT_CONCLUIDA.md` - Sistema de heartbeat
- `SUPABASE_HEARTBEAT_SETUP.md` - Setup do heartbeat

---

**🎵 TUDO PRONTO PARA EXECUTAR E TESTAR O XERIFE MUSIC!**

**Android Studio está aberto** → Execute o app pelo ▶️  
**Xcode está aberto** → Execute o app pelo ▶️

*Última atualização: 21 de junho de 2026, 13:30*
