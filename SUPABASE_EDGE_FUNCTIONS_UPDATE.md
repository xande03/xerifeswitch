# Atualização das Edge Functions do Supabase

## Status Atual

- ✅ Dependências do projeto reinstaladas
- ✅ Edge Functions verificadas e analisadas
- ⚠️ Projeto Supabase está PAUSADO
- ⚠️ Precisa ser despausado em: https://supabase.com/dashboard/project/hvslfbcsokurljstmtip

## Edge Functions Existentes

1. **youtube-search** - Busca de músicas no YouTube Music
2. **youtube-trending** - Músicas em alta/trending
3. **youtube-video-info** - Informações de vídeos
4. **youtube-artist-info** - Informações de artistas
5. **youtube-album-tracks** - Faixas de álbuns
6. **youtube-download** - Download de músicas
7. **youtube-general-search** - Busca geral
8. **fetch-lyrics** - Busca de letras
9. **ai-chat** - Chat com IA

## Melhorias Implementadas nas Edge Functions

### 1. Rate Limiting
- ✅ Implementado em `_shared/rateLimiter.ts`
- Limita requisições por IP
- Proteção contra abuso

### 2. Server-Side Caching
- ✅ Implementado em `_shared/serverCache.ts`
- Cache compartilhado entre usuários
- Reduz chamadas à API do YouTube

### 3. CORS Headers
- ✅ Configurado para aceitar requisições do app
- Headers necessários para Capacitor/iOS

## Comandos para Deploy (Quando Projeto for Despausado)

### 1. Despa usar o Projeto no Dashboard
Acesse: https://supabase.com/dashboard/project/hvslfbcsokurljstmtip

### 2. Fazer Login no Supabase CLI
```bash
npx supabase login
```

### 3. Linkar o Projeto
```bash
npx supabase link --project-ref hvslfbcsokurljstmtip
```

### 4. Deploy de Todas as Edge Functions
```bash
# Deploy todas de uma vez
npx supabase functions deploy

# Ou deploy individual
npx supabase functions deploy youtube-search
npx supabase functions deploy youtube-trending
npx supabase functions deploy youtube-video-info
npx supabase functions deploy youtube-artist-info
npx supabase functions deploy youtube-album-tracks
npx supabase functions deploy youtube-download
npx supabase functions deploy youtube-general-search
npx supabase functions deploy fetch-lyrics
npx supabase functions deploy ai-chat
```

### 5. Verificar Deploy
```bash
npx supabase functions list
```

## Configurações Importantes

### Variáveis de Ambiente (Se Necessário)

Se alguma Edge Function precisar de variáveis de ambiente:

```bash
npx supabase secrets set YOUTUBE_API_KEY=your_key_here
npx supabase secrets set OPENAI_API_KEY=your_key_here
```

### Verificar Secrets Atuais
```bash
npx supabase secrets list
```

## Teste das Edge Functions

Após o deploy, teste cada função:

### 1. YouTube Search
```bash
curl -X POST https://hvslfbcsokurljstmtip.supabase.co/functions/v1/youtube-search \
  -H "Content-Type: application/json" \
  -d '{"q": "test"}'
```

### 2. YouTube Trending
```bash
curl https://hvslfbcsokurljstmtip.supabase.co/functions/v1/youtube-trending
```

### 3. Fetch Lyrics
```bash
curl -X POST https://hvslfbcsokurljstmtip.supabase.co/functions/v1/fetch-lyrics \
  -H "Content-Type: application/json" \
  -d '{"artist": "Artist Name", "title": "Song Title"}'
```

## Monitoramento

### Ver Logs em Tempo Real
```bash
npx supabase functions logs youtube-search --tail
```

### Ver Logs de Todas as Funções
```bash
npx supabase functions logs --tail
```

## Otimizações Recomendadas

### 1. Aumentar Timeout (Se Necessário)
No `supabase/config.toml`, adicione:

```toml
[functions.youtube-search]
verify_jwt = false
timeout = 30  # segundos (padrão é 10)

[functions.youtube-trending]
verify_jwt = false
timeout = 60  # trending pode demorar mais
```

### 2. Configurar Limites de Memória
```toml
[functions.youtube-search]
verify_jwt = false
memory = 256  # MB (padrão é 128)
```

### 3. Habilitar Logs Detalhados
```toml
[functions.youtube-search]
verify_jwt = false
log_level = "debug"  # ou "info", "warn", "error"
```

## Troubleshooting

### Erro: "project is paused"
**Solução:** Despausar o projeto no dashboard do Supabase

### Erro: "unauthorized"
**Solução:** Fazer login novamente
```bash
npx supabase login
```

### Erro: "function not found"
**Solução:** Verificar se o deploy foi bem-sucedido
```bash
npx supabase functions list
```

### Erro: "timeout"
**Solução:** Aumentar timeout no config.toml

### Erro: "rate limit exceeded"
**Solução:** Ajustar limites em `_shared/rateLimiter.ts`

## Integração com o App

As Edge Functions já estão integradas no app através de:

```typescript
// src/integrations/supabase/client.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://hvslfbcsokurljstmtip.supabase.co'
const supabaseAnonKey = 'your-anon-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

### Exemplo de Chamada
```typescript
const { data, error } = await supabase.functions.invoke('youtube-search', {
  body: { q: 'search query' }
})
```

## Checklist de Deploy

- [ ] Despausar projeto no dashboard
- [ ] Fazer login no Supabase CLI
- [ ] Linkar projeto
- [ ] Deploy de todas as Edge Functions
- [ ] Verificar lista de funções
- [ ] Testar cada função
- [ ] Verificar logs
- [ ] Configurar variáveis de ambiente (se necessário)
- [ ] Atualizar config.toml (se necessário)
- [ ] Testar integração com o app
- [ ] Monitorar logs por alguns minutos

## Próximos Passos

1. **Despausar o projeto** no dashboard do Supabase
2. **Executar os comandos de deploy** listados acima
3. **Testar todas as funções** para garantir que estão funcionando
4. **Verificar logs** para identificar possíveis erros
5. **Testar no app** para garantir integração completa

## Notas Importantes

- As Edge Functions usam Deno, não Node.js
- Rate limiting é in-memory, então pode ser resetado entre deploys
- Cache é compartilhado entre usuários para economizar chamadas à API
- CORS está configurado para aceitar requisições de qualquer origem (*)
- JWT verification está desabilitado para permitir chamadas públicas

## Suporte

Se encontrar problemas:
1. Verificar logs: `npx supabase functions logs --tail`
2. Verificar status: `npx supabase status`
3. Documentação: https://supabase.com/docs/guides/functions
4. Discord: https://discord.supabase.com
