# Configuração de CI/CD para Edge Functions

## ✅ Workflow Configurado

O workflow de CI/CD já está configurado em `.github/workflows/deploy-edge-functions.yml` e fará deploy automático das edge functions sempre que houver mudanças em `supabase/functions/` na branch `main`.

## 📋 Próximos Passos

### 1. Adicionar o Secret no GitHub

Para que o workflow funcione automaticamente, você precisa adicionar o token de acesso do Supabase como secret no GitHub:

1. Acesse o repositório no GitHub: https://github.com/xande03/xerifemusic-51b4ae49
2. Vá em **Settings** → **Secrets and variables** → **Actions**
3. Clique em **New repository secret**
4. Configure:
   - **Name**: `SUPABASE_ACCESS_TOKEN`
   - **Value**: `sbp_38ee1070463a6f90aa354965a1214bada5e7e81b`
5. Clique em **Add secret**

### 2. Verificar a Conexão do Projeto

Certifique-se de que o projeto está conectado ao GitHub:

1. Acesse o painel da Lovable
2. Vá em **Settings** → **GitHub**
3. Verifique se está conectado ao repositório correto

## 🚀 Como Funciona

Após configurar o secret, o deploy será automático:

1. Você faz alterações em qualquer arquivo dentro de `supabase/functions/`
2. Faz commit e push para a branch `main`
3. O GitHub Actions detecta as mudanças
4. Executa o workflow automaticamente
5. Faz deploy de todas as edge functions alteradas

## 📊 Status Atual das Edge Functions

Todas as 9 edge functions estão deployadas e ativas (versão 2):

- ✅ youtube-search
- ✅ youtube-video-info
- ✅ youtube-general-search
- ✅ youtube-trending
- ✅ youtube-artist-info
- ✅ youtube-album-tracks
- ✅ youtube-download
- ✅ fetch-lyrics
- ✅ ai-chat

## 🔍 Monitoramento

Você pode monitorar os deploys em:
- GitHub Actions: https://github.com/xande03/xerifemusic-51b4ae49/actions
- Supabase Dashboard: https://supabase.com/dashboard/project/hvslfbcsokurljstmtip/functions

## 🛠️ Deploy Manual (se necessário)

Se precisar fazer deploy manual de uma função específica:

```bash
npx supabase functions deploy <nome-da-funcao> --no-verify-jwt
```

Para fazer deploy de todas as funções:

```bash
for dir in supabase/functions/*/; do
  fn=$(basename "$dir")
  if [ "$fn" = "_shared" ]; then continue; fi
  echo "Deploying $fn..."
  npx supabase functions deploy "$fn" --no-verify-jwt
done
```
