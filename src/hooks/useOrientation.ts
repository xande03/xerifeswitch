import { useState, useEffect } from 'react';

/**
 * Hook para detectar mudanças de orientação do dispositivo
 * Retorna: 'portrait', 'landscape'
 */
export function useOrientation() {
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(() => {
    if (typeof window === 'undefined') return 'portrait';
    return window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
  });

  const [isLandscapeMode, setIsLandscapeMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth > window.innerHeight;
  });

  useEffect(() => {
    const handleOrientationChange = () => {
      const isLandscape = window.innerWidth > window.innerHeight;
      setOrientation(isLandscape ? 'landscape' : 'portrait');
      setIsLandscapeMode(isLandscape);
      
      // Dispatch custom event para outros componentes
      window.dispatchEvent(new CustomEvent('orientationchange', { 
        detail: { orientation: isLandscape ? 'landscape' : 'portrait' } 
      }));
    };

    const handleResize = () => {
      const isLandscape = window.innerWidth > window.innerHeight;
      setOrientation(isLandscape ? 'landscape' : 'portrait');
      setIsLandscapeMode(isLandscape);
    };

    window.addEventListener('orientationchange', handleOrientationChange);
    window.addEventListener('resize', handleResize);
    window.addEventListener('screen.orientation', handleOrientationChange);

    return () => {
      window.removeEventListener('orientationchange', handleOrientationChange);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('screen.orientation', handleOrientationChange);
    };
  }, []);

  return {
    orientation,
    isLandscapeMode,
    isPortraitMode: !isLandscapeMode,
  };
}
