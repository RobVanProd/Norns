// In-level HUD: counters, quota bar, boss health, skill bar, time controls, hints, fate summary.
import { SKILLS, SKILL_INFO, type SkillId } from '../sim/constants';
import { el, pixelCanvas } from './dom';

export interface HudCallbacks {
  skill(s: SkillId): void;
  pause(): void;
  speed(): void;
  rewind(on: boolean): void;
  foresight(): void;
  restart(): void;
  menu(): void;
}

export interface HudState {
  name: string;
  out: number;
  toCome: number;
  saved: number;
  quota: number;
  target: number;
  total: number;
  spindle: boolean | null;
  skills: Record<SkillId, number>;
  armed: SkillId | null;
  paused: boolean;
  speed: number;
  foresight: boolean;
  rewinding: boolean;
  rewindSec: number;
  boss: { hp: number; max: number; name: string } | null;
  doomed: number;
  horizon: number;
}

export class Hud {
  readonly root: HTMLDivElement;
  private skillBtns = new Map<SkillId, { b: HTMLButtonElement; n: HTMLSpanElement }>();
  private name: HTMLDivElement;
  private outEl: HTMLSpanElement;
  private savedEl: HTMLSpanElement;
  private bar: HTMLDivElement;
  private barFill: HTMLDivElement;
  private spindleEl: HTMLDivElement;
  private pauseBtn: HTMLButtonElement;
  private speedBtn: HTMLButtonElement;
  private eyeBtn: HTMLButtonElement;
  private rewindBtn: HTMLButtonElement;
  private bossWrap: HTMLDivElement;
  private bossFill: HTMLDivElement;
  private bossName: HTMLDivElement;
  private fateEl: HTMLDivElement;
  private hintEl: HTMLDivElement;
  private hintTimer = 0;
  private icons: Record<string, HTMLCanvasElement>;
  private last = '';

  constructor(parent: HTMLElement, icons: Record<string, HTMLCanvasElement>, available: Partial<Record<SkillId, number>>, cb: HudCallbacks) {
    this.icons = icons;
    const icon = (k: string, s = 2) => pixelCanvas(icons[k], s, 'px icon');
    this.name = el('div', { class: 'hud-name' });
    this.outEl = el('span', { class: 'num' });
    this.savedEl = el('span', { class: 'num' });
    this.barFill = el('div', { class: 'qfill' });
    this.bar = el('div', { class: 'qbar' }, this.barFill, el('div', { class: 'qmark quota' }), el('div', { class: 'qmark target' }));
    this.spindleEl = el('div', { class: 'spindle-ind', title: 'Golden Spindle' }, icon('thread', 2));
    const counters = el('div', { class: 'counters panel' },
      el('div', { class: 'ctr', title: 'Wyrdlings out / still to come' }, icon('wyrd', 2), this.outEl),
      el('div', { class: 'ctr saved', title: 'Saved / needed' }, icon('gate', 2), this.savedEl, this.bar),
      this.spindleEl,
    );
    const btn = (k: string, title: string, f: () => void) => {
      const b = el('button', { class: 'ibtn', title, 'aria-label': title }, icon(k, 2));
      b.addEventListener('click', (e) => { e.stopPropagation(); f(); });
      return b;
    };
    this.pauseBtn = btn('pause', 'Pause (Space)', () => cb.pause());
    this.speedBtn = btn('fast', 'Speed (F)', () => cb.speed());
    this.eyeBtn = btn('eye', "Skuld's Foresight (V)", () => cb.foresight());
    const restartBtn = btn('restart', 'Restart', () => cb.restart());
    const menuBtn = btn('home', 'Menu (Esc)', () => cb.menu());
    const controls = el('div', { class: 'controls panel' }, this.eyeBtn, this.pauseBtn, this.speedBtn, restartBtn, menuBtn);
    this.bossFill = el('div', { class: 'bfill' });
    this.bossName = el('div', { class: 'bname' });
    this.bossWrap = el('div', { class: 'bossbar' }, this.bossName, el('div', { class: 'btrack' }, this.bossFill));
    this.fateEl = el('div', { class: 'fate' });
    const top = el('div', { class: 'hud-top' }, this.name, counters, controls);

    const bar = el('div', { class: 'skillbar panel' });
    for (const s of SKILLS) {
      if (available[s] === undefined) continue;
      const n = el('span', { class: 'count' });
      const b = el('button', { class: 'skill', title: `${SKILL_INFO[s].name} (${SKILL_INFO[s].key}) — ${SKILL_INFO[s].desc}`, 'aria-label': SKILL_INFO[s].name },
        icon(s, 3), n, el('span', { class: 'key', text: SKILL_INFO[s].key }), el('span', { class: 'sname', text: SKILL_INFO[s].name }));
      b.addEventListener('click', (e) => { e.stopPropagation(); cb.skill(s); });
      bar.append(b);
      this.skillBtns.set(s, { b, n });
    }
    this.rewindBtn = el('button', { class: 'rewind', title: "Hold to rewind (R) — Urðr's Memory", 'aria-label': 'Rewind' }, icon('rewind', 3), el('span', { class: 'rsec' }));
    const start = (e: Event) => { e.preventDefault(); e.stopPropagation(); cb.rewind(true); };
    const stop = (e: Event) => { e.preventDefault(); cb.rewind(false); };
    this.rewindBtn.addEventListener('pointerdown', start);
    this.rewindBtn.addEventListener('pointerup', stop);
    this.rewindBtn.addEventListener('pointercancel', stop);
    this.rewindBtn.addEventListener('pointerleave', stop);
    this.rewindBtn.addEventListener('contextmenu', (e) => e.preventDefault());
    this.hintEl = el('div', { class: 'hint' });
    const bottom = el('div', { class: 'hud-bottom' }, bar, this.rewindBtn);
    this.root = el('div', { class: 'hud' }, top, this.bossWrap, this.fateEl, this.hintEl, bottom);
    // HUD panels swallow pointer events so taps on buttons don't reach the world
    for (const p of [top, bottom, this.bossWrap]) p.addEventListener('pointerdown', (e) => e.stopPropagation());
    parent.append(this.root);
  }

  hint(text: string, seconds = 6): void {
    this.hintEl.textContent = text;
    this.hintEl.classList.add('show');
    this.hintTimer = seconds;
  }

  tick(dt: number): void {
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.hintEl.classList.remove('show');
    }
  }

  flashSkill(s: SkillId): void {
    const b = this.skillBtns.get(s)?.b;
    if (!b) return;
    b.classList.remove('pulse');
    void b.offsetWidth;
    b.classList.add('pulse');
  }

  denySkill(s: SkillId): void {
    const b = this.skillBtns.get(s)?.b;
    if (!b) return;
    b.classList.remove('deny');
    void b.offsetWidth;
    b.classList.add('deny');
  }

  update(s: HudState): void {
    const key = JSON.stringify(s);
    if (key === this.last) return;
    this.last = key;
    this.name.textContent = s.name;
    this.outEl.textContent = `${s.out}${s.toCome ? `+${s.toCome}` : ''}`;
    this.savedEl.textContent = `${s.saved}/${s.quota}`;
    this.savedEl.classList.toggle('met', s.saved >= s.quota);
    this.barFill.style.width = `${Math.min(100, (s.saved / s.total) * 100)}%`;
    (this.bar.children[1] as HTMLElement).style.left = `${(s.quota / s.total) * 100}%`;
    (this.bar.children[2] as HTMLElement).style.left = `${(s.target / s.total) * 100}%`;
    this.spindleEl.style.display = s.spindle === null ? 'none' : '';
    this.spindleEl.classList.toggle('got', !!s.spindle);
    for (const [k, { b, n }] of this.skillBtns) {
      const c = s.skills[k];
      n.textContent = String(c);
      b.classList.toggle('armed', s.armed === k);
      b.classList.toggle('empty', c <= 0);
    }
    const swap = (b: HTMLButtonElement, k: string) => {
      const old = b.querySelector('canvas');
      if (old?.dataset.k === k) return;
      const c = pixelCanvas(this.icons[k], 2, 'px icon');
      c.dataset.k = k;
      if (old) old.replaceWith(c); else b.append(c);
    };
    swap(this.pauseBtn, s.paused ? 'play' : 'pause');
    swap(this.speedBtn, s.speed >= 4 ? 'faster' : 'fast');
    this.speedBtn.classList.toggle('on', s.speed > 1);
    this.speedBtn.dataset.speed = `${s.speed}×`;
    swap(this.eyeBtn, s.foresight ? 'eye' : 'eye_off');
    this.eyeBtn.classList.toggle('on', s.foresight);
    this.pauseBtn.classList.toggle('on', s.paused);
    this.rewindBtn.classList.toggle('on', s.rewinding);
    (this.rewindBtn.querySelector('.rsec') as HTMLElement).textContent = `${Math.floor(s.rewindSec)}s`;
    if (s.boss) {
      this.bossWrap.classList.add('show');
      this.bossName.textContent = s.boss.name;
      this.bossFill.style.width = `${(s.boss.hp / s.boss.max) * 100}%`;
    } else this.bossWrap.classList.remove('show');
    if (s.foresight && s.doomed > 0) {
      this.fateEl.textContent = `☠ ${s.doomed} doomed within ${s.horizon}s`;
      this.fateEl.classList.add('show');
    } else this.fateEl.classList.remove('show');
    this.root.classList.toggle('paused', s.paused);
  }

  dispose(): void {
    this.root.remove();
  }
}
