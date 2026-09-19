import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true });
const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE-ERR:', m.text().slice(0, 200)); });
page.on('pageerror', (e) => console.log('PAGE-ERR:', String(e).slice(0, 300)));
await page.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
const info = await page.evaluate(() => ({
  hasHeader: !!document.querySelector('header'),
  hasNav: !!document.querySelector('nav[data-desktop-island]'),
  navHidden: !!document.querySelector('.hidden.lg\\:flex'),
  headerHTML: (document.querySelector('header')?.innerHTML || 'NO HEADER').slice(0, 400),
  bodyKids: document.body.innerText.slice(0, 150),
}));
console.log(JSON.stringify(info, null, 1));
await b.close();
