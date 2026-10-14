// Scene manager + menus: title (with attract-mode demo), world map, level intro, results, pause,
// the Loom (upgrades & hood dyes), settings.
import { audio, type SongId } from '../audio';
import type { ArtBundle } from '../art/bundle';
import { ALL_LEVELS, REALM_LIST } from '../levels';
import type { Pipeline } from '../render/pipeline';
import { SKILLS, SKILL_INFO } from '../sim/constants';
import type { LevelDef } from '../sim/level';
import { clear, el, pixelCanvas } from '../ui/dom';
import { PlayScene, type PlayMode, type PlayResult } from './play';
import {
  HOODS, UPGRADES, isUnlocked, loadSave, realmUnlocked, recordOutcome, starCount, totalStars, writeSave, type SaveData,
} from './save';
import { setHood } from './view';

type Screen = 'title' | 'map' | 'play' | 'loom';

export class Game {
  readonly p: Pipeline;
  readonly art: ArtBundle;
  readonly save: SaveData;
  private ui: HTMLElement;
  private screenEl: HTMLElement;
  private modal: HTMLElement | null = null;
  private scene: PlayScene | null = null;
  private screen: Screen = 'title';
  private current: LevelDef | null = null;
  private last = performance.now();
  private captionEl: HTMLElement;
  private dpr = Math.min(window.devicePixelRatio || 1, 3);

  constructor(p: Pipeline, art: ArtBundle, ui: HTMLElement) {
    this.p = p;
    this.art = art;
    this.ui = ui;
    this.save = loadSave();
    setHood(this.save.hood);
    p.zoomOffset = this.save.settings.zoom;
    audio.setVolumes({ music: this.save.settings.music, sfx: this.save.settings.sfx });
    this.screenEl = el('div', { class: 'screen' });
    this.captionEl = el('div', { class: 'caption' });
    ui.append(this.screenEl, this.captionEl);
    const unlock = () => { void audio.unlock(); };
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.scene && this.screen === 'play' && this.scene.state === 'play' && !this.scene.paused) this.scene.togglePause();
    });
    this.resize();
    const q = new URLSearchParams(location.search);
    const direct = ALL_LEVELS.find((l) => l.id === (q.get('level') ?? q.get('vision')));
    if (direct) {
      this.playLevel(direct, q.has('vision') ? 'vision' : 'play');
      if (q.has('go')) { this.closeModal(); this.scene?.begin(); }
    } else this.showTitle();
    requestAnimationFrame((t) => this.frame(t));
  }

  private resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = window.innerWidth, h = window.innerHeight;
    if (this.scene) this.scene.resize(w, h, this.dpr);
    else this.p.resize(w, h, this.dpr);
    document.body.classList.toggle('portrait', h > w * 1.1);
  }

  private frame(t: number): void {
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    if (this.scene) {
      this.scene.update(dt);
      this.scene.render();
      this.scene.tickCaption(dt);
      const cap = this.scene.caption;
      this.captionEl.textContent = cap ?? '';
      this.captionEl.classList.toggle('show', !!cap);
    }
    this.p.render(t / 1000);
    requestAnimationFrame((tt) => this.frame(tt));
  }

  private music(id: SongId): void {
    audio.playMusic(id);
  }

  private startScene(level: LevelDef, mode: PlayMode): PlayScene {
    this.scene?.dispose();
    this.closeModal();
    const s = this.save.settings;
    const scene = new PlayScene(this.p, this.art, {
      level, mode,
      horizonSec: UPGRADES.foresight.levels[this.save.upgrades.foresight],
      rewindSec: UPGRADES.rewind.levels[this.save.upgrades.rewind],
      foresight: s.foresight, hints: s.hints,
    }, {
      finished: (r) => this.results(r),
      menu: () => this.pauseMenu(),
      restart: () => this.playLevel(level),
      foresightChanged: (on) => { this.save.settings.foresight = on; writeSave(this.save); },
    }, mode === 'play' ? this.screenEl : null);
    this.scene = scene;
    scene.resize(window.innerWidth, window.innerHeight, this.dpr);
    return scene;
  }

  // ------------------------------------------------------------------ title

  showTitle(): void {
    this.screen = 'title';
    clear(this.screenEl);
    const cleared = ALL_LEVELS.filter((l) => (this.save.stars[l.id] ?? 0) & 1);
    const demo = cleared.length ? cleared[Math.floor(Math.random() * cleared.length)] : ALL_LEVELS[0];
    this.startScene(demo, 'attract');
    this.music('title');
    const logo = pixelCanvas(this.art.logo, 3, 'px logo');
    const play = el('button', { class: 'btn big gold', text: this.save.seenIntro ? 'Continue' : 'Begin' });
    play.addEventListener('click', () => {
      audio.sfx('ui_click');
      if (!this.save.seenIntro) this.story(); else this.showMap();
    });
    const loom = el('button', { class: 'btn', text: 'The Loom' });
    loom.addEventListener('click', () => { audio.sfx('ui_click'); this.showLoom(); });
    const settings = el('button', { class: 'btn', text: 'Settings' });
    settings.addEventListener('click', () => { audio.sfx('ui_click'); this.settings(); });
    const box = el('div', { class: 'title-screen' },
      el('div', { class: 'logo-wrap' }, logo),
      el('div', { class: 'menu' }, play, loom, settings),
      el('div', { class: 'foot', text: 'Mouse, touch or keyboard · 1–9 callings · Space pause · R rewind · V foresight' }),
    );
    this.screenEl.append(box);
  }

  private story(): void {
    const pages = [
      'At the roots of Yggdrasil, three Norns weave the fate of all things.',
      'From their Loom tumble the WYRDLINGS — small hooded spirits, each trailing a golden thread. They wander blind.',
      'You cannot carry them. You can only nudge fate: grant callings, peer ahead along the threads, and unspool time when fate goes wrong.',
      'Lead them home through the Root Gates.',
    ];
    let i = 0;
    const text = el('p', { class: 'story-text' });
    const next = el('button', { class: 'btn gold', text: 'Next' });
    const show = () => { text.textContent = pages[i]; next.textContent = i === pages.length - 1 ? 'To Midgard' : 'Next'; };
    next.addEventListener('click', () => {
      audio.sfx('ui_click');
      i++;
      if (i >= pages.length) { this.save.seenIntro = true; writeSave(this.save); this.showMap(); return; }
      show();
    });
    show();
    this.openModal(el('div', { class: 'panel modal story' }, el('h2', { text: 'The Norns' }), text, el('div', { class: 'row' }, next)));
  }

  // ------------------------------------------------------------------ map

  showMap(): void {
    this.screen = 'map';
    this.closeModal();
    if (!this.scene || this.scene.cfg.mode !== 'attract') this.startScene(ALL_LEVELS[0], 'attract');
    this.music('map');
    clear(this.screenEl);
    const tree = pixelCanvas(this.art.yggdrasil.canvas, 2, 'px tree');
    const header = el('div', { class: 'map-head' },
      el('button', { class: 'ibtn back', 'aria-label': 'Back', title: 'Back' }, pixelCanvas(this.art.icons.arrow_left, 2, 'px icon')),
      el('h1', { text: 'Yggdrasil' }),
      el('div', { class: 'wallet' }, pixelCanvas(this.art.icons.star, 2, 'px icon'), el('span', { text: String(totalStars(this.save)) }),
        pixelCanvas(this.art.icons.thread, 2, 'px icon'), el('span', { text: String(this.save.threads) })),
      el('button', { class: 'btn small', text: 'Loom' }),
    );
    header.querySelector('.back')!.addEventListener('click', () => { audio.sfx('ui_back'); this.showTitle(); });
    header.querySelector('.btn.small')!.addEventListener('click', () => { audio.sfx('ui_click'); this.showLoom(); });
    const realms = el('div', { class: 'realms' });
    REALM_LIST.forEach((r, ri) => {
      const open = realmUnlocked(this.save, ri);
      const nodes = el('div', { class: 'nodes' });
      r.levels.forEach((l, li) => {
        const unlocked = open && isUnlocked(this.save, l.id);
        const mask = this.save.stars[l.id] ?? 0;
        const stars = el('div', { class: 'stars' });
        for (let k = 0; k < 3; k++) stars.append(pixelCanvas(this.art.icons[mask & (1 << k) ? 'star' : 'star_empty'], 1, 'px icon'));
        const boss = !!l.boss;
        const b = el('button', { class: `node${boss ? ' boss' : ''}${unlocked ? '' : ' locked'}${mask & 1 ? ' done' : ''}`, title: l.name },
          el('span', { class: 'n', text: boss ? '☠' : String(li + 1) }),
          el('span', { class: 'lname', text: l.name }),
          unlocked ? stars : pixelCanvas(this.art.icons.lock, 2, 'px icon'));
        if (unlocked) b.addEventListener('click', () => { audio.sfx('ui_click'); this.playLevel(l); });
        else b.addEventListener('click', () => audio.sfx('ui_deny'));
        nodes.append(b);
      });
      realms.append(el('div', { class: `realm panel ${r.id}${open ? '' : ' sealed'}` },
        el('h2', { text: r.name }), el('div', { class: 'sub', text: open ? r.subtitle : 'Sealed — defeat the guardian below' }), nodes));
    });
    this.screenEl.append(el('div', { class: 'map-screen' }, el('div', { class: 'tree-wrap' }, tree), header, realms));
  }

  // ------------------------------------------------------------------ play

  playLevel(level: LevelDef, mode: PlayMode = 'play'): void {
    this.screen = 'play';
    this.current = level;
    clear(this.screenEl);
    const scene = this.startScene(level, mode);
    this.music((level.boss ? 'boss' : level.music ?? level.realm) as SongId);
    audio.setIntensity(0);
    if (mode === 'vision') {
      const stop = el('button', { class: 'btn small vision-stop', text: 'End Vision' });
      stop.addEventListener('click', () => this.playLevel(level));
      this.screenEl.append(el('div', { class: 'vision-banner' }, el('span', { text: "Skuld's Vision — a path that works" }), stop));
      return;
    }
    if (level.boss) audio.stinger('boss_intro');
    this.introCard(level, scene);
  }

  private introCard(level: LevelDef, scene: PlayScene): void {
    const skills = el('div', { class: 'skill-list' });
    for (const s of SKILLS) {
      const n = level.skills[s];
      if (n === undefined) continue;
      skills.append(el('div', { class: 'sk', title: SKILL_INFO[s].desc }, pixelCanvas(this.art.icons[s], 2, 'px icon'), el('span', { text: `${n}` })));
    }
    const realm = REALM_LIST.find((r) => r.id === level.realm);
    const idx = realm ? realm.levels.indexOf(level) : 0;
    const begin = el('button', { class: 'btn big gold', text: 'Begin' });
    begin.addEventListener('click', () => { audio.sfx('ui_click'); this.closeModal(); scene.begin(); });
    const look = el('button', { class: 'btn', text: 'Survey first' });
    look.addEventListener('click', () => {
      audio.sfx('ui_click');
      this.closeModal();
      const go = el('button', { class: 'btn gold survey-go', text: 'Begin ▶' });
      go.addEventListener('click', () => { go.remove(); scene.begin(); });
      this.screenEl.append(go);
    });
    const mask = this.save.stars[level.id] ?? 0;
    this.openModal(el('div', { class: 'panel modal intro' },
      el('div', { class: 'kicker', text: `${realm?.name ?? ''} · ${level.boss ? 'Guardian' : `Thread ${idx + 1}`}` }),
      el('h2', { text: level.name }),
      el('p', { class: 'flavor', text: level.intro }),
      el('div', { class: 'goals' },
        el('div', { class: `goal${mask & 1 ? ' got' : ''}` }, pixelCanvas(this.art.icons[mask & 1 ? 'star' : 'star_empty'], 2, 'px icon'), el('span', { text: level.boss ? `Defeat the guardian, save ${level.quota}` : `Save ${level.quota} of ${level.wyrdlings}` })),
        el('div', { class: `goal${mask & 2 ? ' got' : ''}` }, pixelCanvas(this.art.icons[mask & 2 ? 'star' : 'star_empty'], 2, 'px icon'), el('span', { text: `Save ${level.target}` })),
        level.entities.some((e) => e.type === 'spindle')
          ? el('div', { class: `goal${mask & 4 ? ' got' : ''}` }, pixelCanvas(this.art.icons[mask & 4 ? 'star' : 'star_empty'], 2, 'px icon'), el('span', { text: 'Find the Golden Spindle' }))
          : null,
      ),
      skills,
      el('div', { class: 'row' }, look, begin),
    ), false);
  }

  private results(r: PlayResult): void {
    const level = this.current;
    if (!level || !this.scene) return;
    if (this.scene.cfg.mode === 'vision') {
      this.openModal(el('div', { class: 'panel modal results' }, el('h2', { text: 'The Vision fades' }),
        el('p', { text: `Skuld's path saved ${r.saved} of ${level.wyrdlings}. Now weave it yourself.` }),
        this.row([['Try it', () => this.playLevel(level), true], ['Map', () => this.showMap()]])));
      return;
    }
    const out = recordOutcome(this.save, {
      levelId: level.id, saved: r.saved, quota: level.quota, target: level.target, spindle: r.spindle, bossDefeated: r.bossDefeated,
    });
    const won = (out.mask & 1) === 1;
    audio.stinger(won ? 'victory' : 'defeat');
    if (won && level === ALL_LEVELS[ALL_LEVELS.length - 1]) setTimeout(() => audio.playMusic('finale'), 2500);
    const stars = el('div', { class: 'big-stars' });
    const hasSpindle = level.entities.some((e) => e.type === 'spindle');
    for (let k = 0; k < (hasSpindle ? 3 : 2); k++) {
      const got = out.mask & (1 << k);
      const s = pixelCanvas(this.art.icons[got ? 'star' : 'star_empty'], 4, `px icon${got ? ' pop' : ''}`);
      s.style.animationDelay = `${0.25 + k * 0.3}s`;
      if (got) setTimeout(() => audio.sfx('star', { pitch: 1 + k * 0.12 }), 250 + k * 300);
      stars.append(s);
    }
    const idx = ALL_LEVELS.indexOf(level);
    const next = ALL_LEVELS[idx + 1];
    const buttons: [string, () => void, boolean?][] = [];
    if (won && next) buttons.push(['Next', () => this.playLevel(next), true]);
    buttons.push(['Retry', () => this.playLevel(level), !won]);
    if (!won) buttons.push(["Skuld's Vision", () => this.playLevel(level, 'vision')]);
    buttons.push(['Map', () => this.showMap()]);
    const lines = [
      el('div', { class: 'stat' }, el('span', { text: 'Saved' }), el('b', { text: `${r.saved} / ${level.wyrdlings}` })),
      el('div', { class: 'stat' }, el('span', { text: 'Needed' }), el('b', { text: `${level.quota}` })),
      el('div', { class: 'stat' }, el('span', { text: 'Callings used' }), el('b', { text: `${r.skillsUsed}` })),
      el('div', { class: 'stat' }, el('span', { text: 'Time' }), el('b', { text: fmtTime(r.ticks) })),
    ];
    if (r.rewinds) lines.push(el('div', { class: 'stat' }, el('span', { text: 'Rewinds' }), el('b', { text: `${r.rewinds} (free!)` })));
    if (out.threads) lines.push(el('div', { class: 'stat gain' }, el('span', { text: 'Threads earned' }), el('b', { text: `+${out.threads}` })));
    this.openModal(el('div', { class: `panel modal results ${won ? 'won' : 'lost'}` },
      el('h2', { text: won ? (level === ALL_LEVELS[ALL_LEVELS.length - 1] ? 'The Threads Are Whole!' : level.boss ? 'The Guardian Falls!' : 'Threads Rewoven!') : 'Fate Unravelled' }),
      won && level === ALL_LEVELS[ALL_LEVELS.length - 1] ? el('p', { class: 'flavor', text: 'Surtr\u2019s fire gutters out. The Wyrdlings are home, and the Norns weave on.' }) : null,
      stars,
      el('div', { class: 'stats' }, ...lines),
      won ? null : el('p', { class: 'flavor', text: 'No harm done — hold Rewind next time, or watch Skuld’s Vision for one path that works.' }),
      this.row(buttons)));
  }

  private row(btns: [string, () => void, boolean?][]): HTMLElement {
    const r = el('div', { class: 'row' });
    for (const [t, f, gold] of btns) {
      const b = el('button', { class: `btn${gold ? ' gold' : ''}`, text: t });
      b.addEventListener('click', () => { audio.sfx('ui_click'); f(); });
      r.append(b);
    }
    return r;
  }

  private pauseMenu(): void {
    if (this.screen !== 'play' || !this.scene) { this.showMap(); return; }
    if (this.modal) { this.closeModal(); return; }
    const scene = this.scene;
    const wasPaused = scene.paused;
    if (!wasPaused && scene.state === 'play') scene.togglePause();
    const level = this.current!;
    const resume = () => { this.closeModal(); if (!wasPaused && scene.paused) scene.togglePause(); };
    const buttons: [string, () => void, boolean?][] = [
      ['Resume', resume, true],
      ['Restart', () => this.playLevel(level)],
      ["Skuld's Vision", () => this.playLevel(level, 'vision')],
    ];
    if (scene.sim.d.saved >= level.quota && scene.state === 'play') buttons.push(['End level now', () => { scene.sim.finishNow(); this.closeModal(); if (scene.paused) scene.togglePause(); }]);
    buttons.push(['Settings', () => this.settings(() => this.pauseMenu())], ['World map', () => this.showMap()]);
    const col = el('div', { class: 'col' });
    for (const [t, f, gold] of buttons) {
      const b = el('button', { class: `btn${gold ? ' gold' : ''}`, text: t });
      b.addEventListener('click', () => { audio.sfx('ui_click'); f(); });
      col.append(b);
    }
    this.openModal(el('div', { class: 'panel modal pause' }, el('h2', { text: 'Paused' }), el('p', { class: 'flavor', text: level.name }), col));
  }

  // ------------------------------------------------------------------ loom

  showLoom(): void {
    this.screen = 'loom';
    this.closeModal();
    if (!this.scene || this.scene.cfg.mode !== 'attract') this.startScene(ALL_LEVELS[0], 'attract');
    clear(this.screenEl);
    const s = this.save;
    const wallet = el('div', { class: 'wallet' }, pixelCanvas(this.art.icons.thread, 2, 'px icon'), el('span', { text: `${s.threads} threads` }));
    const ups = el('div', { class: 'ups' });
    for (const key of ['foresight', 'rewind'] as const) {
      const u = UPGRADES[key];
      const lvl = s.upgrades[key];
      const max = lvl >= u.costs.length;
      const cost = max ? 0 : u.costs[lvl];
      const b = el('button', { class: `btn${!max && s.threads >= cost ? ' gold' : ''}`, text: max ? 'Mastered' : `Weave · ${cost}` });
      if (max || s.threads < cost) b.setAttribute('disabled', '');
      b.addEventListener('click', () => {
        if (max || s.threads < cost) return;
        s.threads -= cost;
        s.upgrades[key]++;
        writeSave(s);
        audio.sfx('purchase');
        this.showLoom();
      });
      const unit = 's';
      ups.append(el('div', { class: 'up panel' },
        pixelCanvas(this.art.icons[key === 'foresight' ? 'eye' : 'rewind'], 3, 'px icon'),
        el('div', { class: 'up-text' }, el('h3', { text: u.name }), el('p', { text: `${u.desc} Now ${u.levels[lvl]}${unit}${max ? '' : ` → ${u.levels[lvl + 1]}${unit}`}.` })),
        b));
    }
    const hoods = el('div', { class: 'hoods' });
    const wyrd = this.art.sprites['wyrd.walk'];
    for (const h of HOODS) {
      const owned = s.hoods.includes(h.id);
      const anim = (h.hue === null ? wyrd : this.art.sprites[`wyrd.walk@${h.id}`]) ?? wyrd;
      const pic = pixelCanvas(anim?.frames[0], 4, 'px');
      const b = el('button', { class: `hood${s.hood === h.id ? ' on' : ''}${owned ? '' : ' locked'}`, title: h.name },
        pic, el('span', { text: owned ? h.name : `${h.name} · ${h.cost}` }));
      b.addEventListener('click', () => {
        if (!owned) {
          if (s.threads < h.cost) { audio.sfx('ui_deny'); return; }
          s.threads -= h.cost;
          s.hoods.push(h.id);
          audio.sfx('purchase');
        } else audio.sfx('ui_click');
        s.hood = h.id;
        setHood(h.id);
        writeSave(s);
        this.showLoom();
      });
      hoods.append(b);
    }
    const back = el('button', { class: 'btn', text: 'Back' });
    back.addEventListener('click', () => { audio.sfx('ui_back'); this.showMap(); });
    this.screenEl.append(el('div', { class: 'loom-screen' },
      el('div', { class: 'panel loom' },
        el('h1', { text: 'The Loom' }),
        el('p', { class: 'flavor', text: 'Spend the threads you rescue. Every thread of fate can be rewoven — every level can be won without any of this.' }),
        wallet, el('h2', { text: 'Norn Powers' }), ups, el('h2', { text: 'Hood Dyes' }), hoods,
        el('div', { class: 'row' }, back))));
  }

  // ------------------------------------------------------------------ settings

  private settings(back?: () => void): void {
    const s = this.save.settings;
    const slider = (label: string, v: number, f: (v: number) => void) => {
      const i = el('input', { type: 'range', min: 0, max: 100, value: Math.round(v * 100) });
      i.addEventListener('input', () => f(Number(i.value) / 100));
      return el('label', { class: 'set' }, el('span', { text: label }), i);
    };
    const toggle = (label: string, v: boolean, f: (v: boolean) => void) => {
      const i = el('input', { type: 'checkbox' });
      i.checked = v;
      i.addEventListener('change', () => f(i.checked));
      return el('label', { class: 'set' }, el('span', { text: label }), i);
    };
    const zoom = el('select', {});
    for (const [v, t] of [[-1, 'Far'], [0, 'Normal'], [1, 'Close'], [2, 'Closer']] as const) {
      const o = el('option', { value: v, text: t });
      if (s.zoom === v) o.selected = true;
      zoom.append(o);
    }
    zoom.addEventListener('change', () => { s.zoom = Number(zoom.value); this.p.zoomOffset = s.zoom; this.resize(); writeSave(this.save); });
    const done = el('button', { class: 'btn gold', text: 'Done' });
    done.addEventListener('click', () => { writeSave(this.save); audio.sfx('ui_click'); if (back) back(); else this.closeModal(); });
    const fs = el('button', { class: 'btn', text: 'Fullscreen' });
    fs.addEventListener('click', () => { void document.documentElement.requestFullscreen?.().catch(() => undefined); });
    const reset = el('button', { class: 'btn danger', text: 'Erase progress' });
    reset.addEventListener('click', () => {
      if (!confirm('Erase all stars, threads and dyes?')) return;
      try { localStorage.removeItem('norns.save.v1'); } catch { /* ignore */ }
      location.reload();
    });
    this.openModal(el('div', { class: 'panel modal settings' },
      el('h2', { text: 'Settings' }),
      slider('Music', s.music, (v) => { s.music = v; audio.setVolumes({ music: v }); }),
      slider('Sound', s.sfx, (v) => { s.sfx = v; audio.setVolumes({ sfx: v }); audio.sfx('ui_click'); }),
      toggle("Skuld's Foresight", s.foresight, (v) => { s.foresight = v; if (this.scene) this.scene.cfg.foresight = v; }),
      toggle('Tutorial hints', s.hints, (v) => { s.hints = v; }),
      el('label', { class: 'set' }, el('span', { text: 'Pixel zoom' }), zoom),
      el('div', { class: 'row' }, fs, reset),
      el('div', { class: 'row' }, done)));
  }

  // ------------------------------------------------------------------ modal

  private openModal(content: HTMLElement, dismissable = true): void {
    this.closeModal();
    const m = el('div', { class: 'modal-back' }, content);
    if (dismissable) m.addEventListener('pointerdown', (e) => { if (e.target === m) this.closeModal(); });
    m.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.modal = m;
    this.ui.append(m);
  }

  private closeModal(): void {
    this.modal?.remove();
    this.modal = null;
  }
}

function fmtTime(ticks: number): string {
  const s = Math.floor(ticks / 30);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export { starCount };
