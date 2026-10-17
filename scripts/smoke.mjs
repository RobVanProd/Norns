// Browser smoke test of the main flow: node scripts/smoke.mjs <outDir> [baseUrl]. Exits 1 on page errors.
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? "/tmp"; const base = process.argv[3] ?? "http://localhost:5180";
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errs = [];
// desktop flow: title -> Begin -> story -> map
let page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(`${base}/`); await page.waitForTimeout(5000);
await page.click('text=Begin'); await page.waitForTimeout(500);
for (let i = 0; i < 4; i++) { await page.click('.story .btn'); await page.waitForTimeout(300); }
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/flow-map.png` });
await page.click('.node >> nth=0'); await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/flow-intro.png` });
await page.click('text=Begin'); await page.waitForTimeout(4000);
// select digger and tap a wyrdling via keyboard + mouse
await page.keyboard.press('Digit1');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/flow-play.png` });
await page.close(); // free the software-GL renderer before the next page
// mobile landscape
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page = await ctx.newPage();
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`${base}/?level=m4&go`, { waitUntil: 'domcontentloaded', timeout: 60000 }); await page.waitForTimeout(7000);
await page.screenshot({ path: `${out}/flow-mobile.png` });
await browser.close();
console.log(errs.length ? errs.join('\n') : 'no errors'); process.exit(errs.length ? 1 : 0);
