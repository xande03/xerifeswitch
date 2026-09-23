import { useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hvslfbcsokurljstmtip.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2c2xmYmNzb2t1cmxqc3RtdGlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU2NzI5MjcsImV4cCI6MjA2MTI0ODkyN30.NZhv8qRZqI3jYKZCJXVqCHpLfNg5UKxq0zH3L7-1KBs';

/**
 * Hook to keep the Supabase project active - DESATIVADO para economizar EGRESS
 * 
 * ANTES: Atualizava app_heartbeat a cada 5 minutos → gerou 358GB de egress
 * AGORA: Desativado - projeto pausa após 7 dias sem uso real (comportamento padrão Free)
 * 
 * Se tiver 1 usuário/dia buscando música, o projeto NÃO pausa mesmo sem heartbeat.
 * Para reativar, descomente o código abaixo e use intervalo de 5 DIAS (432000000ms)
 */
export function useAppHeartbeat() {
  useEffect(() => {
    // HEARTBEAT DESATIVADO - Economiza 99.9% de egress
    // Motivo: 358GB estourados por polling a cada 5min + 30s em cada dispositivo
    console.log('[Heartbeat] ⏸️ Desativado - Egress protegido (pausa após 7 dias sem uso)');
    
    // Para reativar com intervalo seguro (5 dias), descomente:
    /*
    const updateHeartbeat = async () => {
      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        const { error } = await supabase
          .from('app_heartbeat')
          .upsert({
            app_name: 'xerife_music',
            last_updated: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            version: '1.0',
            status: 'active'
          }, { onConflict: 'app_name', ignoreDuplicates: false })
          .select();
        if (!error) console.log('[Heartbeat] ✅ 5 dias');
      } catch (err) { console.warn('[Heartbeat] Exception:', err); }
    };
    updateHeartbeat();
    const interval = setInterval(updateHeartbeat, 5 * 24 * 60 * 60 * 1000); // 5 dias
    return () => clearInterval(interval);
    */
  }, []);
}

/**
 * Hook to get the current heartbeat info - DESATIVADO para economizar EGRESS
 * 
 * ANTES: Buscava a cada 30 segundos → 2.880 req/dia por usuário
 * AGORA: Retorna status estático sem bater no Supabase (0 egress)
 */
export function useHeartbeatInfo() {
  const [heartbeatInfo] = React.useState<any>({
    app_name: 'xerife_music',
    status: 'economia',
    version: 'v1.0',
    updated_at: new Date().toISOString(),
    _egress_protected: true,
    _mensagem: 'Heartbeat desativado para zerar egress (358GB). Projeto pausa após 7 dias sem uso real.'
  });
  const [loading] = React.useState(false);

  // Nenhum fetch ao Supabase - 0 egress
  // Para reativar leitura real, descomente o fetch único sem intervalo:
  /*
  React.useEffect(() => {
    const fetchOnce = async () => {
      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        const { data } = await supabase.from('app_heartbeat').select('*').eq('app_name', 'xerife_music').single();
        if (data) setHeartbeatInfo(data);
      } catch {}
    };
    fetchOnce();
  }, []);
  */

  return { heartbeatInfo, loading };
}

// Export React for useHeartbeatInfo
import * as React from 'react';
