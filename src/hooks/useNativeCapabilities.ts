import { useEffect, useRef } from "react";

/**
 * Hook to enable native-like behavior on iOS and Android browsers:
 * - Screen Wake Lock (keeps screen on during playback)
 * - Background playback keep-alive (visibility change handling)
 * - Orientation unlock (allows rotation)
 * - Prevents pull-to-refresh
 */
export function useNativeCapabilities(isPlaying: boolean) {
  // NOTE: Wake Lock is owned exclusively by useYouTubePlayer to avoid duplicate
  // sentinels competing for navigator.wakeLock. We only handle background
  // heartbeat (localStorage ping) + pull-to-refresh + orientation here.
  const bgIntervalRef = useRef<ReturnType<typeof setInterval>>();


  // Background heartbeat: keeps service worker / page lightly active when hidden
  useEffect(() => {
    const stop = () => {
      if (bgIntervalRef.current) {
        clearInterval(bgIntervalRef.current);
        bgIntervalRef.current = undefined;
      }
    };
    const start = () => {
      if (!isPlaying || bgIntervalRef.current) return;
      bgIntervalRef.current = setInterval(() => {
        try { localStorage.setItem('__bg_heartbeat', Date.now().toString()); } catch { }
      }, 3000);
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') start();
      else stop();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', start);
    window.addEventListener('pageshow', stop);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', start);
      window.removeEventListener('pageshow', stop);
      stop();
    };
  }, [isPlaying]);


  // Prevent pull-to-refresh on Android Chrome / Brave
  useEffect(() => {
    const preventOverscroll = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.overflow-y-auto, .overflow-y-scroll, [data-scrollable]')) return;
      
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        if (touch.clientY < 10) {
          e.preventDefault();
        }
      }
    };
    
    document.addEventListener('touchmove', preventOverscroll, { passive: false });
    return () => document.removeEventListener('touchmove', preventOverscroll);
  }, []);

  // Unlock orientation
  useEffect(() => {
    try {
      if (screen.orientation && (screen.orientation as any).unlock) {
        (screen.orientation as any).unlock();
      }
    } catch { }
  }, []);
}

/**
 * Request persistent storage
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage && navigator.storage.persist) {
      return await navigator.storage.persist();
    }
  } catch { }
  return false;
}

/**
 * Check if app is running as installed PWA
 */
export function isInstalledPWA(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true ||
    document.referrer.includes('android-app://')
  );
}

/**
 * Request notification permission
 */
export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return await Notification.requestPermission();
}
