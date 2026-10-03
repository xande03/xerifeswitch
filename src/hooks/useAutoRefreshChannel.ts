import { useEffect, useRef, useState } from 'react';

/**
 * Hook para atualização automática de conteúdo de canais em tempo real
 * Garante que novos vídeos de criadores sejam exibidos automaticamente
 */

interface AutoRefreshOptions {
  channelId?: string;
  enabled?: boolean;
  // (revisão25ª: opção `interval` REMOVIDA — não há mais polling; o hook só
  // carrega no mount/atualiza por gesto.)
  onNewContent?: (count: number) => void;
}

export function useAutoRefreshChannel(
  fetchFunction: () => Promise<any>,
  options: AutoRefreshOptions = {}
) {
  const {
    channelId,
    enabled = true,
    onNewContent
  } = options;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [newContentCount, setNewContentCount] = useState(0);
  
  const previousDataRef = useRef<any>(null);
  const isActiveRef = useRef(true);
  // IDs já contabilizados — evita loop de notificação para os mesmos vídeos
  const notifiedIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  // Função de fetch com detecção de novo conteúdo
  const fetchAndUpdate = async (silent = false) => {
    if (!enabled || !isActiveRef.current) return;

    try {
      if (!silent) setLoading(true);

      const newData = await fetchFunction();

      const newVideos = (newData?.results || newData) as any[];
      if (Array.isArray(newVideos)) {
        if (!initializedRef.current) {
          // Primeira carga: apenas registra IDs, sem notificar
          newVideos.forEach((v: any) => v?.videoId && notifiedIdsRef.current.add(v.videoId));
          initializedRef.current = true;
        } else {
          const trulyNew = newVideos.filter(
            (v: any) => v?.videoId && !notifiedIdsRef.current.has(v.videoId)
          );
          if (trulyNew.length > 0) {
            trulyNew.forEach((v: any) => notifiedIdsRef.current.add(v.videoId));
            console.log(`[AutoRefresh] 🎉 ${trulyNew.length} novo(s) vídeo(s) em ${channelId || 'canal'}`);
            setNewContentCount(prev => prev + trulyNew.length);
            onNewContent?.(trulyNew.length);
          }
        }
      }

      previousDataRef.current = newData;
      // Mescla com o que já estava carregado para preservar a paginação
      // do usuário: novos vídeos vão para o topo, os antigos mantêm a
      // ordem e nada é descartado do catálogo já visível.
      setData((prev: any) => {
        const prevList = (prev?.results || prev || []) as any[];
        const nextList = (newData?.results || newData || []) as any[];
        if (!Array.isArray(nextList) || nextList.length === 0) return prev ?? newData;
        if (!Array.isArray(prevList) || prevList.length === 0) return newData;
        const prevIds = new Set(prevList.map((v: any) => v?.videoId).filter(Boolean));
        const prepend = nextList.filter((v: any) => v?.videoId && !prevIds.has(v.videoId));
        const merged = [...prepend, ...prevList];
        if (newData && typeof newData === 'object' && !Array.isArray(newData) && 'results' in newData) {
          return { ...newData, results: merged };
        }
        return merged;
      });
      setLastUpdate(new Date());

    } catch (error) {
      console.error('[AutoRefresh] Erro ao atualizar:', error);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // (polling automático REMOVIDO — revisão22ª: sem pulso de rede ao Supabase)
  useEffect(() => {
    if (!enabled) return;
    // Reset por canal — evita notificação de vídeos "novos" ao trocar de contexto
    initializedRef.current = false;
    notifiedIdsRef.current = new Set();

    // Busca inicial (carga de conteúdo no mount). O intervalo de atualização
    // (2min) e os refreshs por focus/visibility foram REMOVIDOS — revisão22ª:
    // nenhum pulso automático ao Supabase; atualização = gesto do usuário.
    fetchAndUpdate(false);

    return () => {};
  }, [enabled, channelId]);

  // (refresh por focus/visibility REMOVIDO — revisão22ª, sem pulso de rede)

  // Cleanup ao desmontar
  useEffect(() => {
    isActiveRef.current = true;
    
    return () => {
      isActiveRef.current = false;
    };
  }, []);

  // Função para forçar atualização manual
  const forceRefresh = () => {
    console.log('[AutoRefresh] 🔄 Atualização manual forçada');
    return fetchAndUpdate(false);
  };

  // Resetar contador de novo conteúdo
  const resetNewContentCount = () => {
    setNewContentCount(0);
  };

  return {
    data,
    loading,
    lastUpdate,
    newContentCount,
    forceRefresh,
    resetNewContentCount,
    isAutoRefreshEnabled: enabled
  };
}

/**
 * Hook específico para atualização de lista de vídeos de canal
 */
export function useChannelAutoRefresh(
  channelId: string,
  searchFunction: (channelId: string, options?: any) => Promise<any>,
  options: Omit<AutoRefreshOptions, 'channelId'> = {}
) {
  return useAutoRefreshChannel(
    () => searchFunction(channelId, { sortByDate: true, fresh: true }),
    { ...options, channelId }
  );
}
