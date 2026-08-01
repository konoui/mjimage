import { OP, TYPE, Type } from "../core";
import { BlockHand, Tile, is5Tile } from "../core/parser";
import { forHand } from "./tile";
import type { Hand } from "./hand";

/**
 * 牌の種類ごとの枚数。添字が牌の数字で、0 は赤牌の枚数を表す。
 * 裏牌は数字を持たないので、この形には入れない（Counts.back / HandData.backCount）。
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
export const cloneTileCounts = (counts: TileCounts): TileCounts => ({
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
  readonly tiles: { readonly [T in CountedType]: readonly number[] };
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
export const tilesOf = (counts: Counts): Tile[] => {
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
 * 探索が専有する作業用の枚数表。
 *
 * 探索は牌を抜き差ししながら進むが、書き換えるのはこの写しだけで、
 * 元の手牌にも Counts にも影響しない。
 * 抜き差しは without / with で必ず対にするため、呼び出しの前後で内容は変わらない。
 */
export class MutableCounts implements Counts {
  readonly tiles: TileCounts;
  private backCount: number;
  readonly called: number;

  private constructor(counts: Counts) {
    const c = counts.tiles;
    this.tiles = {
      [TYPE.M]: [...c[TYPE.M]],
      [TYPE.P]: [...c[TYPE.P]],
      [TYPE.S]: [...c[TYPE.S]],
      [TYPE.Z]: [...c[TYPE.Z]],
    };
    this.backCount = counts.back;
    this.called = counts.called;
  }

  static from(counts: Counts) {
    return new MutableCounts(counts);
  }

  static of(hand: Hand) {
    return new MutableCounts(countsOf(hand));
  }

  get back() {
    return this.backCount;
  }

  /**
   * 指定した牌の枚数を返す。赤のみを取得する場合は n に 0 を指定する。
   */
  get(t: Type, n: number): number {
    if (t == TYPE.BACK) return this.backCount;
    return this.tiles[t][n];
  }

  /**
   * 指定した牌の種類の合計枚数を返す。赤は 5 の枚数に含まれるので二重には数えない。
   */
  sum(t: Type): number {
    if (t == TYPE.BACK) return this.backCount;
    const counts = this.tiles[t];
    let sum = 0;
    for (let n = 1; n < counts.length; n++) sum += counts[n];
    return sum;
  }

  /**
   * 牌を一時的に抜いた状態で fn を実行する。
   * fn には赤が解決された牌（例: 最後の 5 が赤であれば r5）を渡す。
   */
  without<T>(tiles: readonly Tile[], fn: (removed: readonly Tile[]) => T): T {
    const removed = this.dec(tiles);
    try {
      return fn(removed);
    } finally {
      this.inc(removed);
    }
  }

  /**
   * 牌を一時的に加えた状態で fn を実行する。without の逆。
   */
  with<T>(tiles: readonly Tile[], fn: (added: readonly Tile[]) => T): T {
    const added = this.inc(tiles);
    try {
      return fn(added);
    } finally {
      this.dec(added);
    }
  }

  toString() {
    return new BlockHand(tilesOf(this)).toString();
  }

  private dec(tiles: readonly Tile[]): readonly Tile[] {
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

      const counts = this.tiles[t.t];
      counts[t.n] -= 1;
      if (t.has(OP.RED)) counts[0] -= 1;

      // r5 ではなく 5 で減算される際に最後の牌が red であれば red を 0 にする。
      if (is5Tile(t) && counts[5] == 0 && counts[0] > 0) {
        counts[0] = 0;
        removed[removed.length - 1] = t.clone({ add: OP.RED });
      }
    }
    return removed;
  }

  private inc(tiles: readonly Tile[]): readonly Tile[] {
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

      const counts = this.tiles[t.t];
      counts[t.n] += 1;
      if (t.has(OP.RED)) counts[0] += 1;
    }
    return added;
  }
}
