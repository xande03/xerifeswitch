import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
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
