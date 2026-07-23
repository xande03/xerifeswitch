# 🫀 Setup do Heartbeat - Xerife Music

## Problema Resolvido

O Supabase **pausa projetos Free automaticamente após 7 dias de inatividade** (sem alterações no banco de dados).

Com essa implementação:
- ✅ Tabela `app_heartbeat` é atualizada a cada 5 minutos
- ✅ Dados são **sobrescritos** (não adicionam novos registros)
- ✅ Projeto fica sempre ATIVO
- ✅ Data e hora exibidas no menu de Ferramentas

---

## 🔧 Como Implementar

### Passo 1: Criar a Tabela no Supabase

1. **Acesse o Dashboard do Supabase**:
   https://supabase.com/dashboard/project/hvslfbcsokurljstmtip/sql

2. **Clique em "New Query"**

3. **Cole o seguinte SQL**:

```sql
-- Create app_heartbeat table to keep project active
CREATE TABLE IF NOT EXISTS app_heartbeat (
  id BIGSERIAL PRIMARY KEY,
  app_name TEXT NOT NULL DEFAULT 'xerife_music',
  last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version TEXT,
  status TEXT DEFAULT 'active',
  user_count INTEGER DEFAULT 0,
  request_count INTEGER DEFAULT 0,
  CONSTRAINT one_record_per_app UNIQUE (app_name)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_app_heartbeat_app_name ON app_heartbeat(app_name);
CREATE INDEX IF NOT EXISTS idx_app_heartbeat_updated_at ON app_heartbeat(updated_at DESC);

-- Enable RLS
ALTER TABLE app_heartbeat ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anonymous reads
CREATE POLICY "Allow anonymous read" ON app_heartbeat
  FOR SELECT USING (true);

-- Policy: Allow authenticated users to update
CREATE POLICY "Allow authenticated update" ON app_heartbeat
  FOR UPDATE USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Insert initial record
INSERT INTO app_heartbeat (app_name, last_updated, updated_at, version, status)
VALUES ('xerife_music', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, '1.0', 'active')
ON CONFLICT (app_name) DO UPDATE SET
  updated_at = CURRENT_TIMESTAMP,
  last_updated = CURRENT_TIMESTAMP;

-- Grant permissions
GRANT SELECT ON app_heartbeat TO anon, authenticated;
GRANT UPDATE ON app_heartbeat TO authenticated;
```

4. **Clique em "Run"**

5. **Resultado esperado**: ✅ Tabela criada com sucesso

---

## 📱 Como Usar no App

### Arquivos Criados

1. **`src/hooks/useAppHeartbeat.ts`**
   - Hook que atualiza o heartbeat a cada 5 minutos
   - Previne pausas automáticas do Supabase

2. **`src/components/AppHeartbeatStatus.tsx`**
   - Componente visual que mostra data/hora
   - Exibido no menu de Ferramentas

3. **`src/components/DesktopSidebar.tsx`** (Atualizado)
   - Integração do componente no menu

### Como Funciona

1. **App inicia** → Hook `useAppHeartbeat` é chamado automaticamente
2. **A cada 5 minutos** → Atualização do registro na tabela
3. **Dados são sobrescritos** → Mesma linha é atualizada (sem crescimento de dados)
4. **Menu mostra status** → Data/hora do último update

---

## 🕐 O Que é Exibido no Menu

```
STATUS DO SERVIDOR
✓ (indicador verde pulsante)

Hora Local
Sexta-feira, 20 de junho de 2026, 15:42:30

Última Atualização (BD)
Sexta-feira, 20 de junho de 2026, 15:40:15

Informações
Status: ATIVO
Versão: v1.0
Projeto: Xerife Music

✅ Servidor mantém o projeto ativo 24/7 e evita pausas automáticas do Supabase
```

---

## ✅ Verificação

### No Supabase Dashboard

1. Acesse: https://supabase.com/dashboard/project/hvslfbcsokurljstmtip/editor/0
2. Selecione a tabela `app_heartbeat`
3. Você verá:
   - 1 único registro
   - Campo `updated_at` constantemente atualizado
   - Sem crescimento de linhas

### No App

1. Abra o menu de Ferramentas (ícone de engrenagem)
2. Veja a seção "STATUS DO SERVIDOR" no topo
3. Confirme que mostra data/hora atual

---

## 🔄 Como Funciona o Ciclo

```
App Inicia
    ↓
useAppHeartbeat Hook Carregado
    ↓
Primeira Atualização Imediata
    ↓
Atualização a Cada 5 Minutos
    ↓
Registro Sobrescrito (mesma linha)
    ↓
Status Exibido no Menu de Ferramentas
    ↓
Projeto Nunca Pausa ✅
```

---

## 📊 Impacto

### Antes
```
Sem heartbeat:
- Projeto pausa após 7 dias de inatividade
- Usuários recebem erro 503
- App fica indisponível
```

### Depois
```
Com heartbeat:
- Projeto SEMPRE ativo
- Database atualizada a cada 5 minutos
- 1 único registro (sem crescimento)
- 0 impacto no limite de dados (1 linha)
- Status visível para o usuário
```

---

## 💾 Consumo de Dados

```
Tabela: app_heartbeat
- 1 registro: ~200 bytes
- Atualizações: sobrescritas (sem crescimento)
- Por mês: +0 bytes (apenas 1 linha)
- Por ano: +0 bytes (apenas 1 linha)

Limite Free: 500 MB
Uso: praticamente 0
```

---

## 🎯 Benefícios

✅ **Projeto sempre ativo** - Nenhuma pausa após 7 dias  
✅ **Sem crescimento de dados** - Apenas 1 linha sobrescrita  
✅ **Visibilidade total** - Status exibido no app  
✅ **Compatível com Free Plan** - Sem impacto no limite  
✅ **Escalável** - Funciona com 1 ou 1 milhão de usuários  

---

## 🚀 Próximos Passos

1. ✅ Criar tabela no Supabase (executar SQL acima)
2. ✅ Atualizar DesktopSidebar (já feito)
3. ⏳ Fazer build e testar
4. ⏳ Verificar heartbeat no Dashboard
5. ⏳ Monitorar por 24h para confirmar

---

## 📞 Suporte

Se der erro ao criar a tabela:

1. Verifique se tem autenticação correta
2. Tente fazer login novamente no Supabase
3. Se persistir, entre em contato com support@supabase.io

---

**🎵 Com esse setup, o Xerife Music nunca mais será pausado! 🎵**
