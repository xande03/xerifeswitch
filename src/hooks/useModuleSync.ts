import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Módulos disponíveis no app
 */
export type AppModule = 
  | 'footer'
  | 'sidebar'
  | 'header'
  | 'now-playing'
  | 'dynamic-island'
  | 'quality-badge'
  | 'picture-in-picture'
  | 'chromecast'
  | 'lyrics'
  | 'chords'
  | 'comments'
  | 'related-videos';

export interface ModuleConfig {
  module: AppModule;
  enabled: boolean;
  desktop?: boolean;
  mobile?: boolean;
  tablet?: boolean;
  lastUpdated: number;
}

interface ModuleStateEvent {
  module: AppModule;
  enabled: boolean;
  desktop?: boolean;
  mobile?: boolean;
  tablet?: boolean;
  timestamp: number;
}

const MODULE_CONFIG_KEY = 'xerife_module_config';

/**
 * Hook para sincronizar configuração de módulos entre dispositivos
 * Permite que administradores façam mudanças que se refletem em tempo real
 */
export function useModuleSync(module: AppModule) {
  const [isEnabled, setIsEnabled] = useState(() => {
    try {
      const config = localStorage.getItem(MODULE_CONFIG_KEY);
      if (!config) return true; // Padrão: ativado
      
      const parsed = JSON.parse(config);
      const moduleConfig = parsed[module];
      
      if (!moduleConfig) return true;
      return moduleConfig.enabled;
    } catch {
      return true;
    }
  });

  const [isDesktopMode, setIsDesktopMode] = useState(() => {
    try {
      const config = localStorage.getItem(MODULE_CONFIG_KEY);
      if (!config) return true;
      
      const parsed = JSON.parse(config);
      const moduleConfig = parsed[module];
      
      if (!moduleConfig) return true;
      return moduleConfig.desktop !== false;
    } catch {
      return true;
    }
  });

  const [isMobileMode, setIsMobileMode] = useState(() => {
    try {
      const config = localStorage.getItem(MODULE_CONFIG_KEY);
      if (!config) return true;
      
      const parsed = JSON.parse(config);
      const moduleConfig = parsed[module];
      
      if (!moduleConfig) return true;
      return moduleConfig.mobile !== false;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    // Subscrever a mudanças de configuração via Supabase Broadcast
    const channel = supabase
      .channel('module-config')
      .on('broadcast', { event: 'module-change' }, (payload) => {
        const event = payload.payload as ModuleStateEvent;
        
        if (event.module === module) {
          setIsEnabled(event.enabled);
          
          if (event.desktop !== undefined) {
            setIsDesktopMode(event.desktop);
          }
          
          if (event.mobile !== undefined) {
            setIsMobileMode(event.mobile);
          }
          
          // Salvar configuração local
          saveModuleConfig(module, {
            module,
            enabled: event.enabled,
            desktop: event.desktop,
            mobile: event.mobile,
            tablet: event.tablet,
            lastUpdated: event.timestamp,
          });
          
          // Disparar evento customizado
          window.dispatchEvent(new CustomEvent('module-config-changed', {
            detail: event
          }));
        }
      })
      .subscribe();

    // Escutar mudanças de storage (de outras abas)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === MODULE_CONFIG_KEY && e.newValue) {
        try {
          const config = JSON.parse(e.newValue);
          const moduleConfig = config[module];
          
          if (moduleConfig) {
            setIsEnabled(moduleConfig.enabled);
            setIsDesktopMode(moduleConfig.desktop !== false);
            setIsMobileMode(moduleConfig.mobile !== false);
          }
        } catch {}
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [module]);

  return {
    isEnabled,
    isDesktopMode,
    isMobileMode,
    updateConfig: (config: Partial<ModuleConfig>) => {
      updateModuleConfig(module, config);
    },
  };
}

/**
 * Atualizar configuração de módulo (normalmente chamado por admin)
 */
export async function updateModuleConfig(
  module: AppModule,
  config: Partial<ModuleConfig>
) {
  try {
    // Salvar localmente
    const current = getModuleConfig(module);
    const updated: ModuleConfig = {
      ...current,
      ...config,
      lastUpdated: Date.now(),
    };
    
    saveModuleConfig(module, updated);
    
    // Broadcast para todos os dispositivos
    await supabase
      .channel('module-config')
      .send({
        type: 'broadcast',
        event: 'module-change',
        payload: {
          module,
          ...updated,
          timestamp: Date.now(),
        },
      });
    
    return updated;
  } catch (error) {
    console.error('Erro ao atualizar configuração de módulo:', error);
    throw error;
  }
}

/**
 * Obter configuração de módulo
 */
export function getModuleConfig(module: AppModule): ModuleConfig {
  try {
    const config = localStorage.getItem(MODULE_CONFIG_KEY);
    if (!config) return getDefaultModuleConfig(module);
    
    const parsed = JSON.parse(config);
    return parsed[module] || getDefaultModuleConfig(module);
  } catch {
    return getDefaultModuleConfig(module);
  }
}

/**
 * Configuração padrão de módulo
 */
function getDefaultModuleConfig(module: AppModule): ModuleConfig {
  return {
    module,
    enabled: true,
    desktop: true,
    mobile: true,
    tablet: true,
    lastUpdated: 0,
  };
}

/**
 * Salvar configuração de módulo localmente
 */
function saveModuleConfig(module: AppModule, config: ModuleConfig) {
  try {
    const current = localStorage.getItem(MODULE_CONFIG_KEY);
    const parsed = current ? JSON.parse(current) : {};
    
    parsed[module] = config;
    
    localStorage.setItem(MODULE_CONFIG_KEY, JSON.stringify(parsed));
  } catch (error) {
    console.error('Erro ao salvar configuração de módulo:', error);
  }
}

/**
 * Resetar todas as configurações para padrão
 */
export function resetAllModuleConfigs() {
  try {
    localStorage.removeItem(MODULE_CONFIG_KEY);
    
    supabase
      .channel('module-config')
      .send({
        type: 'broadcast',
        event: 'reset-all-modules',
        payload: { timestamp: Date.now() },
      });
  } catch (error) {
    console.error('Erro ao resetar configurações:', error);
  }
}
