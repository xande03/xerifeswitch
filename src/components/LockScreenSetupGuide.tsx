import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Share, Plus, CheckCircle2, AlertTriangle, Smartphone, Lock, Radio, EllipsisVertical } from "lucide-react";

interface LockScreenSetupGuideProps {
  open: boolean;
  onClose: () => void;
}

type Platform = "ios" | "android" | "desktop";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua) || (navigator.platform === "MacIntel" && (navigator as any).maxTouchPoints > 1)) {
    return "ios";
  }
  if (/android/.test(ua)) return "android";
  return "desktop";
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // iOS
  // @ts-ignore
  if (window.navigator.standalone === true) return true;
  // Other platforms
  return window.matchMedia?.("(display-mode: standalone)").matches ?? false;
}

const LockScreenSetupGuide = ({ open, onClose }: LockScreenSetupGuideProps) => {
  const platform = useMemo(detectPlatform, []);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    if (!open) return;
    const mm = window.matchMedia?.("(display-mode: standalone)");
    const onChange = () => setInstalled(isStandalone());
    mm?.addEventListener?.("change", onChange);
    return () => mm?.removeEventListener?.("change", onChange);
  }, [open]);

  const mediaSessionOK = typeof navigator !== "undefined" && "mediaSession" in navigator;

  const checks = [
    {
      ok: installed,
      label: installed ? "App instalado na Tela de Início" : "App ainda não instalado — siga os passos abaixo",
    },
    {
      ok: mediaSessionOK,
      label: mediaSessionOK
        ? "Navegador compatível com controles de mídia (Media Session)"
        : "Seu navegador não suporta controles de mídia nativos",
    },
  ];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[10000] bg-black/70 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 280 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full md:max-w-md bg-card border border-border rounded-t-3xl md:rounded-3xl shadow-2xl max-h-[88vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="sticky top-0 bg-card/95 backdrop-blur px-5 pt-5 pb-3 border-b border-border flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-primary/15 flex items-center justify-center">
                  <Lock className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground leading-tight">
                    Controles na Tela de Bloqueio
                  </h2>
                  <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                    Garanta que ⏮ ⏭ apareçam no lock screen e Dynamic Island
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-full hover:bg-accent transition-colors flex-shrink-0"
                aria-label="Fechar"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* Aviso importante */}
            <div className="mx-5 mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-[12px] text-foreground/90 leading-relaxed">
                <strong>Importante:</strong> os controles na tela bloqueada e na Dynamic Island
                só funcionam de forma confiável quando o app é aberto pelo <strong>ícone na Tela de Início</strong>,
                e não pela aba do navegador.
              </p>
            </div>

            {/* Status atual */}
            <div className="px-5 mt-4">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                Status atual
              </h3>
              <div className="space-y-1.5">
                {checks.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-[12px] text-foreground/90">
                    {c.ok ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    )}
                    <span>{c.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Passo a passo */}
            <div className="px-5 mt-5">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
                Passo a passo {platform === "ios" ? "(iPhone / iPad)" : platform === "android" ? "(Android)" : "(Desktop)"}
              </h3>

              {platform === "ios" && (
                <ol className="space-y-3">
                  <Step n={1} icon={<Smartphone className="w-3.5 h-3.5" />} title="Abra no Safari">
                    O Chrome, Firefox e apps in-app (Instagram, WhatsApp) <strong>não</strong> instalam PWA no iOS.
                    Use somente o <strong>Safari</strong>.
                  </Step>
                  <Step n={2} icon={<Share className="w-3.5 h-3.5" />} title="Toque em Compartilhar">
                    Ícone de quadrado com seta para cima na barra inferior do Safari.
                  </Step>
                  <Step n={3} icon={<Plus className="w-3.5 h-3.5" />} title='"Adicionar à Tela de Início"'>
                    Role o menu e toque em <strong>Adicionar à Tela de Início</strong>, depois em <strong>Adicionar</strong>.
                  </Step>
                  <Step n={4} icon={<Radio className="w-3.5 h-3.5" />} title="Abra pelo ícone novo">
                    Feche o Safari e abra o Xerife Switch pelo <strong>ícone na Tela de Início</strong>.
                    Se abrir com a barra de endereço do Safari, não está instalado corretamente.
                  </Step>
                  <Step n={5} icon={<Lock className="w-3.5 h-3.5" />} title="Teste a tela de bloqueio">
                    Toque play em uma música, bloqueie o iPhone. Devem aparecer ⏮ ⏸ ⏭ (não "pular 15 s").
                    Mesma coisa na Dynamic Island ao trocar de app.
                  </Step>
                </ol>
              )}

              {platform === "android" && (
                <ol className="space-y-3">
                  <Step n={1} icon={<Smartphone className="w-3.5 h-3.5" />} title="Abra no Chrome">
                    Use o Chrome (ou outro navegador Chromium como Edge / Brave).
                  </Step>
                  <Step n={2} icon={<EllipsisVertical className="w-3.5 h-3.5" />} title="Menu do navegador">
                    Toque nos três pontos (canto superior direito).
                  </Step>
                  <Step n={3} icon={<Plus className="w-3.5 h-3.5" />} title='"Instalar app" / "Adicionar à tela inicial"'>
                    Confirme a instalação.
                  </Step>
                  <Step n={4} icon={<Radio className="w-3.5 h-3.5" />} title="Abra pelo ícone instalado">
                    O app deve abrir em tela cheia, sem a barra do navegador.
                  </Step>
                  <Step n={5} icon={<Lock className="w-3.5 h-3.5" />} title="Teste a tela de bloqueio">
                    Toque play, bloqueie o aparelho. A notificação de mídia deve mostrar ⏮ ⏸ ⏭ e a capa.
                  </Step>
                </ol>
              )}

              {platform === "desktop" && (
                <ol className="space-y-3">
                  <Step n={1} icon={<Smartphone className="w-3.5 h-3.5" />} title="Use Chrome, Edge ou Brave">
                    No desktop, navegadores Chromium permitem instalar como app.
                  </Step>
                  <Step n={2} icon={<Plus className="w-3.5 h-3.5" />} title="Instalar Xerife Switch">
                    Procure o ícone de instalação na barra de endereço ou no menu (⋮ → <strong>Instalar Xerife Switch</strong>).
                  </Step>
                  <Step n={3} icon={<Radio className="w-3.5 h-3.5" />} title="Controles de mídia do sistema">
                    Os controles aparecem nas teclas de mídia do teclado e na central de mídia do sistema operacional.
                  </Step>
                </ol>
              )}
            </div>

            {/* Troubleshooting */}
            <div className="px-5 mt-5 pb-6">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                Se ⏮ ⏭ não aparecerem
              </h3>
              <ul className="text-[12px] text-muted-foreground space-y-1.5 list-disc list-inside leading-relaxed">
                <li>Confirme que abriu pelo ícone instalado, e não pelo Safari.</li>
                <li>Aguarde 2-3 segundos após tocar play para o iOS registrar os metadados.</li>
                <li>Se aparecer "pular 15 s" em vez de ⏮ ⏭, reinstale o app — algum cache antigo pode ter sobrescrito os handlers.</li>
                <li>Em iPhones com iOS antigo (&lt; 16.4), a Dynamic Island pode mostrar apenas play/pause.</li>
              </ul>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const Step = ({
  n,
  icon,
  title,
  children,
}: {
  n: number;
  icon: React.ReactNode;
  title: React.ReactNode;
  children: React.ReactNode;
}) => (
  <li className="flex gap-3">
    <div className="flex flex-col items-center flex-shrink-0">
      <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground text-[11px] font-bold flex items-center justify-center">
        {n}
      </div>
    </div>
    <div className="flex-1 -mt-0.5">
      <div className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground mb-0.5">
        <span className="text-primary">{icon}</span>
        <span>{title}</span>
      </div>
      <p className="text-[12px] text-muted-foreground leading-relaxed">{children}</p>
    </div>
  </li>
);

export default LockScreenSetupGuide;
