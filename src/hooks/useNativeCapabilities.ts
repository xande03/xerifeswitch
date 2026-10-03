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
  // sentinels competing for navigator.wakeLock. Pull-to-refresh + orientation aqui.
  // (revisão24ª: o pulso `__bg_heartbeat` de localStorage foi REMOVIDO por completo
  // — era escrita a cada3s sem nenhum leitor; zero ping.)


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

  // NOTE: intencionalmente NÃO chamamos screen.orientation.unlock() aqui.
  // Forçar unlock fazia o app girar mesmo com a rotação bloqueada no aparelho.
  // Agora a orientação segue exclusivamente a configuração do sistema.

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
