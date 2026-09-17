/**
 * AdSlot — superfice de anúncio SINGLE por slot ("recomendado/sponsored"),
 * colocada entre os grids da Home, Playlists e Explorar.
 *
 * Princípios (direitos do usuário):
 * - **Sem anúncios das músicas**: nada aqui interrompe um vídeo/faixa; o slot
 *   é estático visualmente e ocupa só o espaço de um card no grid.
 * - Cards estilo "aplicativo premium": arredondado 22px, transição full-visível,
 *   hover suave; em mobile usa altura natural (~92px) para caber no fluxo.
 * - Thumb: aproveitado da arte editorial existente (`public/ads/…`) sem
 *   cortes que estraguem a proporção — arte do Xerife/MyWallet/Artistas +
 *   reserva gerada (ver `src/data/adProfiles.ts`).
 *
 * Anti-repetição: `drawAds(slot)` memo do adsEngine por sessão — clique em
 * "voltar" no app sorteia novo (ver `refreshAds`, disparado no evento de
 * mudança de aba principal/painel).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, ArrowUpRight } from "lucide-react";
import { drawAds, trackAdEvent, refreshAds } from "@/lib/adsEngine";
import type { AdItem } from "@/lib/adsEngine";
import { AD_SPRITES } from "@/data/adProfiles";

interface Props {
  /** Identificador único do slot ("feed-home" | "grid-playlists" | "explorar"). */
  slot: string;
  className?: string;
  /** tamanho visual — "row" = linha inteira (gridCorredor), "card" = quadradinho. */
  variant?: "row" | "card";
}

const AdSlot = ({ slot, className = "", variant = "row" }: Props) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [seed, setSeed] = useState(0);
  const ad: AdItem | null = useMemo(() => drawAds(slot), [slot, seed]);
  const tracked = useRef(false);

  // Nova visita (nav change): re-sorteia este slot e conta nova a impressão.
  useEffect(() => {
    const h = () => { refreshAds(); setSeed((s) => s + 1); tracked.current = false; };
    window.addEventListener("xerife:ads-refresh", h);
    return () => window.removeEventListener("xerife:ads-refresh", h);
  }, []);

  // Conta a impressão só quando o card REALMENTE aparecer na viewport
  useEffect(() => {
    if (!ad || tracked.current) return;
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !tracked.current) {
        tracked.current = true;
        trackAdEvent(ad.linkId, "impression");
        io.disconnect();
      }
    }, { threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  }, [ad]);

  if (!ad) return null;

  const open = () => {
    trackAdEvent(ad.linkId, "click");
    if (ad.href.startsWith("demus:")) {
      document.dispatchEvent(new CustomEvent("xerife:kill-ad", { detail: { href: ad.href } }));
      // fallback: descida suave se a rota não existir
      if (ad.href.includes("perfis")) window.dispatchEvent(new Event("xerife:ads-refresh"));
      return;
    }
    window.open(ad.href, "_blank", "noopener,noreferrer");
  };

  return (
    <div
      ref={rootRef}
      role="complementary"
      aria-label={`${ad.caption} — sponsoreado/itens sugeridos`}
      className={`relative overflow-hidden rounded-[22px] border border-border/50 dark:border-white/10 bg-card/95 dark:bg-neutral-900/95 backdrop-blur-md shadow-sm shadow-black/10 hover:shadow-md dark:shadow-black/30 transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${variant === "row" ? "w-full" : "aspect-square"} ${className}`}
      style={{ animation: "fade-in 0.35s ease-out" }}
    >
      {/* chip "Sponsored"/"Recomendado" — gramática padrão de anúncio */}
      <span className="absolute top-2.5 left-2.5 z-20 inline-flex items-center gap-1 rounded-full bg-black/55 dark:bg-white/10 backdrop-blur px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.12em] text-white/95">
        <Sparkles size={11} />{ad.caption}
      </span>

      <button
        onClick={open}
        className="w-full h-full flex items-stretch text-left cursor-pointer group"
        aria-label={`${ad.caption}: ${ad.title ?? "ver sugestão"}`}
      >
        {/* lado esquerdo — o anúncio interno/host com thumb guardada */}
        <div className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3">
          <span
            aria-hidden
            className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center text-xl shrink-0"
          >
            {ad.hostEmoji ?? "✨"}
          </span>
          <div className="min-w-0">
            <p className="text-[12.5px] font-bold text-foreground truncate leading-tight">{ad.title ?? ad.hostLabel ?? "Sugestão Xerife"}</p>
            {ad.subtitle && <p className="text-[11px] text-muted-foreground truncate mt-0.5 leading-tight">{ad.subtitle}</p>}
            <p className="text-[10.5px] font-semibold text-primary/90 mt-1 inline-flex items-center gap-1 group-hover:gap-1.5 transition-all">
              {ad.hostLabel ? `Com ${ad.hostLabel}` : "Abrir"} <ArrowUpRight size={12} />
            </p>
          </div>
        </div>

        {/* lado direito — tile do grid/sprite (proporção protegida: h-full de área fixa) */}
        <div className="w-[38%] sm:w-[30%] shrink-0 relative overflow-hidden">
          <div
            className="absolute inset-0 bg-cover bg-center group-hover:scale-[1.03] transition-transform duration-300"
            style={{ backgroundImage: `url(${AD_SPRITES[(ad.tileIndex % AD_SPRITES.length + AD_SPRITES.length) % AD_SPRITES.length]})` }}
            aria-hidden
          />
          <span className="absolute inset-0 bg-gradient-to-r from-card/85 via-card/20 to-transparent dark:from-neutral-900/85 pointer-events-none" aria-hidden />
        </div>
      </button>
    </div>
  );
};

export default AdSlot;
