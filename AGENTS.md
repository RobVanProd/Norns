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
- There are 18 levels (`src/levels`): 15 puzzles and 3 guardian fights. Each ships with a scripted
  solution that the tests replay, and every puzzle has a Golden Spindle.
- A run is recorded as a Weave: the callings and the ticks they were granted on. Foresight, the
  paused verdict, "Watch your best", personal records and share links all rest on the same callings
  at the same ticks giving the same run, bit for bit.

## Commands

| Task | Command |
|---|---|
| Install | `npm ci` (Node `^20.19` or `>=22.12`; CI uses 22) |
| Dev server | `npm run dev` → http://localhost:5173 (binds all interfaces) |
| Typecheck | `npm run typecheck` |
| Tests | `npm test`: 377 tests in 23 files, about 35 s on 4 cores. Sim, bosses and each guardian's fight, every level's solution, steps, slack and null run, the verdict's truth at every scripted calling, Weaves and share links, stalemate proofs, staged Vision, progression, settings and keys, crowd targeting, barks, view fit |
| Reports | `npx vitest run --reporter=verbose` also prints the slack tables, the design report and each guardian's grid summary (the slack and design reports never fail) |
| Production build | `npm run build` → `dist/`; `npm run preview` serves it |
| Single-file build | `node scripts/artifact.mjs <out.html>` (everything inlined) |
| Level preview PNG | `npm run level:png <id> [out.png] [--null] [--ticks N] [--scale 2] [--at T]` |
| Trace one Wyrdling | `npm run level:trace <id> <nth> [from] [to] [every]` |
| Boss fight trace | `npx tsx scripts/bosstrace.ts <id> [maxTicks]` |
| Boss one-calling search | `npx tsx scripts/bossgrid.ts [id...] [--every N] [--first K] [--to T] [--horizon H]` (exits 1 if any single calling meets the quota) |
| Browser smoke test | `npm run smoke <outDir> [baseUrl]` (exits 1 on any page error) |
| Exact-tick screenshots | `node scripts/frames.mjs <url> <outDir> <w> <h> <ticks> [options]` (see [Dev-only debug hooks](#dev-only-debug-hooks)) |
| Screenshots of levels | `node scripts/tour.mjs <baseUrl> <outDir> [waitMs] [w] [h] [ids...]`, or one page: `node scripts/shot.mjs <url> <out.png> [w] [h] [waitMs] [--mobile] [--dpr=N]` |
| Contact sheet | `python3 scripts/sheet.py out.png <cols> <scale> <images...>` |
| Click reliability | `node scripts/clicktest.mjs <baseUrl> [level=m1] [drift=9] [body\|hood] [single\|crowd] [mouse\|touch]` (positional) |
| Trailer | `node scripts/trailer.mjs <devServerUrl> [workDir] [out.mp4]` (needs ffmpeg; about 4 min) |
| Audio render check | `node scripts/audio-check.mjs --url <devServerUrl>` (flags silence, clipping, NaNs) |

The browser scripts use `playwright-core` with Chromium at `/opt/pw-browsers/chromium` and
software GL (SwiftShader). Edit `executablePath` in the script if your Chromium lives elsewhere.
`frames`, `clicktest` and `trailer` drive the game through the dev-only hooks, so they need a dev
server (`npm run dev`, or `npx vite --port <p>`) running first. `smoke`, `tour` and `shot` take any
base URL, a dev server or a served build; `audio-check` starts its own dev server if none answers.

## Before you push

1. `npm run typecheck`, `npm test` and a production build pass. CI runs `npm ci`, the
   typecheck, the tests and `npx vite build` on every PR and on `main`.
2. If you touched the simulation or a level, every scripted solution must still pass. Never
   loosen a test, a `target`, a `solutionSaves` or the slack rule to make it pass. Fix the cause,
   or change the level and its solution together. If a change to `src/sim` can make an old Weave
   play out differently, bump `SIM_VERSION` (invariant 7).
3. If you touched rendering, UI or art, look at real frames. Use `scripts/frames.mjs` (it can
   force a boss attack with `--do=TICK:js`), and run `npm run smoke` for page errors. Unit tests
   do not see pixels.
4. If you touched input, run `scripts/clicktest.mjs`. Clicks on walking Wyrdlings should
   assign 12/12, including with cursor drift, and in `crowd` mode (5-7 overlapping Wyrdlings, the
   intended one chosen by Tab or repeat taps) 12/12 grants should reach the intended one, on `mouse`
   and `touch`.

## Architecture

```
src/sim/        deterministic simulation. No DOM, no imports from outside src/sim.
  sim.ts          Sim: step(), assign()/canAssign(), Wyrdling state machine, gates, hazards, finishNow()
  state.ts        SimData (the plain, cloneable state), Wyrd, Body, Hazard, SimEvent and its typed names
  constants.ts    tick rate, materials, callings (SKILLS, SKILL_INFO), movement and skill constants
  terrain.ts      chunked copy-on-write material grid (32×32 chunks), clone() is O(chunks)
  level.ts        LevelDef / TerrainOp / EntityDef / BossDef / SolutionStep types, RealmId, buildTerrain()
  physics.ts      circle bodies (boulders; a resting one sleeps until terrain near it changes), lava hardening
  sand.ts         falling-sand CA over active chunks
  boss.ts         guardians: stones in a fixed order (nextStone), a fixed attack rotation (PATTERNS) at
                  fixed places (BossDef.aim, nextAttack), projectiles and hazards. Never reads the RNG.
  foresight.ts    ForesightJob: time-sliced clone-ahead prediction (Fate, terrain ghosts, the shadow run of
                  a 15 s projection); VerdictJob: a branch run to its end; compareFates(): the delta
  settle.ts       settled(), LoopDetector: proves "nothing more will happen unless you act" (whole-state
                  loops, and groups of Wyrdlings that repeat apart on their own periods)
  weave.ts        the Weave: SIM_VERSION, levelHash(), WeaveRecorder, Replayer, the compact text encoding
  timeline.ts     Rewind: snapshots of the whole run (every tick for the last 5 s, every 10 ticks back to
                  20 s, every 60 before that; the first is never dropped)
  solution.ts     SolutionPlayer and stepReady(): replay a level's scripted SolutionStep[]
  rng.ts          seeded RNG, hashing, noise, dsin/dcos (deterministic trig)
src/levels/     level data (midgard.ts, niflheim.ts, muspelheim.ts), pad.ts (640×360 boss arenas), index.ts
src/render/     pipeline.ts (low-res RTs, lighting, post), scale.ts (fitView), terrainLayer.ts
                (terrain shader, Clear Sight shading), layers.ts (parallax, liquids, particles),
                spriteBatch.ts, atlas.ts
src/game/
  game.ts         scenes and menus: title (attract mode), story, map, intro and results cards (records,
                  sharing), pause menu, Loom, Settings, Keys; URL parameters, #weave= links, dev hooks
  play.ts         PlayScene: tick() (the per-tick work), camera, input, Foresight, the paused verdict,
                  stalemate notice, Weave recording, lessons, Skuld's Vision and replays
  view.ts         sim → sprites: fate threads and edge pins, terrain ghosts, crowd outline and ×N, boss
                  NEXT and next-attack markers, Clear Sight overlay, popups, fates and small life;
                  setPalette() (fate colours)
  input.ts        mouse / touch / keyboard, and the rebindable keys (defaultKeys, bindKey, readKeys)
  crowd.ts        who a click or tap hits, and cycling through a crowd (pure)
  threads.ts      fate-thread patterns and edge pins (pure geometry)
  vision.ts       staged Skuld's Vision planned from the solution's purpose tags (no DOM)
  share.ts        verifyWeave() (headless replay), Skuld's par, share links, the copied result
  save.ts         progress, unlocks, settings and key bindings, best Weaves, personal records
  stats.ts        local playtest log and its report
  sound.ts        sim events and state cues → SFX and Wyrdling barks
src/ui/         HUD (hud.ts), DOM helpers, style.css
src/art/        procedural pixel art (px.ts toolkit, characters incl. reactions and fates, bosses,
                materials, backgrounds, icons, font)
src/audio/      offline-synthesised instruments, sequencer, songs, SFX; barks.ts limits the voices
tests/          levels-<realm>.test.ts (every level, via helpers.ts; each guardian's fight via
                bossfight.ts), verdict-<realm>.test.ts (the verdict's truth, via verdict.ts), verdict
                (spot checks, queued callings, Foresight's early stop), sim, boss, foresight, settle,
                weave, share, timeline, vision, progression, playlog, access, targeting, barks, scale,
                levels (unique ids), design-report. levels-legacy.ts keeps three pre-rework layouts as
                stalemate fixtures; bossgrid.ts is the one-calling search.
docs/           ART_SPEC.md, AUDIO_SPEC.md, images/ (README screenshots), trailer.mp4
```

Data flow per frame (`PlayScene.update` then `render`):
1. While the clock accumulates (times the speed), the scene runs `tick()` at 30 Hz. One `tick()` is
   all the per-tick work, shared by play, Vision, paused stepping and the dev tools:
   - a scripted solution, a Vision's marks or a replayed Weave grant their callings first;
   - `sim.step()`;
   - the timeline records the step, so Rewind and stepping back can return to it;
   - in play mode the `LoopDetector` observes the step (the stalemate notice);
   - the step's events go to `GameView.handleEvents`, which spawns effects and fates, and to the
     `SoundMapper` in `src/game/sound.ts`, which plays SFX and barks.
2. A granted calling is recorded in the attempt's Weave (`WeaveRecorder`). A restored snapshot (Rewind,
   a step back, Rewind from the results) forgets the callings after its tick, and so do the verdicts.
3. The hovered Wyrdling is picked (`crowd.ts`), then Foresight refreshes within its budget: 4 ms per job
   while running, 12 ms shared by the base fate, the branch and the verdict while paused. While paused
   with a calling armed, a `VerdictJob` weighs the hovered branch to its end.
4. `GameView.draw` turns the current `Sim` into sprite batches. The terrain texture syncs only
   the chunks whose version changed. Then the HUD updates.

## Invariants: do not break these

1. **The simulation is deterministic.** Code in `src/sim` uses only IEEE-exact arithmetic
   (`+ - * /`, `Math.sqrt`, integer ops, `Math.floor`/`round`/`abs`/`min`/`max`).
   - Never use `Math.random`, `Math.sin`/`cos`/`pow`/`exp`, `Date`, or anything from the DOM.
     Use `sim.rand()` and `dsin`/`dcos` from `rng.ts` instead. Guardians don't use the RNG at all.
   - The one exception is `performance.now()` in `ForesightJob.advance` and `VerdictJob.advance`.
     It decides only how much work runs per frame, never what the result is.
   - Foresight's promise ("this Wyrdling dies"), the verdict, replays, records and share links are
     only true while this holds. Tests check predicted deaths and verdicts against actual runs, and
     replayed Weaves against the runs they recorded. Determinism across browser engines is not
     tested (only V8 runs here).
   - The loop proof (`LoopDetector`) relies on knowing everything the step reads. A new tick-driven
     rule needs a look at `tickPeriods`; a new way for Wyrdlings to notice each other (or for the world
     to notice a walker) needs a look at `PASSIVE`, `SEEN` and the zones in settle.ts. settle.test.ts
     scans the sources for tick reads and Wyrdling reads and fails on one it doesn't know.
2. **State must clone.** `SimData` is plain data cloned with `structuredClone` (no classes,
   functions or Maps).
   - Terrain is shared copy-on-write between clones. Write through `terrain.set()` or
     `terrain.writable(ci)`, never into a chunk array you got from `terrain.chunks`.
   - The static back-wall array is shared and must never be mutated after the build.
   - Every terrain write must wake sleeping bodies and sand near it: call `sim.touched(x0, y0, x1, y1)`,
     as the existing writers do (`carveRect` and `carveCircle` do it for you).
3. **Every level is solvable and not trivial.** `tests/levels-<realm>.test.ts` checks every level:
   - the scripted solution fires every step, reaches the second-star `target` (or `solutionSaves`),
     collects the spindle, fells the guardian and finishes by itself;
   - every step is load-bearing: the solution without exactly that step loses one of the step's
     `purpose`s;
   - a null run with no callings stays under the `quota` and never collects the spindle;
   - on puzzles, every scripted click still wins when it lands 10 ticks early or late in Midgard, 6
     elsewhere (`SLACK_NEED` in `tests/helpers.ts`; refused clicks and clicks on a Wyrdling's spawn
     tick don't count).

   Each guardian also gets `tests/bossfight.ts`: at least two `boss` callings, each needed; every
   attack in its `PATTERNS` rotation fires in the scripted fight; the stones light in their fixed
   order, each shown as next first, and the RNG never advances; every scripted calling still wins
   ±10 ticks (Midgard) or ±6 (elsewhere); no single calling on a coarse grid meets the quota; the
   Root Gate is within 150 px of the guardian. `tests/vision.test.ts` checks that the Vision's route
   (the solution without spindle-only steps) still meets the target and fells the guardian.
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
   - Colour is never the only cue for a fate: doomed, saved and neither each have their own thread
     pattern (`threads.ts`), so they read in either palette and in greyscale.
6. **The HTML UI scales as one layer.** `#ui` is scaled by the `--ui` CSS variable.
   - Inside it, use `var(--uvw)` / `var(--uvh)` instead of `vw` / `vh`. Raw viewport units get
     multiplied by the scale.
   - Write new font sizes as `calc(Npx * var(--ts))` so Settings → Text size reaches them. The
     only fixed-px fonts are deliberate: labels inside fixed-size buttons and skill cards (count,
     key, name, ×, the rewind and 15s seconds, the speed badge), which would overflow their box,
     and the boot screen, which shows before the save is read.
   - Reduce motion puts `.calm` on the root element: new CSS animation needs a `.calm` rule that
     stops it, and new shake or flash in the view must respect `GameView.setCalm`.
7. **Weaves never replay into nonsense.** A Weave carries `SIM_VERSION` and its level's
   `levelHash`, and a stale one is set aside rather than replayed: best runs and records are
   ignored, and a share link gets an "Old version" badge.
   - Bump `SIM_VERSION` in `src/sim/weave.ts` whenever a change to `src/sim` can make an old Weave
     play out differently.
   - Changing a level's geometry, counts, skills, entities or boss changes its hash and stales its
     Weaves and records. Its text (`name`, `intro`, `idea`, `hints`), `music`, `ambient`,
     `solution`, `solutionSaves`, decor and lights are outside the hash.
   - Keep level ids. Unlocks are keyed by id and sticky (`SaveData.opened`), so inserting a level
     into a realm never relocks a save; `tests/progression.test.ts` loads saves from the first
     release to keep it that way.

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
   - Give it an `idea` (a few words, shown on the intro card) and `hints` (one-line tips: Begin
     shows the next one, and stopping a rewind the next one not yet seen).
2. Add `entities`: entrance, exit, plates, levers (they latch on first touch), gates (linked by `id`;
   `mode: 'all'` needs every link held, `orient: 'h'` makes a trapdoor), boulders, liquids, vents,
   fire jets, brittle floors, spikes, decor, lights, a spindle (every puzzle), and Seiðr stones on boss
   levels. A guardian's `BossDef` sets its `stones` order and the `aim` of each attack.
3. Write `solution`: a list of `SolutionStep`. Each step fires once its conditions hold: the
   `nth` Wyrdling, past `x` in direction `dir`, after tick `t`, within `minY`/`maxY`, in `state`.
   Tag each step's `purpose` with what dropping it would lose (`quota`, `target`, `spindle`,
   `boss`; `finish` if it is only needed so the run ends). A step that loses nothing goes.
4. Iterate with `npm run level:png <id>`, which draws the solution's trails. Use
   `npm run level:trace <id> <nth>` for one Wyrdling, or `bosstrace.ts` and `bossgrid.ts` for boss
   levels, until `npm test` passes. The slack table (`npx vitest run --reporter=verbose`) shows how
   far each click can move.
5. Look at it in the browser: open `/?level=<id>&solution&go` to watch the whole scripted
   solution (spindle steps too), `/?level=<id>&vision&go` to watch Skuld's Vision (the quota
   route only), or `/?level=<id>&go` to play. Hold `C` for Clear Sight to check the wiring.

## Level design rules

These are the rules players of the genre judge levels by. Break one only on purpose, and say why in
a comment next to the level.

- **Puzzle first, execution second.** The hard part is seeing the plan, not clicking on the right
  pixel. Walkers move 1 px a tick, so a click's window in ticks is its window in px. Every scripted
  click must still win when it lands 10 ticks early or late in Midgard, 6 elsewhere (refused clicks
  and clicks on the tick a Wyrdling appears don't count). *(Enforced: `SLACK_NEED` in
  `tests/helpers.ts` for puzzles, `tests/bossfight.ts` for guardians.)* Fix a tight click with geometry.
- **Every scripted step is load-bearing**, tagged with the `purpose` it serves. *(Enforced.)*
- **The null run fails and never collects the spindle.** Doing nothing must not win. *(Enforced.)*
- **Every puzzle has a Golden Spindle** its solution collects, ideally by a second use of the level's
  calling or one learned earlier. Tag steps that serve only the spindle `['spindle']`: Skuld's Vision
  leaves them out, so no hint plays the third star for the player. *(The collecting, the null run
  and the Vision route are enforced; that a puzzle has a spindle at all is not.)*
- **Guardians are planned, not watched.** At least two callings fell each one, its stones and
  attacks are fixed and shown in advance, and no single calling wins. *(Enforced in
  `tests/bossfight.ts`; the single-calling check samples a coarse grid, `scripts/bossgrid.ts` a
  finer one.)*
- **Nothing that matters is invisible while paused.** A pause shows every threat, gate state and
  timer that decides the plan. Clear Sight must show it too.
- **Every hazard first appears where it is harmless**, and Foresight shows it before it can kill.
- **No level timers.** Pressure comes from Wyrdlings walking, not from a clock.
- **One idea per level, then combine.** Put it in the level's `idea` field. Midgard teaches one
  calling per level (m1, m2, m3, m3b, m3c, m3d), then Roots and Wings (m4) combines two. Combination
  levels come after each part has had its own.
- **No long single-Weaver stretches**, and a breather level after each boss.
- **From mid-Niflheim on, triage:** more threats than the callings can fix one at a time.
- **Sacrifices are allowed when Foresight labels them** ("1 lost · 3 saved later"), and greedy
  Foresight traps only when the shown cost makes the trade-off visible.
- **Every calling reappears in at least 3 later levels across at least 2 realms.**
- **The verdict tells the truth about doing nothing more.** While paused, it says what the hovered
  calling comes to with no further callings. In a single-decision teaching level that is an answer
  key, which is fine there. Later levels need multi-step plans, where it truthfully says "quota N
  not met" (or "target N not met") without solving the level.

`tests/design-report.test.ts` prints the advisory side (scripted and spare callings, calling reuse,
where each hazard first appears) with the other reports; run `npx vitest run --reporter=verbose` to
see them. CI fails only on the enforced rules.

## Dev-only debug hooks

These exist only in dev builds (`import.meta.env.DEV`). Production builds strip them.

- URL parameters: `?level=<id>` opens a level and `&go` skips the intro card.
  - `&solution` plays the level's whole scripted solution, spindle steps too, as a play attempt
    (recorded into its Weave). A scripted attempt is taught no lessons, so the first-doom pause never
    stops it.
  - `&vision` plays Skuld's Vision: the quota-and-target route, without any spindle-only step.
    `&tier=1`–`4` picks one stage of it (default 4, the whole route). `?vision=<id>` works as
    `?level=<id>&vision`.
  - In production builds only `?level`, `&go` and `#weave=<encoded Weave>` (a share link) work.
    `?level` ignores unlocks. `?vision=<id>` still opens that level there, but in play mode, since
    only the Vision itself is dev-only.
- `window.__norns` has `scene()`, `SolutionPlayer`, `manual(on)`, `step(dt)` and `palette(id)`.
  - `manual(true)` stops the real-time loop; `step(dt)` then advances and renders exactly one frame
    of `dt` seconds. `scripts/trailer.mjs` and `frames.mjs` film this way, so the simulation,
    particles and animation stay in true time however slow the browser is.
  - `palette('cvd' | 'classic')` switches the fate colours, as Settings → Fate colours does.
- `scene()` returns the current `PlayScene`. Useful members:
  - `sim`: the live `Sim`. `sim.d` is its state; `sim.assign(id, skill)` grants a calling.
  - `debugHold = true` stops real-time ticking, without the pause dimming.
  - `debugAdvance(n)` runs exactly `n` ticks with the same per-tick work as the game loop.
  - `debugCam = { x, y }` pins the camera; `null` releases it.
  - `debugFullForesight = true` finishes Foresight jobs every frame, so frames don't depend on
    machine speed. `debugForesightCost = []` collects each frame's base and branch job ms.
  - `debugVerdictLog = {}` collects, per verdict, the frames, ms and ticks it took and how it ended.
  - `debugSolution()` does what `&solution` does; `solution` can also be set directly, e.g.
    `new window.__norns.SolutionPlayer(scene.cfg.level.solution)`.
  - `armed` and `hoverPt` drive the calling and hover (for Foresight previews and, while paused,
    the verdict).
  - `weave` is the attempt so far as a Weave (play mode). `cutThreads()` ends the level now,
    `reopen()` goes back in from the results, and `replayDesync` says whether a replayed Weave
    went out of step.
- `scripts/frames.mjs <url> <outDir> <w> <h> <tick,tick,...> [options]` fast-forwards to `settle`
  ticks before each listed tick, then plays the rest one rendered frame per tick (1/30 s), so popups,
  particles and flashes look as a player sees them. Options:
  - `--cam=x,y` pins the camera (world px, top-left); `--dpr=N` sets the device pixel ratio;
    `--prefix=name` the file prefix (default `f`); `--settle=N` the true-time frames before each shot
    (default 45);
  - `--freeze` stops the simulation at each shot tick and lets only the visuals settle (e.g. to show
    a branch preview on a hovered Wyrdling);
  - `--do=TICK:js` runs `js` at `TICK` with `s` = the scene and `N` = `window.__norns` (repeatable);
    `--eval=js --evalAt=tick` is the older single form.
- Example: a forced boss attack captured at exact ticks.
  ```bash
  node scripts/frames.mjs "http://localhost:5173/?level=n5&go" out 1280 720 322,330 \
    --do="300:const b = s.sim.d.boss; b.act = 'slam'; b.at = 0;"
  ```

Save data is `localStorage['norns.save.v1']`, the playtest log `localStorage['norns.stats.v1']`.
Delete them, or use Settings → Erase progress (it erases both), to start fresh. A fresh save starts
with the one-card story and goes straight into m1; lessons are recorded in `SaveData.seen`, so a
fresh profile is the way to see them again.

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
  you didn't check. Nobody has listened to the audio and no human has playtested; don't write as
  if they had.
