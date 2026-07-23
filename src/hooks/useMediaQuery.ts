import { useState, useEffect } from 'react';

/**
 * Hook para media queries responsivas
 * Permite detectar breakpoints de forma reativa
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.matchMedia(query).matches;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      const mediaQuery = window.matchMedia(query);
      
      const handleChange = (e: MediaQueryListEvent | Event) => {
        if (e instanceof MediaQueryListEvent) {
          setMatches(e.matches);
        }
      };

      mediaQuery.addEventListener('change', handleChange);
      setMatches(mediaQuery.matches);

      return () => {
        mediaQuery.removeEventListener('change', handleChange);
      };
    } catch {
      return undefined;
    }
  }, [query]);

  return matches;
}

/**
 * Hook para detectar breakpoints Tailwind
 */
export function useResponsive() {
  const isMobile = useMediaQuery('(max-width: 640px)');
  const isTablet = useMediaQuery('(min-width: 641px) and (max-width: 1024px)');
  const isDesktop = useMediaQuery('(min-width: 1025px)');
  const isMobileOrTablet = useMediaQuery('(max-width: 1024px)');
  const isLargeScreen = useMediaQuery('(min-width: 1920px)');

  return {
    isMobile,
    isTablet,
    isDesktop,
    isMobileOrTablet,
    isLargeScreen,
  };
}
