/**
 * API Cache System
 * Reduces Edge Function invocations by caching responses
 * Helps avoid hitting Supabase limits
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

class APICache {
  private cache: Map<string, CacheEntry<any>>;
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutos
  private readonly MAX_CACHE_SIZE = 100; // Máximo de entradas

  constructor() {
    this.cache = new Map();
    this.startCleanupInterval();
  }

  /**
   * Get cached data or fetch new data
   */
  async get<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number = this.DEFAULT_TTL
  ): Promise<T> {
    const cached = this.cache.get(key);

    // Return cached data if still valid
    if (cached && Date.now() < cached.expiresAt) {
      console.log(`[Cache] HIT: ${key}`);
      return cached.data;
    }

    // Fetch new data
    console.log(`[Cache] MISS: ${key}`);
    const data = await fetcher();

    // Store in cache
    this.set(key, data, ttl);

    return data;
  }

  /**
   * Set cache entry
   */
  set<T>(key: string, data: T, ttl: number = this.DEFAULT_TTL): void {
    // Evict oldest entry if cache is full
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + ttl,
    });
  }

  /**
   * Invalidate specific cache entry
   */
  invalidate(key: string): void {
    this.cache.delete(key);
    console.log(`[Cache] INVALIDATED: ${key}`);
  }

  /**
   * Invalidate all cache entries matching a pattern
   */
  invalidatePattern(pattern: RegExp): void {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }
    console.log(`[Cache] INVALIDATED ${count} entries matching pattern`);
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
    console.log('[Cache] CLEARED all entries');
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.MAX_CACHE_SIZE,
      usage: `${((this.cache.size / this.MAX_CACHE_SIZE) * 100).toFixed(1)}%`,
    };
  }

  /**
   * Cleanup expired entries periodically
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      const now = Date.now();
      let cleaned = 0;

      for (const [key, entry] of this.cache.entries()) {
        if (now >= entry.expiresAt) {
          this.cache.delete(key);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        console.log(`[Cache] CLEANED ${cleaned} expired entries`);
      }
    }, 60 * 1000); // Cleanup every minute
  }
}

// Singleton instance
export const apiCache = new APICache();

/**
 * Helper function for easy caching
 */
export async function getCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl?: number
): Promise<T> {
  return apiCache.get(key, fetcher, ttl);
}

/**
 * Cache TTL presets
 */
export const CacheTTL = {
  SHORT: 2 * 60 * 1000,      // 2 minutos (dados que mudam rapidamente)
  MEDIUM: 5 * 60 * 1000,     // 5 minutos (dados normais)
  LONG: 15 * 60 * 1000,      // 15 minutos (dados estáveis)
  VERY_LONG: 60 * 60 * 1000, // 1 hora (dados raramente mudam)
};

/**
 * Usage examples:
 * 
 * // Search results (short TTL - user might search again)
 * const results = await getCached(
 *   `search-${query}`,
 *   () => fetch(`/functions/v1/youtube-search?query=${query}`).then(r => r.json()),
 *   CacheTTL.SHORT
 * );
 * 
 * // Video info (medium TTL - doesn't change often)
 * const videoInfo = await getCached(
 *   `video-${videoId}`,
 *   () => fetch(`/functions/v1/youtube-video-info?videoId=${videoId}`).then(r => r.json()),
 *   CacheTTL.MEDIUM
 * );
 * 
 * // Trending (long TTL - updates hourly)
 * const trending = await getCached(
 *   'trending-music',
 *   () => fetch('/functions/v1/youtube-trending').then(r => r.json()),
 *   CacheTTL.LONG
 * );
 */
