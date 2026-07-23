/**
 * In-memory server-side cache for edge functions.
 * Shares cached responses across ALL users hitting the same edge function instance.
 * This drastically reduces YouTube API calls when multiple users search for similar content.
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

// Cleanup stale entries periodically
let lastCleanup = Date.now();
function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < 120_000) return; // every 2min
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (now > entry.expiresAt) store.delete(key);
  }
}

export interface ServerCacheOptions {
  /** TTL in milliseconds (default: 10 minutes) */
  ttlMs?: number;
  /** Max entries before pruning oldest (default: 200) */
  maxEntries?: number;
}

/**
 * Get a cached value, or compute and cache it.
 */
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: ServerCacheOptions = {}
): Promise<T> {
  cleanup();

  const ttlMs = opts.ttlMs ?? 10 * 60 * 1000; // 10 min default
  const maxEntries = opts.maxEntries ?? 200;
  const now = Date.now();

  const existing = store.get(key) as CacheEntry<T> | undefined;
  if (existing && now < existing.expiresAt) {
    console.log(`[ServerCache] HIT: ${key}`);
    return existing.data;
  }

  console.log(`[ServerCache] MISS: ${key}`);
  const data = await fetcher();

  // Prune if at capacity
  if (store.size >= maxEntries) {
    let oldestKey = "";
    let oldestTime = Infinity;
    for (const [k, v] of store) {
      if (v.expiresAt < oldestTime) {
        oldestTime = v.expiresAt;
        oldestKey = k;
      }
    }
    if (oldestKey) store.delete(oldestKey);
  }

  store.set(key, { data, expiresAt: now + ttlMs });
  return data;
}

/**
 * Get current cache stats (for debugging).
 */
export function getCacheStats() {
  return { entries: store.size };
}
