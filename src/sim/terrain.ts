// Chunked copy-on-write pixel terrain. Cloning is O(chunks) reference copies, so foresight
// (simulate ahead on a clone) and rewind (ring buffer of clones) are cheap. Writes copy a chunk
// the first time it is touched after a clone.

export const CS_SHIFT = 5;
export const CS = 1 << CS_SHIFT; // 32
const CS_MASK = CS - 1;

export class Terrain {
  readonly w: number;
  readonly h: number;
  readonly cw: number;
  readonly ch: number;
  chunks: Uint8Array[];
  /** 1 = this terrain exclusively owns chunk i and may write in place */
  owned: Uint8Array;
  /** bumped on every in-place write; renderers compare (chunk identity, version) to find changes */
  vers: Uint32Array;
  /** static back-wall flags (never modified after build) shared by all clones */
  readonly backWall: Uint8Array;

  constructor(w: number, h: number, backWall?: Uint8Array) {
    this.w = w;
    this.h = h;
    this.cw = (w + CS - 1) >> CS_SHIFT;
    this.ch = (h + CS - 1) >> CS_SHIFT;
    const n = this.cw * this.ch;
    this.chunks = new Array(n);
    for (let i = 0; i < n; i++) this.chunks[i] = new Uint8Array(CS * CS);
    this.owned = new Uint8Array(n).fill(1);
    this.vers = new Uint32Array(n);
    this.backWall = backWall ?? new Uint8Array(w * h);
  }

  /** Material at (x,y). Outside the left/right edges → IRON-like wall (3); above the top / below the bottom → air. */
  get(x: number, y: number): number {
    if (y < 0 || y >= this.h) return 0;
    if (x < 0 || x >= this.w) return 3;
    return this.chunks[(y >> CS_SHIFT) * this.cw + (x >> CS_SHIFT)][((y & CS_MASK) << CS_SHIFT) | (x & CS_MASK)];
  }

  /** Raw in-bounds read without edge rules (caller guarantees bounds). */
  getRaw(x: number, y: number): number {
    return this.chunks[(y >> CS_SHIFT) * this.cw + (x >> CS_SHIFT)][((y & CS_MASK) << CS_SHIFT) | (x & CS_MASK)];
  }

  set(x: number, y: number, m: number): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const ci = (y >> CS_SHIFT) * this.cw + (x >> CS_SHIFT);
    const off = ((y & CS_MASK) << CS_SHIFT) | (x & CS_MASK);
    let c = this.chunks[ci];
    if (c[off] === m) return;
    if (!this.owned[ci]) {
      c = this.chunks[ci] = c.slice();
      this.owned[ci] = 1;
    }
    c[off] = m;
    this.vers[ci]++;
  }

  /** Writable array for chunk ci (copy-on-write); bumps its version. */
  writable(ci: number): Uint8Array {
    let c = this.chunks[ci];
    if (!this.owned[ci]) {
      c = this.chunks[ci] = c.slice();
      this.owned[ci] = 1;
    }
    this.vers[ci]++;
    return c;
  }

  clone(): Terrain {
    const t = Object.create(Terrain.prototype) as Terrain;
    (t as { w: number }).w = this.w;
    (t as { h: number }).h = this.h;
    (t as { cw: number }).cw = this.cw;
    (t as { ch: number }).ch = this.ch;
    (t as { backWall: Uint8Array }).backWall = this.backWall;
    t.chunks = this.chunks.slice();
    t.owned = new Uint8Array(this.chunks.length);
    t.vers = this.vers.slice();
    this.owned.fill(0); // now shared: both sides must copy before writing
    return t;
  }

  /** Copy whole contents into a flat array (row-major). */
  toFlat(out?: Uint8Array): Uint8Array {
    const a = out ?? new Uint8Array(this.w * this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) a[y * this.w + x] = this.getRaw(x, y);
    return a;
  }

  /** Stable content hash, used by determinism tests. */
  hash(): number {
    let h = 2166136261;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        h ^= this.getRaw(x, y);
        h = Math.imul(h, 16777619);
      }
    }
    return h >>> 0;
  }
}
