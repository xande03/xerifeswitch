import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { execSync } from "node:child_process";

// Versão do build: git SHA curto + data — injetada como __APP_BUILD__ e exposta
// no console/data-attribute do <html> para diagnóstico de cache/PWA antigo.
const appBuild = (() => {
  try {
    const sha = execSync("git rev-parse --short HEAD").toString().trim();
    return `${sha}-${new Date().toISOString().slice(0, 10)}`;
  } catch {
    return `dev-${new Date().toISOString().slice(0, 10)}`;
  }
})();

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    __APP_BUILD__: JSON.stringify(appBuild),
  },
  server: {
    host: "0.0.0.0",
    port: 8080,
    hmr: {
      overlay: false,
    },
    cors: true,
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
    // @ts-ignore - allow all hosts for preview proxy
    allowedHosts: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 8080,
  },
  base: "/",
  build: {
    // Um unico chunk de terceiros: as libs se importam entre si (radix -> next-themes,
    // react-dom -> clsx/tailwind-merge...), entao dividir por lib produzia
    // "Circular chunk" no rollup. Com um so chunk de vendor o grifo e aciclico por
    // construcao e o cache continua valendo: mudar codigo do app nao muda o hash do
    // vendor. O ganho real vem do code-splitting das telas (src/lib/deferredScreens.ts).
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          return id.includes("node_modules") ? "vendor" : undefined;
        },
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
