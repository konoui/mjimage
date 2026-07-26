import { BLOCK, TYPE, OP, Type, INPUT_SEPARATOR } from "../core";
import {
  Tile,
  Parser,
  BlockPon,
  BlockChi,
  BlockShoKan,
  BlockAnKan,
  BlockDaiKan,
  Block,
  BlockHand,
  is5Tile,
} from "../core/parser";
import { assert } from "../assert";
import { forHand } from "./tile";

export type TupleOfSize<
  T,
  N extends number,
  R extends unknown[] = [],
> = R["length"] extends N ? R : TupleOfSize<T, N, [T, ...R]>;

export interface HandData {
  [TYPE.M]: TupleOfSize<number, 10>;
  [TYPE.S]: TupleOfSize<number, 10>;
  [TYPE.P]: TupleOfSize<number, 10>;
  [TYPE.Z]: TupleOfSize<number, 8>;
  [TYPE.BACK]: [string, number];
  called: readonly (
    | BlockChi
    | BlockPon
    | BlockAnKan
    | BlockDaiKan
    | BlockShoKan
  )[];
  tsumo: Tile | null;
  reached: boolean;
}

export class Hand {
  protected data: HandData;
  constructor(input: string | readonly Block[], allowBackBlock = false) {
    this.data = {
      [TYPE.M]: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [TYPE.P]: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [TYPE.S]: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [TYPE.Z]: [0, 0, 0, 0, 0, 0, 0, 0],
      [TYPE.BACK]: ["untouchable", 0],
      called: [],
      reached: false,
      tsumo: null,
    };
    this.init(input, allowBackBlock);
  }
  private init(input: string | readonly Block[], allowBackBlock: boolean) {
    const blocks =
      typeof input === "string" ? new Parser(input).parse() : input;
    for (const b of blocks) {
      if (b.isCalled()) {
        this.data.called = [...this.called, b];
        continue;
      } else if (b.is(BLOCK.TSUMO)) {
        const t = b.tiles[0];
        this.inc([t]);
        this.data.tsumo = t;
        continue;
      } else if (b.is(BLOCK.HAND)) {
        this.inc(b.tiles);
        continue;
      } else if (
        typeof input === "string" &&
        input.split("").every((v) => v === TYPE.BACK)
      ) {
        this.inc(b.tiles);
        continue;
      } else if (allowBackBlock) {
        this.inc(b.tiles);
        continue;
      }
      throw new Error(`unexpected block ${b.type} ${b.toString()}`);
    }
  }
  /**
   * 手の内の牌の配列を返す。晒された牌は含まれない。
   */
  get hands() {
    const tiles: Tile[] = [];
    for (const [t, n] of forHand()) {
      let count = this.get(t, n);
      if (t != TYPE.Z && n == 5 && this.get(t, 0) > 0) {
        count -= this.get(t, 0); // for red
        tiles.push(new Tile(t, n, [OP.RED]));
      }
      for (let i = 0; i < count; i++) {
        tiles.push(new Tile(t, n));
      }
    }
    if (this.drawn != null) {
      const drawn = this.drawn;
      const idx = tiles.findIndex(
        (t) => t.equals(drawn) && drawn.has(OP.RED) == t.has(OP.RED),
      );
      assert(
        idx >= 0,
        `drawn tile ${this.drawn} not found in hand: ${tiles.join("")}`,
      );
      tiles[idx] = tiles[idx].clone({ add: OP.TSUMO });
    }
    return tiles;
  }
  /**
   * 晒された牌を含む手牌を整形した文字列で返す。
   */
  toString() {
    const called =
      this.called.length > 0
        ? `${INPUT_SEPARATOR}${this.called.join(INPUT_SEPARATOR)}`
        : "";

    const tsumo = this.drawn
      ? `${INPUT_SEPARATOR}${this.drawn.toString()}`
      : "";

    const tiles = this.hands.filter((v) => !v.has(OP.TSUMO));
    const b = new BlockHand(tiles).toString();
    return `${b}${tsumo}${called}`;
  }
  /**
   * 晒したブロックの配列を返す。
   * 晒したブロック順となる。
   */
  get called() {
    return this.data.called;
  }
  /**
   * リーチ中かどうかを返す。
   */
  get reached() {
    return this.data.reached;
  }
  /**
   * ツモ牌を返す。打牌後は null を返す。
   */
  get drawn() {
    return this.data.tsumo;
  }
  /**
   * 面前かどうかを返す。
   */
  get menzen() {
    return !this.called.some((v) => !(v instanceof BlockAnKan));
  }
  /**
   * 手牌において、指定した牌の種類の合計枚数を返す
   */
  sum(type: Type) {
    return Array.from(forHand({ filterBy: [type] })).reduce(
      (sum, [t, n]) => sum + this.get(t, n),
      0,
    );
  }
  /**
   * 手牌において、牌の合計枚数を返す。
   * 赤のみを取得する場合は n に 0 を指定する。
   */
  get(t: Type, n: number) {
    if (t == TYPE.BACK) return this.data[t][1];
    return this.data[t][n];
  }
  /**
   * 指定した牌を手牌に加える。draw に比べプリミティブな操作となる。
   */
  inc(tiles: readonly Tile[]): readonly Tile[] {
    const backup: Tile[] = [];
    for (const t of tiles) {
      const isInvalidCount = t.t != TYPE.BACK && this.get(t.t, t.n) >= 4;
      const isInvalidRed = t.has(OP.RED) && this.get(t.t, 0) > 0;
      if (isInvalidCount || isInvalidRed) {
        this.dec(backup);
        const msg = isInvalidCount
          ? `tile ${t} exists more than 4 times`
          : `red tile ${t} appears more than once`;
        throw new Error(`invalid hand: ${msg} in hand: ${this.toString()}`);
      }

      backup.push(t);

      if (t.t == TYPE.BACK) this.data[t.t][1] += 1;
      else {
        this.data[t.t][t.n] += 1;
        if (t.has(OP.RED)) this.data[t.t][0] += 1;
      }
    }
    return backup;
  }
  /**
   * 指定した牌を手牌からなくす。discard に比べプリミティブな操作となる。
   */
  dec(tiles: readonly Tile[]): readonly Tile[] {
    const backup: Tile[] = [];
    for (const t of tiles) {
      const isInvalidCount = this.get(t.t, t.n) < 1;
      const isInvalidRed = t.has(OP.RED) && this.get(t.t, 0) <= 0;
      if (isInvalidCount || isInvalidRed) {
        this.inc(backup);
        const msg = isInvalidCount
          ? `tile ${t} does not exist`
          : `red tile ${t} does not exist`;
        throw new Error(`invalid hand: ${msg} in hand: ${this.toString()}`);
      }

      backup.push(t);

      if (t.t == TYPE.BACK) this.data[t.t][1] -= 1;
      else {
        this.data[t.t][t.n] -= 1;
        if (t.has(OP.RED)) this.data[t.t][0] -= 1;
      }

      // r5 ではなく 5 で減算される際に最後の牌が red であれば red を 0 にする。
      if (is5Tile(t) && this.get(t.t, 5) == 0 && this.get(t.t, 0) > 0) {
        this.data[t.t][0] = 0;
        const c = backup.pop()!.clone({ add: OP.RED });
        backup.push(c);
      }
    }

    return backup;
  }
  /**
   * ツモ牌として手牌に加える。
   */
  draw(t: Tile) {
    const ts = t.clone({ add: OP.TSUMO });
    this.inc([ts]);
    this.data.tsumo = ts;
    return;
  }
  /**
   * 打牌として手牌から捨てる
   */
  discard(t: Tile) {
    this.dec([t]);
    this.data.tsumo = null;
    return;
  }
  /**
   * リーチ宣言をする
   */
  reach() {
    if (!this.menzen) throw new Error("cannot declare reach due to called");
    if (this.data.reached) throw new Error("already declared reach");
    this.data.reached = true;
  }
  /**
   * 他家の打牌を指定したブロックで鳴く。鳴く牌はブロック内で表現する。
   */
  call(b: BlockPon | BlockChi | BlockDaiKan) {
    const toRemove = b.tiles.filter((v) => !v.has(OP.HORIZONTAL));
    if (toRemove.length != b.tiles.length - 1)
      throw new Error(`invalid block: removal tiles: ${toRemove}, block: ${b}`);

    this.dec(toRemove);
    // 末尾に追加する
    this.data.called = [...this.called, b];
    this.data.tsumo = null;
    return;
  }
  /**
   * ツモした牌を指定したブロックでカンする。鳴く牌はブロック内で表現する。
   */
  kan(b: BlockAnKan | BlockShoKan) {
    if (b instanceof BlockAnKan) {
      this.dec(b.tiles);
      this.data.called = [...this.called, b];
      this.data.tsumo = null;
      return;
    }

    if (b instanceof BlockShoKan) {
      const idx = this.data.called.findIndex(
        (v) => v.is(BLOCK.PON) && v.tiles[0].equals(b.tiles[0]),
      );
      if (idx == -1)
        throw new Error(
          `cannot find pon block ${b.tiles[0]} to call shokan: ${b}`,
        );
      let t = b.tiles[0];
      // 適当に選んだ牌が red であればエラーが発生しないように red を削除して dec する
      t = is5Tile(t) ? t.clone({ remove: OP.RED }) : t;
      this.dec([t]);
      // remove an existing pon block and add kakan block
      this.data.called = [
        ...this.called.slice(0, idx),
        ...this.called.slice(idx + 1),
        b,
      ];
      this.data.tsumo = null;
      return;
    }

    throw new Error(`unexpected block type ${b}`);
  }
  clone(): Hand {
    const c = new Hand(this.toString());
    c.data.reached = this.data.reached;
    return c;
  }
  /**
   * 現在の状態の写し。inc/dec が配列を直接書き換えるため、配列も複製する。
   */
  private snapshot(): HandData {
    const d = this.data;
    return {
      ...d,
      [TYPE.M]: [...d[TYPE.M]] as HandData[typeof TYPE.M],
      [TYPE.P]: [...d[TYPE.P]] as HandData[typeof TYPE.P],
      [TYPE.S]: [...d[TYPE.S]] as HandData[typeof TYPE.S],
      [TYPE.Z]: [...d[TYPE.Z]] as HandData[typeof TYPE.Z],
      [TYPE.BACK]: [...d[TYPE.BACK]] as HandData[typeof TYPE.BACK],
    };
  }
  /**
   * 手牌の状態を保ったまま fn を実行する。
   *
   * 計算器は探索の過程で手牌を破壊的に変更するため、その影響を呼び出し側へ漏らさない。
   * 入口で写しを取り、fn が例外で終わっても写しへ戻すので、
   * 呼び出し側から見れば計算器は手牌を読み取るだけの存在になる。
   */
  preserving<T>(fn: () => T): T {
    const snapshot = this.snapshot();
    try {
      return fn();
    } finally {
      this.data = snapshot;
    }
  }
}

/**
 * 牌を一時的に手牌から抜いた状態で計算する。
 *
 * 探索は手牌を破壊的に変更しながら進むため、途中で例外が飛ぶと手牌が壊れたまま残る。
 * 抜き差しを対にして必ず戻すことで、計算の失敗が呼び出し側の手牌に漏れないようにする。
 * fn には dec が返した牌（赤が解決済み）を渡す。
 */
export const withoutTiles = <T>(
  hand: Hand,
  tiles: readonly Tile[],
  fn: (removed: readonly Tile[]) => T,
): T => {
  const removed = hand.dec(tiles);
  try {
    return fn(removed);
  } finally {
    hand.inc(removed);
  }
};

/**
 * 牌を一時的に手牌へ加えた状態で計算する。withoutTiles の逆。
 */
export const withTiles = <T>(
  hand: Hand,
  tiles: readonly Tile[],
  fn: (added: readonly Tile[]) => T,
): T => {
  const added = hand.inc(tiles);
  try {
    return fn(added);
  } finally {
    hand.dec(added);
  }
};
