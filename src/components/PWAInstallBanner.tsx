import { motion, AnimatePresence } from "framer-motion";
import { Download, X, Share, Plus, EllipsisVertical } from "lucide-react";
import { usePWAInstall } from "@/hooks/usePWAInstall";

export default function PWAInstallBanner() {
  const { showBanner, canInstall, isIOSManual, isAndroidManual, isDesktopChromiumManual, install, dismiss } = usePWAInstall();

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          initial={{ y: 200, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 200, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed bottom-20 md:bottom-4 left-3 right-3 md:left-auto md:right-4 md:w-96 z-[9999] rounded-2xl bg-card border border-border/50 shadow-2xl shadow-black/40 p-4"
        >
          <button
            onClick={dismiss}
            className="absolute top-3 right-3 p-1 rounded-full hover:bg-accent transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>

          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
              <Download className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground text-sm">Instalar Xerife Switch</h3>
              <p className="text-xs text-muted-foreground">Acesse como um app nativo</p>
            </div>
          </div>

          {canInstall ? (
            <button
              onClick={install}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm transition-transform active:scale-[0.97]"
            >
              Instalar App
            </button>
          ) : isIOSManual ? (
            <div className="text-xs text-muted-foreground space-y-1.5">
              <p className="font-medium text-foreground text-sm mb-2">Como instalar no iPhone:</p>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-accent flex items-center justify-center text-[10px] font-bold">1</span>
                <span>Toque em <Share className="w-3.5 h-3.5 inline text-primary" /> <strong>Compartilhar</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-accent flex items-center justify-center text-[10px] font-bold">2</span>
                <span>Selecione <Plus className="w-3.5 h-3.5 inline text-primary" /> <strong>Adicionar à Tela de Início</strong></span>
              </div>
            </div>
          ) : isAndroidManual ? (
            <div className="text-xs text-muted-foreground space-y-1.5">
              <p className="font-medium text-foreground text-sm mb-2">Como instalar no Android:</p>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-accent flex items-center justify-center text-[10px] font-bold">1</span>
                <span>Toque no menu <EllipsisVertical className="w-3.5 h-3.5 inline text-primary" /> do navegador</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-accent flex items-center justify-center text-[10px] font-bold">2</span>
                <span>Escolha <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong></span>
              </div>
            </div>
          ) : isDesktopChromiumManual ? (
            <div className="text-xs text-muted-foreground space-y-1.5">
              <p className="font-medium text-foreground text-sm mb-2">Como instalar no navegador:</p>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-accent flex items-center justify-center text-[10px] font-bold">1</span>
                <span>Clique no menu <EllipsisVertical className="w-3.5 h-3.5 inline text-primary" /> do navegador (canto superior direito)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-accent flex items-center justify-center text-[10px] font-bold">2</span>
                <span>Selecione <Download className="w-3.5 h-3.5 inline text-primary" /> <strong>Instalar Xerife Switch</strong> ou <strong>Instalar app</strong></span>
              </div>
              <p className="text-[10px] mt-1 opacity-70">Funciona em Brave, Chrome, Edge e outros navegadores Chromium</p>
            </div>
          ) : null}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
