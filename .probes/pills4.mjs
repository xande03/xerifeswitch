import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
for (const vp of [{ width: 1024, height: 700 }, { width: 1280, height: 800 }, { width: 1536, height: 900 }]) {
  const page = await browser.newPage({ viewport: vp });
  await page.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForSelector('nav[data-desktop-island] button', { timeout: 25000 });
  await page.waitForTimeout(1000);
  const rows = [];
  for (let i = 0; i < 3; i++) {
    rows.push(await page.evaluate(() => {
      const vw = window.innerWidth;
      const nav = document.querySelector('nav[data-desktop-island]');
      const bot = document.querySelector('[aria-label="Player (desktop)"]');
      const active = nav.querySelector('button[aria-pressed="true"]');
      const out = { modulo: (active?.textContent || '').trim() };
      const nr = nav.getBoundingClientRect();
      out.topOff = Math.round(nr.left + nr.width / 2 - vw / 2);
      if (bot) { const br = bot.getBoundingClientRect(); out.botOff = Math.round(br.left + br.width / 2 - vw / 2); }
      const hdr = nav.closest('header');
      const sibs = [...hdr.children].filter((k) => k !== nav.parentElement);
      out.overlap = sibs.some((k) => { const r = k.getBoundingClientRect(); return r.width > 0 && r.right > nr.left + 2 && r.left < nr.right - 2; });
      return out;
    }));
    // próximo módulo dentro da própria ilha
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('nav[data-desktop-island] button[aria-label^="Sessão"]')];
      const cur = btns.findIndex((b) => b.getAttribute('aria-pressed') === 'true');
      btns[(cur + 1) % btns.length]?.click();
    });
    await page.waitForTimeout(1400);
  }
  console.log(`═══ ${vp.width}px ═══`);
  rows.forEach((r) => console.log('  ', JSON.stringify(r)));
  await page.close();
}
await browser.close();
