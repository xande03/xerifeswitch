import { useMemo, useState } from "react";
import { Heart, ThumbsUp, ThumbsDown, MessageSquare, ArrowUpDown, Check } from "lucide-react";
import type { Comment } from "@/lib/youtubeVideoInfo";

interface VideoCommentsProps {
  comments: Comment[];
  loading?: boolean;
  /** Show YouTube-style header with count + sort. Defaults to true. */
  showHeader?: boolean;
}

type SortMode = "top" | "new";

const parseTimeToOrder = (s?: string): number => {
  if (!s) return 0;
  const m = s.match(/(\d+)\s*(segundo|minuto|hora|dia|semana|m[eê]s|ano)/i);
  if (!m) return 0;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const mult =
    unit.startsWith("seg") ? 1 :
    unit.startsWith("min") ? 60 :
    unit.startsWith("hor") ? 3600 :
    unit.startsWith("dia") ? 86400 :
    unit.startsWith("sem") ? 604800 :
    unit.startsWith("m") ? 2592000 :
    31536000;
  // smaller value = newer
  return n * mult;
};

const VideoComments = ({ comments, loading, showHeader = true }: VideoCommentsProps) => {
  const [sort, setSort] = useState<SortMode>("top");
  const [sortOpen, setSortOpen] = useState(false);

  const sorted = useMemo(() => {
    const list = [...comments];
    if (sort === "top") list.sort((a, b) => (b.likes || 0) - (a.likes || 0));
    else list.sort((a, b) => parseTimeToOrder(a.publishedTime) - parseTimeToOrder(b.publishedTime));
    return list;
  }, [comments, sort]);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3 animate-pulse">
            <div className="w-9 h-9 rounded-full bg-muted flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-2 bg-muted rounded w-1/3" />
              <div className="h-3 bg-muted rounded w-full" />
              <div className="h-3 bg-muted rounded w-2/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!loading && comments.length === 0) {
    return (
      <div className="py-6 text-center">
        <MessageSquare size={22} className="mx-auto text-muted-foreground/60 mb-2" />
        <p className="text-sm text-muted-foreground">Comentários não disponíveis</p>
      </div>
    );
  }

  return (
    <div>
      {showHeader && (
        <div className="flex items-center gap-6 mb-6">
          <h3 className="text-xl md:text-2xl font-bold text-foreground tracking-tight">
            {comments.length.toLocaleString("pt-BR")} comentário{comments.length === 1 ? "" : "s"}
          </h3>
          <div className="relative">
            <button
              onClick={() => setSortOpen((v) => !v)}
              className="flex items-center gap-1.5 text-[13px] font-medium text-foreground/80 hover:text-foreground transition-colors"
            >
              <ArrowUpDown size={14} />
              Ordenar por
            </button>
            {sortOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSortOpen(false)} />
                <div className="absolute left-0 top-full mt-2 z-50 min-w-[180px] rounded-xl border border-border bg-popover shadow-2xl py-1.5">
                  {[
                    { id: "top" as SortMode, label: "Mais relevantes" },
                    { id: "new" as SortMode, label: "Mais recentes" },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => { setSort(opt.id); setSortOpen(false); }}
                      className="w-full flex items-center justify-between px-3 py-2 text-[13px] text-foreground hover:bg-accent transition-colors"
                    >
                      {opt.label}
                      {sort === opt.id && <Check size={14} className="text-primary" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="space-y-5 font-sans">
        {sorted.map((comment, i) => (
          <article key={i} className="flex gap-3 items-start">
            {/* Avatar column — fixed width keeps every comment's text/actions at the same left edge */}
            <div className="w-10 flex-shrink-0">
              {comment.authorThumbnail ? (
                <img
                  src={comment.authorThumbnail}
                  alt={comment.author}
                  className="w-10 h-10 rounded-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-sm text-muted-foreground font-medium">
                  {comment.author.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            {/* Body — min-w-0 lets long text wrap without pushing actions off-screen */}
            <div className="flex-1 min-w-0">
              <header className="flex items-baseline gap-2 flex-wrap leading-tight">
                <span className="text-[13px] font-medium text-foreground tracking-[0.1px] truncate max-w-[60%]">
                  {comment.author}
                </span>
                {comment.publishedTime ? (
                  <span className="text-[12px] text-muted-foreground tracking-[0.2px]">
                    {comment.publishedTime}
                  </span>
                ) : (
                  <span className="text-[12px] text-muted-foreground/70 tracking-[0.2px]">
                    há pouco tempo
                  </span>
                )}
              </header>

              <p className="text-[14px] text-foreground/95 mt-1.5 leading-[1.45] tracking-[0.1px] break-words whitespace-pre-line font-normal">
                {comment.content}
              </p>

              <div className="flex items-center gap-1 mt-2 -ml-2 text-muted-foreground">
                <button
                  className="inline-flex items-center gap-1.5 h-8 px-2 rounded-full text-[12px] font-medium hover:bg-accent hover:text-foreground transition-colors"
                  aria-label="Gostei"
                >
                  <ThumbsUp size={15} strokeWidth={1.8} />
                  {comment.likes > 0 && <span className="tracking-[0.2px]">{comment.likes}</span>}
                </button>
                <button
                  className="inline-flex items-center justify-center h-8 w-8 rounded-full hover:bg-accent hover:text-foreground transition-colors"
                  aria-label="Não gostei"
                >
                  <ThumbsDown size={15} strokeWidth={1.8} />
                </button>
                <button className="h-8 px-3 rounded-full text-[12px] font-semibold tracking-[0.3px] hover:bg-accent hover:text-foreground transition-colors">
                  Responder
                </button>
                {comment.isHearted && (
                  <span className="ml-1 inline-flex items-center gap-1 text-[11px]">
                    <Heart size={12} className="text-primary fill-primary" />
                    <span className="text-primary/80">Curtido pelo criador</span>
                  </span>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};

export default VideoComments;
