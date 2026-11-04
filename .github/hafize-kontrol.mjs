// Loads index.html of this branch and of main in Chromium and compares the uncaught errors. Written by Hafize.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const PAGE = process.env.HAFIZE_SAYFA || 'index.html';
mkdirSync('.kontrol', { recursive: true });
let mainCopy = '';
try { mainCopy = execFileSync('git', ['show', `origin/main:${PAGE}`], { encoding: 'utf8', maxBuffer: 50e6 }); } catch { /* no main yet */ }
writeFileSync('.kontrol/main.html', mainCopy);

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function errorsOf(file) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  const clicks = [];
  let afterInteractions = false;
  page.on('pageerror', (error) => {
    const msg = String(error?.message ?? error).split('\n')[0].slice(0, 200);
    if (afterInteractions) clicks.push(msg);
    else errors.push(msg);
  });
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  await page.goto('file://' + resolve(file), { waitUntil: 'load', timeout: 60_000 }).catch((error) => errors.push('Sayfa açılmadı: ' + error.message.slice(0, 160)));
  await page.waitForTimeout(12_000);
  afterInteractions = true;
  // Arama
  await page.fill('#searchInput', 'Kızılay').catch(() => {});
  await page.press('#searchInput', 'Enter').catch(() => {});
  await page.waitForTimeout(1000);
  // Taban butonları ve onclick öğeleri
  const targets = await page.$$('[onclick], .basemap-list button').catch(() => []);
  for (const el of targets) {
    await el.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(2000);
  const body = await page.evaluate(() => document.body?.innerText?.length ?? 0).catch(() => 0);
  const nodes = await page.evaluate(() => document.querySelectorAll('body *').length).catch(() => 0);
  await page.close();
  return { errors: [...new Set(errors)], clicks: [...new Set(clicks)], nodes, body };
}
const mine = await errorsOf(PAGE);
const base = mainCopy ? await errorsOf('.kontrol/main.html') : { errors: [], nodes: 0 };
await browser.close();
const fresh = mine.errors.filter((error) => !base.errors.includes(error));
console.log('Bu dal:', JSON.stringify(mine));
console.log('main:', JSON.stringify(base));
if (mine.nodes < 3) { console.error('Sayfa boş görünüyor.'); process.exit(1); }
if (fresh.length) { console.error('Yeni hata:', fresh.join(' | ')); process.exit(1); }
if (mine.clicks.length) { console.error('Tıklama hatası:', mine.clicks.join(' | ')); process.exit(1); }
console.log('Temiz: main\'de olmayan bir hata yok.');
