# AGENTS.md: working on NORNS

A guide for AI coding agents and new contributors. Read it before you change code. The
player-facing overview is in [README.md](README.md) and the design intent in
[DESIGN.md](DESIGN.md).

## What this is

A browser game in the Lemmings lineage: Three.js + TypeScript, built with Vite and tested with
Vitest.
- A deterministic simulation (`src/sim`) runs at 30 ticks/s.
- A low-res WebGL pipeline (`src/render`, `src/game/view.ts`) draws it.
- All art and audio are generated in code at startup (`src/art`, `src/audio`).
- There are 15 levels (`src/levels`), each shipped with a scripted solution that the tests replay.

## Commands

| Task | Command |
|---|---|
| Install | `npm ci` (Node `^20.19` or `>=22.12`; CI uses 22) |
| Dev server | `npm run dev` → http://localhost:5173 (binds all interfaces) |
| Typecheck | `npm run typecheck` |
| Tests | `npm test` (about 5 s: sim, bosses, every level's solution, its steps and null run, view fit, slack report) |
| Production build | `npm run build` → `dist/` |
| Single-file build | `node scripts/artifact.mjs <out.html>` (everything inlined) |
| Level preview PNG | `npm run level:png <id> [out.png] [--null] [--ticks N] [--scale 2] [--at T]` |
| Trace one Wyrdling | `npm run level:trace <id> <nth> [from] [to] [every]` |
| Boss fight trace | `npx tsx scripts/bosstrace.ts <id> [maxTicks]` |
| Browser smoke test | `npm run smoke <outDir> [baseUrl]` (exits 1 on any page error) |
| Exact-tick screenshots | `node scripts/frames.mjs <url> <outDir> <w> <h> <ticks> [options]` (see the file header) |
| Contact sheet | `python3 scripts/sheet.py out.png <cols> <scale> <images...>` |
| Click reliability | `node scripts/clicktest.mjs <baseUrl> [level] [drift] [body\|hood]` |
| Trailer | `node scripts/trailer.mjs <devServerUrl> [workDir] [out.mp4]` (needs ffmpeg; about 4 min) |
| Audio render check | `node scripts/audio-check.mjs --url <devServerUrl>` (flags silence, clipping, NaNs) |

The browser scripts use `playwright-core` with Chromium at `/opt/pw-browsers/chromium` and
software GL (SwiftShader). Edit `executablePath` in the script if your Chromium lives elsewhere.
Scripts marked "dev server" need `npm run dev` (or `npx vite --port <p>`) running first.

## Before you push

1. `npm run typecheck`, `npm test` and a production build pass. CI runs `npm ci`, the
   typecheck, the tests and `npx vite build` on every PR and on `main`.
2. If you touched the simulation or a level, every scripted solution must still pass. Never
   loosen a test, a `target`, or a `solutionSaves` to make it pass. Fix the cause, or change the
   level and its solution together.
3. If you touched rendering, UI or art, look at real frames. Use `scripts/frames.mjs` (it can
   force a boss attack with `--do=TICK:js`), and run `npm run smoke` for page errors. Unit tests
   do not see pixels.
4. If you touched input, run `scripts/clicktest.mjs`. Clicks on walking Wyrdlings should
   assign 12/12, including with cursor drift.

## Architecture

```
src/sim/        deterministic simulation. No DOM, no imports from outside src/sim.
  sim.ts          Sim: step(), assign()/canAssign(), Wyrdling state machine, gates, hazards
  terrain.ts      chunked copy-on-write material grid (32×32 chunks), clone() is O(chunks)
  level.ts        LevelDef / TerrainOp / EntityDef types, buildTerrain() rasteriser
  physics.ts      circle bodies (boulders), lava hardening
  sand.ts         falling-sand CA over active chunks
  boss.ts         boss patterns, projectiles, hazards (wyrm / jotunn / herald)
  foresight.ts    ForesightJob: time-sliced clone-ahead prediction (Fate)
  timeline.ts     rewind ring buffer of clones
  solution.ts     SolutionPlayer: replays a level's scripted SolutionStep[]
  rng.ts          seeded RNG, hashing, noise, dsin/dcos (deterministic trig)
src/levels/     level data (midgard.ts, niflheim.ts, muspelheim.ts), pad.ts, index.ts
src/render/     pipeline.ts (low-res RTs, lighting, post), scale.ts (fitView), terrainLayer.ts
                (terrain shader), layers.ts (parallax, liquids, particles), spriteBatch.ts, atlas.ts
src/game/       game.ts (scenes, menus, URL params), play.ts (PlayScene: loop, camera, input,
                foresight), view.ts (sim → sprites, effects), input.ts, save.ts, sound.ts
src/ui/         HUD (hud.ts), DOM helpers, style.css
src/art/        procedural pixel art (px.ts toolkit, characters, bosses, materials, backgrounds)
src/audio/      offline-synthesised instruments, sequencer, songs, SFX
tests/          sim.test.ts, boss.test.ts, levels-<realm>.test.ts (level checks + slack report, via
                helpers.ts), levels.test.ts, scale.test.ts, timeline.test.ts
docs/           ART_SPEC.md, AUDIO_SPEC.md, images/ (README screenshots)
```

Data flow per frame (`PlayScene.update` then `render`):
1. While the clock accumulates, the scene runs `sim.step()` at 30 Hz.
2. It records the step on the timeline, so Rewind can return to it.
3. It feeds the step's events to `GameView.handleEvents`, which spawns effects, and to the sound
   map in `src/game/sound.ts`, which plays SFX.
4. It refreshes Foresight within a few milliseconds of budget.
5. `GameView.draw` turns the current `Sim` into sprite batches. The terrain texture syncs only
   the chunks whose version changed.

## Invariants: do not break these

1. **The simulation is deterministic.** Code in `src/sim` uses only IEEE-exact arithmetic
   (`+ - * /`, `Math.sqrt`, integer ops, `Math.floor`/`round`/`abs`/`min`/`max`).
   - Never use `Math.random`, `Math.sin`/`cos`/`pow`/`exp`, `Date`, or anything from the DOM.
     Use `sim.rand()` and `dsin`/`dcos` from `rng.ts` instead.
   - The one exception is `performance.now()` in `ForesightJob.advance`. It decides only how much
     work runs per frame, never what the result is.
   - Foresight's promise ("this Wyrdling dies") is only true while this holds. A test checks
     predicted deaths against actual ones.
2. **State must clone.** `SimData` is plain data cloned with `structuredClone` (no classes,
   functions or Maps).
   - Terrain is shared copy-on-write between clones. Write through `terrain.set()` or
     `terrain.writable(ci)`, never into a chunk array you got from `terrain.chunks`.
   - The static back-wall array is shared and must never be mutated after the build.
3. **Every level is solvable and not trivial.** `tests/levels-<realm>.test.ts` checks three things:
   - the scripted solution reaches the second-star `target` (or `solutionSaves`), collects the
     spindle, and kills the boss;
   - every step is load-bearing: the solution without exactly that step loses one of the step's
     `purpose`s;
   - a null run with no callings stays under the `quota` and never collects the spindle.
4. **The view never shows past the level.** `fitView` (`src/render/scale.ts`) picks an integer
   scale whose view fits inside the level and covers the screen with a centred crop. Camera
   shake is clamped too.
   - `tests/scale.test.ts` checks this for many screens, DPRs and every level.
   - Boss arenas are 640×360 (`padLevel`) so the whole arena fits 16:9 screens.
5. **Rendering is pixel art.** Draw into the low-res render targets with nearest sampling,
   then upscale by an integer factor.
   - The terrain texture stores the material in R and the back wall in G (255 = wall behind
     solid terrain, shown once dug out; 128 = designed cave, open from the start).
   - World→clip mapping goes through the `uView` uniform (`camX, camY, viewW, viewH`).
6. **The HTML UI scales as one layer.** `#ui` is scaled by the `--ui` CSS variable.
   - Inside it, use `var(--uvw)` / `var(--uvh)` instead of `vw` / `vh`. Raw viewport units get
     multiplied by the scale.

## Adding or changing a level

1. Write the level in the realm file (`src/levels/<realm>.ts`) and add it to that realm's
   exported list.
   - Coordinates are world pixels with y pointing down.
   - `terrain` is an ordered list of shape ops (`rect`, `ellipse`, `poly`, `ground`, `ceiling`).
     `mat: 'Air'` carves.
   - `rough` and `grain` add noise to an edge. Noise is sampled per absolute pixel, so the same
     op gives the same edge everywhere.
   - `noBack` makes a solid with no cave wall behind it. `back: true` paints a cave back wall
     without collision. `only` restricts an op to replacing the listed materials.
2. Add `entities`: entrance, exit, plates, levers, gates (linked by `id`), boulders, liquids,
   hazards, decor, lights, and spindle and Seiðr stones where relevant.
3. Write `solution`: a list of `SolutionStep`. Each step fires once its conditions hold: the
   `nth` Wyrdling, past `x` in direction `dir`, after tick `t`, within `minY`/`maxY`, in `state`.
   Tag each step's `purpose` with what dropping it would lose (`quota`, `target`, `spindle`,
   `boss`; `finish` if it is only needed so the run ends). A step that loses nothing goes.
4. Iterate with `npm run level:png <id>`, which draws the solution's trails. Use
   `npm run level:trace <id> <nth>` for one Wyrdling, or `bosstrace.ts` for boss levels, until
   `npm test` passes.
5. Look at it in the browser: open `/?level=<id>&vision&go` to watch the solution, or
   `/?level=<id>&go` to play.

## Dev-only debug hooks

These exist only in dev builds (`import.meta.env.DEV`). Production builds strip them.

- URL parameters: `?level=<id>` opens a level, `&go` skips the intro card, and `&vision` replays
  the solution.
- `window.__norns.scene()` returns the current `PlayScene`. Useful members:
  - `sim`: the live `Sim`. `sim.d` is its state; `sim.assign(id, skill)` grants a calling.
  - `debugHold = true` stops real-time ticking, without the pause dimming.
  - `debugAdvance(n)` runs exactly `n` ticks with the same per-tick work as the game loop.
  - `debugCam = { x, y }` pins the camera; `null` releases it.
  - `solution`: set `new window.__norns.SolutionPlayer(scene.cfg.level.solution)` to script play
    mode.
  - `armed` and `hoverPt` drive the calling and hover (for Foresight previews).
- `window.__norns.manual(true)` stops the real-time loop. `window.__norns.step(dt)` then advances and
  renders exactly one frame of `dt` seconds. `scripts/trailer.mjs` films this way, so the simulation,
  particles and animation stay in true time however slow the browser is.
- Example: a forced boss attack captured at exact ticks.
  ```bash
  node scripts/frames.mjs "http://localhost:5173/?level=n5&go" out 1280 720 322,330 \
    --do="300:const b = s.sim.d.boss; b.act = 'slam'; b.at = 0;"
  ```

Save data is `localStorage['norns.save.v1']`. Delete it, or use Settings → Erase progress, to
start fresh.

## Deployment and licensing

- `.github/workflows/pages.yml` publishes `dist/` (plus `docs/trailer.mp4`) to GitHub Pages on
  every push to `main`.
  - It needs the one-time owner setting Settings → Pages → Source: "GitHub Actions".
  - Without that setting it prints a notice and skips, rather than failing.
- The game is free to play but **proprietary**: `package.json` says `"license": "UNLICENSED"` and
  there is deliberately no LICENSE file. Don't add one.
- Every bundled third-party package must have its license text in
  `public/THIRD_PARTY_NOTICES.txt`. Vite copies that file into every build, and
  `scripts/artifact.mjs` embeds it in the single-file build. Add the notice when you add a runtime
  dependency. Today they are three.js (MIT) and the two Fontsource fonts (OFL-1.1).

## Conventions

- Match the surrounding code: short comments that explain *why*, no dead code, and no new
  dependencies without a reason.
- Simulation changes need a test. Visual changes need a look at real frames, and if you report
  what you saw, name the frames.
- Keep claims honest in docs and commit messages. Say what you verified and how, and say what
  you didn't check.
