import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
for (const vp of [{ width: 1024, height: 700 }, { width: 1280, height: 800 }, { width: 1536, height: 860 }]) {
  const page = await browser.newPage({ viewport: vp });
  await page.goto('http://localhost:8080/', { waitUntil: 'networkidle', timeout: 40000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const m = await page.evaluate(() => {
    const out = { vw: window.innerWidth, center: window.innerWidth / 2 };
    // ilha do topo (nav)
    const nav = document.querySelector('nav[data-desktop-island]');
    if (nav) { const r = nav.getBoundingClientRect(); out.topIsland = { left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), center: Math.round(r.left + r.width / 2), off: Math.round(r.left + r.width / 2 - window.innerWidth / 2) }; }
    // ilha do rodapé
    const bot = document.querySelector('[aria-label="Player (desktop)"]');
    if (bot) { const r = bot.getBoundingClientRect(); out.bottomIsland = { left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), center: Math.round(r.left + r.width / 2), off: Math.round(r.left + r.width / 2 - window.innerWidth / 2) }; }
    // clusters do header
    const hdr = document.querySelector('header');
    if (hdr) {
      const kids = [...hdr.children].filter((k) => k.getBoundingClientRect().width > 0);
      out.headerKids = kids.map((k) => { const r = k.getBoundingClientRect(); return `${k.tagName}.${(k.className + '').split(' ')[0]} x:${Math.round(r.x)}-${Math.round(r.right)}`; });
    }
    return out;
  });
  console.log(`\n═══ ${vp.width}px ═══`);
  console.log(JSON.stringify(m, null, 1));
  await page.close();
}
await browser.close();
