# Audio spec (OST + SFX, all synthesised in code)

Everything lives in `src/audio/`. No audio files are shipped. Read `DESIGN.md` for the fiction
(Norse: the Norns, Yggdrasil, three realms, bosses).

## Approach: a 32-bit-era sample engine

32-bit-era consoles played short instrument *samples* through a mixer with reverb. We do the
same: at startup, synthesise instrument samples offline in plain JS DSP into `AudioBuffer`s
(Karplus–Strong plucks for lyre/harp, additive/FM for bells and flutes, filtered detuned saws for
bowed tagelharpa/strings and choir "aah" via formant filters, synthesised drum hits: frame drum,
taiko-like toms, shaker, anvil), then a lookahead sequencer plays them with
`AudioBufferSourceNode` + `playbackRate` for pitch, per-note gain envelopes, stereo pan, and
a shared convolution reverb (impulse response also synthesised) plus a delay send.
Sample synthesis must be fast (< ~400 ms total on a laptop) and may be done lazily per song.

## Public API — `src/audio/index.ts`

```ts
export type SongId = 'title' | 'map' | 'midgard' | 'niflheim' | 'muspelheim' | 'boss' | 'finale';
export type StingerId = 'victory' | 'defeat' | 'unlock' | 'boss_intro';
export type SfxId =
  | 'ui_click' | 'ui_hover' | 'ui_back' | 'ui_deny'
  | 'select_skill' | 'assign' | 'assign_fail'
  | 'spawn' | 'gate_open' | 'saved' | 'quota_met'
  | 'death_unravel' | 'death_burn' | 'death_drown' | 'splat_warn'
  | 'dig' | 'bash' | 'mine' | 'plank' | 'plank_warn' | 'shrug'
  | 'climb' | 'glide_open' | 'leap' | 'land'
  | 'rune_plant' | 'rune_tick' | 'blast'
  | 'boulder_roll' | 'boulder_impact' | 'stone_harden'
  | 'plate_on' | 'plate_off' | 'gate_move' | 'sand_pour' | 'brittle_crack' | 'brittle_break'
  | 'spindle' | 'vent'
  | 'boss_roar' | 'boss_hit' | 'boss_telegraph' | 'boss_defeat' | 'seidr_beam'
  | 'venom_spit' | 'venom_hit' | 'burrow' | 'tail_lash'
  | 'icicle_fall' | 'ice_shatter' | 'freeze' | 'slam'
  | 'fire_whoosh' | 'magma' | 'meteor'
  | 'rewind_start' | 'rewind_end' | 'foresight' | 'pause' | 'unpause'
  | 'star' | 'purchase' | 'level_start'
  // Wyrdling barks: formant gibberish on the voice bus (own volume, rate-limited, see barks.ts)
  | 'bark_hup' | 'bark_mm' | 'bark_oh' | 'bark_whee' | 'bark_yay';

export interface SfxOpts { pan?: number /* -1..1 */; volume?: number /* 0..1, default 1 */; pitch?: number /* playback-rate multiplier, default 1 */ }

export interface AudioEngine {
  /** Must be called from a user gesture (click/touch/key). Idempotent. */
  unlock(): Promise<void>;
  readonly unlocked: boolean;
  playMusic(id: SongId, opts?: { fadeIn?: number }): void; // crossfades from the current song; same id = no-op
  stopMusic(fadeOut?: number): void;
  stinger(id: StingerId): void;                            // short jingle; ducks music while it plays
  sfx(id: SfxId, opts?: SfxOpts): void;                    // fire-and-forget, safe to spam (internal voice limiting/rate limiting per id; barks also share a crowd limit)
  setIntensity(level: 0 | 1 | 2): void;                    // boss phases: adds/removes layers live, on bar boundaries
  setRewinding(on: boolean): void;                         // tape-reverse feel: music pitch bends down + lowpass + wobble while on
  setPaused(on: boolean): void;                            // music muffled (lowpass) + quieter while paused
  setSpeed(mult: 1 | 2 | 4): void;                         // optional subtle effect for fast-forward (e.g. slight highpass); must not change tempo
  setVolumes(v: { master?: number; music?: number; sfx?: number; voice?: number }): void;
  setMuted(m: boolean): void;
}
export const audio: AudioEngine;
export function barkPitch(id: number): number;            // a Wyrdling's own voice: playback rate 0.88..1.12, fixed by its id
```

The game plays ½× speed as `setSpeed(1)`: the fast-forward colour has nothing for slow motion.

Calls before `unlock()` must be safe no-ops (but remember the requested song and start it on
unlock). Everything must survive the tab being backgrounded (AudioContext suspended/resumed).

## OST

Compose real music, not noodling: memorable motifs, chord progressions, A/B sections, loops of
roughly 60–120 s that loop seamlessly. Norse-folk-meets-32-bit-JRPG: modal (Dorian, Aeolian,
Phrygian), drones, frame drums, lyre/harp, flutes, bowed strings, choir pads, bells.
A shared **"Thread" leitmotif** (a short rising-falling figure) should recur in every song,
re-harmonised per realm.

| id | mood | suggestions |
|---|---|---|
| `title` | wonder, ancient, inviting | slow harp arpeggios, choir pad, flute states the leitmotif; ~70 bpm |
| `map` | calm, contemplative | lighter variation of title; lyre + soft pad |
| `midgard` | warm, bouncy folk, curious | D Dorian ~112 bpm, lyre, flute melody, frame drum + shaker groove |
| `niflheim` | cold, crystalline, sparse | E Aeolian ~84 bpm, bells/celesta, airy pads, slow bowed bass, light ticking percussion |
| `muspelheim` | driving, hot, industrious | E Phrygian ~126 bpm, low bowed ostinato, anvil hits, toms, brassy saw lead |
| `boss` | urgent, heroic, menacing | ~140 bpm, taiko toms, staccato strings ostinato, choir stabs; **3 intensity layers** (0: base groove; 1: + lead melody; 2: + choir/brass and double-time drums) |
| `finale` | triumphant, emotional | the leitmotif in full glory, major-mode lift |

Stingers (2–5 s): `victory` (bright fanfare on the leitmotif), `defeat` (gentle descending,
not punishing — low stakes!), `unlock` (sparkling rise), `boss_intro` (ominous horn + drum hit).

## SFX

Short, punchy, readable, each with a distinct timbre and pitch range so simultaneous sounds stay
legible. Feedback should feel good (Immediate Feedback is a design pillar): `assign` is a
satisfying soft "pop + shimmer"; `saved` a bright chime (caller may pass rising `pitch` for
consecutive saves); `blast` a meaty boom with low thump; `death_*` soft, sad but not harsh;
`dig/bash/mine` crunchy and short (they repeat every ~0.25–0.5 s, so keep them subtle);
`boss_telegraph` a clear warning tone. Rate-limit spammy ids internally (e.g. `dig` at most every
60 ms). Mix: music sits under SFX; master limiter (DynamicsCompressor) prevents clipping.

## Wyrdling voices

Five barks, formant gibberish from a buzzing source through moving formant filters (`sfx.ts`):
`bark_hup` as a Wyrdling drops in, `bark_mm` (mm-hm) when it is granted a calling, `bark_oh`
(uh-oh) as a fatal fall begins, `bark_whee` as a glide opens, `bark_yay` at the Root Gate. The
vowels only suggest words; nothing is spoken. The game passes `pitch: barkPitch(id)`, so each
Wyrdling keeps one voice. Barks go to their own voice bus (the Voices slider in Settings) and share
a crowd limit (`barks.ts`, `BARK_LIMITS`): a short hush after every bark, at most 3 in any second,
and a cooldown per kind. Barks over the limit are dropped, not queued. Every bark has something to
see as well (a speech bubble, or the calling's popup for `bark_mm`), so no information is carried
by a voice alone.

## Verification expectations

Provide `scripts/audio-check.mjs` (Playwright, Chromium at `/opt/pw-browsers/chromium`) or an
equivalent dev page that renders each song (first ~20 s) and every SFX through an
`OfflineAudioContext` and reports: duration, peak, RMS, NaN/Infinity count, and that each is
non-silent and not clipping (peak ≤ 1.0). TypeScript must pass `npx tsc --noEmit`.
