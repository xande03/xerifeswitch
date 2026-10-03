/**
 * check-videos-avatars.mjs — validação AO VIVO da UI do Xerife Vídeos:
 * garante que os ícones/logo dos canais sejam APARENTES e REAIS.
 *
 * Passos: abre o hub → entra em "Xerife Videos" → espera o feed (trending) →
 * conta avatares reais (img src yt3.googleusercontent, rounded-full) vs
 * fallbacks de inicial (div com letra). PASS = avatares reais ≥ Mínimo.
 *
 * Uso: node scripts/check-videos-avatars.mjs [BASE_URL]
 * Env: VIEWPORT=390x844 (default) | DESKTOP=1 para1440x900
 */
import { chromium } from "playwright";

const BASE = process.argv[2] || process.env.BASE_URL || "https://xerifeswitch.netlify.app";
const [VW, VH] = (process.env.VIEWPORT || (process.env.DESKTOP ? "1440x900" : "390x844")).split("x").map(Number);
const MIN_REAIS = Number(process.env.MIN_REAIS || 5);

console.log(`== check-videos-avatars: ${BASE} viewport=${VW}x${VH}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: VW, height: VH } });
const failures = [];
page.on("pageerror", (e) => failures.push("pageerror: " + String(e).split("\n")[0]));
page.on("console", (m) => { if (m.type() === "error") failures.push("console.error: " + m.text().slice(0, 240)); });

const t0 = Date.now();
await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(1200);

// 1) Entra no módulo Xerife Videos (card do hub)
const card = page.locator('button:has-text("Xerife Videos")').first();
if (!(await card.count())) { console.log("HUB CARD 'Xerife Videos' AUSENTE"); await browser.close(); process.exit(1); }
await card.click();
console.log(`entrou em Xerife Videos em ${Date.now() - t0}ms`);

// 2) Espera os avatares reais aparecerem (trending carrega em ~1.5s)
let reais = 0;
const deadline = Date.now() + 35000; // fanout de recomendações tem 1º wave abortado + retry
while (Date.now() < deadline) {
  reais = await page.locator('img.rounded-full[src*="yt3"]').count();
  if (reais >= MIN_REAIS) break;
  await page.waitForTimeout(500);
}

// Dispensa o sheet "Instalar Xerife Switch" (PWA) para expor as linhas dos logos
try {
  const closeBtn = page.locator('button:has-text("\u00d7"), button[aria-label*="echar" i], button[aria-label*="lose" i]').first();
  if (await closeBtn.count()) await closeBtn.click({ timeout: 1500 }).catch(() => {});
} catch {}
await page.waitForTimeout(400);
const iniciais = await page.locator('button[aria-label] div.rounded-full').count();

await page.mouse.wheel(0, 260);
await page.waitForTimeout(500);
await page.screenshot({ path: "/tmp/videos-avatars.png", fullPage: false });

console.log(`AVATARES REAIS (img yt3): ${reais}`);
console.log(`fallbacks/div-por-vizinhos detectados: ${iniciais} (referência)`);
console.log(`screenshot: /tmp/videos-avatars.png`);
if (failures.length) console.log(`falhas de página (${failures.length}):`, failures.slice(0, 2));

if (failures.length) console.log(`aviso: ${failures.length} erro(s) de página (pré-existentes conhecidos — fanout abort/embed vazio)`);
const PASS = reais >= MIN_REAIS;
console.log(`VIDEO AVATARS: ${PASS ? "PASS" : "FAIL"} (${reais} reais, mínimo ${MIN_REAIS})`);
await browser.close();
process.exit(PASS ? 0 : 1);
