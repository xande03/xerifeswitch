import { useState, useEffect, useCallback } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type ManualInstallMode = "none" | "ios" | "android" | "desktop-chromium";

const DISMISS_TTL_MS = 3 * 24 * 60 * 60 * 1000;

function getManualInstallMode(): ManualInstallMode {
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  // Desktop Chromium browsers (Brave, Edge, Opera, etc.) that may block beforeinstallprompt
  if (/Chrome|Chromium|Edg|OPR|Brave/i.test(ua) && !/Mobile/i.test(ua)) return "desktop-chromium";
  return "none";
}

function isAlreadyInstalled(): boolean {
  // Standard display-mode check
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  // iOS Safari standalone
  if ((window.navigator as any).standalone === true) return true;
  // TWA / Android app ref
  if (document.referrer.includes("android-app://")) return true;
  // Launched from PWA shortcut
  if (new URLSearchParams(window.location.search).get("source") === "pwa") return true;
  return false;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [manualInstallMode, setManualInstallMode] = useState<ManualInstallMode>("none");

  useEffect(() => {
    if (isAlreadyInstalled()) {
      setIsInstalled(true);
      return;
    }

    // Check if user dismissed before (show again after 3 days)
    const dismissed = localStorage.getItem("pwa-install-dismissed");
    if (dismissed) {
      const dismissedAt = parseInt(dismissed, 10);
      if (Date.now() - dismissedAt < DISMISS_TTL_MS) return;
    }

    let promptCaptured = false;
    const manualMode = getManualInstallMode();

    const handlePrompt = (e: Event) => {
      e.preventDefault();
      promptCaptured = true;
      setManualInstallMode("none");
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowBanner(true);
    };

    const handleInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setManualInstallMode("none");
      setShowBanner(false);
    };

    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);

    // Listen for display-mode changes (user installs via browser menu)
    let mql: MediaQueryList | null = null;
    try {
      mql = window.matchMedia("(display-mode: standalone)");
      const handleDisplayChange = (e: MediaQueryListEvent) => {
        if (e.matches) handleInstalled();
      };
      mql.addEventListener("change", handleDisplayChange);
    } catch { /* matchMedia not supported */ }

    // Fallback: show manual instructions after timeout if prompt not captured
    const fallbackTimer = window.setTimeout(() => {
      if (promptCaptured || manualMode === "none") return;
      setManualInstallMode(manualMode);
      setShowBanner(true);
    }, 2500);

    return () => {
      window.clearTimeout(fallbackTimer);
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return false;
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      if (outcome === "accepted") {
        setIsInstalled(true);
        setShowBanner(false);
        return true;
      }
    } catch {
      // prompt() can throw if already called
    }
    return false;
  }, [deferredPrompt]);

  const dismiss = useCallback(() => {
    setShowBanner(false);
    localStorage.setItem("pwa-install-dismissed", Date.now().toString());
  }, []);

  return {
    showBanner: showBanner && !isInstalled,
    isInstalled,
    canInstall: !!deferredPrompt,
    isIOSManual: manualInstallMode === "ios" && !deferredPrompt && showBanner,
    isAndroidManual: manualInstallMode === "android" && !deferredPrompt && showBanner,
    isDesktopChromiumManual: manualInstallMode === "desktop-chromium" && !deferredPrompt && showBanner,
    install,
    dismiss,
  };
}
