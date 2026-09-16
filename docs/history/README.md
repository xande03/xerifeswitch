# Histórico de sessões (arquivado)

Estes 32 arquivos são relatórios de fim de sessão gerados entre abril e agosto de 2026.
Foram movidos da raiz para cá porque:

1. **Maioria está vencida e contradiz o estado atual.** Ex.: `URGENTE_REATIVAR_SUPABASE.md`,
   `PROJETO_INATIVO_NOVAMENTE.md`, `REATIVAR_PROJETO_SUPABASE.md` e `STATUS_SUPABASE_ATUAL.md`
   descrevem o projeto Supabase como `INACTIVE` — hoje ele está **ativo** e as Edge Functions
   respondem 200 com dados do dia.
2. Seis arquivos diferentes anunciam um "deploy final concluído" com datas e versões que não
   batem entre si (`DEPLOY_COMPLETO_REALIZADO`, `DEPLOY_COMPLETO_SUCESSO`, `DEPLOY_FINAL_COMPLETO`,
   `DEPLOY_FINAL_RESUMO`, `DEPLOY_FINAL_V6_PRODUCAO`, `IMPLEMENTACAO_COMPLETA_FINAL`).
3. Vários apontam para URLs da Lovable que não existem mais
   (`xerifehub.lovable.app`, `e2889fd9-….lovableproject.com` → `404 Project not found`).

Nada foi editado ou apagado — é só `git mv`, então cada relatório continua intacto e no
`git log`. Para o estado real e verificado do projeto, leia [`../../STATUS.md`](../../STATUS.md).

| Arquivo | O que registrou | Estado hoje |
|---|---|---|
| `*INATIVO*`, `*REATIVAR*`, `STATUS_SUPABASE_ATUAL` | projeto Supabase pausado | ✅ resolvido (ativo) |
| `DEPLOY_*`, `IMPLEMENTACAO_COMPLETA_FINAL` | deploys das Edge Functions | ⚠️ parcial: functions no repo OK; CI sem secret, `ai-chat` fora do repo |
| `FIX_BACKGROUND_PLAYBACK`, `PAUSE_PERSISTENTE_IMPLEMENTADO`, `TEST_PLAYBACK_CONTROLS` | áudio em background / controles | ✅ mantido (ver `SOLUCAO_PROXY_AUDIO.md` na raiz) |
| `SISTEMA_AUTO_REFRESH_COMPLETO`, `PAGINACAO_CATALOGO_COMPLETO`, `GARANTIA_CATALOGOS_ATUALIZADOS` | frescor de catálogo (TTL/paginação) | ✅ mantido |
| `OTIMIZACAO_EDGE_FUNCTIONS_FINAL`, `OTIMIZACOES_SUPABASE_PRODUCAO`, `SUPABASE_EDGE_FUNCTIONS_UPDATE` | TTL/cache/timeout | ✅ mantido |
| `RESUMO_*`, `ATUALIZACOES_*`, `SINCRONIZACAO_FINAL_COMPLETA`, `ULTIMAS_ATUALIZACOES_BAIXADAS`, `GIT_CONFLICT_RESOLVED` | diário de sincronismo com a Lovable | 🗑️ obsoleto (projeto Lovable despublicado) |
| `ANTES_E_DEPOIS`, `GARANTIAS_IMPLEMENTADAS` | narrativa de produto/decisões | 📖 referência histórica |
| `ATUALIZACAO_HEARTBEAT_CONCLUIDA` | tabela `app_heartbeat` | ✅ mantido (migração 001) |
