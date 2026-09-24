// FASE 3: transport DO APP display:none via style — só o iframe aparece
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import http from 'http';
import { readFileSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = (n) => path.join(__dirname, 'shots', n);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(readFileSync(path.join(__dirname, 'glyph-repro.html')));
});
await new Promise((r) => server.listen(8123, '0.0.0.0', r));

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 420 } });
await page.goto('http://127.0.0.1:8123/');
await page.waitForFunction(() => window.__ready && window.__ready(), null, { timeout: 25000 });
await sleep(1500);

// ESCONDE o botão do app de verdade (inline style, sem depender de CSS)
await page.evaluate(() => { document.querySelector('.transport').style.display = 'none'; });
console.log('display:', await page.evaluate(() => getComputedStyle(document.querySelector('.transport')).display));

const clip = { x: 16, y: 16, width: 530, height: 298 };

// 1) tocando, sem chrome nosso
await page.evaluate(() => document.getElementById('b-play').click());
await sleep(3000);
await page.screenshot({ path: out('P1-playing-ytonly.png'), clip });

// 2) pausa via API (pointer-events:none) — o YT pinta algo?
await page.evaluate(() => document.getElementById('b-pause').click());
await sleep(600);
await page.screenshot({ path: out('P2-paused-600ms.png'), clip });
await sleep(4000);
await page.screenshot({ path: out('P3-paused-4600ms.png'), clip });

// 3) retoma — o glifo de pausa some?
await page.evaluate(() => document.getElementById('b-play').click());
await sleep(800);
await page.screenshot({ path: out('P4-resumed-800ms.png'), clip });
await sleep(3000);
await page.screenshot({ path: out('P5-resumed-4s.png'), clip });

// 4) seek durante reprodução
await page.evaluate(() => document.getElementById('b-seek').click());
await sleep(800);
await page.screenshot({ path: out('P6-seek-800ms.png'), clip });
await sleep(4000);
await page.screenshot({ path: out('P7-seek-5s.png'), clip });

// 5) pausa e espera 12s — pause overlay some sozinho (sem pointer)?
await page.evaluate(() => document.getElementById('b-pause').click());
await sleep(12000);
await page.screenshot({ path: out('P8-paused-12s.png'), clip });

// 6) pointer events ON + mouse real em cima → some agora?
await page.evaluate(() => document.getElementById('b-events').click());
const box = await page.locator('#box').boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 6 });
await sleep(2000);
await page.screenshot({ path: out('P9-paused-events-hover.png'), clip });

await browser.close();
server.close();
console.log('FASE3 DONE');
