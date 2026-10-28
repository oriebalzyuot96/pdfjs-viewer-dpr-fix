// Loads PDFViewer (components build) at DPR 1, switches the emulated DPR to 3 and reports
// whether page 1 was re-rendered at the new resolution. Usage: node run.mjs <pdf.js repo>
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(process.argv[2]);
const puppeteer = createRequire(path.join(repo, 'package.json'))('puppeteer');
const types = { '.html': 'text/html', '.mjs': 'text/javascript', '.css': 'text/css', '.pdf': 'application/pdf', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const [root, rel] = url.startsWith('/repo/') ? [repo, url.slice(6)] : [here, url.slice(1) || 'index.html'];
  const p = path.join(root, rel);
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));

const browser = await puppeteer.launch({ browser: 'chrome', executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage();
page.on('pageerror', e => console.error('pageerror', e.message));
const setDpr = f => page.setViewport({ width: 800, height: 900, deviceScaleFactor: f });

await page.evaluateOnNewDocument(() => {
  window.resolutionListeners = [];
  const realMatchMedia = window.matchMedia.bind(window);
  window.matchMedia = query => {
    const mql = realMatchMedia(query);
    if (query.includes('dppx')) {
      const realAdd = mql.addEventListener.bind(mql);
      mql.addEventListener = (type, fn, opts) => {
        if (type === 'change') window.resolutionListeners.push(fn);
        return realAdd(type, fn, opts);
      };
    }
    return mql;
  };
});
await setDpr(1);
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await page.waitForFunction(() => window.firstCanvasWidth?.()?.pixels > 0, { timeout: 30000 });
await new Promise(r => setTimeout(r, 500));
const before = await page.evaluate(() => window.firstCanvasWidth());

await setDpr(3);
// CDP emulation updates devicePixelRatio but never fires the media query `change` event that a
// real monitor/zoom change fires, so fire the recorded resolution listeners by hand.
const fired = await page.evaluate(() => {
  const listeners = window.resolutionListeners.splice(0);
  listeners.forEach(fn => fn(new Event('change')));
  return listeners.length;
});
console.log('resolution listeners fired:', fired);
let after;
try {
  await page.waitForFunction(px => window.firstCanvasWidth()?.pixels > px * 2, { timeout: 5000 }, before.pixels);
} catch {}
after = await page.evaluate(() => window.firstCanvasWidth());

if (process.argv[3]) {
  // Crop of the paper's title and abstract on page 1, captured at the new DPR.
  const box = await page.$eval('.page[data-page-number="1"] canvas', c => {
    const r = c.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width };
  });
  await page.screenshot({
    path: process.argv[3],
    clip: { x: box.x + 60, y: box.y + 40, width: 420, height: 230 },
  });
}

console.log(JSON.stringify({ dprBefore: 1, before, dprAfter: 3, after, rerenderedSharp: after.pixels >= before.pixels * 2.5 }));
await browser.close();
server.close();
