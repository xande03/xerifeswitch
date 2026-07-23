import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { isNativePlatform, isPreviewEnvironment } from "./lib/platform";
import { initNativePlugins } from "./lib/nativeInit";

const safeStorageGet = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

// Restore saved theme before first render.
// If nothing is saved, honor the OS preference so the first paint matches
// the user's system (and stays consistent with useTheme()).
const savedTheme = safeStorageGet("demus-theme");
const prefersLight = typeof window !== "undefined"
  && window.matchMedia?.("(prefers-color-scheme: light)").matches;
const initialLight = savedTheme === "light" || (!savedTheme && prefersLight);
if (initialLight) {
  document.documentElement.classList.add("light");
}
document.documentElement.style.colorScheme = initialLight ? "light" : "dark";
const savedColor = safeStorageGet("demus-color") || "red";
document.documentElement.classList.add(`theme-${savedColor}`);

// Ambient background feature removed — purge any legacy preference so it can't resurface.
try { window.localStorage.removeItem("demus-ambient-bg-enabled"); } catch {}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Initialize native plugins (StatusBar, SplashScreen) on Capacitor
initNativePlugins();

// Register Service Worker — only for web (PWA), not native or preview
if ("serviceWorker" in navigator) {
  if (import.meta.env.PROD && !isNativePlatform() && !isPreviewEnvironment()) {
    window.addEventListener("load", () => {
      let refreshing = false;

      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });

      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          console.log("SW registered:", reg.scope);

          if (reg.waiting) {
            reg.waiting.postMessage({ type: "SKIP_WAITING" });
          }

          reg.addEventListener("updatefound", () => {
            const installingWorker = reg.installing;
            if (!installingWorker) return;

            installingWorker.addEventListener("statechange", () => {
              if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
                installingWorker.postMessage({ type: "SKIP_WAITING" });
              }
            });
          });

          // Check for updates periodically (every 30 min)
          setInterval(() => { reg.update().catch(() => {}); }, 30 * 60 * 1000);
        })
        .catch((err) => console.log("SW registration failed:", err));
    });
  } else {
    // Unregister SW in dev, native, or preview environments
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((reg) => reg.unregister());
    });
    caches.keys().then((keys) => {
      keys.forEach((key) => caches.delete(key));
    });
  }
}

// Request persistent storage so browser doesn't evict IndexedDB/cache
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().then((granted) => {
    if (granted) console.log("Persistent storage granted");
  });
}
