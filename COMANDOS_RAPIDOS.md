# Comandos Rápidos - Xerife Music

## 🚀 Desenvolvimento

### Instalar Dependências
```bash
npm install
```

### Rodar em Desenvolvimento
```bash
npm run dev
```

### Build para Produção
```bash
npm run build
```

### Preview do Build
```bash
npm run preview
```

## 📱 Capacitor (iOS/Android)

### Sync com Plataformas
```bash
npx cap sync
```

### Sync Apenas iOS
```bash
npx cap sync ios
```

### Sync Apenas Android
```bash
npx cap sync android
```

### Abrir no Xcode (iOS)
```bash
npx cap open ios
```

### Abrir no Android Studio
```bash
npx cap open android
```

### Build e Sync (Sequência Completa)
```bash
npm run build && npx cap sync
```

## 🔧 Supabase Edge Functions

### Login no Supabase
```bash
npx supabase login
```

### Linkar Projeto
```bash
npx supabase link --project-ref hvslfbcsokurljstmtip
```

### Deploy Todas as Funções
```bash
npx supabase functions deploy
```

### Deploy Função Específica
```bash
npx supabase functions deploy youtube-search
```

### Ver Logs em Tempo Real
```bash
npx supabase functions logs --tail
```

### Ver Logs de Função Específica
```bash
npx supabase functions logs youtube-search --tail
```

### Listar Funções
```bash
npx supabase functions list
```

### Listar Secrets
```bash
npx supabase secrets list
```

### Definir Secret
```bash
npx supabase secrets set SECRET_NAME=value
```

## 🧪 Testes

### Rodar Testes
```bash
npm test
```

### Rodar Testes em Watch Mode
```bash
npm run test:watch
```

### Lint
```bash
npm run lint
```

## 🔍 Debug

### Ver Versão do Node
```bash
node --version
```

### Ver Versão do npm
```bash
npm --version
```

### Ver Versão do Capacitor
```bash
npx cap --version
```

### Ver Versão do Supabase CLI
```bash
npx supabase --version
```

### Limpar Cache do npm
```bash
npm cache clean --force
```

### Reinstalar Dependências
```bash
Remove-Item -Recurse -Force node_modules
npm install
```

## 📊 Informações do Projeto

### Ver Dependências Desatualizadas
```bash
npm outdated
```

### Atualizar Dependências
```bash
npm update
```

### Auditar Segurança
```bash
npm audit
```

### Corrigir Vulnerabilidades
```bash
npm audit fix
```

## 🌐 URLs Importantes

### Dashboard Supabase
```
https://supabase.com/dashboard/project/hvslfbcsokurljstmtip
```

### Edge Functions URL Base
```
https://hvslfbcsokurljstmtip.supabase.co/functions/v1/
```

### Testar Edge Function (curl)
```bash
curl https://hvslfbcsokurljstmtip.supabase.co/functions/v1/youtube-trending
```

## 🔄 Workflow Completo

### Desenvolvimento Local
```bash
# 1. Instalar dependências
npm install

# 2. Rodar em dev
npm run dev

# 3. Fazer mudanças no código

# 4. Build
npm run build

# 5. Sync com plataformas
npx cap sync

# 6. Testar no iOS
npx cap open ios
```

### Deploy para Produção
```bash
# 1. Build
npm run build

# 2. Sync
npx cap sync

# 3. Deploy Edge Functions (se necessário)
npx supabase functions deploy

# 4. Abrir Xcode e fazer build para App Store
npx cap open ios
```

## 🐛 Troubleshooting

### Erro de Dependências
```bash
Remove-Item -Recurse -Force node_modules
Remove-Item package-lock.json
npm install
```

### Erro no Capacitor
```bash
npx cap sync
npx cap doctor
```

### Erro no Supabase
```bash
npx supabase login
npx supabase link --project-ref hvslfbcsokurljstmtip
```

### Limpar Tudo e Recomeçar
```bash
Remove-Item -Recurse -Force node_modules
Remove-Item -Recurse -Force dist
Remove-Item package-lock.json
npm install
npm run build
npx cap sync
```

## 📝 Atalhos Úteis

### Build Rápido
```bash
npm run build && npx cap sync ios
```

### Ver Logs do iOS
```bash
# No Safari: Develop > [iPhone] > [App]
```

### Testar Edge Function
```bash
curl -X POST https://hvslfbcsokurljstmtip.supabase.co/functions/v1/youtube-search \
  -H "Content-Type: application/json" \
  -d '{"q": "test"}'
```

## 🎯 Comandos Mais Usados

```bash
# Desenvolvimento diário
npm run dev

# Build e teste
npm run build && npx cap sync && npx cap open ios

# Deploy Edge Functions
npx supabase functions deploy

# Ver logs
npx supabase functions logs --tail
```

## 💡 Dicas

1. **Sempre fazer build antes de sync**: `npm run build && npx cap sync`
2. **Usar Safari Web Inspector para debug iOS**: Develop > [iPhone] > [App]
3. **Verificar logs das Edge Functions**: `npx supabase functions logs --tail`
4. **Limpar cache se houver problemas**: `npm cache clean --force`
5. **Reinstalar dependências se necessário**: `Remove-Item -Recurse -Force node_modules && npm install`
