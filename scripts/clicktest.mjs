// Click-reliability harness (dev server):
//   node scripts/clicktest.mjs <baseUrl> [level=m1] [drift=9] [aim=body] [mode=single] [input=mouse]
// Arms a calling, then clicks walking Wyrdlings like a player tracking them: press on the sprite, the
// cursor drifts `drift` CSS px along the walk, release. The sim is frozen during the click (headless frames
// are slow, so a live target would walk out from under the cursor); drift stands in for its motion.
// Reports how many clicks actually assigned.
// aim=body clicks the sprite's middle, aim=hood its top edge.
// mode=crowd: a dense crowd instead. Each trial gathers 5-7 walkers on one flat stretch of floor, 1 px apart and
// facing both ways (the harness moves them there and arms Climber, which leaves them walking; it is a
// targeting test, not a level), picks one of them as the intended target and chooses it by cycling before
// the grant: with input=mouse it hovers the crowd,
// presses Tab until the outline is on the intended Wyrdling, then clicks; with input=touch (an emulated
// touch screen) it taps the crowd, taps the same spot again until the intended one is outlined, then holds
// a finger on it to grant. A trial passes only if the intended Wyrdling, and no other, got the calling.
import { chromium } from 'playwright-core';
const [base, level = 'm1', drift = '9', aim = 'body', mode = 'single', input = 'mouse'] = process.argv.slice(2);
const touch = input === 'touch';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, hasTouch: touch });
const cdp = touch ? await page.context().newCDPSession(page) : null;
// each touch event carries the time the finger did it (s since epoch): the page measures a hold from these, and
// a slow software-GL renderer would otherwise stretch a quick tap into a hold
const finger = (type, at, x, y) => cdp.send('Input.dispatchTouchEvent', { type, timestamp: at, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
const now = () => Date.now() / 1000;
await page.goto(`${base}/?level=${level}&go`);
await page.waitForFunction(() => window.__norns?.scene()?.state === 'play', null, { timeout: 60000 });
const frame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
// world px → CSS px on the page
const css = () => page.evaluate(() => {
  const p = window.__norns.scene().p, dpr = window.__norns.scene().dpr || 1;
  return { vx: p.view.x, vy: p.view.y, scale: p.scale, ox: p.ox, top: p.devH - (p.oy + p.viewH * p.scale), dpr };
});
const toCss = (m, x, y) => ({ x: ((x - m.vx) * m.scale + m.ox) / m.dpr, y: ((y - m.vy) * m.scale + m.top) / m.dpr });

let ok = 0, n = 0, chosen = 0;
if (mode === 'crowd') {
  for (let trial = 0; trial < 12; trial++) {
    // hold real time, step on, gather a crowd on flat floor, re-arm a fresh calling
    const crowd = await page.evaluate(([trial]) => {
      const s = window.__norns.scene(); s.debugHold = true;
      // the camera follows the action early on, in real time: free it while gathering, pin it while clicking
      s.debugCam = null;
      s.debugAdvance(trial === 0 ? 330 : 25);
      s.sim.d.skills.climber = 50; s.armed = 'climber';
      const p = s.p, T = s.sim.terrain;
      const solid = (x, y) => T.get(x, y) !== 0;
      const vis = (w) => w.x > p.view.x + 30 && w.x < p.view.x + p.viewW - 30 && w.y > p.view.y + 40 && w.y < p.view.y + p.viewH - 40;
      const flat = (x, y) => { for (let dx = -5; dx <= 5; dx++) if (!solid(x + dx, y + 1) || solid(x + dx, y) || solid(x + dx, y - 14)) return false; return true; };
      // step on (a few ticks at a time) until enough are out walking, one of them on screen on flat floor
      let walkers = [], a;
      for (let k = 0; k < 60; k++) {
        walkers = s.sim.d.wyrds.filter((w) => w.st === 'walk');
        a = walkers.find((w) => vis(w) && flat(w.x, w.y));
        if (a && walkers.length >= 5) break;
        a = null;
        s.debugAdvance(5);
      }
      if (!a) return null;
      const group = [a, ...walkers.filter((w) => w !== a).slice(0, 6)];
      group.forEach((w, i) => { w.x = a.x - 3 + i; w.y = a.y; w.dir = i & 1 ? -1 : 1; w.climber = false; });
      const ids = group.map((w) => w.id);
      s.debugCam = { x: p.view.x, y: p.view.y };
      // the intended one: not the one a plain click would pick
      return { ids, want: ids[(trial * 3 + 2) % ids.length], x: a.x, y: a.y, used: s.sim.d.used };
    }, [trial]);
    if (!crowd) { console.log(`  trial ${trial}: no crowd could be gathered`); continue; }
    n++;
    await frame();
    const m = await css();
    const pt = toCss(m, crowd.x, aim === 'hood' ? crowd.y - 12 : crowd.y - 7);
    const state = () => page.evaluate(() => { const s = window.__norns.scene(); return { hover: s.hover, crowd: s.crowd }; });
    let st, cycles = 0;
    if (!touch) {
      await page.mouse.move(pt.x, pt.y);
      await frame();
      st = await state();
      while (st.hover !== crowd.want && cycles <= crowd.ids.length) {
        await page.keyboard.press('Tab');
        await frame();
        st = await state();
        cycles++;
      }
      await page.mouse.down();
      await page.mouse.move(pt.x + +drift, pt.y, { steps: 4 });
      await page.mouse.up();
    } else {
      // repeat taps on the same spot: the first chooses, each next one cycles
      do {
        const t = now();
        await finger('touchStart', t, pt.x, pt.y);
        await finger('touchEnd', t + 0.08);
        await frame();
        st = await state();
        cycles++;
      } while (st.hover !== crowd.want && cycles <= crowd.ids.length + 1);
      // hold a finger on it (drifting a little, as a finger does), then lift: that grants
      const t = now();
      await finger('touchStart', t, pt.x, pt.y);
      await page.waitForTimeout(420);
      for (let i = 1; i <= 4; i++) await finger('touchMove', t + 0.3 + i * 0.03, pt.x + (+drift * i) / 4, pt.y);
      await finger('touchEnd', t + 0.45);
    }
    await page.waitForTimeout(80);
    const after = await page.evaluate(([ids]) => {
      const s = window.__norns.scene();
      return { used: s.sim.d.used, granted: ids.filter((id) => s.sim.d.wyrds[id].climber) };
    }, [crowd.ids]);
    const hit = after.used === crowd.used + 1 && after.granted.length === 1 && after.granted[0] === crowd.want;
    if (hit) ok++;
    else {
      const why = await page.evaluate(([x, y]) => {
        const s = window.__norns.scene(), e = document.elementFromPoint(x, y);
        return `scene ${s.state}${s.paused ? ' paused' : ''}, tick ${s.sim.d.tick}, under the pointer: ${e ? `${e.tagName}.${e.className}` : 'none'}`;
      }, [pt.x, pt.y]);
      console.log(`  miss: wanted #${crowd.want} of [${crowd.ids}] (×${st.crowd} shown, outlined #${st.hover} after ${cycles} cycles), granted to [${after.granted}]; ${why}`);
    }
  }
  console.log(`${level} crowd input=${input} drift=${drift}px aim=${aim}: ${ok}/${n} grants went to the intended Wyrdling`);
} else {
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
    if (touch) {
      const t = now();
      await finger('touchStart', t, tgt.x, tgt.y);
      for (let i = 1; i <= 4; i++) await finger('touchMove', t + i * 0.02, tgt.x + (tgt.dir * +drift * i) / 4, tgt.y);
      await finger('touchEnd', t + 0.1);
    } else {
      await page.mouse.move(tgt.x, tgt.y);
      await page.mouse.down();
      await page.mouse.move(tgt.x + tgt.dir * +drift, tgt.y, { steps: 4 });
      await page.mouse.up();
    }
    await page.waitForTimeout(80);
    const used = await page.evaluate(() => window.__norns.scene().sim.d.used);
    // a quick tap on two or more about equally near the finger chooses one of them (outlined) instead of granting
    const chose = touch ? await page.evaluate(() => window.__norns.scene().choice) : null;
    if (used > tgt.used) ok++;
    else if (chose) {
      chosen++;
      console.log(`  crowd: wyrd #${tgt.id} overlaps another; the tap chose #${chose.id} (a hold grants, see mode=crowd)`);
    } else {
      const hit = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? `${e.tagName}.${e.className}` : 'none'; }, [tgt.x, tgt.y]);
      console.log(`  miss: wyrd #${tgt.id} at css (${tgt.x.toFixed(0)},${tgt.y.toFixed(0)}), element under cursor: ${hit}`);
    }
  }
  console.log(`${level}${touch ? ' input=touch' : ''} drift=${drift}px aim=${aim}: ${ok}/${n} clicks assigned${chosen ? `, ${chosen} chose in a crowd instead` : ''}`);
}
await browser.close();
