# NORNS: Threads of Fate — Design

A 32-bit-era-styled creature-guiding puzzle game (in the lineage of Lemmings) built on Three.js,
playable with mouse/keyboard or touch.

## Fiction

At the roots of Yggdrasil the three Norns weave the fate of all things. The **Wyrdlings** —
small hooded spirits, each trailing a golden thread of fate — have tumbled out of the great
Loom and wander blindly through the realms. You are the Norns. You cannot carry them; you can
only *nudge fate*: grant a Wyrdling a calling (a skill), peer ahead along the threads, and
unspool time when fate goes wrong. Lead enough of them back through each realm's **Root Gate**.

## The twist: the three Norn powers

Classic creature-guiding games are opaque: you commit a skill, watch, fail, restart. NORNS is
built on three design pillars — **immediate feedback**, **legible agency**, **low-stakes
autonomy** — expressed as one power per Norn:

| Norn | Power | What it does |
|---|---|---|
| **Skuld** (what shall be) | **Foresight** | Every Wyrdling's future path for the next few seconds is drawn as a dotted thread. Paths that end in death end in a red skull; paths that reach the gate end in a spark. With a skill armed, hovering a Wyrdling shows the *branched* future in gold and a live "+saved / −doomed" delta before you commit. |
| **Verðandi** (what is becoming) | **Callings** | Assign skills; pause, slow and fast-forward time; plan while paused. |
| **Urðr** (what has been) | **Rewind** | Hold to unspool time (up to 30 s). Mistakes cost seconds, not restarts. Never penalised. |

All three rely on one property: **the simulation is fully deterministic and cheaply cloneable**
(chunked copy-on-write terrain + plain-data state). Foresight is literally the real simulation
run forward on a clone; rewind is a ring buffer of clones. Every level ships with a recorded
solution that the test suite replays to prove the level is beatable — and a null run that must
fail, so no level is trivially solved.

## Callings (skills)

| Skill | Effect |
|---|---|
| Digger | Digs straight down. |
| Weaver | Weaves 12 golden thread planks, a rising bridge. |
| Warden | Stands still and turns others back. |
| Basher | Tunnels horizontally. |
| Miner | Tunnels diagonally downward. |
| Climber | Permanent: climbs vertical walls. |
| Glider | Permanent: opens a leaf-cloak when falling — drifts forward and rides updrafts. Survives any fall. |
| Leaper | One ballistic jump forward (clears gaps; falls can still be fatal). |
| Rune Blast | Plants a rune that detonates 3 s later. The Wyrdling walks on unharmed. The blast carves terrain and flings bodies, boulders and nearby Wyrdlings (physics). |

## Physics

- Pixel terrain (destructible, per-pixel collision) with materials: earth, rock, rune-iron
  (indestructible), sand/snow (granular — collapses and flows when undermined), ice, thread,
  brittle (crumbles under weight), gates.
- Rigid boulders (circle bodies): gravity, rolling, friction, restitution, collisions with
  terrain, each other, pressure plates and Wyrdlings. A fast boulder crushes; a resting one is
  a weight. A boulder rolled into lava hardens into a stepping stone.
- Wyrdlings use real ballistic motion when flung (blasts, boss attacks); falls beyond a
  height are fatal unless gliding.

## Environmental puzzle elements

Pressure plates (momentary) and rune switches (toggle) wired to gates; updraft vents; water and
lava; spikes; crushers and fire jets on timers; brittle floors; sand traps; boulders; the
optional **Golden Spindle** collectible (third star).

## Progression loop

- **World map**: Yggdrasil, with realm branches — Midgard → Niflheim → Muspelheim.
- Each realm: 4 puzzle levels, then a boss. Each level teaches one idea, then combines it.
- **Stars**: ★ quota met, ★★ high target met, ★★★ Golden Spindle collected.
- **Threads** (currency) = saved Wyrdlings + star bonuses → spent at **the Loom** on upgrades
  (longer foresight horizon, longer rewind buffer, cosmetic hoods). Every level is solvable
  with no upgrades — the solution tests run on base stats.

## Bosses

Boss arenas use **Seiðr stones**: one stone glows at a time; a Wyrdling stepping on it fires a
beam into the boss (1 damage) and another stone lights up elsewhere — forcing route changes
while the boss attacks. All boss attacks are **telegraphed** (red markers, shadows, glows) and
are part of the deterministic simulation, so Foresight shows who an incoming attack will hit.
The Root Gate opens when the boss falls.

1. **The Gnawing Wyrm** (Midgard) — venom volleys that dissolve terrain, burrow strikes that
   cleave shafts, tail lashes that fling.
2. **Hrímgrímnir, the Frost Jötunn** (Niflheim) — icicle rain that builds ice walls, frost
   breath that freezes Wyrdlings solid, glacial slams whose shockwave launches.
3. **Surtr's Herald** (Muspelheim) — flame-sword sweeps, rising magma, meteor showers that
   crater terrain and drop boulders.

## Presentation

- Internal low-resolution render (~270 px tall) upscaled with integer scaling; 2D deferred
  lighting (posterised light falloff), emissive layers, parallax backgrounds, rotation/scaling
  effects — the things 32-bit hardware added on top of 16-bit pixel art.
- All pixel art is generated procedurally at startup from hand-tuned palettes and drawing code.
- The OST is composed in code and played by a sample-based synth engine (instrument samples
  are synthesised offline into buffers at startup, then sequenced — the way 32-bit-era sound
  chips worked).
