import { useEffect, useMemo, useState } from "react";
import { X, CheckCircle2, XCircle, Clock, Activity, RotateCcw, Smartphone, Radio, PlayCircle } from "lucide-react";
import { getPipStats, getPipEvents, clearPipTelemetry, type PipEvent } from "@/lib/pipTelemetry";

interface PiPDiagnosticsProps {
  open: boolean;
  onClose: () => void;
  onStartScenario?: (scenario: "recorded" | "live") => void;
  currentStatus: "off" | "armed" | "active" | "denied";
}

type Step = { id: string; label: string; hint?: string };

const IOS_STEPS_RECORDED: Step[] = [
  { id: "s1", label: "Toque em um vídeo GRAVADO em Xerife Videos", hint: "Escolha um vídeo com duração fixa (não ao vivo)." },
  { id: "s2", label: "Aguarde a reprodução começar (áudio + imagem)", hint: "O PiP só engata se o vídeo estiver realmente tocando." },
  { id: "s3", label: "Toque no botão Picture-in-Picture", hint: "O botão deve ficar âmbar (armado) e o vídeo entra em tela cheia." },
  { id: "s4", label: "Pressione o botão Home ou deslize para cima", hint: "iOS deve encolher o vídeo em janela flutuante." },
  { id: "s5", label: "Verifique a janela flutuante em outros apps", hint: "Arraste, redimensione e teste play/pause." },
  { id: "s6", label: "Toque na janela → botão para voltar ao app", hint: "O app deve reabrir com o player expandido no mesmo ponto." },
];

const IOS_STEPS_LIVE: Step[] = [
  { id: "l1", label: "Abra um canal ao vivo (ex.: Cazé TV)", hint: "Use a seção AO VIVO AGORA no topo do canal." },
  { id: "l2", label: "Aguarde 3-5s de reprodução da transmissão", hint: "Streams ao vivo demoram para bufferizar antes do PiP aceitar." },
  { id: "l3", label: "Toque em Picture-in-Picture", hint: "Botão ficará âmbar (armado)." },
  { id: "l4", label: "Saia do app (Home)", hint: "iOS deve manter o stream tocando em janela flutuante." },
  { id: "l5", label: "Confira se o áudio continua no background", hint: "Mesmo sem o pop-up visual, o áudio da live deve seguir." },
  { id: "l6", label: "Retorne ao app", hint: "O player volta ao vivo, no ponto atual da transmissão." },
];

const PiPDiagnostics = ({ open, onClose, currentStatus }: PiPDiagnosticsProps) => {
  const [scenario, setScenario] = useState<"recorded" | "live">("recorded");
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [tick, setTick] = useState(0);

  // Auto-refresh stats every 2s while open
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setTick((v) => v + 1), 2000);
    return () => clearInterval(id);
  }, [open]);

  const stats = useMemo(() => getPipStats(), [tick, open]);
  const events = useMemo<PipEvent[]>(() => getPipEvents(20), [tick, open]);
  const steps = scenario === "recorded" ? IOS_STEPS_RECORDED : IOS_STEPS_LIVE;
  const doneCount = steps.filter((s) => checked[s.id]).length;
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  if (!open) return null;

  const toggle = (id: string) => setChecked((c) => ({ ...c, [id]: !c[id] }));
  const resetScenario = () => setChecked({});

  const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

  return (
    <div className="fixed inset-0 z-[200] bg-background/95 backdrop-blur-xl overflow-y-auto">
      <div className="max-w-3xl mx-auto p-4 sm:p-6 pb-24 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/15 text-primary flex items-center justify-center">
              <Activity size={20} />
            </div>
            <div>
              <h1 className="text-lg font-black text-foreground">Diagnóstico PiP</h1>
              <p className="text-xs text-muted-foreground">
                Verificação em dispositivo real + telemetria
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="w-9 h-9 rounded-full bg-secondary hover:bg-accent flex items-center justify-center">
            <X size={18} />
          </button>
        </div>

        {/* Status + platform */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatusCard label="Plataforma" value={isIOS ? "iOS" : /Android/i.test(navigator.userAgent) ? "Android" : "Web"} icon={<Smartphone size={16} />} />
          <StatusCard label="PiP agora" value={currentStatus} tone={currentStatus === "active" ? "success" : currentStatus === "armed" ? "warn" : currentStatus === "denied" ? "danger" : "muted"} icon={<PlayCircle size={16} />} />
          <StatusCard label="Taxa sucesso" value={pct(stats.successRate)} tone={stats.successRate >= 0.6 ? "success" : "warn"} />
          <StatusCard label="iOS armed→active" value={pct(stats.iosArmedToActiveRate)} tone={stats.iosArmedToActiveRate >= 0.6 ? "success" : "warn"} />
        </div>

        {/* Scenario tabs */}
        <div className="rounded-2xl bg-card/60 border border-border/40 p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-foreground">Cenário de teste</h2>
            <button onClick={resetScenario} className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground">
              <RotateCcw size={12} /> Resetar
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => { setScenario("recorded"); setChecked({}); }}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                scenario === "recorded" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-accent"
              }`}
            >
              <PlayCircle size={16} /> Vídeo gravado
            </button>
            <button
              onClick={() => { setScenario("live"); setChecked({}); }}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                scenario === "live" ? "bg-red-600 text-white" : "bg-secondary text-foreground hover:bg-accent"
              }`}
            >
              <Radio size={16} /> Ao vivo
            </button>
          </div>

          <div className="space-y-2">
            {steps.map((s, i) => (
              <button
                key={s.id}
                onClick={() => toggle(s.id)}
                className={`w-full text-left flex items-start gap-3 p-3 rounded-xl border transition-all ${
                  checked[s.id]
                    ? "bg-emerald-500/10 border-emerald-500/40"
                    : "bg-background/40 border-border/40 hover:border-border"
                }`}
              >
                <div className={`mt-0.5 flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                  checked[s.id] ? "bg-emerald-500 text-white" : "bg-secondary text-muted-foreground"
                }`}>
                  {checked[s.id] ? <CheckCircle2 size={14} /> : i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${checked[s.id] ? "text-emerald-500" : "text-foreground"}`}>{s.label}</p>
                  {s.hint && <p className="text-[11px] text-muted-foreground mt-0.5">{s.hint}</p>}
                </div>
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border/30">
            <span className="text-xs text-muted-foreground">Progresso</span>
            <span className="text-sm font-bold text-foreground">{doneCount}/{steps.length}</span>
          </div>
        </div>

        {/* Telemetry summary */}
        <div className="rounded-2xl bg-card/60 border border-border/40 p-4 space-y-3">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Activity size={14} className="text-primary" /> Telemetria acumulada
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <Mini label="Pedidos" value={stats.requests} />
            <Mini label="Ativos" value={stats.active} tone="success" />
            <Mini label="Recusados" value={stats.denied} tone="danger" />
            <Mini label="Timeouts 30s" value={stats.timeout} tone="warn" />
            <Mini label="Nativo" value={stats.enterNative} />
            <Mini label="Armed" value={stats.enterArmed} />
            <Mini label="Fallback" value={stats.enterFallback} />
            <Mini label="Leaves" value={stats.leave} />
          </div>
          <div className="text-[10px] text-muted-foreground pt-2 border-t border-border/30">
            Recusa total: <span className="font-bold text-red-500">{pct(stats.denialRate)}</span> · Por plataforma: {Object.entries(stats.perPlatform).map(([k, v]) => `${k}=${v}`).join(", ") || "—"}
          </div>
        </div>

        {/* Recent events */}
        <div className="rounded-2xl bg-card/60 border border-border/40 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">Eventos recentes</h2>
            <button
              onClick={() => { clearPipTelemetry(); setTick((v) => v + 1); }}
              className="text-[11px] font-medium text-red-500 hover:text-red-400"
            >
              Limpar histórico
            </button>
          </div>
          {events.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Nenhum evento ainda. Toque no botão PiP para começar.</p>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {events.map((e, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-background/50 text-[11px] font-mono">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    e.kind === "active" || e.kind === "enter-native" ? "bg-emerald-500" :
                    e.kind === "denied" || e.kind === "timeout" ? "bg-red-500" :
                    e.kind === "enter-armed" ? "bg-amber-400" :
                    "bg-muted-foreground"
                  }`} />
                  <span className="text-muted-foreground w-16 flex-shrink-0">{new Date(e.t).toLocaleTimeString()}</span>
                  <span className="font-bold text-foreground w-24 flex-shrink-0 truncate">{e.kind}</span>
                  <span className="text-muted-foreground uppercase text-[10px]">{e.platform}</span>
                  {e.isLive && <Radio size={10} className="text-red-500 flex-shrink-0" />}
                  {e.reason && <span className="text-muted-foreground/70 truncate">· {e.reason}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="text-[11px] text-muted-foreground text-center pt-2 space-y-1">
          <p>Também acessível via console do Safari Web Inspector:</p>
          <code className="text-[10px] text-primary">window.__xerifePipTelemetry.stats()</code>
        </div>
      </div>
    </div>
  );
};

const StatusCard = ({ label, value, tone = "muted", icon }: { label: string; value: string; tone?: "success" | "warn" | "danger" | "muted"; icon?: React.ReactNode }) => (
  <div className={`rounded-2xl p-3 border ${
    tone === "success" ? "bg-emerald-500/10 border-emerald-500/30" :
    tone === "warn" ? "bg-amber-500/10 border-amber-500/30" :
    tone === "danger" ? "bg-red-500/10 border-red-500/30" :
    "bg-card/60 border-border/40"
  }`}>
    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
      {icon}{label}
    </div>
    <div className={`mt-1 text-lg font-black ${
      tone === "success" ? "text-emerald-500" :
      tone === "warn" ? "text-amber-500" :
      tone === "danger" ? "text-red-500" :
      "text-foreground"
    }`}>{value}</div>
  </div>
);

const Mini = ({ label, value, tone = "muted" }: { label: string; value: number; tone?: "success" | "warn" | "danger" | "muted" }) => (
  <div className="rounded-lg bg-background/50 px-2 py-1.5">
    <div className="text-[9px] uppercase text-muted-foreground font-bold">{label}</div>
    <div className={`text-sm font-black ${
      tone === "success" ? "text-emerald-500" :
      tone === "warn" ? "text-amber-500" :
      tone === "danger" ? "text-red-500" :
      "text-foreground"
    }`}>{value}</div>
  </div>
);

export default PiPDiagnostics;
