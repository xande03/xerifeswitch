/**
 * Placeholder progressivo exibido durante o refresh por swipe.
 * Mantém o layout previsível enquanto os vídeos mais recentes chegam.
 */
interface RefreshSkeletonProps {
  rows?: number;
  variant?: "grid" | "list";
}

const RefreshSkeleton = ({ rows = 3, variant = "grid" }: RefreshSkeletonProps) => {
  if (variant === "list") {
    return (
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-3 animate-pulse">
            <div className="w-32 aspect-video rounded-lg bg-muted flex-shrink-0" />
            <div className="flex-1 space-y-2 py-1">
              <div className="h-3 bg-muted rounded w-3/4" />
              <div className="h-2.5 bg-muted rounded w-1/2" />
              <div className="h-2.5 bg-muted rounded w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="animate-pulse">
          <div className="w-full aspect-video rounded-xl bg-muted mb-2" />
          <div className="flex gap-3">
            <div className="w-9 h-9 rounded-full bg-muted flex-shrink-0" />
            <div className="flex-1 space-y-2 py-1">
              <div className="h-3 bg-muted rounded w-full" />
              <div className="h-3 bg-muted rounded w-2/3" />
              <div className="h-2.5 bg-muted rounded w-1/2" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default RefreshSkeleton;
