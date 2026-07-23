import React, { useState, useEffect } from 'react';
import { useHeartbeatInfo, useAppHeartbeat } from '@/hooks/useAppHeartbeat';
import { Clock } from 'lucide-react';

/**
 * Component to display app heartbeat status
 * Shows current date and time from Supabase
 * Indicates that the app is keeping the project active
 */
export function AppHeartbeatStatus() {
  // Initialize heartbeat (starts updating every 5 minutes)
  useAppHeartbeat();

  // Get heartbeat info
  const { heartbeatInfo, loading } = useHeartbeatInfo();

  const [currentTime, setCurrentTime] = useState<string>('');
  const [localTime, setLocalTime] = useState<string>('');

  // Update local time display every second
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setLocalTime(now.toLocaleString('pt-BR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }));
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);

    return () => clearInterval(interval);
  }, []);

  // Format Supabase timestamp
  useEffect(() => {
    if (heartbeatInfo?.updated_at) {
      const date = new Date(heartbeatInfo.updated_at);
      const formatted = date.toLocaleString('pt-BR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      setCurrentTime(formatted);
    }
  }, [heartbeatInfo]);

  return (
    <div className="bg-gradient-to-br from-blue-900/20 to-purple-900/20 border border-blue-500/20 rounded-lg p-4 mb-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Clock className="w-4 h-4 text-blue-400" />
        <span className="text-sm font-semibold text-blue-300">Status do Servidor</span>
        <span className="ml-auto w-2 h-2 bg-green-500 rounded-full animate-pulse" />
      </div>

      {/* Current Time Section */}
      <div className="space-y-2 text-xs">
        {/* Local Time */}
        <div>
          <p className="text-gray-400 uppercase tracking-wide text-xs font-medium mb-1">
            Hora Local
          </p>
          <p className="text-gray-200 font-mono text-sm">
            {localTime || 'Carregando...'}
          </p>
        </div>

        {/* Supabase Time */}
        <div className="pt-2 border-t border-blue-500/10">
          <p className="text-gray-400 uppercase tracking-wide text-xs font-medium mb-1">
            Última Atualização (BD)
          </p>
          <p className="text-gray-200 font-mono text-sm">
            {loading ? 'Carregando...' : (currentTime || 'Sem dados')}
          </p>
        </div>

        {/* Status Info */}
        {heartbeatInfo && (
          <div className="pt-2 border-t border-blue-500/10">
            <p className="text-gray-400 uppercase tracking-wide text-xs font-medium mb-1">
              Informações
            </p>
            <div className="space-y-1 text-gray-300">
              <p>
                <span className="text-gray-500">Status:</span>{' '}
                <span className="text-green-400 font-medium">
                  {heartbeatInfo.status?.toUpperCase() || 'ATIVO'}
                </span>
              </p>
              <p>
                <span className="text-gray-500">Versão:</span>{' '}
                <span className="text-gray-300">{heartbeatInfo.version || 'v1.0'}</span>
              </p>
              <p>
                <span className="text-gray-500">Projeto:</span>{' '}
                <span className="text-gray-300 capitalize">
                  {heartbeatInfo.app_name?.replace(/_/g, ' ') || 'Xerife Music'}
                </span>
              </p>
            </div>
          </div>
        )}

        {/* Info Text */}
        <div className="pt-2 border-t border-blue-500/10">
          <p className="text-gray-400 text-xs leading-relaxed">
            ✅ Servidor mantém o projeto ativo 24/7 e evita pausas automáticas do Supabase
          </p>
        </div>
      </div>
    </div>
  );
}

export default AppHeartbeatStatus;
