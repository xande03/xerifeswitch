// Laboratório: observa o glifo central do embed YT (controls=0, pointer-events:none)
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import http from 'http';
import { readFileSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = (n) => path.join(__dirname, 'shots', n);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// mini server
const server = http.createServer((req, res) => {
  const html = readFileSync(path.join(__dirname, 'glyph-repro.html'));
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
});
await new Promise((r) => server.listen(8123, '0.0.0.0', r));

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 420 } });
page.on('console', (m) => console.log('PAGE:', m.type(), m.text().slice(0, 200)));
page.on('pageerror', (e) => console.log('PAGEERR:', e.message));
page.on('requestfailed', (r) => console.log('REQFAIL:', r.url().slice(0, 120), r.failure()?.errorText));

await page.goto('http://127.0.0.1:8123/');
try {
  await page.waitForFunction(() => window.__ready && window.__ready(), null, { timeout: 25000 });
  console.log('READY OK');
} catch (e) {
  console.log('NOT READY — screenshot de debug');
  await page.screenshot({ path: out('0-debug.png') });
  await browser.close();
  server.close();
  process.exit(1);
}
await sleep(2000);

// 1) play via API
await page.evaluate(() => document.getElementById('b-play').click());
await sleep(3000);
await page.screenshot({ path: out('1-playing.png') });
console.log('state after play:', await page.evaluate(() => window.__state()));

// 2) pause via API (sem pointer events) — glifo deve pintar
await page.evaluate(() => document.getElementById('b-pause').click());
await sleep(2500);
await page.screenshot({ path: out('2-paused-noevents.png') });
console.log('state after pause:', await page.evaluate(() => window.__state()));

// 3) play de novo — o glifo de pausa persiste?
await page.evaluate(() => document.getElementById('b-play').click());
await sleep(3000);
await page.screenshot({ path: out('3-resumed-glyph.png') });
console.log('state after resume:', await page.evaluate(() => window.__state()));

// 4) mais tempo — sozinho ele some?
await sleep(7000);
await page.screenshot({ path: out('4-resumed-plus10s.png') });

// 5) liga pointer-events e move o mouse REAL sobre o centro do iframe
await page.evaluate(() => document.getElementById('b-events').click());
const box = await page.locator('#box').boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
await sleep(2500);
await page.screenshot({ path: out('5-pointerevents-hover.png') });

// 6) pausa com pointer events ligados e espera auto-hide interno
await page.evaluate(() => document.getElementById('b-pause').click());
await sleep(4500);
await page.screenshot({ path: out('6-paused-events-autohide.png') });

// 7) volta a tocar, desliga pointer events, seek no meio
await page.evaluate(() => document.getElementById('b-play').click());
await sleep(1200);
await page.evaluate(() => document.getElementById('b-events').click()); // none de novo
await page.evaluate(() => document.getElementById('b-seek').click());
await sleep(2500);
await page.screenshot({ path: out('7-seek-glyph-noevents.png') });
await sleep(7000);
await page.screenshot({ path: out('8-seek-glyph-plus9s.png') });

await browser.close();
server.close();
console.log('DONE — veja lab/shots/');
