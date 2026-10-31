<p align="center">
  <img src="docs/images/logo.png" alt="NORNS: Threads of Fate" width="560">
</p>

<p align="center">
  <b>A pixel-art creature-guiding puzzle game in the Lemmings lineage, where you can see fate coming and wind it back.</b><br>
  Three.js + TypeScript · plays in the browser · mouse, keyboard or touch
</p>

<p align="center">
  <a href="https://github.com/RobVanProd/Norns/actions/workflows/ci.yml"><img src="https://github.com/RobVanProd/Norns/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
</p>

<p align="center">
  <a href="https://robvanprod.github.io/Norns/"><b>▶ Play free in your browser</b></a> &nbsp;·&nbsp;
  <a href="docs/trailer.mp4"><b>Watch the trailer</b></a> &nbsp;·&nbsp; free to play, all rights reserved
</p>

<p align="center">
  <img src="docs/images/bridge.gif" alt="On The Weaver's Bridge, two Weavers lay rising golden bridges, one across a gorge and one up onto a floating stone where the Golden Spindle is collected, while the line of Wyrdlings follows" width="854">
</p>

You play the three Norns of Norse myth. The **Wyrdlings**, small hooded spirits, wander blind
toward their doom. You can't carry them, but you can grant them callings (skills), **see each
one's fate before it happens**, and **rewind time** when fate goes wrong. Lead enough of them
home through the Root Gate to clear a level.

## Trailer

<p align="center">
  <a href="docs/trailer.mp4"><img src="docs/images/trailer-poster.png" alt="Play the NORNS trailer" width="854"></a><br>
  <sub>Captured from the game itself, with its own soundtrack (MP4). Click the image to watch.</sub>
</p>

## Play it

**Online:** [robvanprod.github.io/Norns](https://robvanprod.github.io/Norns/). It's free, with nothing to
install and nothing to buy. It is made for desktop and phone browsers (so far only Chromium has been
tested, see [Known limits](#for-developers-and-ai-agents)), and the site is rebuilt from `main` on
every push.

**On your own machine:** you need [Node.js](https://nodejs.org) 20.19+ or 22.12+ (CI uses 22).

```bash
npm install
npm run dev          # open http://localhost:5173
```

`npm run dev` also prints a network address. Open it on a phone on the same Wi-Fi to play
with touch. Landscape is the intended layout.

Other ways to run it:

| Goal | Command | Result |
|---|---|---|
| Static website | `npm run build` | `dist/`: host it anywhere, paths are relative |
| One file you can send or open offline | `node scripts/artifact.mjs norns.html` | a single self-contained `norns.html` |
| Jump straight into a level | open `http://localhost:5173/?level=m2&go` | level ids are `m1`, `m2`, `m3`, `m3b`, `m3c`, `m3d`, `m4`, `m5`, `n1`–`n5` and `u1`–`u5` |
| Watch a verified solution | open `http://localhost:5173/?level=m2&solution&go` | plays the level's scripted solution (dev server only) |

Progress (stars, Threads, upgrades, settings, your records and best runs) is saved in the
browser's `localStorage`. A separate playtest log (attempts, rewinds, Vision use and the like, per
level) is kept there too. It never leaves the browser unless you copy it out with Settings → Copy
playtest report.

## How to play

Wyrdlings drop from the entrance and walk until something stops them. A cliff, a lava pool or
a falling icicle can end one. Each level gives you a limited set of callings: choose one from
the bar, then click or tap a Wyrdling to grant it. Save the quota to clear the level, save more
for a second star, and find the Golden Spindle hidden in every puzzle level for a third.

Each level's card names the one idea it is about, and **Survey first** lets you look around
before the first Wyrdling drops. Midgard teaches one calling per level before it combines them.
There are no tutorial screens. Instead a short lesson appears the first time something happens:
the first time Foresight shows a Wyrdling about to die while you could still grant it a calling,
the game pauses and points at it. Settings → Tutorial hints turns the lessons off.

When nothing more can change unless you act (everyone left is pacing back and forth, say), a
notice says so, with **Rewind** and **Cut the Threads**, which ends the level there. The pause
menu can always end a level too.

### The twist: three Norn powers

<p align="center">
  <img src="docs/images/foresight.png" alt="Foresight preview on The Weaver's Bridge, paused: a Weaver is armed over a Wyrdling at the gorge edge; a golden ghost shows the bridge it would weave, the words above it read 'saves 10 (15s)' and 'reaches the gate', and the verdict at the top reads 'With this Weaver, if you do nothing more: saves 12 · quota 9 met · target 12 met · no spindle'" width="854">
</p>

- **Skuld's Foresight.** Threads show every Wyrdling's next few seconds, patterned by fate: dashes
  to a skull for a death, diamonds to a spark for a rescue, dots for neither. A death off screen or
  under the HUD is pinned to the nearest edge, and the HUD counts how many are doomed. Arm a calling
  and hover a Wyrdling (on touch, press and hold) to see the branched future before you commit:
  - what the calling would leave, drawn as a ghost: golden planks, or the outline of a tunnel,
    shaft or crater;
  - where this Wyrdling ends up, in words: "reaches the gate", "drowns at x 231", "turned back by
    a wall";
  - what the calling changes for everyone over the stretch both futures cover: "saves 10 (15s)",
    "1 more lost (4s)", "no change in 4s", or "1 lost · 8 freed later" when a loss buys a rescue.

  Hold `Q` (on touch, the 15s eye button) to follow that one branch 15 seconds ahead. Above, the
  game is paused with a Weaver armed over a Wyrdling at the gorge edge: the golden ghost shows the
  bridge it would weave, the words say this Wyrdling reaches the gate and the calling saves 10
  within the next 15 s, and the verdict at the top weighs the whole level.
- **Verðandi's callings.** Grant skills, pause, step tick by tick, and play at 2×, 4× or ½×. While
  paused with a calling armed, the **verdict** plays the rest of the level out in the background
  and says what it comes to if you grant that calling and nothing more: "With this Weaver, if you
  do nothing more: saves 12 · quota 9 met · target 12 met · no spindle". On levels that need
  several callings it truthfully says "not met" until the plan is complete.
- **Urðr's Rewind.** Hold to unspool time, as far back as the start of the level. It speeds up the
  longer you hold. Rewinding is never penalised, so experimenting is free, and the results card has
  a Rewind button too. If holding is awkward, set Settings → Rewind to Toggle: one press starts it
  and the next stops it.

Hold `C` for **Clear Sight**, a plain view of what matters: flat light and no scenery, terrain
shaded by kind (diggable, rune-iron, brittle), deadly water, lava, spikes and flames tinted, dashed
wiring from each plate and lever to whatever it drives, fire-jet timers, and how many Wyrdlings are
still to come. Settings → Clear Sight keeps it on.

Every boss attack is telegraphed with a marker or a warning band. The simulation is
deterministic, so Foresight also predicts exactly who an attack will hit.

### Callings

A level's bar shows its callings in this order. Keys `1`–`9` follow the bar: `1` is always its
leftmost calling.

| Calling | What it does |
|---|---|
| Digger | Digs straight down through soft ground. |
| Weaver | Weaves 12 golden planks: a rising bridge. |
| Warden | Stands firm and turns others back. |
| Basher | Tunnels straight ahead. |
| Miner | Tunnels diagonally downward. |
| Climber | Permanent: scales vertical walls (not smooth rune-iron). |
| Glider | Permanent: glides safely from any height and rides updrafts. |
| Leaper | One big jump forward over a gap. |
| Rune Blast | Plants a rune that bursts 3 s later, carving rock and flinging things. The planter walks on. |

### Controls

The keys below are the defaults.

| Action | Mouse / keyboard | Touch |
|---|---|---|
| Choose a calling | click the bar, or press `1`–`9` (left to right along the bar) | tap the bar |
| Grant it | press on a Wyrdling (it applies the moment you click) | tap a Wyrdling; press and hold to preview its fate first |
| Choose among overlapping Wyrdlings (the outlined one gets it; ×N says how many) | `Tab` / `Shift`+`Tab` while pointing at them | tap the crowd, tap again for the next one, then hold a finger on it to grant |
| Put the calling away | `Esc` or right-click | tap the × on the armed calling |
| Look 15 s ahead on the previewed branch | hold `Q` | hold the 15s eye button with a second finger |
| Clear Sight | hold `C` | Settings → Clear Sight |
| Pan | drag empty space, arrow keys or WASD, mouse wheel | drag |
| Zoom | `+` / `-`, or Ctrl + wheel | pinch |
| Pause | `Space` or `P` | pause button |
| Step one tick while paused | `,` back / `.` forward (with Shift: one second) | ◀ / ▶ beside the pause button (shown while paused) |
| Speed 1× / 2× / 4× / ½× | `F` | speed button |
| Rewind | hold `R` (or Backspace); in Toggle mode press once to start, again to stop | hold ◀◀; in Toggle mode tap to start, tap to stop |
| Foresight on/off | `V` | eye button |
| Restart | restart button | restart button |
| Menu | `Esc` (when no calling is armed) | home button |

### Accessibility and assists

- **Settings → Keys** rebinds the calling slots, pause, rewind, speed, Foresight and the tick
  steps. A key already in use moves over, and the action it leaves without a key takes your old
  one. Esc, Shift and Tab keep their meaning; the camera keys, `Q`, `C` (Clear Sight) and zoom give
  way to anything you bind to them.
- **Settings → Access**: Reduce motion (no screen shake or flashes, a steady tint instead of a
  guardian's hurt flicker, a still backdrop, calmer menus; it starts on if your system asks for
  reduced motion), text size 100, 125 or 150 %, and touch reach (how far from a Wyrdling a finger
  may land and still pick it).
- **Settings → Assists**: Fate colours (red / green or blue / orange; the thread patterns differ
  either way), and Foresight, the verdict and Clear Sight on or off.
- No level has a timer. ½× speed, tick stepping and the Rewind toggle are there for anyone who
  would rather plan slowly than act fast.
- Music, sound effects and the Wyrdlings' voices have separate volumes, and every voice comes with
  something to see (a speech bubble, a popup), so nothing is told by sound alone.
- The HUD buttons have accessible labels that name their key and current state.

## Three realms, eighteen levels, three bosses

Midgard is the tutorial realm: its first six levels each teach one calling, the seventh combines
two, and the Wyrm asks for two at once. Each puzzle's card states its idea, as below.

| Midgard | Niflheim | Muspelheim |
|---|---|---|
| 1. First Threads<br><sub>Dig down through soft earth</sub> | 1. Frozen Steps<br><sub>A Leaper jumps up and forward</sub> | 1. Ember Road<br><sub>A Rune Blast flings a boulder</sub> |
| 2. The Weaver's Bridge<br><sub>Weave a bridge across a gap</sub> | 2. Glacier Depths<br><sub>A Miner tunnels down a slope</sub> | 2. The Cracked Floor<br><sub>Weight breaks a cracked floor</sub> |
| 3. Hold the Line<br><sub>A Warden turns the crowd around</sub> | 3. Avalanche Pass<br><sub>A Warden on a plate holds it down</sub> | 3. The Forge<br><sub>Flames that burn in rhythm</sub> |
| 4. Through the Stone<br><sub>A Basher tunnels straight ahead</sub> | 4. Rime Gate<br><sub>Two plates held at once</sub> | 4. Surtr's Gate<br><sub>Clear the road, then ride the heat</sub> |
| 5. Climb, Little Thread<br><sub>A Climber scales walls</sub> | | |
| 6. Fall Like a Leaf<br><sub>A Glider falls softly and rides updrafts</sub> | | |
| 7. Roots and Wings<br><sub>One Wyrdling can be both Climber and Glider</sub> | | |
| **Boss: The Gnawing Wyrm** | **Boss: Hrímgrímnir, the Frost Jötunn** | **Boss: Surtr's Herald** |

Puzzles are built from physical pieces:

- destructible pixel terrain, and snow that falls, slides and piles up;
- rolling boulders that bowl Wyrdlings over, crack thin floors, and cool into stepping stones in lava;
- plates and levers wired to gates and trapdoors (the Rime Gate wants two plates held at once);
- updrafts that carry gliders, and gas flames that burn in turn;
- water, lava and spikes.

| Niflheim: a snow hopper pours powder snow into the chasm | Muspelheim: a boulder has broken through the cracked floor |
|---|---|
| ![Avalanche Pass in Niflheim: a snow hopper releases powder snow into a chasm while Wyrdlings walk the ledge beside it](docs/images/niflheim.png) | ![The Cracked Floor in Muspelheim: a boulder has broken through the cracked floor and falls down the shaft toward the lava pool, while Wyrdlings climb a Weaver's bridge to the spindle's floating stone](docs/images/muspelheim.png) |

Bosses are hurt only when a Wyrdling steps onto the glowing **Seiðr stone**. The stones light in a
fixed order, and a NEXT marker shows which one comes after the glowing stone. Each guardian
attacks in a fixed rotation and strikes fixed places, and the next attack's name is marked along
the ground it will reach a few seconds before its telegraph begins. A fight is planned, not
watched: no single calling fells a guardian. The Root Gate stands near it and opens when it
falls.

| The Gnawing Wyrm spits venom | Hrímgrímnir's fist reaches down through the ice | Surtr's Herald rains meteors |
|---|---|---|
| ![The Gnawing Wyrm spits venom at the floor, where it will land ringed in red, while a Weaver's bridge crosses the hole by the Root Gate and NEXT marks the stone on the Wyrm's perch](docs/images/wyrm.png) | ![Hrímgrímnir's ice arm reaches down from the ceiling, the ground it will strike ringed in red on the floor by the Root Gate](docs/images/jotunn.png) | ![Meteors fall on a ledge, their targets ringed in red, while a Wyrdling by the Root Gate is granted the Warden calling and NEXT marks the stone beside Surtr's Herald](docs/images/herald.png) |

## Progression

- **Stars**: one for meeting the quota, one for the higher target, one for the Golden Spindle.
  Every puzzle level has a spindle; the three guardian levels have two stars each.
- **Unlocks**: clearing a level (meeting its quota) opens the next two levels in its realm. A
  realm's guardian wakes once three of its puzzle levels are cleared. The next realm opens when
  the guardian falls, or when every puzzle level in the realm is cleared. The second and third
  stars never lock anything.
- **Threads**: earned per new star (5 each) and for beating your best save count. Spend them at
  **the Loom**:
  - longer Foresight (4 → 10 s);
  - five hood dyes for your Wyrdlings.

  Every level can be won without any of them.
- **Skuld's Vision** is a hint in four stages, offered after a failed attempt and in the pause
  menu: 1 marks where and when the first calling happens, 2 names it, 3 plays the first half of
  the route, 4 plays all of it. Each stage before the last offers Show more, and a level's Vision
  reopens at the furthest stage you watched. It never plays a calling that only serves the Golden
  Spindle.
- **Records**: once you clear a level, its card shows your records (most saved, fewest callings,
  fastest finish) beside **Skuld's par**, which is what the scripted solution does. The results
  card adds this run and, once you have a few, small histograms of your past clears. Only a run
  that checks out counts: each finished run is replayed from its recording, and it must end
  exactly where yours did. **Watch your best** on the level card replays your best run.
- **Sharing**: the results card offers **Copy result** (level, counts and stars, nothing that gives
  the solution away) and, for a run that checked out, **Copy replay link**. The link (`#weave=…`)
  opens the game, replays the run first, then offers to watch it, with a warning that it shows a
  whole solution. You can watch a shared run on a level you haven't opened yet. A link made on
  another version of the game or of the level is marked "Old version" and isn't replayed.

| The world map | Phone, landscape |
|---|---|
| ![World map: Midgard's eight levels with their stars, Niflheim open with its guardian not yet awake, Muspelheim still sealed](docs/images/map.png) | ![Roots and Wings on a phone in landscape: a Wyrdling drops from the entrance, a Glider drifts under its leaf, and the touch-only 15s look-ahead button sits beside Rewind](docs/images/phone.png) |

## Everything is generated in code

There are no image or audio files in the game itself. At startup the game builds:

- **Art**: hue-shifted pixel art, parallax skies, terrain shaded per pixel in a shader, banded 2D
  lighting and particles.
- **Audio**: a sample-based synth plays an original soundtrack (title, map, three realm themes,
  a boss theme with 3 intensity layers, finale, and stingers), 63 sound effects, and five
  Wyrdling voices in formant gibberish: a "hup" as one drops in, "mm-hm" for a calling, "uh-oh",
  "whee" and "yay". Each Wyrdling speaks at its own pitch.

The Wyrdlings have a little life of their own. They fidget while they wait, cower when Foresight
sees their end coming, cheer at the Root Gate, and meet comic, bloodless fates: a puff of soot with
two blinking eyes, a hood left afloat, a Wyrdling squashed flat that pops back up as a loose thread.

The view always uses whole-pixel scaling and never shows past a level's edges, at any screen
size.

## Free to play, all rights reserved

NORNS is free to play, with no ads and nothing to buy.

The source code is public so you can see how it's made, but **no license is granted**. Copying,
modifying, redistributing or reusing its code, art, music or levels needs written permission
from the author. GitHub's Terms of Service let people view and fork public repositories on
GitHub; nothing beyond that is granted.

© 2026 RobVanProd. All rights reserved.

Third-party components keep their own licenses:

- [three.js](https://threejs.org/) (MIT);
- the [Pixelify Sans](https://fontsource.org/fonts/pixelify-sans) and
  [Silkscreen](https://fontsource.org/fonts/silkscreen) fonts (SIL Open Font License 1.1).

Their notices are in [public/THIRD_PARTY_NOTICES.txt](public/THIRD_PARTY_NOTICES.txt) and ship
with every build.

## For developers and AI agents

**[AGENTS.md](AGENTS.md)** is the working guide. It covers commands, architecture, the
invariants you must not break, how to add a level, and the dev-only debug hooks. Other docs:

- [DESIGN.md](DESIGN.md): game design.
- [docs/ART_SPEC.md](docs/ART_SPEC.md): pixel-art rules.
- [docs/AUDIO_SPEC.md](docs/AUDIO_SPEC.md): the sound engine and score.

```bash
npm test             # simulation tests + every level's scripted solution
npm run typecheck    # TypeScript, no emit
npm run build        # typecheck + production build to dist/
```

```
src/sim/      deterministic simulation (no DOM): terrain, Wyrdlings, physics, sand, bosses,
              foresight and the paused verdict, rewind timeline, replays (the Weave), stalemate proofs
src/levels/   level data: terrain shape ops, entities, a scripted solution per level
src/render/   Three.js low-res pipeline, terrain shader, instanced sprites, lights, particles
src/game/     play scene, view (sim → sprites + juice), input and key bindings, crowd targeting,
              menus, save/progression/records, share links, staged Vision, playtest log, sound map
src/art/      procedural pixel-art generators
src/audio/    offline-synthesised instruments, sequencer, songs, SFX and Wyrdling voices
tests/        vitest suites
scripts/      level previews, traces, boss grids, browser checks, frame capture
```

The simulation uses only IEEE-exact arithmetic (no `Math.random`, `sin` or `pow`). Its terrain
is chunked and copy-on-write, so cloning a whole game state is cheap. That is what makes
Foresight (a real simulation run ahead on a clone), Rewind (snapshots of the whole run) and
replays (a run is just its callings and the ticks they were granted on) possible.

**How it's verified**

- `npm test` runs 377 tests in 23 files, in CI on every pull request and every push to `main`.
  Every level ships with a scripted solution, and for every level the tests check that:
  - the solution reaches the second-star target, collects the spindle, and fells the guardian;
  - each scripted calling is needed: without it, something it was for is lost;
  - each scripted click still wins when it lands 10 ticks early or late in Midgard, 6 elsewhere;
  - playing with no callings fails the quota and never collects the spindle.
- Each guardian needs at least two scripted callings, shows its whole attack rotation, and lights
  its stones in their fixed order without touching the random number generator. A grid of
  single-calling attempts never meets its quota (a coarse grid in the tests, a finer one in
  `scripts/bossgrid.ts`).
- The paused verdict is checked against the real run for every scripted calling, granted on its
  tick and on each of the 10 ticks either side. Foresight's predicted boss kills are checked
  against what the simulation then does.
- Recorded runs replay to the identical state, also after the trip through a share link, and
  tampered links or claims are refused without touching the save. The stalemate proof is checked
  on real stalemates and never fires during a scripted solution.
- Two browser checks run by hand, outside CI. A headless smoke test walks through the title, story
  card, first level, menu, map and a phone layout, and fails on any page error. A click harness
  checks that mouse clicks on walking Wyrdlings land 12 times out of 12, and that in a crowd of 5
  to 7 the intended one gets the calling 12 times out of 12, by mouse and by emulated touch.
- Most screenshots on this page were captured with `scripts/frames.mjs`, which steps the
  simulation to exact ticks. The map and the phone layout came from one-off capture scripts that
  aren't in the repo: the map needs a seeded save and the phone shot needs touch emulation (the
  15s button shows only on touch screens), and `frames.mjs` does neither.

**Known limits**

- Nobody has listened to the music, sound effects or Wyrdling voices yet. They are checked only by
  offline rendering: nothing is silent, nothing clips, no NaNs.
- No human playtest yet. Puzzles, bosses, lessons and wording are tuned against scripted solutions
  and headless checks, and some thresholds (such as how long a finger must stay on a crowd to
  grant) are guesses for a playtest to tune. Settings → Copy playtest report is there to collect it.
- Only Chromium has been tested: headless, with software GL and emulated touch. Real phones and
  touch screens, Safari/iOS, Firefox and low-end GPUs are untested. The colour-blind palette was
  checked on simulated colour-blind views of real frames, not by colour-blind players, and no
  motion-sensitive player has tried Reduce motion.
- Share links and records depend on the simulation replaying bit for bit. That has been checked
  only in Chromium and Node, which share a JavaScript engine; whether other browsers replay a
  link in step is unverified. A link that goes out of step is marked "Out of step" and isn't
  played.
- Portrait phones get a "rotate" prompt.
