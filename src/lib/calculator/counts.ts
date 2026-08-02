import { OP, TYPE, Type, BlockHand, Tile, is5Tile } from "../core";
import { forHand } from "./tile";
import type { Hand } from "./hand";

/**
 * 牌の種類ごとの枚数。添字が牌の数字で、0 は赤牌の枚数を表す。
 * 裏牌は数字を持たないので、この形には入れない（TileStore.back / Counts.back）。
 */
export interface TileCounts {
  [TYPE.M]: number[];
  [TYPE.P]: number[];
  [TYPE.S]: number[];
  [TYPE.Z]: number[];
}

/**
 * 数字ごとに枚数を持つ牌の種類。裏牌以外の全て。
 */
export type CountedType = keyof TileCounts;

const COUNTED_TYPES: readonly CountedType[] = [TYPE.M, TYPE.P, TYPE.S, TYPE.Z];

/**
 * 書き換えられない枚数表。読み取りだけの受け渡しに使う。
 */
export type TileCountsView = {
  readonly [T in CountedType]: readonly number[];
};

/**
 * 空の枚数表を返す。添字が牌の数字なので、長さは最大の数字 + 1 となる。
 */
export const emptyTileCounts = (): TileCounts => ({
  [TYPE.M]: new Array<number>(10).fill(0),
  [TYPE.P]: new Array<number>(10).fill(0),
  [TYPE.S]: new Array<number>(10).fill(0),
  [TYPE.Z]: new Array<number>(8).fill(0),
});

/**
 * 枚数表の写しを返す。写した側を書き換えても元には響かない。
 */
export const cloneTileCounts = (counts: TileCountsView): TileCounts => ({
  [TYPE.M]: [...counts[TYPE.M]],
  [TYPE.P]: [...counts[TYPE.P]],
  [TYPE.S]: [...counts[TYPE.S]],
  [TYPE.Z]: [...counts[TYPE.Z]],
});

/**
 * 手牌の枚数表。探索の入力となる値。
 *
 * 計算器はこの値だけを見て探索する。手牌そのものには触れないため、
 * 計算が手牌を壊すことも、計算の途中経過が呼び出し側から観測できることもない。
 */
export interface Counts {
  readonly tiles: TileCountsView;
  /** 裏牌の枚数。牌の種類が分からないので数字ごとには持たない。 */
  readonly back: number;
  /** 晒した面子の数。 */
  readonly called: number;
}

/**
 * 手牌から枚数表の写しを取る。
 */
export const countsOf = (hand: Hand): Counts => {
  const tiles = emptyTileCounts();
  for (const t of COUNTED_TYPES) {
    const counts = tiles[t];
    // 添字 0（赤牌の枚数）も含めて写す
    for (let n = 0; n < counts.length; n++) counts[n] = hand.get(t, n);
  }
  return { tiles, back: hand.get(TYPE.BACK, 0), called: hand.called.length };
};

/**
 * 枚数表が表す牌の配列を返す。
 * 赤牌の枚数は 5 の枚数の内訳なので、その分だけ 5 を赤牌に置き換える。
 */
export const tilesOf = (counts: Omit<Counts, "called">): Tile[] => {
  const tiles: Tile[] = [];
  for (const [t, n] of forHand()) {
    let count = t == TYPE.BACK ? counts.back : counts.tiles[t][n];
    if (t != TYPE.BACK && t != TYPE.Z && n == 5 && counts.tiles[t][0] > 0) {
      count -= counts.tiles[t][0];
      tiles.push(new Tile(t, n, [OP.RED]));
    }
    for (let i = 0; i < count; i++) tiles.push(new Tile(t, n));
  }
  return tiles;
};

/**
 * 牌の枚数を持ち、増減できる入れ物。
 *
 * 対局中の手牌（Hand）と探索用の写し（MutableCounts）は、どちらも
 * 「手の内の牌が何枚あるか」を持ち、同じ規則で増減する。その規則をここに集約する。
 *
 * 赤牌は 5 の枚数の内訳として添字 0 に持つため、増減のたびに 5 と 0 のつじつまを
 * 合わせる必要がある。この扱いが 2 箇所にあると、片方だけ直したときに崩れる。
 */
export class TileStore {
  private readonly counts: TileCounts;
  private backCount: number;

  constructor(counts: TileCounts = emptyTileCounts(), back = 0) {
    this.counts = counts;
    this.backCount = back;
  }

  /**
   * 写しを返す。写した側を書き換えても元には響かない。
   */
  clone(): TileStore {
    return new TileStore(cloneTileCounts(this.counts), this.backCount);
  }

  get tiles(): TileCountsView {
    return this.counts;
  }

  /** 裏牌の枚数。 */
  get back(): number {
    return this.backCount;
  }

  /**
   * 指定した牌の枚数を返す。赤のみを取得する場合は n に 0 を指定する。
   */
  get(t: Type, n: number): number {
    if (t == TYPE.BACK) return this.backCount;
    return this.counts[t][n];
  }

  /**
   * 指定した牌の種類の合計枚数を返す。赤は 5 の枚数に含まれるので二重には数えない。
   */
  sum(t: Type): number {
    if (t == TYPE.BACK) return this.backCount;
    const counts = this.counts[t];
    let sum = 0;
    for (let n = 1; n < counts.length; n++) sum += counts[n];
    return sum;
  }

  toString() {
    return new BlockHand(tilesOf(this)).toString();
  }

  /**
   * 牌を加える。加えた牌を返すので、そのまま dec に渡せば元に戻せる。
   * 途中で弾かれた場合は、それまでに加えた分を戻してから投げる。
   */
  inc(tiles: readonly Tile[]): readonly Tile[] {
    const added: Tile[] = [];
    for (const t of tiles) {
      const isInvalidCount = t.t != TYPE.BACK && this.get(t.t, t.n) >= 4;
      const isInvalidRed = t.has(OP.RED) && this.get(t.t, 0) > 0;
      if (isInvalidCount || isInvalidRed) {
        this.dec(added);
        const msg = isInvalidCount
          ? `tile ${t} exists more than 4 times`
          : `red tile ${t} appears more than once`;
        throw new Error(`invalid hand: ${msg} in hand: ${this}`);
      }

      added.push(t);

      if (t.t == TYPE.BACK) {
        this.backCount += 1;
        continue;
      }

      const counts = this.counts[t.t];
      counts[t.n] += 1;
      if (t.has(OP.RED)) counts[0] += 1;
    }
    return added;
  }

  /**
   * 牌をなくす。なくした牌を返すので、そのまま inc に渡せば元に戻せる。
   * 途中で弾かれた場合は、それまでになくした分を戻してから投げる。
   */
  dec(tiles: readonly Tile[]): readonly Tile[] {
    const removed: Tile[] = [];
    for (const t of tiles) {
      const isInvalidCount = this.get(t.t, t.n) < 1;
      const isInvalidRed = t.has(OP.RED) && this.get(t.t, 0) <= 0;
      if (isInvalidCount || isInvalidRed) {
        this.inc(removed);
        const msg = isInvalidCount
          ? `tile ${t} does not exist`
          : `red tile ${t} does not exist`;
        throw new Error(`invalid hand: ${msg} in hand: ${this}`);
      }

      removed.push(t);

      if (t.t == TYPE.BACK) {
        this.backCount -= 1;
        continue;
      }

      const counts = this.counts[t.t];
      counts[t.n] -= 1;
      if (t.has(OP.RED)) counts[0] -= 1;

      // r5 ではなく 5 で減算される際に最後の牌が red であれば red を 0 にする。
      // 戻すときに赤が復元できるよう、返す牌の方を赤にしておく。
      if (is5Tile(t) && counts[5] == 0 && counts[0] > 0) {
        counts[0] = 0;
        removed[removed.length - 1] = t.clone({ add: OP.RED });
      }
    }
    return removed;
  }
}

/**
 * 探索が専有する作業用の枚数表。
 *
 * 探索は牌を抜き差ししながら進むが、書き換えるのはこの写しだけで、
 * 元の手牌にも Counts にも影響しない。
 * 抜き差しは without / with で必ず対にするため、呼び出しの前後で内容は変わらない。
 */
export class MutableCounts implements Counts {
  private readonly store: TileStore;
  readonly called: number;

  private constructor(counts: Counts) {
    this.store = new TileStore(cloneTileCounts(counts.tiles), counts.back);
    this.called = counts.called;
  }

  static from(counts: Counts) {
    return new MutableCounts(counts);
  }

  static of(hand: Hand) {
    return new MutableCounts(countsOf(hand));
  }

  get tiles(): TileCountsView {
    return this.store.tiles;
  }

  get back() {
    return this.store.back;
  }

  /**
   * 指定した牌の枚数を返す。赤のみを取得する場合は n に 0 を指定する。
   */
  get(t: Type, n: number): number {
    return this.store.get(t, n);
  }

  /**
   * 指定した牌の種類の合計枚数を返す。赤は 5 の枚数に含まれるので二重には数えない。
   */
  sum(t: Type): number {
    return this.store.sum(t);
  }

  /**
   * 牌を一時的に抜いた状態で fn を実行する。
   * fn には赤が解決された牌（例: 最後の 5 が赤であれば r5）を渡す。
   */
  without<T>(tiles: readonly Tile[], fn: (removed: readonly Tile[]) => T): T {
    const removed = this.store.dec(tiles);
    try {
      return fn(removed);
    } finally {
      this.store.inc(removed);
    }
  }

  /**
   * 牌を一時的に加えた状態で fn を実行する。without の逆。
   */
  with<T>(tiles: readonly Tile[], fn: (added: readonly Tile[]) => T): T {
    const added = this.store.inc(tiles);
    try {
      return fn(added);
    } finally {
      this.store.dec(added);
    }
  }

  toString() {
    return this.store.toString();
  }
}
