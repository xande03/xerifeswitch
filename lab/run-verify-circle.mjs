// Verificação: o círculo no centro é do DOM do app ou do iframe?
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import http from 'http';
import { readFileSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

await page.evaluate(() => document.querySelector('.transport').classList.add('hide'));
console.log('display do meu transporte:', await page.evaluate(() => getComputedStyle(document.querySelector('.transport')).display));
console.log('display do meu btn:', await page.evaluate(() => getComputedStyle(document.querySelector('.btn')).display));

await page.evaluate(() => document.getElementById('b-play').click());
await sleep(3000);
// esconde o IFRAME também — se o círculo sumir, é do YouTube
await page.evaluate(() => { document.querySelector('#box iframe').style.visibility = 'hidden'; });
await page.screenshot({ path: path.join(__dirname, 'shots', 'Z1-iframe-hidden.png'), clip: { x: 16, y: 16, width: 530, height: 298 } });
await page.evaluate(() => { document.querySelector('#box iframe').style.visibility = 'visible'; });
// pausa — esconde iframe de novo para ver se o glifo é interno
await page.evaluate(() => document.getElementById('b-pause').click());
await sleep(1200);
await page.screenshot({ path: path.join(__dirname, 'shots', 'Z2-paused-iframe-visible.png'), clip: { x: 16, y: 16, width: 530, height: 298 } });
await page.evaluate(() => { document.querySelector('#box iframe').style.visibility = 'hidden'; });
await page.screenshot({ path: path.join(__dirname, 'shots', 'Z3-paused-iframe-hidden.png'), clip: { x: 16, y: 16, width: 530, height: 298 } });

await browser.close();
server.close();
console.log('VERIFY DONE');
