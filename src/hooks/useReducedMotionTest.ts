import { useEffect } from 'react';

/**
 * Hook to test and verify reduced motion settings
 */
export function useReducedMotionTest(isReduced: boolean) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[ReducedMotion Test] Active: ${isReduced}`);
      
      const checkStyle = () => {
        const root = document.documentElement;
        const style = window.getComputedStyle(root);
        const transition = style.getPropertyValue('transition-duration');
        
        if (isReduced && transition !== '0s' && transition !== '0.001s' && transition !== '0.000001s') {
          console.warn('[ReducedMotion Test] Transition leak detected:', transition);
        }
      };

      const interval = setInterval(checkStyle, 2000);
      return () => clearInterval(interval);
    }
  }, [isReduced]);
}
