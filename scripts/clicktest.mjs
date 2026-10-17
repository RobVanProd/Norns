// Click-reliability harness (dev server): node scripts/clicktest.mjs <baseUrl> [level=m1] [drift=9] [aim=body]
// Arms a calling, then clicks walking Wyrdlings like a player tracking them: press on the sprite, the
// cursor drifts `drift` CSS px along the walk, release. The sim is frozen during the click (headless frames
// are slow, so a live target would walk out from under the cursor); drift stands in for its motion.
// Reports how many clicks actually assigned.
// aim=body clicks the sprite's middle, aim=hood its top edge.
import { chromium } from 'playwright-core';
const [base, level = 'm1', drift = '9', aim = 'body'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`${base}/?level=${level}&go`);
await page.waitForFunction(() => window.__norns?.scene()?.state === 'play', null, { timeout: 60000 });
let ok = 0, n = 0;
for (let trial = 0; trial < 12; trial++) {
  // hold real time, step to a moment with a walking Wyrdling on screen, re-arm a fresh calling
  const tgt = await page.evaluate(([trial, aim]) => {
    const s = window.__norns.scene(); s.debugHold = true;
    s.debugAdvance(trial === 0 ? 260 : 25);
    s.sim.d.skills.blast = 50; s.armed = 'blast';
    const p = s.p, dpr = s.dpr || 1;
    const vis = (w) => w.x > p.view.x + 8 && w.x < p.view.x + p.viewW - 8 && w.y > p.view.y + 20 && w.y < p.view.y + p.viewH - 8;
    const walkers = s.sim.d.wyrds.filter((w) => w.st === 'walk' && vis(w));
    if (!walkers.length) return null;
    const w = walkers[trial % walkers.length];
    const top = p.devH - (p.oy + p.viewH * p.scale);
    const wy = aim === 'hood' ? w.y - 14 : w.y - 7;
    return { id: w.id, dir: w.dir, x: ((w.x - p.view.x) * p.scale + p.ox) / dpr, y: ((wy - p.view.y) * p.scale + top) / dpr, used: s.sim.d.used };
  }, [trial, aim]);
  if (!tgt) continue;
  n++;
  await page.mouse.move(tgt.x, tgt.y);
  await page.mouse.down();
  await page.mouse.move(tgt.x + tgt.dir * +drift, tgt.y, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(80);
  const used = await page.evaluate(() => window.__norns.scene().sim.d.used);
  if (used > tgt.used) ok++;
  else {
    const hit = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? `${e.tagName}.${e.className}` : 'none'; }, [tgt.x, tgt.y]);
    console.log(`  miss: wyrd #${tgt.id} at css (${tgt.x.toFixed(0)},${tgt.y.toFixed(0)}), element under cursor: ${hit}`);
  }
}
console.log(`${level} drift=${drift}px aim=${aim}: ${ok}/${n} clicks assigned`);
await browser.close();
