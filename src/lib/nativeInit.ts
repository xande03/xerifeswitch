import { isNativePlatform } from './platform';

/**
 * Initialize native plugins (StatusBar, SplashScreen) when running in Capacitor.
 * Safe no-op on web.
 */
export async function initNativePlugins() {
  if (!isNativePlatform()) return;

  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#121212' });
  } catch (e) {
    console.warn('StatusBar plugin not available', e);
  }

  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    // Hide native splash after a short delay (our React splash takes over)
    await SplashScreen.hide({ fadeOutDuration: 300 });
  } catch (e) {
    console.warn('SplashScreen plugin not available', e);
  }
}
