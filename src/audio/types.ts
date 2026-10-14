// Public audio types (contract: docs/AUDIO_SPEC.md).

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
  | 'star' | 'purchase' | 'level_start';

export interface SfxOpts {
  pan?: number /* -1..1 */;
  volume?: number /* 0..1, default 1 */;
  pitch?: number /* playback-rate multiplier, default 1 */;
}

export interface AudioEngine {
  /** Must be called from a user gesture (click/touch/key). Idempotent. */
  unlock(): Promise<void>;
  readonly unlocked: boolean;
  playMusic(id: SongId, opts?: { fadeIn?: number }): void; // crossfades from the current song; same id = no-op
  stopMusic(fadeOut?: number): void;
  stinger(id: StingerId): void; // short jingle; ducks music while it plays
  sfx(id: SfxId, opts?: SfxOpts): void; // fire-and-forget, safe to spam (internal voice limiting/rate limiting per id)
  setIntensity(level: 0 | 1 | 2): void; // boss phases: adds/removes layers live, on bar boundaries
  setRewinding(on: boolean): void; // tape-reverse feel: music pitch bends down + lowpass + wobble while on
  setPaused(on: boolean): void; // music muffled (lowpass) + quieter while paused
  setSpeed(mult: 1 | 2 | 4): void; // optional subtle effect for fast-forward (e.g. slight highpass); must not change tempo
  setVolumes(v: { master?: number; music?: number; sfx?: number }): void;
  setMuted(m: boolean): void;
}

export const SONG_IDS: readonly SongId[] = ['title', 'map', 'midgard', 'niflheim', 'muspelheim', 'boss', 'finale'];
export const STINGER_IDS: readonly StingerId[] = ['victory', 'defeat', 'unlock', 'boss_intro'];
export const SFX_IDS: readonly SfxId[] = [
  'ui_click', 'ui_hover', 'ui_back', 'ui_deny',
  'select_skill', 'assign', 'assign_fail',
  'spawn', 'gate_open', 'saved', 'quota_met',
  'death_unravel', 'death_burn', 'death_drown', 'splat_warn',
  'dig', 'bash', 'mine', 'plank', 'plank_warn', 'shrug',
  'climb', 'glide_open', 'leap', 'land',
  'rune_plant', 'rune_tick', 'blast',
  'boulder_roll', 'boulder_impact', 'stone_harden',
  'plate_on', 'plate_off', 'gate_move', 'sand_pour', 'brittle_crack', 'brittle_break',
  'spindle', 'vent',
  'boss_roar', 'boss_hit', 'boss_telegraph', 'boss_defeat', 'seidr_beam',
  'venom_spit', 'venom_hit', 'burrow', 'tail_lash',
  'icicle_fall', 'ice_shatter', 'freeze', 'slam',
  'fire_whoosh', 'magma', 'meteor',
  'rewind_start', 'rewind_end', 'foresight', 'pause', 'unpause',
  'star', 'purchase', 'level_start',
];
