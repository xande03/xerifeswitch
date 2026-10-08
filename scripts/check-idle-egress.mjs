/**
 * check-idle-egress.mjs — medição EMPÍRICA de egress por fase (revisão27ª).
 * Fases: boot → repouso → Xerife Vídeos → repouso → Podcast → repouso.
 * Esperado: burst único de boot (cache frio) e ZERO em repouso.
 * Uso: node scripts/check-idle-egress.mjs
 */
import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const counts = { boot: 0, idle1: 0, videos: 0, idle2: 0, podcast: 0, idle3: 0 };
let phase = "boot";
page.on("request", (r) => {
  if (r.url().includes("dtzuhqeprqhbxbcbobcn.supabase.co")) counts[phase]++;
});
await page.goto("https://xerifeswitch.netlify.app", { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(12000); // boot + fanout inicial
phase = "idle1";
await page.waitForTimeout(45000); // repouso no hub45s
// entra em Xerife Videos
try { await page.locator('button:has-text("Xerife Videos")').first().click({ timeout: 5000 }); } catch {}
phase = "videos";
await page.waitForTimeout(12000);
phase = "idle2";
await page.waitForTimeout(45000); // repouso na tela de vídeos45s
// aba Podcast (stress do prefetch antigo)
try {
  await page.locator('button:has-text("Podcast")').first().click({ timeout: 4000 });
} catch {}
phase = "podcast";
await page.waitForTimeout(12000);
phase = "idle3";
await page.waitForTimeout(30000);
console.log("CHAMADAS SUPABASE POR FASE:");
for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
const total = Object.values(counts).reduce((a, b) => a + b, 0);
console.log("TOTAL:", total);
await browser.close();
