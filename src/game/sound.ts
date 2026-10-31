// Maps simulation events to sound effects (with stereo pan from screen position), and gives the
// Wyrdlings their voices: a bark for a few moments worth a word. Some of those moments have no
// simulation event (a glide opening, a fatal fall beginning, a climber's scrabble), so CueReader reads
// them off the state each step leaves. GameView reads the same cues, so every sound has something to see.
import { audio, barkPitch, type SfxId } from '../audio';
import { FALL_DEATH } from '../sim/constants';
import type { Sim } from '../sim/sim';
import type { SimEvent, SimEventType, Wyrd } from '../sim/state';

const FIRE = new Set(['lava', 'fire', 'sweep', 'magma', 'meteor', 'burn']);

const DIRECT: Partial<Record<SimEventType, SfxId>> = {
  spawn: 'spawn', gate_open: 'gate_open', quota_met: 'quota_met', assign: 'assign', dig: 'dig', bash: 'bash', mine: 'mine',
  shrug: 'shrug', land: 'land', leap: 'leap', rune_plant: 'rune_plant', rune_tick: 'rune_tick', blast: 'blast',
  boulder_roll: 'boulder_roll', boulder_impact: 'boulder_impact', stone_harden: 'stone_harden', plate_on: 'plate_on',
  plate_off: 'plate_off', gate_move: 'gate_move', sand: 'sand_pour', brittle_crack: 'brittle_crack',
  brittle_break: 'brittle_break', spindle: 'spindle', lever: 'plate_on', boss_telegraph: 'boss_telegraph',
  boss_hit: 'boss_hit', boss_defeat: 'boss_defeat', seidr_beam: 'seidr_beam', seidr_on: 'foresight', venom_spit: 'venom_spit',
  venom_hit: 'venom_hit', burrow: 'burrow', hazard_burrow: 'burrow', hazard_lash: 'tail_lash', icicle_warn: 'icicle_fall',
  ice_shatter: 'ice_shatter', freeze: 'freeze', slam: 'slam', hazard_sweep: 'fire_whoosh', magma_warn: 'magma',
  hazard_magma: 'magma', meteor: 'meteor', inhale: 'boss_roar', clink: 'ui_deny', crusher_break: 'boulder_impact', bowled: 'land',
};

const QUIET: Partial<Record<SimEventType, number>> = { dig: 0.5, bash: 0.55, mine: 0.55, sand: 0.4, boulder_roll: 0.5, clink: 0.35, rune_tick: 0.6, spawn: 0.6 };

/** Events a Wyrdling answers with a bark (its id is the event's id). */
const EVENT_BARK: Partial<Record<string, SfxId>> = { spawn: 'bark_hup', assign: 'bark_mm', saved: 'bark_yay' };

/** A moment with no simulation event: a fatal fall begins, a glide opens, a climber scrabbles up. */
export interface Cue {
  kind: 'teeter' | 'glide' | 'climb';
  id: number;
  x: number;
  y: number;
}

const CUE_SOUNDS: Record<Cue['kind'], [SfxId, number, SfxId | null]> = {
  teeter: ['splat_warn', 0.8, 'bark_oh'],
  glide: ['glide_open', 1, 'bark_whee'],
  climb: ['climb', 0.8, null],
};

/** Will this fall kill? Nothing to land on, liquid first, or ground further down than a Wyrdling survives.
 *  (A presentation guess from the terrain below: it ignores what may move into the way.) */
export function fatalFall(sim: Sim, w: Wyrd): boolean {
  if (w.glider) return false;
  for (let y = w.y + 1; y < sim.L.h; y++) {
    if (sim.liquidAt(w.x, y)) return true;
    if (sim.solid(w.x, y)) return y - 1 - w.fallY > FALL_DEATH;
  }
  return true;
}

/** Reads cues once per simulation step. A second read at the same tick (a calling granted between
 *  steps) finds nothing new; any other tick, rewound or not, is read afresh. */
export class CueReader {
  private tick = -1;

  read(sim: Sim): Cue[] {
    if (sim.d.tick === this.tick) return [];
    this.tick = sim.d.tick;
    const out: Cue[] = [];
    for (const w of sim.d.wyrds) {
      // a state's first tick shows as t === 1 after the step that entered it
      const kind = w.st === 'fall' && w.t === 1 && fatalFall(sim, w) ? 'teeter'
        : w.st === 'glide_open' && w.t === 1 ? 'glide'
        : w.st === 'climb' && w.t % 10 === 1 ? 'climb' : null;
      if (kind) out.push({ kind, id: w.id, x: w.x, y: w.y });
    }
    return out;
  }
}

export class SoundMapper {
  private saveStreak = 0;
  private lastSaveTick = -999;
  private cues = new CueReader();

  play(events: SimEvent[], sim: Sim, camX: number, viewW: number): void {
    const tick = sim.d.tick;
    const place = (x: number) => {
      const pan = Math.max(-1, Math.min(1, (x - (camX + viewW / 2)) / (viewW / 2)));
      const off = Math.abs(x - (camX + viewW / 2)) - viewW / 2;
      return { pan, atten: off > 0 ? Math.max(0.2, 1 - off / viewW) : 1 };
    };
    // barks are for the Wyrdlings on screen (or nearly): a voice from far off is only chatter
    const bark = (id: SfxId, who: number | undefined, pan: number, atten: number) => {
      if (atten >= 0.75) audio.sfx(id, { pan, volume: atten, pitch: barkPitch(who ?? 0) });
    };
    for (const e of events) {
      const { pan, atten } = place(e.x);
      const b = EVENT_BARK[e.type];
      if (b) bark(b, e.id, pan, atten);
      if (e.type === 'saved') {
        this.saveStreak = tick - this.lastSaveTick < 90 ? this.saveStreak + 1 : 0;
        this.lastSaveTick = tick;
        audio.sfx('saved', { pan, pitch: 1 + Math.min(0.6, this.saveStreak * 0.06), volume: atten });
        continue;
      }
      if (e.type === 'death') {
        const id: SfxId = e.s === 'water' ? 'death_drown' : FIRE.has(e.s ?? '') ? 'death_burn' : 'death_unravel';
        audio.sfx(id, { pan, volume: atten });
        continue;
      }
      if (e.type === 'plank') {
        audio.sfx((e.v ?? 99) <= 3 ? 'plank_warn' : 'plank', { pan, volume: 0.6 * atten });
        continue;
      }
      const id = DIRECT[e.type];
      if (id) audio.sfx(id, { pan, volume: (QUIET[e.type] ?? 1) * atten });
    }
    for (const c of this.cues.read(sim)) {
      const { pan, atten } = place(c.x);
      const [sfx, vol, b] = CUE_SOUNDS[c.kind];
      audio.sfx(sfx, { pan, volume: vol * atten });
      if (b) bark(b, c.id, pan, atten);
    }
  }
}
