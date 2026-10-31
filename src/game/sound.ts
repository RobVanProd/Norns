// Maps simulation events to sound effects (with stereo pan from screen position).
import { audio, type SfxId } from '../audio';
import type { SimEvent, SimEventType } from '../sim/state';

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

export class SoundMapper {
  private saveStreak = 0;
  private lastSaveTick = -999;

  play(events: SimEvent[], tick: number, camX: number, viewW: number): void {
    for (const e of events) {
      const pan = Math.max(-1, Math.min(1, (e.x - (camX + viewW / 2)) / (viewW / 2)));
      const off = Math.abs(e.x - (camX + viewW / 2)) - viewW / 2;
      const atten = off > 0 ? Math.max(0.2, 1 - off / viewW) : 1;
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
  }
}
