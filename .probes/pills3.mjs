import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
for (const vp of [{ width: 1024, height: 700 }, { width: 1280, height: 800 }, { width: 1440, height: 900 }, { width: 1536, height: 900 }]) {
  const page = await browser.newPage({ viewport: vp });
  await page.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForSelector('nav[data-desktop-island]', { timeout: 25000 });
  await page.waitForTimeout(1200);
  const rows = [];
  for (let i = 0; i < 3; i++) {
    rows.push(await page.evaluate(() => {
      const vw = window.innerWidth;
      const nav = document.querySelector('nav[data-desktop-island]');
      const bot = document.querySelector('[aria-label="Player (desktop)"]');
      const hdr = nav.closest('header');
      const active = hdr.querySelector('[aria-current="page"], .text-primary');
      const out = { modulo: (active?.textContent || '').trim().slice(0, 16) };
      const nr = nav.getBoundingClientRect();
      out.topOff = Math.round(nr.left + nr.width / 2 - vw / 2);
      if (bot) { const br = bot.getBoundingClientRect(); out.botOff = Math.round(br.left + br.width / 2 - vw / 2); }
      // overlap da ilha com logo (1ª col) ou cluster direito (3ª col)?
      const sibs = [...hdr.children].filter((k) => k !== nav.parentElement);
      out.overlap = sibs.some((k) => { const r = k.getBoundingClientRect(); return r.width > 0 && r.right > nr.left + 2 && r.left < nr.right - 2; });
      return out;
    }));
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /alternar|switch/i.test((x.getAttribute('aria-label') || '') + (x.textContent || '')));
      b?.click();
    });
    await page.waitForTimeout(1500);
  }
  console.log(`═══ ${vp.width}px ═══`);
  rows.forEach((r) => console.log('  ', JSON.stringify(r)));
  await page.close();
}
await browser.close();
