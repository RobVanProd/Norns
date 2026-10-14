# NORNS: Threads of Fate

A 32-bit-era-styled creature-guiding puzzle game in the Lemmings lineage, built with Three.js and
TypeScript. It runs in any modern browser with a mouse, a keyboard or a touchscreen.

You play the three Norns of Norse myth. You can't carry the **Wyrdlings** home, but you can grant
them callings (skills), **see their fate ahead of time**, and **rewind time** when fate goes wrong.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # simulation + every level's scripted solution
npm run build      # static site in dist/
```

## What's in it

- **15 levels in 3 realms**: Midgard, Niflheim and Muspelheim. Each realm has 4 puzzle levels and
  a boss: the Gnawing Wyrm, Hrímgrímnir the Frost Jötunn, and Surtr's Herald.
- **9 callings**: Digger, Weaver (builds a bridge), Warden (blocker), Basher, Miner, Climber,
  Glider, Leaper, and Rune Blast.
- **The twist, the three Norn powers** (the design pillars are immediate feedback, legible agency
  and low-stakes autonomy):
  - **Skuld's Foresight**: dotted threads show every Wyrdling's next few seconds. A red skull means
    death, a spark means saved. Arm a calling and hover (or press and hold on touch) a Wyrdling to
    see the branched future and a "+saved / −lost" delta before you commit.
  - **Verðandi's callings**: assign skills, pause, and fast-forward at 2× or 4×.
  - **Urðr's Rewind**: hold to unspool up to 20 s of time. Upgrades raise this to 60 s. It is
    never penalised.
- **Physics**:
  - Destructible pixel terrain and falling sand/snow.
  - Rigid boulders that roll, bounce, bowl Wyrdlings over, press plates, and cool into stepping
    stones in lava.
  - Ballistic flinging from blasts and boss attacks.
- **Environmental puzzles**: pressure plates and levers wired to gates and bridges, snow hoppers,
  updrafts, crushers and gas flames that rune blasts can wreck, lava and water.
- **Boss fights**: every attack is telegraphed (markers, bands, a shaking fist). Damage comes from
  glowing **Seiðr stones**. All of it is deterministic simulation, so Foresight predicts who an
  attack will hit.
- **Progression**:
  - Stars per level: quota, high target, and a Golden Spindle.
  - Threads (currency) are spent at **the Loom** on longer foresight, a longer rewind, and hood
    dyes.
  - Skuld's Vision replays a verified solution if you're stuck.
- **Presentation**:
  - Everything is generated in code at startup: hue-shifted pixel art, parallax skies, terrain
    shaded per pixel in a shader, 2D lighting with banded falloff, and particles.
  - A sample-based synth plays an original soundtrack (title, map, three realm themes, boss with
    3 intensity layers, finale, stingers) and 63 sound effects.

## Controls

| | Mouse / keyboard | Touch |
|---|---|---|
| Choose a calling | click the bar or press `1`–`9` | tap the bar |
| Grant it | click a Wyrdling | tap a Wyrdling (press and hold to preview its fate) |
| Pan | drag, arrow keys or WASD, mouse wheel | drag |
| Zoom | `+` / `-`, Ctrl + wheel | pinch |
| Pause / speed | `Space` / `F` | buttons |
| Rewind | hold `R` | hold ◀◀ |
| Foresight on/off | `V` | eye button |

## How it's built

```
src/sim/      deterministic simulation (no DOM): terrain, wyrdlings, physics, sand, bosses,
              foresight (time-sliced clone-ahead), timeline (rewind), scripted solutions
src/levels/   level data: terrain shape ops, entities, scripted solution per level
src/render/   Three.js low-res pipeline, terrain shader, instanced sprites, lights, particles
src/game/     play scene, view (sim → sprites + juice), input, menus, save/progression, sound map
src/art/      procedural pixel-art generators (characters, entities, icons, font, materials,
              backgrounds, bosses, logo)
src/audio/    offline-synthesised instrument samples, sequencer, songs, SFX
```

The simulation only uses IEEE-exact arithmetic (no `Math.random`, `sin`, `pow`). The terrain is
chunked copy-on-write, so cloning it costs a few hundred pointer copies. That is what makes
Foresight (a real simulation run ahead on a clone) and Rewind (a ring buffer of clones) cheap.

### Verification

- `npm test` replays every level's scripted solution and checks that it reaches the 2nd-star
  target, collects the spindle, and defeats the boss.
- The same suite runs a **null run** (no callings) on every level, which must fail the quota, so
  no level is trivially won.
- Other tests cover each skill, clone determinism, copy-on-write isolation, boss behaviour, and
  that Foresight's predicted deaths match what actually happens.
- `npm run level:png <id>` renders a level and its solution's trails to a PNG.
- `npm run level:trace <id> <n>` traces one Wyrdling's states.
- `npm run smoke <outDir> <url>` drives the title, map and play screens, plus a phone-sized
  layout, in headless Chromium and fails on any page error.

### Known limits

- Nobody has listened to the music or sound effects yet. They are checked only by offline
  rendering: nothing is silent, nothing clips, no NaNs.
- Boss balance is tuned so a scripted, non-reactive solution wins. Foresight and Rewind should make
  them comfortable for players, but no human has playtested this yet.
- Portrait phones get a "rotate" prompt. Landscape is the intended layout.
