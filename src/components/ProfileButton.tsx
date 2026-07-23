import { useState, useRef, useEffect } from "react";
import { User, LogOut, History, Edit2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { LocalUser } from "@/hooks/useLocalProfile";

interface ProfileButtonProps {
  user: LocalUser | null;
  onLogin: () => void;
  onLogout: () => void;
  onOpenHistory?: () => void;
  onUpdateName?: (name: string) => void;
}

const ProfileButton = ({ user, onLogin, onLogout, onOpenHistory, onUpdateName }: ProfileButtonProps) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const initials = user?.name
    ? user.name.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase()
    : "";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => (user ? setOpen(!open) : onLogin())}
        className="flex items-center justify-center w-8 h-8 rounded-full bg-muted/60 hover:bg-muted transition-colors overflow-hidden border border-border/40"
        title={user ? user.name : "Criar perfil"}
      >
        {initials ? (
          <span className="text-xs font-bold text-primary">{initials}</span>
        ) : (
          <User size={16} className="text-muted-foreground" />
        )}
      </button>

      <AnimatePresence>
        {open && user && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-10 w-56 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden"
          >
            <div className="p-3 border-b border-border/50 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-bold text-primary">{initials}</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{user.name}</p>
                <p className="text-xs text-muted-foreground">Perfil local</p>
              </div>
            </div>

            <div className="p-1.5">
              {onUpdateName && (
                <button
                  onClick={() => {
                    const name = prompt("Novo nome:", user.name);
                    if (name?.trim()) { onUpdateName(name.trim()); }
                    setOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-muted/60 rounded-lg transition-colors"
                >
                  <Edit2 size={16} className="text-muted-foreground" />
                  Editar nome
                </button>
              )}
              {onOpenHistory && (
                <button
                  onClick={() => { onOpenHistory(); setOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-muted/60 rounded-lg transition-colors"
                >
                  <History size={16} className="text-muted-foreground" />
                  Meu Histórico
                </button>
              )}
              <button
                onClick={() => { onLogout(); setOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
              >
                <LogOut size={16} />
                Sair
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ProfileButton;
