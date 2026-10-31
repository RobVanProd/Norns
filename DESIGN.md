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
| **Skuld** (what shall be) | **Foresight** | Every Wyrdling's future path for the next few seconds is drawn as a thread patterned by its fate: dashes to a skull for a death, diamonds to a spark for a rescue, dots for neither (colour is a second cue, red / green or blue / orange). Deaths off screen are pinned to the screen edge. With a skill armed, hovering a Wyrdling shows the *branched* future before you commit: the terrain the calling would leave as a ghost, the Wyrdling's own end in words, and what it changes for everyone ("saves 10", "1 lost · 8 freed later"). Holding Q follows that branch 15 s ahead. |
| **Verðandi** (what is becoming) | **Callings** | Assign skills; pause, step tick by tick, slow and fast-forward time; plan while paused. Paused with a skill armed, the verdict says what the hovered calling comes to if nothing more is done. |
| **Urðr** (what has been) | **Rewind** | Hold to unspool time, back as far as the start of the level (or set it to toggle: press to start, press again to stop). Mistakes cost seconds, not restarts. Never penalised. |

All three rely on one property: **the simulation is fully deterministic and cheaply cloneable**
(chunked copy-on-write terrain + plain-data state). Foresight is literally the real simulation
run forward on a clone; rewind keeps snapshots of the whole run (dense for the last seconds,
sparser further back); a replay (the Weave) is only the callings and the ticks they were granted
on. Every level ships with a recorded solution that the test suite replays to prove the level is
beatable — and a null run that must fail, so no level is trivially solved.

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

Pressure plates (held only while weighed down) and levers (latch on first touch) wired to gates
and trapdoors, singly or all at once; updraft vents; water and lava; spikes; fire jets on timers;
brittle floors; snow that slides and piles up; boulders; and in every puzzle level a **Golden
Spindle** (third star). The simulation also has crushers on timers, which no level uses yet.

## Progression loop

- **World map**: Yggdrasil, with realm branches — Midgard → Niflheim → Muspelheim.
- Midgard: six levels that each teach one calling, a seventh that combines two, then a boss.
  Niflheim and Muspelheim: 4 puzzle levels each, then a boss. Each level teaches one idea (shown
  on its intro card), then later ones combine them.
- **Help** is staged rather than all-or-nothing: lessons appear the first time something happens,
  and **Skuld's Vision** shows the scripted route in four steps (where and when the first calling
  happens, which calling, the first half, all of it), never playing a step that serves only the
  spindle.
- **Stars**: ★ quota met, ★★ high target met, ★★★ Golden Spindle collected (boss levels have no
  spindle and two stars).
- **Unlocks** never wait on a single level or on extra stars: clearing a level at quota opens the
  next two in its realm; a boss needs three of its realm's puzzles cleared; the next realm opens
  when the boss falls *or* every puzzle in the realm is cleared. Unlocks are keyed by level id and
  stick once earned (`src/game/save.ts`), so adding a level to a realm never relocks a save; a
  level added before one already cleared opens too. Saves from the first release, which opened
  levels in one global order and kept no list, load with everything that order had open.
- **Threads** (currency) = saved Wyrdlings beyond your best + star bonuses → spent at **the Loom**
  on upgrades (longer foresight horizon, cosmetic hoods). Every level is solvable with no upgrades — the
  solution tests run on base stats. Rewind already reaches the first tick, so the old longer-rewind
  upgrade (Urðr's Memory) is retired and refunded.

## Bosses

Boss fights are planned, not watched. Boss arenas use **Seiðr stones**: one stone glows at a
time; a Wyrdling stepping on it fires a beam into the boss (1 damage) and, after a pause, the next
stone lights — forcing route changes while the boss attacks. The stones light in a **fixed order**
per level, and a NEXT marker shows which comes after the glowing one. Each boss uses its attacks
in a **fixed rotation** that shows every attack in its first round, and each attack strikes a fixed
place; the next one is named over the ground it will reach a few seconds before its own
**telegraph** (red markers, shadows, glows). Nothing in a fight is random and nothing aims at the
live crowd, so a plan that works keeps working when a calling lands a tick early or late. All of
it is part of the deterministic simulation, so Foresight shows who an incoming attack will hit.
Every boss needs at least two callings to fell (a grid of single-calling attempts never wins),
and the Root Gate stands beside it and opens when it falls.

1. **The Gnawing Wyrm** (Midgard) — burrow strikes that break the ground open (its first breaks the
   root crust over its shaft), venom that pocks the ground, tail lashes that fling.
2. **Hrímgrímnir, the Frost Jötunn** (Niflheim) — icicle rain that leaves small ice spikes (never
   walls), frost breath that freezes Wyrdlings solid, a fist that crushes every Wyrdling on the
   ground or walls where it lands (the terrain stays whole) and a shockwave that launches the
   rest; when he falls, one last quake shakes a held line loose.
3. **Surtr's Herald** (Muspelheim) — meteor showers that crater terrain, flame-sword sweeps,
   rising magma; a vent of the Herald's heat carries gliders while it lives.

## Presentation

- Internal low-resolution render (~270 px tall) upscaled with integer scaling; 2D deferred
  lighting (posterised light falloff), emissive layers, parallax backgrounds, rotation/scaling
  effects — the things 32-bit hardware added on top of 16-bit pixel art.
- All pixel art is generated procedurally at startup from hand-tuned palettes and drawing code.
- The OST is composed in code and played by a sample-based synth engine (instrument samples
  are synthesised offline into buffers at startup, then sequenced — the way 32-bit-era sound
  chips worked).
