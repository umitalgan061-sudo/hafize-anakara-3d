// hafize-kontrol v2: opens index.html of this branch and of main in Chromium, then uses the page like a person
// would (types into text boxes and presses Enter, clicks every button) and compares the uncaught errors with main's.
// Every error is also written as a GitHub annotation, so Hafize's next round knows what is broken. Written by Hafize.
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
  const used = [];
  let using = false;
  page.on('pageerror', (error) => (using ? used : errors).push(String(error?.message ?? error).split('\n')[0].slice(0, 200)));
  page.on('dialog', (dialog) => dialog.dismiss().catch(() => {}));
  await page.goto('file://' + resolve(file), { waitUntil: 'load', timeout: 60_000 }).catch((error) => errors.push('Sayfa açılmadı: ' + error.message.slice(0, 160)));
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
  }
  await page.waitForTimeout(1500);
  await page.close();
  return { errors: [...new Set(errors)], used: [...new Set(used)], nodes, body };
}
const mine = await errorsOf(PAGE);
const base = mainCopy ? await errorsOf('.kontrol/main.html') : { errors: [], used: [], nodes: 0 };
await browser.close();
const oneLine = (text) => String(text).replace(/[\r\n%]/g, ' ');
const fresh = mine.errors.filter((error) => !base.errors.includes(error));
const freshUse = mine.used.filter((error) => !base.used.includes(error));
for (const error of mine.errors) console.log(`::${fresh.includes(error) ? 'error' : 'warning'} title=Açılış hatası${fresh.includes(error) ? '' : ' (main de var)'}::${oneLine(error)}`);
for (const error of mine.used) console.log(`::${freshUse.includes(error) ? 'error' : 'warning'} title=Kullanım hatası${freshUse.includes(error) ? '' : ' (main de var)'}::${oneLine(error)}`);
console.log('Bu dal:', JSON.stringify(mine));
console.log('main:', JSON.stringify(base));
if (mine.nodes < 3) { console.error('Sayfa boş görünüyor.'); process.exit(1); }
if (fresh.length || freshUse.length) { console.error('Yeni hata:', [...fresh, ...freshUse].join(' | ')); process.exit(1); }
console.log('Temiz: main\'de olmayan bir hata yok.');
