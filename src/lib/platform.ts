import { Capacitor } from '@capacitor/core';

/**
 * Detect if running inside a Capacitor native shell (iOS/Android)
 */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Get current platform: 'ios' | 'android' | 'web'
 */
export function getPlatform(): 'ios' | 'android' | 'web' {
  return Capacitor.getPlatform() as 'ios' | 'android' | 'web';
}

/**
 * Returns true when running as an installed PWA in a browser (not native)
 */
export function isInstalledPWA(): boolean {
  if (isNativePlatform()) return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true ||
    document.referrer.includes('android-app://')
  );
}

/**
 * Returns true if in iframe or Lovable preview host
 */
export function isPreviewEnvironment(): boolean {
  try {
    const isInIframe = window.self !== window.top;
    const isPreviewHost =
      window.location.hostname.includes('id-preview--') ||
      window.location.hostname.includes('lovableproject.com');
    return isInIframe || isPreviewHost;
  } catch {
    return true;
  }
}
