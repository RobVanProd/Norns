# Art spec (procedural pixel art)

All art is generated at startup by TypeScript code in `src/art/`, drawn with the shared toolkit
`src/art/px.ts` (Px buffers, hue-shifted ramps, noise, ordered dithering, outlines). No image
files are shipped. Read `DESIGN.md` for the fiction.

## Target look: 32-bit-era 2D

Think late-90s 2D on 32-bit hardware (Castlevania: SotN, Rayman, Saturn/PS1/GBA-era sprite
work), not 8-bit:

- Rich hue-shifted ramps (shadows drift to blue/purple, highlights to warm yellow). Use
  `ramp()` from px.ts; 4–8 shades per material/character part.
- Light source: top-left. Every form gets highlight on top-left, shadow on bottom-right.
- Selective outlining: outlines are a dark, saturated version of the adjacent fill (never pure
  `#000`), lighter where light hits.
- Manual anti-aliasing on curves with intermediate shades; no jaggies on silhouettes.
- Dithering only for large gradients (sky, glows), using Bayer 4×4 (`ditherPick`).
- Readability first: characters must pop against every realm's terrain (dark outline + bright
  hood). Indestructible materials must look obviously different from diggable ones.
- Animations: anticipation + follow-through; squash & stretch on landings; secondary motion
  (hood tip, cape, golden thread trailing from the back).

All sprites face **right**; the renderer mirrors them. Every animation is an `Anim`
(`frames: HTMLCanvasElement[]`, anchor `ax, ay` = the frame pixel placed at the entity position;
all frames of one Anim share size and anchor). Determinism: use seeded RNG (`mulberry32`,
`hash2`) only, so art is identical every run.

## The Wyrdling

A small hooded spirit, ~8 px wide × 11–12 px tall inside a **16×16** cell, anchor **(8,15)**
(feet on the bottom row, centred). Pointed teal-cyan hood (bright, `#3fd0c9`-ish ramp) with the
tip flopping backwards, pale round face with two dark dot eyes (a 1-px highlight in each), deep
indigo cloak/body, tiny dark boots, and a short **golden thread** (`#f2c14e`-ish) trailing from
its back that sways with motion. Distinct from classic lemmings (no green hair, no blue robe).

| key | frames | notes |
|---|---|---|
| `wyrd.walk` | 8 | full walk cycle, bob 1px, hood tip & thread sway |
| `wyrd.fall` | 4 | arms up, flailing, hood blown upward |
| `wyrd.tumble` | 4 | flung through the air: curled ball rotating 90° per frame |
| `wyrd.land` | 2 | squash on landing |
| `wyrd.warden` | 4 | Warden (blocker): legs apart, arms out holding a glowing rune-staff horizontally; subtle loop |
| `wyrd.weave` | 16 | Weaver: one plank cycle — reach back, pull glowing thread, kneel and lay a plank in front (plank placed at frame 8). The plank itself is terrain, don't draw it after frame 8 |
| `wyrd.shrug` | 8 | out of planks: shrug, then ready to walk |
| `wyrd.bash` | 16 | Basher: one cycle = two punches with glowing fists (or hammer); strikes land at frames 3 and 11 |
| `wyrd.mine` | 16 | Miner: one pickaxe swing aimed diagonally down-forward; impact at frame 10 |
| `wyrd.dig` | 8 | Digger: digging straight down with both paws/shovel, dirt flicked up |
| `wyrd.climb` | 8 | climbing a wall on the right side of the sprite (the wall is at x≈12) |
| `wyrd.hoist` | 8 | pulling itself over the top of the wall, ends standing on top |
| `wyrd.glide_open` | 4 | unfurls a large leaf-cloak above its head |
| `wyrd.glide` | 4 | drifting under the leaf-cloak, gentle sway (cloak may exceed the body; cell stays 16×16, keep cloak within) |
| `wyrd.plant` | 8 | Rune Blast: kneels, presses a glowing rune into the ground in front, stands |
| `wyrd.leap` | 6 | 0–1 crouch, 2 launch (stretched), 3–4 airborne tucked, 5 land squash |
| `wyrd.exit` | 8 | steps into the gate and dissolves into golden sparkles (last frame nearly empty) |
| `wyrd.unravel` | 12 | death: body comes apart into loose glowing threads that drift up and fade (gentle, not gory) |
| `wyrd.burn` | 10 | death by fire/lava: flashes orange-white, crumbles into embers |
| `wyrd.drown` | 10 | death in water: sinks, bubbles rise |
| `wyrd.frozen` | 1 | Wyrdling encased in a translucent ice block (~12×14 inside the cell) |
| `mark.climber` | 1 | 7×7, anchor (3,6): tiny claw/glove badge shown above the head of a Climber |
| `mark.glider` | 1 | 7×7, anchor (3,6): tiny leaf badge shown above the head of a Glider |

## Entities (all face right / are symmetric)

| key | size | anchor | frames | notes |
|---|---|---|---|---|
| `gate.entrance.open` | 32×24 | (16,0) | 6 | Spindle Gate: hangs from ceiling; a carved wooden/stone hatch with a spindle motif that opens downward; Wyrdlings drop from (16,22) |
| `gate.entrance.idle` | 32×24 | (16,0) | 4 | open, golden light swirling inside |
| `gate.exit` | 32×32 | (16,31) | 6 | Root Gate: archway of gnarled Yggdrasil roots on the ground with a glowing swirling portal; loop |
| `gate.exit.locked` | 32×32 | (16,31) | 1 | same arch, portal dark, sealed by rune-iron bars with a red rune |
| `rune.charge` | 8×8 | (4,7) | 6 | planted blast rune, pulsing brighter (gets drawn tinted red near detonation) |
| `plate.up` / `plate.down` | 16×5 | (8,4) | 1 each | pressure plate, stone with a rune; down = pressed, rune lit |
| `switch.off` / `switch.on` | 8×16 | (4,15) | 1 each | rune switch post with a lever/crystal; on = glowing |
| `seidr.off` | 20×10 | (10,9) | 1 | Seiðr stone (boss weak-point plate), dormant |
| `seidr.on` | 20×10 | (10,9) | 4 | glowing, rune pulsing, motes rising |
| `vent` | 16×6 | (8,5) | 4 | updraft vent grate, spinning fan blades |
| `spikes` | 8×6 | (0,5) | 1 | tileable horizontally, iron spikes |
| `crusher.head` | 24×16 | (12,15) | 1 | stone/iron piston head, toothed bottom |
| `crusher.shaft` | 8×8 | (4,0) | 1 | chain/shaft segment, tiled upward |
| `firejet.base` | 12×6 | (6,5) | 1 | nozzle |
| `firejet.flame` | 12×32 | (6,31) | 4 | flame column (drawn additively; use bright opaque colors on transparent) |
| `spindle` | 12×14 | (6,13) | 8 | Golden Spindle collectible, spinning, glinting |
| `boulder` | 24×24 | (12,12) | 1 | round rock radius ~11, with a carved rune/moss so rotation is visible |
| `torch` | 8×16 | (4,15) | 4 | wall torch / sconce with flame |
| `brazier` | 12×12 | (6,11) | 4 | standing brazier with fire |
| `crystal` | 10×16 | (5,15) | 1 | glowing ice crystal (Niflheim decor) |
| `mushroom` | 8×8 | (4,7) | 2 | two variants as two frames (Midgard decor) |
| `banner` | 10×20 | (5,0) | 4 | hanging cloth banner with a knot rune, waving |
| `runestone` | 12×18 | (6,17) | 1 | carved standing stone |
| `skull` | 7×7 | (3,3) | 1 | Foresight: predicted death marker (red/bone) |
| `spark` | 7×7 | (3,3) | 1 | Foresight: predicted save marker (gold) |
| `cursor.ring` | 16×16 | (8,8) | 4 | hover ring around a targeted Wyrdling, rotating dashes |
| `target` | 15×15 | (7,7) | 4 | boss attack telegraph: red rune circle, pulsing |
| `warn` | 5×9 | (2,8) | 2 | red "!" blink |

## UI icons — `buildIcons(): Record<string, HTMLCanvasElement>`

16×16 each, designed to be shown at 3–4× with `image-rendering: pixelated`, on dark UI panels.
Keys: skills `digger weaver warden basher miner climber glider leaper blast`; controls
`pause play fast faster rewind restart home eye eye_off music sound mute fullscreen gear`;
misc `star star_empty thread lock wyrd gate skull check arrow_left arrow_right loom hood`.
Skill icons should be instantly distinguishable by silhouette and colour family
(earth-moving skills warm, movement skills cool, Warden gold, Blast red).

## Bitmap font — `buildFont(): BitmapFont`

A crisp 5×7 pixel font (glyph cell 6×8 incl. spacing) covering `A–Z a–z 0–9` and
`+-/!?:.,'()%★→×`. White glyphs on transparent; the renderer tints and drop-shadows.

## Material atlas — `buildMaterialAtlas(realm): HTMLCanvasElement` (1024×128)

Terrain is a per-pixel material grid. Material ids: `1 EARTH, 2 ROCK, 3 IRON (indestructible),
4 SAND (granular: sand in Midgard, snow in Niflheim, ash in Muspelheim), 5 ICE, 6 THREAD
(Weaver planks — golden woven), 7 BRITTLE (cracked, crumbles), 8 GATE (indestructible, moves —
iron/rune bars), 9 ROOT (gnarled roots)`. Each realm reskins them (Midgard: loam, mossy
granite; Niflheim: frozen earth, blue-grey stone with frost; Muspelheim: scorched earth,
basalt with glowing cracks).

Column `m` (x from `m*64` to `m*64+63`) describes material `m` (column 0 unused):

| rows | content |
|---|---|
| 0–63 | **body tile**, opaque, seamlessly tileable in both axes |
| 64–71 | **top cap**: row r = r px below an exposed top surface. Alpha 0 = use body. (grass/moss on earth, frost on stone, snow cap…) |
| 72–79 | **bottom cap**: row r = r px above an exposed underside. Alpha 0 = use body |
| 80–95 | **surface decoration** drawn in the AIR above top surfaces; row 95 is the air pixel directly on the surface, row 80 is 16 px above (grass blades, flowers, frost spikes, embers); tileable horizontally; alpha 0 = nothing |
| 96–111 | **hanging decoration** drawn in the AIR below ceilings; row 96 directly under the ceiling (roots, moss drips, icicles, stalactites); alpha 0 = nothing |
| 112 | params: x+0 outline color, x+1 edge highlight (top-left facing edges), x+2 edge shadow (bottom-right facing edges), x+3 and x+4 debris particle colors |

The renderer applies: body or cap color → edge highlight/shadow on exposed edges → 1-px
selective outline where the pixel touches air → depth darkening a few px into the interior →
lighting. Make IRON read as carved rune-iron blocks with rivets and bevels; GATE as vertical
iron bars with rune bands; BRITTLE with dark cracks; THREAD as bright golden weave.

## Backgrounds — `buildBackground(realm): BackgroundSet`

Sky gradient stops plus 3–4 horizontally tileable parallax layers (width 512, height 160–300,
transparent above their silhouettes), far → near, bottom-anchored; plus a 64×64 tileable
`backWall` (dark, low-contrast, desaturated, recessed cave wall shown wherever terrain was dug
out or a cave interior exists), an ambient light color and an atmosphere style.
Midgard: dawn sky, distant mountains, misty pine forests, giant Yggdrasil roots arching overhead.
Niflheim: night aurora, glaciers, frozen waterfalls, ice spires. Muspelheim: red-black sky,
volcanoes, lava falls, obsidian spires, ash.

## Bosses — `buildBossSprites(): SpriteLib`

| key | size | anchor | frames |
|---|---|---|---|
| `wyrm.head.idle` | 48×40 | (24,20) | 2 (breathing) |
| `wyrm.head.open` | 48×40 | (24,20) | 2 (jaws open, venom glow) |
| `wyrm.head.hurt` | 48×40 | (24,20) | 1 |
| `wyrm.body` | 28×28 | (14,14) | 1 (segment; drawn rotated along the spine) |
| `wyrm.tail` | 20×20 | (10,10) | 1 |
| `wyrm.venom` | 10×10 | (5,5) | 4 |
| `jotunn.body.idle` | 128×112 | (64,111) | 2 |
| `jotunn.body.inhale` | 128×112 | (64,111) | 1 |
| `jotunn.body.slam` | 128×112 | (64,111) | 1 (one arm raised high) |
| `jotunn.body.hurt` | 128×112 | (64,111) | 1 |
| `jotunn.fist` | 36×30 | (18,29) | 1 |
| `jotunn.icicle` | 8×20 | (4,19) | 1 |
| `herald.body.idle` | 112×128 | (56,127) | 2 |
| `herald.body.raise` | 112×128 | (56,127) | 1 |
| `herald.body.hurt` | 112×128 | (56,127) | 1 |
| `herald.sword` | 96×14 | (6,7) | 1 (hilt at left; rotated by the renderer around the anchor) |
| `herald.fireball` | 14×14 | (7,7) | 4 |

Bosses face right (the renderer mirrors them; they usually sit on the right side facing left).
They should feel huge and mythic relative to 12-px Wyrdlings; hurt frames flash pale.

## Title / map art

- `buildLogo(): HTMLCanvasElement` — "NORNS" wordmark (~220×56) in carved gold-and-stone
  letters with a thread weaving through them, plus "THREADS OF FATE" subtitle beneath.
- `buildYggdrasil(): { canvas: HTMLCanvasElement; realms: Record<RealmId, {x:number;y:number}> }`
  — 480×300 world-tree scene for the title/map screens; three realm "fruits/clearings" on its
  branches (Midgard low, Niflheim mid, Muspelheim high) whose centre coordinates are returned so
  the map can place level nodes around them.
