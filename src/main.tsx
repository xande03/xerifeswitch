import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { isNativePlatform, isPreviewEnvironment } from "./lib/platform";
import { initNativePlugins } from "./lib/nativeInit";

// ── Marcador de versão do build ─────────────────────────────────────────────
// Injetado pelo vite.config.ts (git SHA + data). Aparece no console e em
// document.documentElement.dataset.appBuild — para diagnosticar PWA/cache
// desatualizado (ex.: "figura fantasma" que já foi corrigida no deploy).
try {
  document.documentElement.dataset.appBuild = __APP_BUILD__;
  console.info(`[Xerife] build ${__APP_BUILD__}`);
} catch { /* ignora */ }

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

// Legacy ambient key (formato antigo) — o fundo dinâmico agora usa "xerife:dynamic-bg-enabled".
try { window.localStorage.removeItem("demus-ambient-bg-enabled"); } catch {}


createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Initialize native plugins (StatusBar, SplashScreen) on Capacitor
initNativePlugins();

// ── AUTO-UPDATE (2026-09-19) ────────────────────────────────────────────────
// PWAs instalados ficam abertos por dias rodando JS antigo em memória — o caso
// do "símbolo que não some no Netlify" enquanto o preview (sem Service Worker)
// sempre mostra a versão nova. Ao voltar ao foco (e a cada 15 min), comparamos
// o bundle referenciado no HTML publicado com o bundle carregado: se mudou,
// recarregamos na hora. Só em produção web (mesma guarda do SW).
if (import.meta.env.PROD && !isNativePlatform() && !isPreviewEnvironment()) {
  const loadedBundle = (() => {
    try {
      const el = document.querySelector<HTMLScriptElement>('script[src*="/assets/index-"]');
      return el ? new URL(el.src, location.href).pathname : null;
    } catch { return null; }
  })();
  if (loadedBundle) {
    let checking = false;
    const checkForNewBuild = async () => {
      if (checking || document.visibilityState !== "visible") return;
      checking = true;
      try {
        const res = await fetch(`/?_v=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const html = await res.text();
        const m = html.match(/assets\/index-[^"']+\.js/);
        if (m) {
          const latest = "/" + m[0];
          if (latest !== loadedBundle) {
            console.info(`[Xerife] nova versão publicada (${latest}) — recarregando`);
            location.reload();
          }
        }
      } catch { /* offline: mantém a versão atual */ } finally { checking = false; }
    };
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") setTimeout(checkForNewBuild, 800);
    });
    // Também no boot: PWA que abriu direto num build antigo (SW ainda
    // atualizando) recarrega sozinho para o novo em vez de esperar o foco.
    setTimeout(checkForNewBuild, 3000);
    setInterval(checkForNewBuild, 15 * 60 * 1000);
  }
}

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
