import { useState, useEffect } from 'react';

/**
 * Debounce hook to reduce API calls
 * Particularly useful for search inputs
 * 
 * Example:
 * const [searchQuery, setSearchQuery] = useState('');
 * const debouncedQuery = useDebouncedValue(searchQuery, 500);
 * 
 * useEffect(() => {
 *   if (debouncedQuery.length > 2) {
 *     performSearch(debouncedQuery);
 *   }
 * }, [debouncedQuery]);
 */
export function useDebouncedValue<T>(value: T, delay: number = 500): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Set timeout to update debounced value after delay
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Clear timeout if value changes before delay expires
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Debounce callback function
 * Use when you need to debounce a function call instead of a value
 * 
 * Example:
 * const debouncedSearch = useDebouncedCallback((query) => {
 *   performSearch(query);
 * }, 500);
 * 
 * <input onChange={(e) => debouncedSearch(e.target.value)} />
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number = 500
): (...args: Parameters<T>) => void {
  const [timeoutId, setTimeoutId] = useState<ReturnType<typeof setTimeout> | null>(null);

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    const newTimeoutId = setTimeout(() => {
      callback(...args);
    }, delay);

    setTimeoutId(newTimeoutId);
  };
}

/**
 * Throttle hook - limits function calls to once per interval
 * Different from debounce: executes immediately and then blocks for interval
 * 
 * Example:
 * const throttledScroll = useThrottledCallback((event) => {
 *   handleScroll(event);
 * }, 100);
 * 
 * <div onScroll={throttledScroll}>...</div>
 */
export function useThrottledCallback<T extends (...args: any[]) => any>(
  callback: T,
  interval: number = 500
): (...args: Parameters<T>) => void {
  const [lastCall, setLastCall] = useState<number>(0);

  return (...args: Parameters<T>) => {
    const now = Date.now();
    
    if (now - lastCall >= interval) {
      setLastCall(now);
      callback(...args);
    }
  };
}
