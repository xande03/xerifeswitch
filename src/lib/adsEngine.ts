/**
 * adsEngine — engine de ads do Xerife Switch ("tráfego interno + links externos
 * afiliados/parceiros pagos").
 *
 * ── Como funciona ──
 * Destinos/arte: vem de `src/data/adProfiles.ts` (banners + grids 3x) e do catálogo
 * dinâmico da Edge Function `ad-links` (tabela SQL em
 * `supabase/migrations/20260720_ad_links_e_objections.sql` — applicar no SQL Editor
 * do Supabase; se estiver offline, o app segue com o catálogo local = banners do
 * próprio Xerife/MyWallet/Artistas, sem anúncios "Externos" vazios).
 *
 * ── Comprouorno ──
 * - Uma ficha é sorteada por SLOT por app-boot (sessionStorage) — os 3 slots
 *   hospedados (feed-home, grid-playlists, explorar) SEMPRE mostram itens
 *   distintos (anti-repetição), e cada visita sorteia de novo — sem timers.
 * - Premise da história: "recomendado sem anúncios das músicas" — nenhum anúncio
 *   aparece dentro do player/de faixas; os 3 slots ficam em grids/corredores.
 * - placeholder-ad: registry commanda "ad:hide" (o Root já escuta) para esconder
 *   os interstitiais antigos gerados nele — a nova superfície vive DENTRO do grid.
 *
 * Métricas: `impression` = entrou na viewport (observer); `click` = clique.
 */
import { AD_ARTWORK, AD_BANNERS, AD_SPRITES, AD_GENDER_POOL_SIZE } from "@/data/adProfiles";
import { supabase } from "@/integrations/supabase/client";

export type AdKind = "banner" | "sprite" | "featured-link" | "paired";

export interface LeadCampaignLink {
  id: string;
  title: string;
  subtitle?: string | null;
  url: string;
  kind: "direct" | "sponsored";
  impressions: number;
  clicks: number;
  artist_emoji: string;
  host_emoji: string;
  host_label: string;
}

export interface AdItem {
  kind: AdKind;
  /** Texto/label mostrado no chip "Sponsored"/"Recomendado". */
  caption: string;
  href: string;
  /** sprite/banner art (o componente decide qual) */
  tileIndex: number; // grid 0-2 dentro do grid escolhido
  /** featured: o que aparece */
  title?: string;
  subtitle?: string;
  /** paired: lado esquerdo (host) */
  hostEmoji?: string;
  hostLabel?: string;
  /** Métrica — id do link externo se houver */
  linkId?: string;
}

/** Pools de tiles por estilo (banner usa i<3, sprite usa grids/células) */
const msk = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Catálogo local (sempre disponível, mesmo offline) */
function buildLocalPool(): AdItem[] {
  const out: AdItem[] = [];
  // 1) banners internos (campaign Xerife / MyWallet / Artist)
  ["app", "mywallet", "artist"].forEach((g, gi) => {
    msk(3).forEach((tileIndex) => {
      out.push({
        kind: tileIndex === 1 ? "paired" : "featured-link",
        caption: gi === 1 ? "Recomendamos" : "Recomendado",
        href: `demus:perfis/${g}`,
        tileIndex,
        title: gi === 1 ? "Minha Carteira" : gi === 2 ? "Para Artistxs" : "Conheça o Xerife",
        subtitle: gi === 1 ? "Anúncio sugerido também no app" : undefined,
      });
    });
  });
  // 2) featured-link sugerido (referente a outro app Ger)
  msk(AD_GENDER_POOL_SIZE).slice(0, 3).forEach((i) => {
    out.push({
      kind: "featured-link",
      caption: "Recomendado",
      href: "demus:perfis/outra",
      tileIndex: i,
      title: "Descubra",
      subtitle: "artista sugerido para você",
    });
  });
  return out;
}

// ── Catálogo dinâmico (link externo, vem da Edge Function + tabela SQL ad_links)──
let _remoteCache: LeadCampaignLink[] | null = null;
let _remoteFetchedAt = 0;

export async function getRemoteAdLinks(force = false): Promise<LeadCampaignLink[]> {
  if (!force && _remoteCache && Date.now() - _remoteFetchedAt < 30_000) return _remoteCache;
  try {
    const { data, error } = await supabase.functions.invoke("ad-links", { method: "GET" });
    if (error || !data?.ok || !Array.isArray(data.items)) return _remoteCache ?? [];
    _remoteCache = data.items as LeadCampaignLink[];
    _remoteFetchedAt = Date.now();
    return _remoteCache;
  } catch {
    return _remoteCache ?? [];
  }
}

// ── Sorteio anti-repetição + memo per-visit ────────────────────────────────
const SLOT_KEY = (slot: string) => `xerife:ads:${slot}`;
const _adPool: AdItem[] = buildLocalPool();

function dedupeBy<T>(arr: T[], key: (a: T) => string): T[] {
  const seen = new Set<string>(), out: T[] = [];
  for (const a of arr) { const k = key(a); if (!seen.has(k)) { seen.add(k); out.push(a); } }
  return out;
}

function shuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Sorteia UM ad para o slot para ESTA visita (persistido na sessão). */
export function drawAds(slot: string): AdItem | null {
  if (typeof window === "undefined") return null;
  const key = SLOT_KEY(slot);
  const saved = sessionStorage.getItem(key);
  if (saved) { try { return JSON.parse(saved); } catch { /* refaz */ } }
  // junto catálogo local com links do network (todas band banners da classe
  // linked — FeaturedLink do type featured-link), só kind=featured-link &
  // paired do catalog externo ocupam os slots:
  const remotes: AdItem[] = (_remoteCache ?? []).flatMap((l, i) => ([
    { kind: "featured-link" as const, caption: "Sponsored", href: l.url, tileIndex: (i + 2) % 7, title: l.title, subtitle: l.subtitle ?? undefined, linkId: l.id },
  ]));
  const pool = [...remotes];
  const cli = dedupeBy([..._adPool, ...pool], (a) => a.href);
  if (!cli.length) return null;
  const seed = (slot.length * 31 + (Date.now() >> 12)) >>> 0;
  const drawn = shuffle(cli, seed)[0];
  sessionStorage.setItem(key, JSON.stringify(drawn));
  return drawn;
}

/** Re-sorteia todos os slots na próxima tela (ex.: após user voltar ao feed). */
export function refreshAds(): void {
  try {
    ["feed-home", "grid-playlists", "explorar"].forEach((s) => sessionStorage.removeItem(SLOT_KEY(s)));
  } catch { /* ignore */ }
}

/** Métricas — impression é disparado pelo componente ao entrar na viewport. */
export function trackAdEvent(linkId: string | undefined, kind: "impression" | "click"): void {
  if (!linkId) return;
  try {
    supabase.functions
      .invoke("ad-links", { body: { link_id: linkId, kind } })
      .catch(() => {});
  } catch { /* best-effort */ }
}

export { AD_GENDER_POOL_SIZE };
