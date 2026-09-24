/** Auto-hide do chrome do painel (NowPlayingView) — lógica Alse no Xerife.
 * Mobile: toca música → modo Vídeo → barra superior some aos 3s →
 * pointermove restaura → pausar mantém visível → info nunca some. */
import { chromium } from "playwright";
const URL = process.env.TARGET || "http://localhost:8080/";

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(3000);

// Dispensa o card "Instalar Xerife Switch" (fica por cima do mini player)
try {
  const closed = await page.evaluate(() => {
    for (const b of document.querySelectorAll("button")) {
      const t = b.parentElement?.textContent || "";
      if (t.includes("Instalar Xerife Switch") && t.length < 500) { b.click(); return true; }
    }
    return false;
  });
  if (closed) await page.waitForTimeout(400);
} catch { /* pode não existir */ }

const barOpacity = () =>
  page.evaluate(() => {
    const el = document.querySelector("[data-panel-top-bar]");
    if (!el) return "MISSING";
    const cs = getComputedStyle(el);
    return `${cs.opacity}|${cs.pointerEvents}`;
  });
const infoOpacity = () =>
  page.evaluate(() => {
    // Info Header (título/artista) — nunca deve sumir
    const shell = document.getElementById("now-playing-shell");
    const title = shell?.querySelector(".font-black.text-foreground");
    if (!title) return "MISSING";
    return getComputedStyle(title.closest("div")).opacity;
  });

const results = [];
const step = async (name, fn) => {
  try {
    const r = await fn();
    results.push([name, r]);
    console.log(`✓ ${name}: ${JSON.stringify(r)}`);
  } catch (e) {
    results.push([name, "FAIL: " + String(e).slice(0, 120)]);
    console.log(`✗ ${name} FAIL: ${String(e).slice(0, 200)}`);
  }
};

// 1) Tocar uma música (SongCard aria-label "Tocar ...") — hub → VER TUDO se preciso
await step("tocar música", async () => {
  const card = page.locator('button[aria-label^="Tocar "]').first();
  try {
    await card.waitFor({ timeout: 5000 });
  } catch {
    // Landing hub: entra no módulo Xerife Music (card ou VER TUDO)
    const mod = page.locator('button:has-text("Xerife Music")').first();
    if (await mod.count()) {
      await mod.click({ timeout: 3000 }).catch(() => {});
    } else {
      await page.locator('button:has-text("VER TUDO")').first().click({ timeout: 3000 });
    }
    await page.waitForTimeout(1500);
    await card.waitFor({ timeout: 6000 });
  }
  await card.click({ timeout: 4000 });
  // Mini player mobile → expandir painel (botão capa+titulo, sem aria)
  const expand = page.locator('div[class*="md:hidden"] button.flex.items-center.gap-3').first();
  await expand.waitFor({ timeout: 6000 });
  await expand.click({ timeout: 4000 });
  await page.waitForSelector("#now-playing-shell", { timeout: 8000 });
  return "painel aberto";
});

// 2) Ativar modo Vídeo (botão da action bar; fallback = evento local do sync)
await step("modo vídeo", async () => {
  const btn = page.locator('button[title="Vídeo"]');
  try {
    await btn.waitFor({ timeout: 6000 });
    await btn.click({ timeout: 3000 });
    console.log("  (via botão Vídeo da action bar)");
  } catch {
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("xerife:player-mode:changed", { detail: { mode: "video" } }));
    });
    console.log("  (via evento xerife:player-mode:changed — fallback)");
  }
  await page.waitForTimeout(800);
  const present = await page.evaluate(() => !!document.querySelector("[data-panel-top-bar]"));
  if (!present) throw new Error("barra superior ausente");
  return await barOpacity();
});

// 3) Logo após ativar: barra VISÍVEL (timer recém-armado)
await step("t+0.5s barra visível", async () => {
  await page.waitForTimeout(500);
  const v = await barOpacity();
  if (!v.startsWith("1|")) throw new Error(`esperava 1, veio ${v}`);
  return v;
});

// 4) Sem interação por >3000ms: barra OCULTA
await step("t+4.5s sem interação → oculta", async () => {
  await page.waitForTimeout(4000);
  const v = await barOpacity();
  if (!v.startsWith("0|none")) throw new Error(`esperava 0|none, veio ${v}`);
  const info = await infoOpacity();
  if (info !== "1" && info !== "MISSING") throw new Error(`info sumiu: ${info}`);
  return { barra: v, info };
});

// 5) pointermove no painel → restaura
await step("pointermove → restaura", async () => {
  await page.mouse.move(195, 700);
  await page.mouse.move(195, 680);
  await page.waitForTimeout(450); // > transition-opacity 300ms
  const v = await barOpacity();
  if (!v.startsWith("1|")) throw new Error(`esperava 1, veio ${v}`);
  return v;
});

// 6) Pausar → barra fica visível (regra 5 Alse: pausado = permanente)
await step("pausar → mantém visível", async () => {
  const playBtn = page.locator("[data-central-transport] button").nth(1);
  await playBtn.click({ timeout: 4000 });
  await page.waitForTimeout(3600); // > N: se pausado não segurasse, sumiria
  const v = await barOpacity();
  if (!v.startsWith("1|")) throw new Error(`pausado deveria manter 1, veio ${v}`);
  return v;
});

const fails = results.filter(([, r]) => String(r).startsWith("FAIL"));
console.log(`\nPANEL-CHROME ${fails.length === 0 ? "OK" : "FALHOU"} (${results.length} passos)`);
await browser.close();
process.exit(fails.length === 0 ? 0 : 1);
