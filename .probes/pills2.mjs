import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const modules = ['Xerife Music', 'Xerife Videos', null]; // null = terceiro módulo (Podcasts), se houver
for (const vp of [{ width: 1024, height: 700 }, { width: 1280, height: 800 }, { width: 1440, height: 900 }]) {
  const page = await browser.newPage({ viewport: vp });
  await page.goto('http://localhost:8080/', { waitUntil: 'networkidle', timeout: 40000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const results = [];
  for (let i = 0; i < 3; i++) {
    const m = await page.evaluate(() => {
      const nav = document.querySelector('nav[data-desktop-island]');
      const bot = document.querySelector('[aria-label="Player (desktop)"]');
      const title = document.querySelector('header button span');
      const out = { modulo: title ? title.textContent.trim() : '?' };
      if (nav) { const r = nav.getBoundingClientRect(); out.topOff = Math.round(r.left + r.width / 2 - window.innerWidth / 2); }
      if (bot) { const r = bot.getBoundingClientRect(); out.botOff = Math.round(r.left + r.width / 2 - window.innerWidth / 2); }
      // overlap com os clusters?
      const hdr = nav?.closest('header');
      if (hdr && nav) {
        const nr = nav.getBoundingClientRect();
        const kids = [...hdr.children].filter((k) => k !== nav.parentElement && k.getBoundingClientRect().width > 0);
        out.overlap = kids.some((k) => { const r = k.getBoundingClientRect(); return r.right > nr.left && r.left < nr.right; });
      }
      return out;
    });
    results.push(m);
    // troca de módulo (botão Alternar → próximo módulo)
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /alternar entre music/i.test(x.getAttribute('aria-label') || ''));
      b?.click();
    });
    await page.waitForTimeout(1800);
  }
  console.log(`═══ ${vp.width}px ═══`);
  results.forEach((r) => console.log('  ', JSON.stringify(r)));
  await page.close();
}
await browser.close();
