// Wyrdling barks are characterful once and grating on the twentieth time, so they share a crowd limit
// on top of each SFX's own gap: a short hush after every bark (no overlapping chatter), at most a few
// in any one second, and a cooldown per kind so one kind never repeats back to back. Barks over the
// limit are dropped, not queued: a late bark would be about something that has already happened.
// Pure (no AudioContext), so tests can drive it with their own clock.

export interface BarkLimits {
  /** sliding window, s */
  window: number;
  /** most barks of any kind in one window */
  total: number;
  /** least time between two barks of any kind, s */
  hush: number;
  /** least time between two barks of the same kind, s (kinds not listed use `cooldown`) */
  kinds: Partial<Record<string, number>>;
  cooldown: number;
}

export const BARK_LIMITS: BarkLimits = {
  window: 1,
  total: 3,
  hush: 0.15,
  // the player's own grant answers quickly; a stream of spawns or arrivals only now and then
  kinds: { bark_mm: 0.35, bark_hup: 2.5, bark_yay: 0.9, bark_oh: 0.6, bark_whee: 1.2 },
  cooldown: 1,
};

export class BarkLimiter {
  private played: { kind: string; t: number }[] = [];

  constructor(readonly limits: BarkLimits = BARK_LIMITS) {}

  /** May a bark of `kind` play at `now` (s)? If so it counts as played. */
  allow(kind: string, now: number): boolean {
    const L = this.limits;
    // forget what is out of every window; a clock that went backwards (a new context) starts afresh
    const keep = Math.max(L.window, L.hush, L.cooldown, ...Object.values(L.kinds).map((v) => v ?? 0));
    this.played = this.played.filter((p) => p.t <= now && now - p.t < keep);
    let inWindow = 0;
    for (const p of this.played) {
      const ago = now - p.t;
      if (ago < L.hush) return false;
      if (p.kind === kind && ago < (L.kinds[kind] ?? L.cooldown)) return false;
      if (ago < L.window) inWindow++;
    }
    if (inWindow >= L.total) return false;
    this.played.push({ kind, t: now });
    return true;
  }
}

/** Each Wyrdling's own voice: a playback-rate multiplier in 0.88..1.12, fixed by its id. */
export function barkPitch(id: number): number {
  const h = (Math.imul(id + 1, 0x9e3779b1) >>> 0) / 4294967296;
  return 0.88 + Math.round(h * 12) * 0.02;
}
