// hafize-kontrol v3: serves this branch and main over http (so sites of several files and modules work), opens
// index.html of each in Chromium, uses the page like a person would (types into text boxes and presses Enter, clicks
// every button) and compares the uncaught errors with main's. Every error is also written as a GitHub annotation,
// so Hafize's next round knows what is broken. Written by Hafize.
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { chromium } from 'playwright';

const PAGE = process.env.HAFIZE_SAYFA || 'index.html';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8' };
mkdirSync('.kontrol', { recursive: true });
let hasMain = false;
try { execFileSync('git', ['worktree', 'add', '--detach', '.kontrol/main', 'origin/main'], { stdio: 'ignore' }); } catch { /* no main yet, or already there */ }
hasMain = existsSync('.kontrol/main/' + PAGE);

function serve(root) {
  const base = resolve(root);
  const server = createServer((request, response) => {
    const path = normalize(decodeURIComponent(new URL(request.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    let file = join(base, path || PAGE);
    if (!file.startsWith(base)) { response.writeHead(403).end(); return; }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream' });
    createReadStream(file).pipe(response);
  });
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done({ url: `http://127.0.0.1:${server.address().port}/${PAGE}`, close: () => server.close() })));
}

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function errorsOf(root) {
  const site = await serve(root);
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  const used = [];
  let using = false;
  page.on('pageerror', (error) => (using ? used : errors).push(String(error?.message ?? error).split('\n')[0].slice(0, 200)));
  page.on('dialog', (dialog) => dialog.dismiss().catch(() => {}));
  await page.goto(site.url, { waitUntil: 'load', timeout: 60_000 }).catch((error) => errors.push('Sayfa açılmadı: ' + error.message.slice(0, 160)));
  await page.waitForTimeout(12_000);
  const body = await page.evaluate(() => document.body?.innerText?.length ?? 0).catch(() => 0);
  const nodes = await page.evaluate(() => document.querySelectorAll('body *').length).catch(() => 0);
  using = true;
  for (const box of (await page.$$('input[type="text"], input[type="search"], input:not([type])')).slice(0, 10)) {
    if (!(await box.isVisible().catch(() => false))) continue;
    await box.fill('Ankara').catch(() => {});
    await box.press('Enter').catch(() => {});
    await page.waitForTimeout(800);
  }
  for (const target of (await page.$$('button, [onclick], [role="button"], input[type="button"], input[type="submit"]')).slice(0, 40)) {
    if (!(await target.isVisible().catch(() => false))) continue;
    await target.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(400);
    if (!page.url().startsWith(site.url.replace(/[^/]*$/, ''))) await page.goto(site.url).catch(() => {});
  }
  await page.waitForTimeout(1500);
  await page.close();
  site.close();
  return { errors: [...new Set(errors)], used: [...new Set(used)], nodes, body };
}
const mine = await errorsOf('.');
const base = hasMain ? await errorsOf('.kontrol/main') : { errors: [], used: [], nodes: 0 };
await browser.close();
const oneLine = (text) => String(text).replace(/[\r\n%]/g, ' ');
const fresh = mine.errors.filter((error) => !base.errors.includes(error));
const freshUse = mine.used.filter((error) => !base.used.includes(error));
for (const error of mine.errors) console.log(`::${fresh.includes(error) ? 'error' : 'warning'} title=Açılış hatası${fresh.includes(error) ? '' : ' (main de var)'}::${oneLine(error)}`);
for (const error of mine.used) console.log(`::${freshUse.includes(error) ? 'error' : 'warning'} title=Kullanım hatası${freshUse.includes(error) ? '' : ' (main de var)'}::${oneLine(error)}`);
console.log('Bu dal:', JSON.stringify(mine));
console.log('main:', JSON.stringify(base));
if (mine.nodes < 3) { console.log('::error title=Açılış hatası::Sayfa boş görünüyor'); process.exit(1); }
if (fresh.length || freshUse.length) { console.error('Yeni hata:', [...fresh, ...freshUse].join(' | ')); process.exit(1); }
console.log('Temiz: main\'de olmayan bir hata yok.');
