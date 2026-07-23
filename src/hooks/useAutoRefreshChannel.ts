import { useEffect, useRef, useState } from 'react';

/**
 * Hook para atualização automática de conteúdo de canais em tempo real
 * Garante que novos vídeos de criadores sejam exibidos automaticamente
 */

interface AutoRefreshOptions {
  channelId?: string;
  enabled?: boolean;
  interval?: number;  // Intervalo em ms (padrão: 2 minutos)
  onNewContent?: (count: number) => void;
}

export function useAutoRefreshChannel(
  fetchFunction: () => Promise<any>,
  options: AutoRefreshOptions = {}
) {
  const {
    channelId,
    enabled = true,
    interval = 2 * 60 * 1000, // 2 minutos (alinhado com cache da Edge Function)
    onNewContent
  } = options;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [newContentCount, setNewContentCount] = useState(0);
  
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
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

  // Configurar polling automático
  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    // Reset por canal — evita notificação de vídeos "novos" ao trocar de contexto
    initializedRef.current = false;
    notifiedIdsRef.current = new Set();

    // Busca inicial
    fetchAndUpdate(false);

    // Configurar intervalo de atualização
    intervalRef.current = setInterval(() => {
      console.log(`[AutoRefresh] ⏰ Verificando novos vídeos em ${channelId || 'canal'}...`);
      fetchAndUpdate(true); // Silent = true para não mostrar loading
    }, interval);

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, channelId, interval]);

  // Detectar quando usuário volta para a aba/app
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && enabled) {
        console.log('[AutoRefresh] 👁️ Usuário voltou - verificando atualizações...');
        fetchAndUpdate(true);
      }
    };

    const handleFocus = () => {
      if (enabled) {
        console.log('[AutoRefresh] 🎯 App focado - verificando atualizações...');
        fetchAndUpdate(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [enabled]);

  // Cleanup ao desmontar
  useEffect(() => {
    isActiveRef.current = true;
    
    return () => {
      isActiveRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
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

/**
 * Hook para múltiplos canais (feed, subscrições, etc.)
 */
export function useMultiChannelAutoRefresh(
  channelIds: string[],
  searchFunction: (channelId: string) => Promise<any>,
  options: AutoRefreshOptions = {}
) {
  const [aggregatedData, setAggregatedData] = useState<any[]>([]);
  const [totalNewContent, setTotalNewContent] = useState(0);

  useEffect(() => {
    if (!channelIds.length || !options.enabled) return;

    const interval = setInterval(async () => {
      console.log(`[MultiChannelAutoRefresh] Atualizando ${channelIds.length} canais...`);
      
      const results = await Promise.allSettled(
        channelIds.map(id => searchFunction(id))
      );

      const successfulResults = results
        .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
        .map(r => r.value);

      setAggregatedData(successfulResults);
      
      // Detectar novo conteúdo total
      const newTotal = successfulResults.reduce((acc, data) => {
        return acc + (data?.results?.length || 0);
      }, 0);

      if (newTotal > totalNewContent) {
        const diff = newTotal - totalNewContent;
        console.log(`[MultiChannelAutoRefresh] 🎉 ${diff} novo(s) vídeo(s) no feed`);
        options.onNewContent?.(diff);
      }

      setTotalNewContent(newTotal);

    }, options.interval || 2 * 60 * 1000);

    return () => clearInterval(interval);
  }, [channelIds, options.enabled]);

  return {
    data: aggregatedData,
    newContentCount: totalNewContent
  };
}
