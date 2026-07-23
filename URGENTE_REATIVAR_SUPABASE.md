# 🚨 URGENTE: Projeto Supabase Inativo - Ação Necessária

## ❌ Problema Atual

O projeto "xerife music" está **INATIVO** no Supabase e não é possível fazer deploy das Edge Functions.

```
Project ID: hvslfbcsokurljstmtip
Status: INACTIVE
Região: West US (Oregon)
```

## 🔥 AÇÃO IMEDIATA NECESSÁRIA

### 1. Acesse o Dashboard
👉 **Link direto**: https://supabase.com/dashboard/project/hvslfbcsokurljstmtip

### 2. Verifique o Status

Quando você acessar, você verá uma das seguintes situações:

#### 💳 Situação A: Problema de Pagamento
**Mensagem esperada**: "Payment method required" ou "Billing issue"

**SOLUÇÃO**:
1. Vá em **Settings** → **Billing**
2. Adicione/atualize seu método de pagamento
3. Resolva qualquer cobrança pendente
4. Aguarde 5-10 minutos para reativação

#### ⏸️ Situação B: Projeto Pausado
**Mensagem esperada**: "Project is paused" ou botão "Resume"

**SOLUÇÃO**:
1. Clique em **"Resume Project"** ou **"Restore"**
2. Confirme a ação
3. Aguarde 2-3 minutos

#### 📊 Situação C: Limite de Uso Excedido
**Mensagem esperada**: "Usage limit exceeded"

**SOLUÇÃO**:
1. Upgrade para plano Pro: https://supabase.com/dashboard/project/hvslfbcsokurljstmtip/settings/billing
2. Ou aguarde o reset mensal (dia 1 do mês)

#### 🗑️ Situação D: Projeto Deletado/Restaurar
**Mensagem esperada**: "Project deleted" ou "Restore from backup"

**SOLUÇÃO**:
1. Clique em **"Restore Project"**
2. Selecione o backup mais recente
3. Confirme a restauração

## ✅ Como Confirmar que Reativou

Após tomar a ação, rode este comando:

```bash
npx supabase functions list
```

**Resultado esperado**: Lista de 10 funções ativas

Se ainda der erro, aguarde 5-10 minutos e tente novamente.

## 📋 Checklist de Verificação

- [ ] Acessei o dashboard do Supabase
- [ ] Identifiquei o motivo da inativação
- [ ] Tomei a ação necessária (pagamento/resume/upgrade)
- [ ] Aguardei o tempo de reativação
- [ ] Testei o comando `npx supabase functions list`
- [ ] Vejo as funções listadas com status ACTIVE

## 🔄 Depois da Reativação

Assim que o projeto estiver ativo novamente, eu poderei:

1. ✅ Fazer redeploy de todas as Edge Functions
2. ✅ Verificar se todas estão funcionando
3. ✅ Testar as requisições do app
4. ✅ Confirmar que tudo está operacional

## 📞 Contatos de Emergência

**Supabase Support**:
- Email: support@supabase.io
- Discord: https://discord.supabase.com
- Status: https://status.supabase.com

## ⚡ Comandos Úteis (Após Reativar)

```bash
# Verificar projetos
npx supabase projects list

# Listar funções
npx supabase functions list

# Redeploy todas as funções
npx supabase functions deploy youtube-search --no-verify-jwt
npx supabase functions deploy youtube-video-info --no-verify-jwt
npx supabase functions deploy youtube-general-search --no-verify-jwt
npx supabase functions deploy youtube-trending --no-verify-jwt
npx supabase functions deploy youtube-artist-info --no-verify-jwt
npx supabase functions deploy youtube-album-tracks --no-verify-jwt
npx supabase functions deploy youtube-download --no-verify-jwt
npx supabase functions deploy fetch-lyrics --no-verify-jwt
npx supabase functions deploy ai-chat --no-verify-jwt
```

## 🎯 Objetivo Final

**Edge Functions que precisam estar ativas**:

1. youtube-search - Busca de músicas no YouTube
2. youtube-video-info - Informações de vídeos
3. youtube-general-search - Busca geral
4. youtube-trending - Músicas em alta
5. youtube-artist-info - Info de artistas
6. youtube-album-tracks - Faixas de álbuns
7. youtube-download - Download de áudio
8. fetch-lyrics - Busca de letras
9. ai-chat - Chat com IA
10. quick-responder - Respostas rápidas

## 💰 Informação de Custos

**Plano Free do Supabase**:
- Edge Functions: 500K invocações/mês
- Database: 500MB
- Storage: 1GB
- Bandwidth: 5GB

**Plano Pro** ($25/mês):
- Edge Functions: 2M invocações/mês
- Database: 8GB
- Storage: 100GB
- Bandwidth: 250GB

## 🔐 Credenciais Já Configuradas

```
Project ID: hvslfbcsokurljstmtip
Token: sbp_38ee1070463a6f90aa354965a1214bada5e7e81b (já configurado)
Region: West US (Oregon)
Organization: rhridrycpicrrtkxbvcc
```

## ⏰ Próximos Passos

1. **AGORA**: Reative o projeto no dashboard
2. **Depois**: Me avise que reativou para eu fazer o deploy
3. **Final**: Testar o app e confirmar que tudo funciona

---

**Status Atual**: ⏸️ Aguardando reativação do projeto  
**Última tentativa de deploy**: Falhou - Projeto INACTIVE  
**Próxima ação**: Reativar projeto no dashboard do Supabase
