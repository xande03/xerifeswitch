/**
 * E2E: garante que a sessão (hub/music/video/podcast) e sua cor de destaque
 * são restauradas corretamente após reload, tanto no mobile quanto no desktop.
 *
 * Executar com o dev server rodando em http://localhost:8080:
 *   node e2e/module-persistence.spec.mjs
 */
import { chromium } from "playwright";
import assert from "node:assert/strict";

const BASE = process.env.E2E_BASE_URL || "http://localhost:8080";

// Cores HSL (do src/index.css → tokens --primary por módulo, tema dark)
const EXPECTED = {
  hub:     "217 91% 60%",
  music:   "142 55% 45%",
  video:   "0 68% 55%",
  podcast: "270 55% 60%",
};

const readModuleState = async (page) =>
  page.evaluate(() => ({
    dataModule: document.documentElement.getAttribute("data-module"),
    primary: getComputedStyle(document.documentElement).getPropertyValue("--primary").trim(),
    homeMode: localStorage.getItem("demus-home-mode"),
    podcastMode: localStorage.getItem("demus-podcast-mode"),
    url: location.href,
  }));

async function runCase({ browser, viewport, label, initial, act, expected, expectQuery }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();

  // 1) Bootstrap inicial
  await page.goto(initial.url || `${BASE}/`, { waitUntil: "domcontentloaded" });
  if (initial.localStorage) {
    await page.evaluate((kv) => {
      for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v);
    }, initial.localStorage);
  }

  // 2) Ação (opcional): ex. mudar de sessão via UI/URL antes do reload
  if (act) await act(page);

  // 3) Reload → deve restaurar sessão e cor
  await page.reload({ waitUntil: "domcontentloaded" });
  // aguarda hidratação
  await page.waitForFunction(() => !!document.documentElement.getAttribute("data-module"));
  const state = await readModuleState(page);

  console.log(`[${label}]`, state);
  assert.equal(state.dataModule, expected, `${label}: data-module`);
  assert.equal(state.primary, EXPECTED[expected], `${label}: --primary token`);
  if (expectQuery === "podcast") {
    assert.match(state.url, /[?&]module=podcast\b/, `${label}: URL deve manter ?module=podcast`);
  } else if (expectQuery === "none") {
    assert.doesNotMatch(state.url, /[?&]module=/, `${label}: URL não deve ter ?module`);
  }

  await context.close();
}

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };

const cases = [
  // --- Sem query, localStorage vazio → default = hub (azul)
  { label: "mobile · default hub",  viewport: MOBILE,  initial: { url: `${BASE}/` }, expected: "hub", expectQuery: "none" },
  { label: "desktop · default hub", viewport: DESKTOP, initial: { url: `${BASE}/` }, expected: "hub", expectQuery: "none" },

  // --- ?module=podcast → restaura podcast (roxo) mesmo sem localStorage
  { label: "mobile · ?module=podcast",  viewport: MOBILE,  initial: { url: `${BASE}/?module=podcast` }, expected: "podcast", expectQuery: "podcast" },
  { label: "desktop · ?module=podcast", viewport: DESKTOP, initial: { url: `${BASE}/?module=podcast` }, expected: "podcast", expectQuery: "podcast" },

  // --- localStorage restaura music (verde)
  {
    label: "mobile · localStorage music", viewport: MOBILE,
    initial: { url: `${BASE}/`, localStorage: { "demus-home-mode": "music", "demus-podcast-mode": "0" } },
    expected: "music", expectQuery: "none",
  },
  {
    label: "desktop · localStorage video", viewport: DESKTOP,
    initial: { url: `${BASE}/`, localStorage: { "demus-home-mode": "video", "demus-podcast-mode": "0" } },
    expected: "video", expectQuery: "none",
  },

  // --- Transição: entrar em podcast e depois voltar para music
  //     não pode deixar cor azul/roxa "presa" após reload.
  {
    label: "mobile · podcast → music (sem resíduo)", viewport: MOBILE,
    initial: { url: `${BASE}/?module=podcast` },
    act: async (page) => {
      await page.evaluate(() => {
        localStorage.setItem("demus-home-mode", "music");
        localStorage.setItem("demus-podcast-mode", "0");
      });
      // simula limpeza da query como o hook faz
      await page.evaluate(() => history.replaceState(null, "", "/"));
    },
    expected: "music", expectQuery: "none",
  },
  {
    label: "desktop · music → podcast (overlay lilás)", viewport: DESKTOP,
    initial: { url: `${BASE}/`, localStorage: { "demus-home-mode": "music" } },
    act: async (page) => {
      await page.evaluate(() => {
        localStorage.setItem("demus-podcast-mode", "1");
        history.replaceState(null, "", "/?module=podcast");
      });
    },
    expected: "podcast", expectQuery: "podcast",
  },
];

const browser = await chromium.launch({ headless: true });
try {
  for (const c of cases) await runCase({ browser, ...c });
  console.log("\n✅ All module-persistence e2e cases passed");
} finally {
  await browser.close();
}
