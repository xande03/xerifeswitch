# 🔄 Reativar Projeto Supabase

## ⚠️ Problema Detectado

O projeto "xerife music" (ID: `hvslfbcsokurljstmtip`) está com status **INACTIVE** no Supabase.

Erro ao tentar fazer deploy:
```
unexpected deploy status 404: {"message":"Cannot retrieve service for project hvslfbcsokurljstmtip with currect status 'INACTIVE'."}
```

## 🔧 Como Reativar o Projeto

### Passo 1: Acessar o Dashboard do Supabase
1. Acesse: https://supabase.com/dashboard
2. Faça login com sua conta

### Passo 2: Localizar o Projeto
1. Procure pelo projeto **"xerife music"**
2. ID do projeto: `hvslfbcsokurljstmtip`
3. Região: West US (Oregon)

### Passo 3: Verificar Status do Projeto

O projeto pode estar pausado por:
- **Falta de pagamento** - Atualizar método de pagamento
- **Limite de uso excedido** - Upgrade do plano ou aguardar reset mensal
- **Pausado manualmente** - Clicar em "Resume" ou "Restore"
- **Problema de billing** - Resolver pendências financeiras

### Passo 4: Reativar

#### Se o projeto foi pausado:
1. Clique no projeto
2. Procure por botões como:
   - **"Resume Project"**
   - **"Restore Project"**
   - **"Unpause Project"**
3. Confirme a ação

#### Se há problema de billing:
1. Vá em **Settings** → **Billing**
2. Atualize o método de pagamento
3. Resolva qualquer pendência
4. Aguarde alguns minutos

#### Se excedeu o limite:
1. Vá em **Settings** → **Billing**
2. Faça upgrade para um plano maior, ou
3. Aguarde o reset mensal do limite

## 📋 Informações do Projeto

```
Nome: xerife music
Project ID: hvslfbcsokurljstmtip
Organization ID: rhridrycpicrrtkxbvcc
Região: West US (Oregon)
Criado em: 2026-03-29 01:52:10 UTC
```

## 🔗 Links Úteis

- **Dashboard do Projeto**: https://supabase.com/dashboard/project/hvslfbcsokurljstmtip
- **Configurações**: https://supabase.com/dashboard/project/hvslfbcsokurljstmtip/settings/general
- **Billing**: https://supabase.com/dashboard/project/hvslfbcsokurljstmtip/settings/billing
- **Edge Functions**: https://supabase.com/dashboard/project/hvslfbcsokurljstmtip/functions

## ✅ Edge Functions Deployadas (quando reativar)

Atualmente existem 10 Edge Functions no projeto:

1. ✅ youtube-search (v4)
2. ✅ youtube-video-info (v4)
3. ✅ youtube-general-search (v4)
4. ✅ youtube-trending (v4)
5. ✅ youtube-artist-info (v3)
6. ✅ youtube-album-tracks (v4)
7. ✅ youtube-download (v4)
8. ✅ fetch-lyrics (v4)
9. ✅ ai-chat (v4)
10. ✅ quick-responder (v1)

## 🚀 Após Reativar

Depois que o projeto for reativado, rode:

```bash
# Verificar se está ativo
npx supabase projects list

# Testar as funções
npx supabase functions list

# Redeploy se necessário
npx supabase functions deploy youtube-search --no-verify-jwt
```

## 📧 Suporte Supabase

Se precisar de ajuda:
- **Email**: support@supabase.io
- **Discord**: https://discord.supabase.com
- **Documentação**: https://supabase.com/docs

## ⏰ Tempo Estimado

Depois de resolver o problema de pagamento/limite:
- Reativação automática: 5-10 minutos
- Reativação manual: Imediato após clicar em "Resume"

## 🔍 Como Verificar se Reativou

1. Tente acessar o dashboard do projeto
2. Verifique se consegue ver as Edge Functions
3. Tente fazer um deploy de teste
4. Verifique se o app consegue fazer requisições

## 💡 Dica

Para evitar pausas futuras:
1. Configure alertas de uso no dashboard
2. Mantenha um método de pagamento válido
3. Monitore o uso mensal
4. Considere upgrade se próximo do limite
