import { Bell, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface NewContentBadgeProps {
  count: number;
  onRefresh: () => void;
  onDismiss: () => void;
  channelName?: string;
  position?: 'top' | 'floating';
}

/**
 * Badge flutuante que notifica usuário sobre novo conteúdo disponível
 * Aparece quando criadores publicam novos vídeos
 */
export function NewContentBadge({
  count,
  onRefresh,
  onDismiss,
  channelName,
  position = 'top'
}: NewContentBadgeProps) {
  if (count === 0) return null;

  const positionClasses = position === 'floating'
    ? 'fixed top-20 left-1/2 -translate-x-1/2 z-[200]'
    : 'sticky top-0 z-50';

  return (
    <div
      className={`${positionClasses} animate-in slide-in-from-top duration-300`}
    >
      <div className="bg-primary text-primary-foreground shadow-2xl rounded-full px-4 py-2 flex items-center gap-3 mx-auto max-w-fit border-2 border-primary/30">
        {/* Ícone animado */}
        <div className="relative">
          <Bell size={18} className="animate-bounce" />
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
        </div>

        {/* Mensagem */}
        <div className="flex flex-col">
          <span className="text-sm font-bold">
            {count === 1 ? 'Novo vídeo disponível!' : `${count} novos vídeos!`}
          </span>
          {channelName && (
            <span className="text-xs opacity-90">
              {channelName}
            </span>
          )}
        </div>

        {/* Botão de atualizar */}
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            onRefresh();
            onDismiss();
          }}
          className="h-7 px-3 gap-1.5 bg-white/20 hover:bg-white/30 text-primary-foreground font-semibold"
        >
          <RefreshCw size={14} />
          <span className="text-xs">Atualizar</span>
        </Button>

        {/* Botão de dispensar */}
        <button
          onClick={onDismiss}
          className="w-5 h-5 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors"
          aria-label="Dispensar"
        >
          <span className="text-xs">×</span>
        </button>
      </div>
    </div>
  );
}

/**
 * Badge compacto para lista de canais
 */
export function CompactNewContentBadge({ count }: { count: number }) {
  if (count === 0) return null;

  return (
    <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center animate-pulse shadow-lg">
      {count > 9 ? '9+' : count}
    </div>
  );
}

/**
 * Notificação inline para feed
 */
export function InlineNewContentNotice({
  count,
  onRefresh
}: {
  count: number;
  onRefresh: () => void;
}) {
  if (count === 0) return null;

  return (
    <button
      onClick={onRefresh}
      className="w-full bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 border border-primary/20 rounded-lg p-3 flex items-center justify-center gap-2 hover:bg-primary/20 transition-all group"
    >
      <RefreshCw size={16} className="text-primary group-hover:rotate-180 transition-transform duration-500" />
      <span className="text-sm font-medium text-primary">
        {count === 1 
          ? 'Novo vídeo disponível - Clique para atualizar' 
          : `${count} novos vídeos disponíveis - Clique para atualizar`
        }
      </span>
      <Bell size={14} className="text-primary animate-bounce" />
    </button>
  );
}

export default NewContentBadge;
