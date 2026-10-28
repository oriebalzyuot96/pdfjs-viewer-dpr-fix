// Builds docs/before-after.png from docs/before.png and docs/after.png.
// Usage: node compose.mjs <pdf.js repo (for puppeteer)> <showcase repo>
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const [repo, out] = process.argv.slice(2).map(p => path.resolve(p));
const puppeteer = createRequire(path.join(repo, 'package.json'))('puppeteer');
const img = f => `data:image/png;base64,${fs.readFileSync(path.join(out, 'docs', f)).toString('base64')}`;
const panel = (label, color, src) => `
  <figure>
    <figcaption style="background:${color}">${label}</figcaption>
    <img src="${src}">
  </figure>`;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin: 0; padding: 28px; background: #0f172a; font-family: Segoe UI, system-ui, sans-serif; width: max-content; }
  h1 { color: #fff; font-size: 26px; margin: 0 0 6px; }
  p { color: #cbd5e1; font-size: 16px; margin: 0 0 20px; }
  .row { display: flex; gap: 20px; }
  figure { margin: 0; background: #fff; border-radius: 12px; overflow: hidden; }
  figcaption { color: #fff; font-weight: 700; font-size: 18px; padding: 10px 14px; }
  img { display: block; width: 630px; }
</style></head><body>
  <h1>pdfjs-dist PDFViewer after the screen's pixel ratio changes (1x to 3x)</h1>
  <p>Same PDF, same zoom. Left: pdf.js master keeps the 760 px canvas. Right: with the fix the page is redrawn at 2280 px.</p>
  <div class="row">
    ${panel('Before: still drawn for 1x, blurry', '#b91c1c', img('before.png'))}
    ${panel('After: redrawn for 3x, sharp', '#15803d', img('after.png'))}
  </div>
</body></html>`;

const browser = await puppeteer.launch({ browser: 'chrome', executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 600, deviceScaleFactor: 2 });
await page.setContent(html);
const box = await (await page.$('body')).boundingBox();
await page.screenshot({ path: path.join(out, 'docs', 'before-after.png'), clip: { x: 0, y: 0, width: Math.ceil(box.width), height: Math.ceil(box.height) } });
await browser.close();
console.log('wrote docs/before-after.png');
