import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true });
const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded', timeout: 40000 });
await page.waitForSelector('nav[data-desktop-island]', { timeout: 25000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: '.probes/pills-centered.png' });
// linhas-guia no centro exato para inspeção
await page.evaluate(() => {
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;top:0;bottom:0;left:50%;width:2px;background:rgba(255,0,170,.65);z-index:99999;pointer-events:none';
  document.body.appendChild(d);
});
await page.waitForTimeout(300);
await page.screenshot({ path: '.probes/pills-centered-guide.png' });
await b.close();
