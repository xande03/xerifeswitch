const SearchSkeleton = () => (
  <div className="space-y-3 animate-pulse">
    {Array.from({ length: 5 }).map((_, i) => (
      <div key={i} className="flex items-center gap-3 p-3">
        <div className="w-12 h-12 rounded-md bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-muted rounded w-3/4" />
          <div className="h-2 bg-muted rounded w-1/2" />
        </div>
        <div className="h-3 bg-muted rounded w-10" />
      </div>
    ))}
  </div>
);

export default SearchSkeleton;
