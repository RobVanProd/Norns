// Scene manager + menus: title (with attract-mode demo), world map, level intro, results, pause,
// the Loom (upgrades & hood dyes), settings. Also keeps the local playtest log (see stats.ts).
import { audio, type SongId } from '../audio';
import type { ArtBundle } from '../art/bundle';
import { ALL_LEVELS, REALM_LIST } from '../levels';
import type { Pipeline } from '../render/pipeline';
import { SKILLS, SKILL_INFO } from '../sim/constants';
import type { LevelDef } from '../sim/level';
import { SolutionPlayer } from '../sim/solution';
import type { Weave } from '../sim/weave';
import { clear, el, pixelCanvas } from '../ui/dom';
import { bindKey, defaultKeys, KEY_ACTIONS, keyName, keysName, reservedKey, type KeyAction, type KeyBinds } from './input';
import { PlayScene, type PlayMode, type PlayResult } from './play';
import {
  BOSS_NEEDS, HOODS, RECORD_KEYS, TEXT_SIZES, TOUCH_REACH, UPGRADES, bestWeave, isUnlocked, levelRecords, loadSave, markSeen, offerRecords,
  offerWeave, realmUnlocked, recordOutcome, starCount, totalStars, writeSave, type LevelRecords, type RecordKey, type SaveData,
} from './save';
import { fmtTicks, gameUrl, histogram, readShared, resultText, shareUrl, skuldPar, weaveFromHash, type RunFacts } from './share';
import { eraseStats, levelStats, loadStats, logFinish, logQuit, playtestReport, writeStats, type QuitPoint, type Stats } from './stats';
import { setHood, setPalette, type PaletteId } from './view';
import { VISION_TIERS, type VisionTier } from './vision';

/** What a partial Vision leaves the player with (tier 4 says what the whole path saved). */
const VISION_FADES: Record<1 | 2 | 3, string> = {
  1: 'That is where and when it begins. Which calling? That is yours to find.',
  2: 'Now you know the first calling: where, when and which.',
  3: 'Those are the first steps. The rest is yours to weave.',
};

type Screen = 'title' | 'map' | 'play' | 'loom';

/** The first key of an action, as players read it ('—' if it has none). */
function firstKey(keys: KeyBinds, a: KeyAction): string {
  return keys[a][0] ? keyName(keys[a][0]) : '—';
}

export class Game {
  readonly p: Pipeline;
  readonly art: ArtBundle;
  readonly save: SaveData;
  private stats: Stats;
  /** the play attempt on screen is in the playtest log already (it finished, or it was left) */
  private attemptCounted = false;
  private ui: HTMLElement;
  private screenEl: HTMLElement;
  private modal: HTMLElement | null = null;
  private scene: PlayScene | null = null;
  private screen: Screen = 'title';
  private current: LevelDef | null = null;
  private last = performance.now();
  private captionEl: HTMLElement;
  private dpr = Math.min(window.devicePixelRatio || 1, 3);
  /** the realm-unsealed stinger waiting for the victory one to finish */
  private unlockTimer = 0;
  /** the Weave the last shared link brought, while it is the one being watched */
  private shared: Weave | null = null;

  constructor(p: Pipeline, art: ArtBundle, ui: HTMLElement) {
    this.p = p;
    this.art = art;
    this.ui = ui;
    this.save = loadSave();
    this.stats = loadStats();
    setHood(this.save.hood);
    this.applyPalette(this.save.settings.palette);
    this.applyDisplay();
    p.zoomOffset = this.save.settings.zoom;
    audio.setVolumes({ music: this.save.settings.music, sfx: this.save.settings.sfx, voice: this.save.settings.voice });
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
    // closing the tab mid-level is a quit point too
    window.addEventListener('pagehide', () => this.endAttempt('closed'));
    this.resize();
    const q = new URLSearchParams(location.search);
    const direct = ALL_LEVELS.find((l) => l.id === (q.get('level') ?? q.get('vision')));
    // a shared replay link (#weave=…), also when one is pasted into the address bar of an open game
    const link = weaveFromHash(location.hash);
    window.addEventListener('hashchange', () => {
      const t = weaveFromHash(location.hash);
      if (t !== null) this.openShared(t);
    });
    if (link !== null) this.openShared(link);
    else if (direct) {
      // dev tooling (see AGENTS.md): &vision watches Skuld's Vision of the whole quota route, &tier=1-4 one
      // stage of it, &solution plays the whole scripted solution (spindle steps too) as an attempt
      const dev = import.meta.env.DEV;
      const tier = Number(q.get('tier') ?? 4);
      if (dev && q.has('vision')) this.playLevel(direct, 'vision', undefined, tier >= 1 && tier <= 4 ? tier as VisionTier : 4);
      else this.playLevel(direct);
      if (q.has('go')) { this.closeModal(); this.scene?.begin(); }
      if (dev && q.has('solution') && this.scene?.cfg.mode === 'play') this.scene.debugSolution();
    } else this.showTitle();
    requestAnimationFrame((t) => this.frame(t));
    // dev-only hook for scripts/frames.mjs, scripts/clicktest.mjs and agents (see AGENTS.md)
    if (import.meta.env.DEV) {
      (window as unknown as { __norns: unknown }).__norns = {
        scene: () => this.scene, SolutionPlayer,
        manual: (on: boolean) => this.setManualClock(on), step: (dt: number) => this.debugStep(dt),
        palette: (id: PaletteId) => this.applyPalette(id),
      };
    }
  }

  /** Fate colours in the world (threads, rings, words over a Wyrdling) and in the HUD (verdict, doom count). */
  private applyPalette(id: PaletteId): void {
    setPalette(id);
    this.ui.classList.toggle('cvd', id === 'cvd');
  }

  private resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = window.innerWidth, h = window.innerHeight;
    if (this.scene) this.scene.resize(w, h, this.dpr);
    else this.p.resize(w, h, this.dpr);
    document.body.classList.toggle('portrait', h > w * 1.1);
    // scale the HTML UI with the screen in quarter steps (1x up to 1280x720, then larger)
    const ui = Math.max(1, Math.min(3, Math.floor(Math.min(h / 720, w / 1280) * 4) / 4));
    this.ui.style.setProperty('--ui', String(ui));
    this.fitTitleLogo();
  }

  /** Settings that live in the page itself: calmer CSS motion, and the text size every font size scales by. */
  private applyDisplay(): void {
    const s = this.save.settings, root = document.documentElement;
    root.classList.toggle('calm', s.reduceMotion);
    root.style.setProperty('--ts', String(TEXT_SIZES.includes(s.textSize) ? s.textSize : 1));
  }

  /** Largest whole-pixel logo scale (1-3) that leaves room for the menu and footer. */
  private fitTitleLogo(): void {
    const box = this.screenEl.querySelector<HTMLElement>('.title-screen');
    const logo = box?.querySelector<HTMLCanvasElement>('canvas.logo');
    const menu = box?.querySelector<HTMLElement>('.menu');
    const foot = box?.querySelector<HTMLElement>('.foot');
    if (!box || !logo || !menu || !foot) return;
    const gap = parseFloat(getComputedStyle(box).rowGap) || 0;
    const availH = box.clientHeight - menu.offsetHeight - foot.offsetHeight - gap * 3 - 16;
    const availW = box.clientWidth - 32;
    const s = Math.max(1, Math.min(3, Math.floor(Math.min(availH / logo.height, availW / logo.width))));
    logo.style.width = `${logo.width * s}px`;
    logo.style.height = `${logo.height * s}px`;
  }

  private frame(t: number): void {
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    if (this.manualClock === null) this.advance(dt, t / 1000);
    requestAnimationFrame((tt) => this.frame(tt));
  }

  /** Dev tooling (scripts/trailer.mjs): seconds on the manual clock, or null for real time. */
  private manualClock: number | null = null;

  /** Dev tooling: stop the real-time loop; frames then advance only through debugStep(). */
  setManualClock(on: boolean): void {
    this.manualClock = on ? 0 : null;
  }

  /** Dev tooling: advance and render exactly one frame of `dt` seconds on the manual clock. */
  debugStep(dt: number): void {
    if (this.manualClock === null) return;
    this.manualClock += dt;
    this.advance(dt, this.manualClock);
  }

  private advance(dt: number, now: number): void {
    if (this.scene) {
      this.scene.update(dt);
      this.scene.render();
      this.scene.tickCaption(dt);
      let cap = this.scene.caption;
      // a replayed calling is captioned as the player's own; a shared Weave's callings are someone else's
      if (cap && this.shared && this.scene.cfg.replay === this.shared) cap = cap.replace(/^You grant/, 'They grant');
      this.captionEl.textContent = cap ?? '';
      this.captionEl.classList.toggle('show', !!cap);
    }
    this.p.render(now);
  }

  private music(id: SongId): void {
    audio.playMusic(id);
  }

  /** The play attempt on screen ends (another scene replaces it, or the page closes): fold its counts
   *  into the playtest log, and if it never finished, count it and note where it was left. An attempt
   *  counts once begun: leaving from the intro card attempts nothing. */
  private endAttempt(via: QuitPoint['via']): void {
    const scene = this.scene;
    if (!scene?.log || scene.state === 'intro') return;
    const l = levelStats(this.stats, scene.cfg.level.id);
    if (this.attemptCounted) {
      scene.log.foldInto(l);
      writeStats(this.stats);
      return;
    }
    l.attempts++;
    // counted once: a page closed after this (or hidden and back) is not a second quit
    this.attemptCounted = true;
    const d = scene.sim.d;
    logQuit(this.stats, scene.cfg.level.id, scene.log, { tick: d.tick, saved: d.saved, used: d.used, via }, scene.weave);
  }

  private startScene(level: LevelDef, mode: PlayMode, replay?: Weave, visionTier?: VisionTier): PlayScene {
    // what the player does instead says how the attempt on screen ended
    const old = this.scene;
    if (old?.log) this.endAttempt(mode === 'vision' ? 'vision' : mode === 'play' && old.cfg.level === level ? 'restart' : 'left');
    this.scene?.dispose();
    this.closeModal();
    this.attemptCounted = false;
    if (mode === 'vision' && !replay) {
      levelStats(this.stats, level.id).visions++;
      writeStats(this.stats);
    }
    const s = this.save.settings;
    const scene = new PlayScene(this.p, this.art, {
      level, mode, replay, visionTier,
      horizonSec: UPGRADES.foresight.levels[this.save.upgrades.foresight],
      foresight: s.foresight, hints: s.hints, rewindToggle: s.rewindToggle, verdict: s.verdict, clearSight: s.clearSight,
      keys: s.keys, reduceMotion: s.reduceMotion, touchReach: clampReach(s.touchReach),
    }, {
      finished: (r) => this.results(r),
      menu: () => this.pauseMenu(),
      dialogOpen: () => this.modal !== null,
      restart: () => this.playLevel(level),
      foresightChanged: (on) => { this.save.settings.foresight = on; writeSave(this.save); },
      fresh: (key) => !this.save.seen.includes(key),
      learn: (key) => { if (markSeen(this.save, key)) writeSave(this.save); },
    }, mode === 'attract' ? null : this.screenEl);
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
      el('div', { class: 'foot', text: this.keysLine() }),
    );
    this.screenEl.append(box);
    this.fitTitleLogo();
  }

  /** The title screen's line on the keys, as bound. */
  private keysLine(): string {
    const k = this.save.settings.keys;
    return `Mouse, touch or keyboard · ${firstKey(k, 'slot1')}–${firstKey(k, 'slot9')} callings · ${firstKey(k, 'pause')} pause`
      + ` · ${firstKey(k, 'rewind')} rewind · ${firstKey(k, 'foresight')} foresight · hold C clear sight`;
  }

  /** The story, on one card. The very first launch goes from it straight into the first level; the map
   *  comes after that level. */
  private story(): void {
    const go = el('button', { class: 'btn gold', text: 'To Midgard' });
    const skip = el('button', { class: 'btn', text: 'Skip' });
    const done = () => { this.save.seenIntro = true; writeSave(this.save); this.playLevel(ALL_LEVELS[0]); };
    go.addEventListener('click', () => { audio.sfx('ui_click'); done(); });
    skip.addEventListener('click', () => { audio.sfx('ui_back'); done(); });
    this.openModal(el('div', { class: 'panel modal story' }, el('h2', { text: 'The Norns' }),
      el('p', { class: 'story-text', text: 'At the roots of Yggdrasil, three Norns weave all fate. From their Loom tumble the Wyrdlings: '
        + 'small hooded spirits who wander blind. Grant them callings, peer ahead along their threads, and unspool time when fate goes wrong.' }),
      el('div', { class: 'row' }, go, skip)));
  }

  // ------------------------------------------------------------------ shared links

  /**
   * A shared link (#weave=…). The Weave is replayed headless before anything is shown: one that replays
   * true is offered to watch, with a warning that it shows a whole solution; one from another version of
   * the game or of its level, or one that goes out of step, is marked and never replayed. Watching does
   * not need the level open; playing it does.
   */
  private openShared(text: string): void {
    // the link is spent: a reload, or the address copied from the bar, starts from the plain game
    history.replaceState(null, '', location.pathname + location.search);
    const sh = readShared(text, ALL_LEVELS);
    this.showTitle();
    const level = sh.kind === 'bad' ? null : sh.level;
    const title = el('button', { class: 'btn', text: 'To the title' });
    title.addEventListener('click', () => { audio.sfx('ui_back'); this.closeModal(); });
    const buttons: HTMLButtonElement[] = [];
    if (sh.kind === 'ok') {
      const watch = el('button', { class: 'btn gold', text: 'Watch it' });
      watch.addEventListener('click', () => { audio.sfx('ui_click'); this.shared = sh.w; this.playLevel(sh.level, 'vision', sh.w); });
      buttons.push(watch);
    }
    if (level && isUnlocked(this.save, level.id)) {
      const play = el('button', { class: `btn${sh.kind === 'ok' ? '' : ' gold'}`, text: sh.kind === 'ok' ? 'Play it first' : 'Play this level' });
      play.addEventListener('click', () => { audio.sfx('ui_click'); this.playLevel(level); });
      buttons.push(play);
    }
    buttons.push(title);
    let says: string;
    if (sh.kind === 'ok') {
      const f = sh.facts;
      says = `It saves ${f.saved} of ${sh.level.wyrdlings} with ${f.used} calling${f.used === 1 ? '' : 's'}`
        + `${f.bossDefeated ? ' and fells the guardian' : ''}${f.spindle ? ', and finds the Golden Spindle' : ''}.`;
    } else if (sh.kind === 'bad') says = 'This link holds no weave that NORNS can read.';
    else if (sh.kind === 'step') says = 'It goes out of step when replayed here (the link may be damaged), so it is not replayed.';
    else if (sh.why === 'version') says = 'It was woven on another version of NORNS, whose rules may differ, so it is not replayed.';
    else says = level ? 'It was woven on another version of this level, so it is not replayed.' : 'It was woven on a level this version of NORNS does not have.';
    const badge = sh.kind === 'old' ? 'Old version' : sh.kind === 'step' ? 'Out of step' : null;
    this.openModal(el('div', { class: 'panel modal shared' },
      el('div', { class: 'kicker', text: 'A shared weave' }),
      el('h2', { text: level?.name ?? (sh.kind === 'bad' ? 'Not a weave' : 'An unknown thread') }),
      badge ? el('div', { class: 'badge', text: badge }) : null,
      el('p', { class: 'flavor', text: says }),
      sh.kind === 'ok' ? el('p', { class: 'warn', text: 'Watching it shows the whole solution, calling by calling.' }) : null,
      el('div', { class: 'row' }, ...buttons)));
  }

  // ------------------------------------------------------------------ map

  showMap(): void {
    this.screen = 'map';
    this.closeModal();
    if (markSeen(this.save, 'map')) writeSave(this.save);
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
      const puzzles = r.levels.filter((l) => !l.boss);
      r.levels.forEach((l, li) => {
        const unlocked = open && isUnlocked(this.save, l.id);
        const mask = this.save.stars[l.id] ?? 0;
        const stars = el('div', { class: 'stars' });
        for (let k = 0; k < 3; k++) stars.append(pixelCanvas(this.art.icons[mask & (1 << k) ? 'star' : 'star_empty'], 1, 'px icon'));
        const boss = !!l.boss;
        const why = !open ? 'Realm sealed' : boss ? `Clear ${Math.min(BOSS_NEEDS, puzzles.length)} of ${r.name}'s threads to wake the guardian`
          : puzzles.indexOf(l) === 1 ? 'Clear the thread before it' : 'Clear one of the two threads before it';
        const b = el('button', { class: `node${boss ? ' boss' : ''}${unlocked ? '' : ' locked'}${mask & 1 ? ' done' : ''}`, title: unlocked ? l.name : `${l.name} · ${why}` },
          el('span', { class: 'n', text: boss ? '☠' : String(li + 1) }),
          el('span', { class: 'lname', text: l.name }),
          unlocked ? stars : pixelCanvas(this.art.icons.lock, 2, 'px icon'));
        if (unlocked) b.addEventListener('click', () => { audio.sfx('ui_click'); this.playLevel(l); });
        else b.addEventListener('click', () => audio.sfx('ui_deny'));
        nodes.append(b);
      });
      realms.append(el('div', { class: `realm panel ${r.id}${open ? '' : ' sealed'}` },
        el('h2', { text: r.name }),
        el('div', { class: 'sub', text: open ? r.subtitle : `Sealed: defeat ${REALM_LIST[ri - 1].name}'s guardian or clear all its threads` }), nodes));
    });
    this.screenEl.append(el('div', { class: 'map-screen' }, el('div', { class: 'tree-wrap' }, tree), header, realms));
  }

  // ------------------------------------------------------------------ play

  /** Open a level: to play, or to watch Skuld's Vision at a tier (or, with `replay`, the player's own best Weave). */
  playLevel(level: LevelDef, mode: PlayMode = 'play', replay?: Weave, tier?: VisionTier): void {
    this.screen = 'play';
    // a realm's stinger belongs to the results and the map, not to the next level's opening
    clearTimeout(this.unlockTimer);
    this.current = level;
    clear(this.screenEl);
    if (mode === 'vision' && !replay) {
      // the Vision opens where this level's last one left off, and remembers how far it went
      tier ??= this.visionTier(level);
      if (tier > (this.save.visionTier[level.id] ?? 0)) { this.save.visionTier[level.id] = tier; writeSave(this.save); }
    }
    const scene = this.startScene(level, mode, replay, tier);
    this.music((level.boss ? 'boss' : level.music ?? level.realm) as SongId);
    audio.setIntensity(0);
    if (mode === 'vision') {
      const stop = el('button', { class: 'btn small vision-stop', text: replay ? 'Stop' : 'End Vision' });
      stop.addEventListener('click', () => { audio.sfx('ui_back'); this.afterReplay(level, replay); });
      const banner = el('div', { class: 'vision-banner' });
      if (replay && replay === this.shared) banner.append(el('span', { text: 'A shared weave, woven again' }));
      else if (replay || !tier) banner.append(el('span', { text: 'Your best weave, woven again' }));
      else {
        banner.append(el('span', { text: "Skuld's Vision" }), el('span', { class: 'vtier', text: `${tier}/4 ${VISION_TIERS[tier]}` }));
        if (tier < 4) {
          const more = el('button', { class: 'btn small gold', text: 'Show more' });
          more.addEventListener('click', () => { audio.sfx('ui_click'); this.playLevel(level, 'vision', undefined, (tier! + 1) as VisionTier); });
          banner.append(more);
        }
      }
      banner.append(stop);
      this.screenEl.append(banner);
      return;
    }
    if (level.boss) audio.stinger('boss_intro');
    this.introCard(level, scene);
  }

  /** The tier a level's Vision opens at: the furthest one already watched. */
  private visionTier(level: LevelDef): VisionTier {
    return Math.max(1, Math.min(4, this.save.visionTier[level.id] ?? 1)) as VisionTier;
  }

  /** Leaving a replay goes into the level, unless a shared link brought it and the level is not open yet. */
  private afterReplay(level: LevelDef, replay?: Weave): void {
    if (replay && replay === this.shared && !isUnlocked(this.save, level.id)) this.showTitle();
    else this.playLevel(level);
  }

  private introCard(level: LevelDef, scene: PlayScene): void {
    // named calling chips; pointing at one (or tapping it, on touch) says what it does underneath
    const skills = el('div', { class: 'skill-list' });
    const desc = el('p', { class: 'sk-desc' });
    const read = (chip: HTMLElement, s: (typeof SKILLS)[number]) => {
      for (const c of skills.children) c.classList.toggle('on', c === chip);
      desc.replaceChildren(el('b', { text: SKILL_INFO[s].name }), ` ${SKILL_INFO[s].desc}`);
    };
    for (const s of SKILLS) {
      const n = level.skills[s];
      if (n === undefined) continue;
      const chip = el('button', { class: 'sk', 'aria-label': `${SKILL_INFO[s].name} ×${n}` },
        pixelCanvas(this.art.icons[s], 2, 'px icon'), el('span', { text: SKILL_INFO[s].name }), el('span', { class: 'n', text: `×${n}` }));
      chip.addEventListener('click', () => { audio.sfx('ui_click'); read(chip, s); });
      chip.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') read(chip, s); });
      skills.append(chip);
    }
    // one calling: say what it does straight away; several: say how to read them
    const only = SKILLS.filter((s) => level.skills[s] !== undefined);
    if (only.length === 1) read(skills.firstElementChild as HTMLElement, only[0]);
    else desc.textContent = matchMedia('(hover: none)').matches ? 'Tap a calling to read what it does.' : 'Point at a calling to read what it does.';
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
    const records = levelRecords(this.save, level);
    // the player's best run, if it still replays on this version of the level
    const best = bestWeave(this.save, level);
    let watch: HTMLButtonElement | null = null;
    if (best) {
      watch = el('button', { class: 'btn', text: 'Watch your best', title: `Saved ${best.saved} with ${best.used} calling${best.used === 1 ? '' : 's'}` });
      watch.addEventListener('click', () => { audio.sfx('ui_click'); this.playLevel(level, 'vision', best.w); });
    }
    this.openModal(el('div', { class: 'panel modal intro' },
      el('div', { class: 'kicker', text: `${realm?.name ?? ''} · ${level.boss ? 'Guardian' : `Thread ${idx + 1}`}` }),
      el('h2', { text: level.name }),
      el('p', { class: 'flavor', text: level.intro }),
      level.idea ? el('p', { class: 'idea', text: level.idea }) : null,
      el('div', { class: 'goals' },
        el('div', { class: `goal${mask & 1 ? ' got' : ''}` }, pixelCanvas(this.art.icons[mask & 1 ? 'star' : 'star_empty'], 2, 'px icon'), el('span', { text: level.boss ? `Defeat the guardian, save ${level.quota}` : `Save ${level.quota} of ${level.wyrdlings}` })),
        el('div', { class: `goal${mask & 2 ? ' got' : ''}` }, pixelCanvas(this.art.icons[mask & 2 ? 'star' : 'star_empty'], 2, 'px icon'), el('span', { text: `Save ${level.target}` })),
        level.entities.some((e) => e.type === 'spindle')
          ? el('div', { class: `goal${mask & 4 ? ' got' : ''}` }, pixelCanvas(this.art.icons[mask & 4 ? 'star' : 'star_empty'], 2, 'px icon'), el('span', { text: 'Find the Golden Spindle' }))
          : null,
      ),
      // once cleared: the player's records against Skuld's par (before that, the level speaks for itself)
      records ? this.recordsTable(level, records, null) : null,
      skills, desc,
      el('div', { class: 'row' }, look, watch, begin),
    ));
  }

  private results(r: PlayResult): void {
    const level = this.current;
    if (!level || !this.scene) return;
    if (this.scene.cfg.mode === 'vision') {
      const own = this.scene.cfg.replay;
      const shared = !!own && own === this.shared;
      const tier = this.scene.cfg.visionTier ?? 4;
      const text = own
        ? `${shared ? 'This' : 'Your'} weave saved ${r.saved} of ${level.wyrdlings} with ${r.skillsUsed} calling${r.skillsUsed === 1 ? '' : 's'}${this.scene.replayDesync ? ', but it went out of step with the recording' : ''}.`
        : tier < 4 ? VISION_FADES[tier as 1 | 2 | 3] : `Skuld's path saved ${r.saved} of ${level.wyrdlings}. Now weave it yourself.`;
      // a shared Weave can be watched on a level not yet open; playing it waits for the level to open
      const playable = !shared || isUnlocked(this.save, level.id);
      const buttons: [string, () => void, boolean?][] = [playable ? [own ? 'Play' : 'Try it', () => this.playLevel(level), true] : ['To the title', () => this.showTitle(), true]];
      if (!own && tier < 4) buttons.push(['Show more', () => this.playLevel(level, 'vision', undefined, (tier + 1) as VisionTier)]);
      buttons.push(['Watch again', () => this.playLevel(level, 'vision', own, own ? undefined : tier)], ['Map', () => this.showMap()]);
      this.openModal(el('div', { class: 'panel modal results' }, el('h2', { text: own ? 'Woven again' : 'The Vision fades' }),
        el('p', { text }), this.row(buttons)));
      return;
    }
    const sealed = REALM_LIST.map((_, i) => !realmUnlocked(this.save, i));
    const out = recordOutcome(this.save, {
      levelId: level.id, saved: r.saved, quota: level.quota, target: level.target, spindle: r.spindle, bossDefeated: r.bossDefeated,
    });
    // records (and the best run to watch) come only from the Weave replayed headless to this very result
    const claimed: RunFacts = { saved: r.saved, used: r.skillsUsed, ticks: r.ticks, spindle: r.spindle, bossDefeated: r.bossDefeated };
    const rec = r.weave ? offerRecords(this.save, level, r.weave, claimed) : { facts: null, set: [] };
    if (r.weave && rec.facts) offerWeave(this.save, level, r.weave, rec.facts);
    writeSave(this.save);
    const l = levelStats(this.stats, level.id);
    if (!this.attemptCounted) l.attempts++;
    this.attemptCounted = true;
    if (this.scene.log) logFinish(this.stats, level.id, this.scene.log, (out.mask & 1) === 1, r.weave);
    const won = (out.mask & 1) === 1;
    audio.stinger(won ? 'victory' : 'defeat');
    const unsealed = REALM_LIST.filter((_, i) => sealed[i] && realmUnlocked(this.save, i));
    // a realm opening gets its own fanfare, once the victory one (two bars at 120 bpm) is over
    if (unsealed.length) this.unlockTimer = window.setTimeout(() => audio.stinger('unlock'), 4100);
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
    // Next: the following level, or else the first open one not yet cleared after it (wrapping round,
    // so a level skipped earlier is still offered)
    const at = ALL_LEVELS.indexOf(level);
    const following = ALL_LEVELS[at + 1];
    const next = following && isUnlocked(this.save, following.id) ? following
      : [...ALL_LEVELS.slice(at + 1), ...ALL_LEVELS.slice(0, at)].find((l) => isUnlocked(this.save, l.id) && !((this.save.stars[l.id] ?? 0) & 1));
    const buttons: [string, () => void, boolean?][] = [];
    // the very first clear, before the map was ever seen: the map comes next, to show what it opened
    const mapFirst = won && (out.newMask & 1) === 1 && !this.save.seen.includes('map');
    if (mapFirst) buttons.push(['To the map', () => this.showMap(), true]);
    else if (won && next) buttons.push(['Next', () => this.playLevel(next), true]);
    const scene = this.scene;
    buttons.push(['Rewind', () => { if (scene.reopen()) this.closeModal(); }, !won]);
    buttons.push(['Retry', () => this.playLevel(level)]);
    if (!won) buttons.push(["Skuld's Vision", () => this.playLevel(level, 'vision')]);
    if (!mapFirst) buttons.push(['Map', () => this.showMap()]);
    // saved, callings and time sit in the records table, against the player's records and Skuld's par
    const lines = [el('div', { class: 'stat' }, el('span', { text: 'Needed' }), el('b', { text: `${level.quota}` }))];
    if (r.rewinds) lines.push(el('div', { class: 'stat' }, el('span', { text: 'Rewinds' }), el('b', { text: `${r.rewinds} (free!)` })));
    if (out.threads) lines.push(el('div', { class: 'stat gain' }, el('span', { text: 'Threads earned' }), el('b', { text: `+${out.threads}` })));
    for (const r of unsealed) lines.push(el('div', { class: 'stat gain' }, el('span', { text: 'Realm unsealed' }), el('b', { class: 'name', text: r.name })));
    for (const id of out.opened) {
      const l = ALL_LEVELS.find((x) => x.id === id);
      if (l) lines.push(el('div', { class: 'stat gain' }, el('span', { text: 'Now open' }), el('b', { class: 'name', text: l.name })));
    }
    const missed = el('div', { class: 'goals missed' });
    for (const t of missedStars(level, r, out.mask)) {
      missed.append(el('div', { class: 'goal' }, pixelCanvas(this.art.icons.star_empty, 2, 'px icon'), el('span', { text: t })));
    }
    // sharing: a spoiler-free result for anyone, and the replay itself for those who want to watch it
    const base = gameUrl(location);
    const box = el('textarea', { class: 'copy-box', readonly: true, 'aria-label': 'Text to copy' });
    const copyResult = el('button', { class: 'btn small', text: 'Copy result' });
    copyResult.addEventListener('click', () => { audio.sfx('ui_click'); copyOut(resultText(level, { saved: r.saved, used: r.skillsUsed }, out.mask, base), copyResult, box); });
    const share = el('div', { class: 'row share' }, copyResult);
    // only a run that replays true is worth a link
    if (r.weave && rec.facts) {
      const w = r.weave;
      const copyLink = el('button', { class: 'btn small', text: 'Copy replay link' });
      copyLink.addEventListener('click', () => { audio.sfx('ui_click'); copyOut(shareUrl(base, w), copyLink, box); });
      share.append(copyLink);
    }
    this.openModal(el('div', { class: `panel modal results ${won ? 'won' : 'lost'}` },
      el('h2', { text: won ? (level === ALL_LEVELS[ALL_LEVELS.length - 1] ? 'The Threads Are Whole!' : level.boss ? 'The Guardian Falls!' : 'Threads Rewoven!') : 'Fate Unravelled' }),
      won && level === ALL_LEVELS[ALL_LEVELS.length - 1] ? el('p', { class: 'flavor', text: 'Surtr\u2019s fire gutters out. The Wyrdlings are home, and the Norns weave on.' }) : null,
      stars,
      missed.childElementCount ? missed : null,
      this.recordsTable(level, levelRecords(this.save, level), { facts: rec.facts ?? claimed, set: rec.set, verified: !!rec.facts }),
      el('div', { class: 'stats' }, ...lines),
      won ? null : el('p', { class: 'flavor', text: 'No harm done. Rewind to where it went wrong, or watch Skuld’s Vision for one path that works.' }),
      this.row(buttons), share, box));
  }

  /**
   * Saved, callings and time: this run (if any), the player's records, Skuld's par (what the scripted
   * solution does), and under them a small histogram of the player's own past clears with this run (gold)
   * and the par (teal) marked. A record this run set is flagged where it stands.
   */
  private recordsTable(level: LevelDef, rec: LevelRecords | null, run: { facts: RunFacts; set: RecordKey[]; verified: boolean } | null): HTMLElement {
    const par = skuldPar(level);
    const fmt = (k: RecordKey, v: number) => (k === 'ticks' ? fmtTicks(v) : String(v));
    const t = el('div', { class: 'records' }, el('span', { class: 'rh' }),
      el('span', { class: 'rh', text: 'Saved' }), el('span', { class: 'rh', text: 'Callings' }), el('span', { class: 'rh', text: 'Time' }));
    const row = (label: string, cls: string, cells: HTMLElement[]) => t.append(el('span', { class: `rl ${cls}`, text: label }), ...cells);
    // each count also carries its unit, shown where short screens drop the header row
    const cell = (cls: string, k: RecordKey, n: number, tag: HTMLElement | null = null) => el('b', { class: cls },
      k === 'saved' && cls === 'now' ? `${n}/${level.wyrdlings}` : fmt(k, n),
      k === 'ticks' ? null : el('span', { class: 'unit', text: k === 'saved' ? ' saved' : n === 1 ? ' calling' : ' callings' }), tag);
    if (run) {
      const f = run.facts;
      row('This run', 'now', RECORD_KEYS.map((k) => cell('now', k, f[k], run.set.includes(k) ? el('i', { class: 'new', text: 'best' }) : null)));
    }
    // the records row says something only where the best is not this very run
    if (rec && !(run && run.set.length === RECORD_KEYS.length)) row('Your best', 'best', RECORD_KEYS.map((k) => cell('best', k, rec[k][k])));
    row("Skuld's par", 'par', RECORD_KEYS.map((k) => cell('par', k, par[k])));
    if (rec && run && rec.runs.length > 1) {
      // this run is marked only if it is one of the clears
      const now = run.verified && run.facts.saved >= level.quota && run.facts.bossDefeated !== false ? run.facts : null;
      row(`Your ${rec.runs.length} clears`, 'hist-l', RECORD_KEYS.map((k, i) => this.histogramEl(rec.runs.map((x) => x[i]), now ? now[k] : null, par[k])));
    }
    if (run && !run.verified) t.append(el('p', { class: 'unverified', text: 'This run did not replay true, so it sets no records.' }));
    return t;
  }

  /** A tiny bar chart of the player's past clears: the bin this run falls in gold, the one Skuld's par falls in underlined teal. */
  private histogramEl(values: number[], now: number | null, par: number): HTMLElement {
    const all = [...values, par, ...(now === null ? [] : [now])];
    const { counts, bin } = histogram(values, Math.min(...all), Math.max(...all), 8);
    const top = Math.max(...counts);
    const box = el('span', { class: 'hist' });
    counts.forEach((c, i) => {
      const b = el('i', { class: `${now !== null && bin(now) === i ? 'now' : ''}${bin(par) === i ? ' par' : ''}` });
      b.style.height = `${c ? 3 + Math.round((c / top) * 13) : 1}px`;
      box.append(b);
    });
    return box;
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

  /** Whether the game was running when the pause menu first opened (kept across Settings and back). */
  private resumeOnClose = false;

  private pauseMenu(reopen = false): void {
    if (this.screen !== 'play' || !this.scene) { this.showMap(); return; }
    // Esc / the menu button with a dialog open acts like that dialog's own close action
    if (this.modal && !reopen) { this.modalDismiss?.(); return; }
    const scene = this.scene;
    if (!reopen) {
      this.resumeOnClose = !scene.paused && scene.state === 'play';
      if (this.resumeOnClose) scene.togglePause();
    }
    const level = this.current!;
    const resume = () => { this.closeModal(); if (this.resumeOnClose && scene.paused) scene.togglePause(); };
    const buttons: [string, () => void, boolean?][] = [
      ['Resume', resume, true],
      ['Restart', () => this.playLevel(level)],
      ["Skuld's Vision", () => this.playLevel(level, 'vision')],
    ];
    const finish = () => { this.closeModal(); scene.cutThreads(); };
    // ending is always possible: a stalled or doomed run should never need a restart from the menu
    if (scene.state === 'play' && scene.cfg.mode === 'play') buttons.push(scene.sim.d.saved >= level.quota ? ['End level now', finish] : ['Cut the Threads (give up)', finish]);
    buttons.push(['Settings', () => this.settings(() => this.pauseMenu(true))], ['World map', () => this.showMap()]);
    const col = el('div', { class: 'col' });
    for (const [t, f, gold] of buttons) {
      const b = el('button', { class: `btn${gold ? ' gold' : ''}`, text: t });
      b.addEventListener('click', () => { audio.sfx('ui_click'); f(); });
      col.append(b);
    }
    this.openModal(el('div', { class: 'panel modal pause' }, el('h2', { text: 'Paused' }), el('p', { class: 'flavor', text: level.name }), col), resume);
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
    for (const key of ['foresight'] as const) {
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
        pixelCanvas(this.art.icons.eye, 3, 'px icon'),
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
    const toggle = (label: string, v: boolean, f: (v: boolean) => void, title?: string) => {
      const i = el('input', { type: 'checkbox' });
      i.checked = v;
      i.addEventListener('change', () => f(i.checked));
      return el('label', { class: 'set', title }, el('span', { text: label }), i);
    };
    const zoom = el('select', {});
    for (const [v, t] of [[-1, 'Far'], [0, 'Normal'], [1, 'Close'], [2, 'Closer']] as const) {
      const o = el('option', { value: v, text: t });
      if (s.zoom === v) o.selected = true;
      zoom.append(o);
    }
    zoom.addEventListener('change', () => { s.zoom = Number(zoom.value); this.p.zoomOffset = s.zoom; this.resize(); writeSave(this.save); });
    const rewind = el('select', {});
    for (const [v, t] of [['hold', 'Hold'], ['toggle', 'Toggle']] as const) {
      const o = el('option', { value: v, text: t });
      if (s.rewindToggle === (v === 'toggle')) o.selected = true;
      rewind.append(o);
    }
    rewind.addEventListener('change', () => {
      s.rewindToggle = rewind.value === 'toggle';
      if (this.scene) this.scene.cfg.rewindToggle = s.rewindToggle;
      writeSave(this.save);
    });
    const palette = el('select', {});
    for (const [v, t] of [['classic', 'Red / green'], ['cvd', 'Blue / orange']] as const) {
      const o = el('option', { value: v, text: t });
      if (s.palette === v) o.selected = true;
      palette.append(o);
    }
    palette.addEventListener('change', () => {
      s.palette = palette.value === 'cvd' ? 'cvd' : 'classic';
      this.applyPalette(s.palette);
      writeSave(this.save);
    });
    const text = el('select', { 'aria-label': 'Text size' });
    for (const v of TEXT_SIZES) {
      const o = el('option', { value: v, text: `${Math.round(v * 100)}%` });
      if (s.textSize === v) o.selected = true;
      text.append(o);
    }
    text.addEventListener('change', () => { s.textSize = Number(text.value); this.applyDisplay(); writeSave(this.save); });
    const reach = el('input', { type: 'range', min: TOUCH_REACH.min, max: TOUCH_REACH.max, step: 1, value: clampReach(s.touchReach), 'aria-label': 'Touch reach' });
    const reachVal = el('span', { class: 'val', text: String(clampReach(s.touchReach)) });
    reach.addEventListener('input', () => {
      s.touchReach = Number(reach.value);
      reachVal.textContent = reach.value;
      if (this.scene) this.scene.cfg.touchReach = s.touchReach;
    });
    const done = el('button', { class: 'btn gold', text: 'Done' });
    const close = () => { writeSave(this.save); this.closeModal(); back?.(); };
    done.addEventListener('click', () => { audio.sfx('ui_click'); close(); });
    const keys = el('button', { class: 'btn', text: 'Keys' });
    keys.addEventListener('click', () => { audio.sfx('ui_click'); writeSave(this.save); this.keysPanel(() => this.settings(back)); });
    const fs = el('button', { class: 'btn', text: 'Fullscreen' });
    fs.addEventListener('click', () => { void document.documentElement.requestFullscreen?.().catch(() => undefined); });
    const reset = el('button', { class: 'btn danger', text: 'Erase progress' });
    let armed = false;
    reset.addEventListener('click', () => {
      // two-step confirmation in the page itself (browser dialogs are not always available)
      if (!armed) { armed = true; reset.textContent = 'Tap again to erase'; audio.sfx('ui_deny'); return; }
      try { localStorage.removeItem('norns.save.v1'); } catch { /* ignore */ }
      eraseStats();
      // the page is going away: the attempt on screen must not write its stats back
      this.scene = null;
      location.reload();
    });
    // the playtest log leaves the device only this way: copied, by the player, to paste where they like
    const copy = el('button', { class: 'btn', text: 'Copy playtest report' });
    const copied = el('textarea', { class: 'copy-box', readonly: true, 'aria-label': 'Playtest report' });
    copy.addEventListener('click', () => {
      audio.sfx('ui_click');
      const scene = this.scene;
      if (scene?.log) scene.log.foldInto(levelStats(this.stats, scene.cfg.level.id));
      writeStats(this.stats);
      copyOut(playtestReport(this.stats, ALL_LEVELS, this.save.stars,
        { w: window.innerWidth, h: window.innerHeight, touch: matchMedia('(any-pointer: coarse)').matches }), copy, copied);
    });
    // two columns side by side on short (landscape phone) screens, one under the other elsewhere
    this.openModal(el('div', { class: 'panel modal settings' },
      el('h2', { text: 'Settings' }),
      el('div', { class: 'cols' },
        el('div', {},
          slider('Music', s.music, (v) => { s.music = v; audio.setVolumes({ music: v }); }),
          slider('Sound', s.sfx, (v) => { s.sfx = v; audio.setVolumes({ sfx: v }); audio.sfx('ui_click'); }),
          // the Wyrdlings' barks, apart from the other sounds: the first thing to turn down if they grate
          slider('Voices', s.voice, (v) => { s.voice = v; audio.setVolumes({ voice: v }); audio.sfx('bark_yay'); }),
          toggle('Tutorial hints', s.hints, (v) => { s.hints = v; if (this.scene) this.scene.cfg.hints = v; },
            'Level tips, and a word the first time something new happens'),
          el('label', { class: 'set' }, el('span', { text: 'Pixel zoom' }), zoom),
          el('label', { class: 'set', title: 'Hold: rewind while R or the rewind button is held. Toggle: press once to start, again to stop.' },
            el('span', { text: 'Rewind' }), rewind)),
        el('div', {},
          el('h3', { text: 'Assists' }),
          toggle("Skuld's Foresight", s.foresight, (v) => { s.foresight = v; if (this.scene) this.scene.cfg.foresight = v; }),
          toggle('Verdict', s.verdict, (v) => { s.verdict = v; if (this.scene) this.scene.cfg.verdict = v; },
            'While paused with a calling armed: what the hovered Wyrdling\'s calling comes to if you do nothing more'),
          toggle('Clear Sight', s.clearSight, (v) => { s.clearSight = v; if (this.scene) this.scene.cfg.clearSight = v; },
            'Always show only what the physics cares about: flat light, gate wiring, timers, terrain by kind. Hold C to see it any time.'),
          el('label', { class: 'set', title: 'Colours for doomed and saved fates. Their thread patterns (dashes, dots, diamonds) differ in either.' },
            el('span', { text: 'Fate colours' }), palette),
          el('h3', { text: 'Access' }),
          toggle('Reduce motion', s.reduceMotion, (v) => {
            s.reduceMotion = v;
            this.applyDisplay();
            if (this.scene) { this.scene.cfg.reduceMotion = v; this.scene.settingsChanged(); }
          }, 'No screen shake or flashes, a still backdrop, calmer menus'),
          el('label', { class: 'set' }, el('span', { text: 'Text size' }), text),
          el('label', { class: 'set', title: 'How close a finger must land to a Wyrdling to pick it' },
            el('span', { text: 'Touch reach' }), el('span', { class: 'range' }, reach, reachVal)))),
      el('div', { class: 'row' }, keys, fs, copy, reset),
      copied,
      el('div', { class: 'row' }, done)), close);
  }

  /** Settings → Keys: rebind the callings' slots, pause, rewind, speed, Foresight and the tick steps. Press a
   *  key's button, then the new key; a key already in use moves over (and the action that had it takes the
   *  old one if it would be left with none). */
  private keysPanel(back: () => void): void {
    const keys = this.save.settings.keys;
    let capturing: { a: KeyAction; b: HTMLButtonElement } | null = null;
    const note = el('p', { class: 'flavor keys-note', role: 'status',
      text: 'Fixed: Esc (put away, menu) · arrows / WASD (camera, unless bound here) · Q (look further) · + − (zoom) · Shift with a step (a second)' });
    const grid = el('div', { class: 'keys-grid' });
    const buttons = new Map<KeyAction, HTMLButtonElement>();
    const changed = () => {
      writeSave(this.save);
      this.scene?.settingsChanged();
      // the title screen's line on the keys, if it is under the dialog
      const foot = this.screenEl.querySelector('.title-screen .foot');
      if (foot) foot.textContent = this.keysLine();
      for (const [a, b] of buttons) { b.textContent = keysName(keys, a); b.setAttribute('aria-label', `${KEY_ACTIONS.find((k) => k.id === a)!.label}: ${keysName(keys, a)}`); }
    };
    const stop = () => {
      capturing?.b.classList.remove('listening');
      capturing = null;
    };
    for (const { id, label } of KEY_ACTIONS) {
      const b = el('button', { class: 'btn small keybtn' });
      b.addEventListener('click', () => {
        audio.sfx('ui_click');
        stop();
        capturing = { a: id, b };
        b.classList.add('listening');
        b.textContent = 'Press a key…';
        note.textContent = `${label}: press the new key · Esc keeps ${keysName(keys, id)}`;
      });
      buttons.set(id, b);
      grid.append(el('span', { class: 'klabel', text: label }), b);
    }
    // ahead of the game's own key handling, and only while a button is listening
    const onKey = (e: KeyboardEvent) => {
      if (!grid.isConnected) { window.removeEventListener('keydown', onKey, true); return; }
      if (!capturing) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const { a } = capturing;
      const label = KEY_ACTIONS.find((k) => k.id === a)!.label;
      if (e.code === 'Escape') { stop(); changed(); note.textContent = `${label} stays on ${keysName(keys, a)}`; return; }
      if (reservedKey(e.code)) { audio.sfx('ui_deny'); note.textContent = `${keyName(e.code)} keeps its own meaning: choose another key for ${label}`; return; }
      const other = bindKey(keys, a, e.code);
      stop();
      changed();
      audio.sfx('ui_click');
      const lost = other && KEY_ACTIONS.find((k) => k.id === other)!.label;
      // say where the action that gave up the key went
      note.textContent = `${label} → ${keyName(e.code)}${!other ? '' : keys[other].length ? ` · ${lost} → ${keysName(keys, other)}` : ` · ${lost} has no key now`}`;
    };
    window.addEventListener('keydown', onKey, true);
    changed();
    const reset = el('button', { class: 'btn', text: 'Reset keys' });
    reset.addEventListener('click', () => {
      audio.sfx('ui_click');
      stop();
      Object.assign(keys, defaultKeys());
      changed();
      note.textContent = 'Keys are back to their defaults.';
    });
    const done = el('button', { class: 'btn gold', text: 'Back' });
    const close = () => { stop(); window.removeEventListener('keydown', onKey, true); this.closeModal(); back(); };
    done.addEventListener('click', () => { audio.sfx('ui_back'); close(); });
    this.openModal(el('div', { class: 'panel modal settings keys' }, el('h2', { text: 'Keys' }), grid, note, el('div', { class: 'row' }, reset, done)), close);
  }

  // ------------------------------------------------------------------ modal

  /** What closing the open dialog means (backdrop click, Esc); null = it can only be closed by its buttons. */
  private modalDismiss: (() => void) | null = null;

  private openModal(content: HTMLElement, onDismiss?: () => void): void {
    this.closeModal();
    // a toggled rewind has no release to stop it: left running behind a dialog it would unspool the run
    // to its first tick unseen, and Timeline.back() drops every newer snapshot
    this.scene?.setRewind(false);
    const m = el('div', { class: 'modal-back' }, content);
    // story, intro and results cards must not vanish on a stray click; pause and settings close to a safe state
    if (onDismiss) m.addEventListener('pointerdown', (e) => { if (e.target === m) onDismiss(); });
    m.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.modal = m;
    this.modalDismiss = onDismiss ?? null;
    this.ui.append(m);
  }

  private closeModal(): void {
    this.modal?.remove();
    this.modal = null;
    this.modalDismiss = null;
  }
}

/** Why each star this run did not earn was missed, e.g. 'Target 10: saved 8'. */
function missedStars(level: LevelDef, r: PlayResult, mask: number): string[] {
  const out: string[] = [];
  const won = (mask & 1) === 1;
  const lostBy = r.saved < level.quota ? 'the quota was missed' : 'the guardian still stands';
  if (!won) {
    if (r.saved < level.quota) out.push(`Quota ${level.quota}: saved ${r.saved}`);
    if (r.bossDefeated === false) out.push('Guardian: still standing');
  }
  if (!(mask & 2)) out.push(r.saved < level.target ? `Target ${level.target}: saved ${r.saved}` : `Target ${level.target}: reached, but ${lostBy}`);
  if (level.entities.some((e) => e.type === 'spindle') && !(mask & 4)) {
    out.push(r.spindle ? `Golden Spindle: found, but ${lostBy}` : 'Golden Spindle: not collected');
  }
  return out;
}

function clampReach(v: number): number {
  return Number.isFinite(v) ? Math.max(TOUCH_REACH.min, Math.min(TOUCH_REACH.max, Math.round(v))) : TOUCH_REACH.def;
}

/** Copy text to the clipboard; with no clipboard (an insecure page, a refusal) show it in `box` to copy by hand. */
function copyOut(text: string, btn: HTMLElement, box: HTMLTextAreaElement): void {
  const show = (msg: string) => {
    btn.textContent = msg;
    box.value = text;
    box.style.display = msg === 'Copied' ? 'none' : 'block';
    if (msg !== 'Copied') box.select();
  };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => show('Copied'), () => show('Select and copy below'));
  else show('Select and copy below');
}

export { starCount };
