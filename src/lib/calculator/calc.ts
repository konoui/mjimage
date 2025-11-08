import {
  BLOCK,
  TYPE,
  OP,
  Round,
  Wind,
  WIND,
  Type,
  createWindMap,
  INPUT_SEPARATOR,
} from "../core";
import {
  Tile,
  Parser,
  BlockPon,
  BlockChi,
  BlockShoKan,
  BlockAnKan,
  BlockDaiKan,
  BlockPair,
  Block,
  BlockIsolated,
  BlockThree,
  BlockRun,
  BlockHand,
  compareTiles,
  SerializedBlock,
  is5Tile,
} from "../core/parser";
import { roundWind } from "../core";
import { assert } from "../myassert";

export type TupleOfSize<
  T,
  N extends number,
  R extends unknown[] = []
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

/**
 * 全ての牌を順番に返すジェネレーター
 */
export function* forHand(options?: {
  skipBack?: boolean;
  filterBy?: readonly Type[];
}) {
  const types =
    options?.filterBy && options.filterBy.length > 0
      ? options?.filterBy
      : Object.values(TYPE);
  for (const t of types) {
    if (options?.skipBack && t == TYPE.BACK) continue;
    // Note: the value is related to data length of hand(data[type].length -1)
    const upper = t == TYPE.Z ? 7 : t == TYPE.BACK ? 1 : 9;
    for (let n = 1; n <= upper; n++) {
      yield [t, n] as const;
    }
  }
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
        (t) => t.equals(drawn) && drawn.has(OP.RED) == t.has(OP.RED)
      );
      assert(
        idx >= 0,
        `drawn tile ${this.drawn} not found in hand: ${tiles.join("")}`
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
      0
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
        (v) => v.is(BLOCK.PON) && v.tiles[0].equals(b.tiles[0])
      );
      if (idx == -1)
        throw new Error(
          `cannot find pon block ${b.tiles[0]} to call shokan: ${b}`
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
}

export class ShantenCalculator {
  hand: Hand;
  constructor(hand: Hand) {
    this.hand = hand;
  }
  /**
   * シャンテン数を返す。
   */
  calc() {
    return Math.min(
      this.sevenPairs(),
      this.thirteenOrphans(),
      this.standardType()
    );
  }
  /**
   * 七対子のシャンテン数を返す。
   */
  sevenPairs() {
    if (this.hand.called.length > 0) return Number.POSITIVE_INFINITY;
    let nPairs = 0;
    let nIsolated = 0;
    for (const [t, n] of forHand({ skipBack: true })) {
      if (this.hand.get(t, n) >= 2) nPairs++;
      if (this.hand.get(t, n) == 1) nIsolated++;
    }

    if (nPairs > 7) nPairs = 7;
    if (nPairs + nIsolated >= 7) nIsolated = 7 - nPairs;
    return 13 - 2 * nPairs - nIsolated;
  }

  /**
   * 国士無双のシャンテン数を返す。
   */
  thirteenOrphans() {
    if (this.hand.called.length > 0) return Number.POSITIVE_INFINITY;
    let nOrphans = 0;
    let nPairs = 0;
    for (const t of Object.values(TYPE)) {
      if (t == TYPE.BACK) continue;
      const nn = t == TYPE.Z ? NZ : N19;
      for (const n of nn) {
        if (this.hand.get(t, n) >= 1) nOrphans++;
        if (this.hand.get(t, n) >= 2) nPairs++;
      }
    }
    return nPairs >= 1 ? 12 - nOrphans : 13 - nOrphans;
  }

  /**
   * 標準形のシャンテン数を返す。
   */
  standardType() {
    const calc = (hasPair: boolean) => {
      // [set, pair, isolated]
      const z = [0, 0, 0];
      for (const [t, n] of forHand({ filterBy: [TYPE.Z] })) {
        if (this.hand.get(t, n) >= 3) z[0]++;
        else if (this.hand.get(t, n) == 2) z[1]++;
        else if (this.hand.get(t, n) == 1) z[2]++;
      }

      const b = [0, 0, 0];
      const bn = this.hand.get(TYPE.BACK, 0);
      const bb = bn % 3;
      b[0] = Math.floor(bn / 3);
      if (bb == 2) b[1] = 1;
      else if (bb == 1) b[2] = 1;

      let min = 13;
      const mr = this.calcNumberTilePatterns(TYPE.M);
      const pr = this.calcNumberTilePatterns(TYPE.P);
      const sr = this.calcNumberTilePatterns(TYPE.S);
      for (const m of [mr.patternA, mr.patternB]) {
        for (const p of [pr.patternA, pr.patternB]) {
          for (const s of [sr.patternA, sr.patternB]) {
            // [set, pair, isolated]
            const v = [this.hand.called.length, 0, 0];
            for (let i = 0; i < 3; i++) {
              v[i] += m[i] + p[i] + s[i] + z[i] + b[i];
            }
            const r = this.getStandardTypeShanten(v[0], v[1], v[2], hasPair);
            if (r < min) min = r;
          }
        }
      }
      return min;
    };
    // case not having pairs for the initial
    let min = calc(false);

    // case having pairs
    for (const [t, n] of forHand()) {
      if (this.hand.get(t, n) >= 2) {
        const tiles = this.hand.dec(new Array(2).fill(new Tile(t, n)));
        const r = calc(true);
        this.hand.inc(tiles);
        if (r < min) {
          min = r;
        }
      }
    }
    return min;
  }
  private calcNumberTilePatterns(
    t: typeof TYPE.M | typeof TYPE.S | typeof TYPE.P,
    n = 1
  ): {
    patternA: [number, number, number];
    patternB: [number, number, number];
  } {
    if (n > 9) return this.groupRemainingTiles(t);

    let max = this.calcNumberTilePatterns(t, n + 1);

    if (
      n <= 7 &&
      this.hand.get(t, n) > 0 &&
      this.hand.get(t, n + 1) > 0 &&
      this.hand.get(t, n + 2) > 0
    ) {
      const tiles = this.hand.dec([
        new Tile(t, n),
        new Tile(t, n + 1),
        new Tile(t, n + 2),
      ]);
      const r = this.calcNumberTilePatterns(t, n);
      this.hand.inc(tiles);
      r.patternA[0]++, r.patternB[0]++;
      if (
        r.patternA[2] < max.patternA[2] ||
        (r.patternA[2] == max.patternA[2] && r.patternA[1] < max.patternA[1])
      ) {
        max.patternA = r.patternA;
      }
      if (
        r.patternB[0] > max.patternB[0] ||
        (r.patternB[0] == max.patternB[0] && r.patternB[1] > max.patternB[1])
      ) {
        max.patternB = r.patternB;
      }
    }

    if (this.hand.get(t, n) >= 3) {
      const tiles = this.hand.dec(new Array(3).fill(new Tile(t, n)));
      const r = this.calcNumberTilePatterns(t, n);
      this.hand.inc(tiles);
      r.patternA[0]++, r.patternB[0]++;
      if (
        r.patternA[2] < max.patternA[2] ||
        (r.patternA[2] == max.patternA[2] && r.patternA[1] < max.patternA[1])
      ) {
        max.patternA = r.patternA;
      }
      if (
        r.patternB[0] > max.patternB[0] ||
        (r.patternB[0] == max.patternB[0] && r.patternB[1] > max.patternB[1])
      ) {
        max.patternB = r.patternB;
      }
    }
    return max;
  }
  private groupRemainingTiles(type: Type): {
    patternA: [number, number, number];
    patternB: [number, number, number];
  } {
    let nSerialPairs = 0;
    let nIsolated = 0;
    let nTiles = 0;

    for (const [t, n] of forHand({ filterBy: [type] })) {
      nTiles += this.hand.get(t, n);
      if (
        n <= 7 &&
        this.hand.get(t, n + 1) == 0 &&
        this.hand.get(t, n + 2) == 0
      ) {
        nSerialPairs += nTiles >> 1;
        nIsolated += nTiles % 2;
        nTiles = 0;
      }
    }

    nSerialPairs += nTiles >> 1;
    nIsolated += nTiles % 2;

    return {
      patternA: [0, nSerialPairs, nIsolated],
      patternB: [0, nSerialPairs, nIsolated],
    };
  }
  private getStandardTypeShanten(
    nSet: number,
    nSerialPair: number,
    nIsolated: number,
    hasPair: boolean
  ) {
    let n = hasPair ? 4 : 5;

    if (nSet > 4) {
      nSerialPair += nSet - 4;
      nSet = 4;
    }
    if (nSet + nSerialPair > 4) {
      nIsolated += nSet + nSerialPair - 4;
      nSerialPair = 4 - nSet;
    }
    if (nSet + nSerialPair + nIsolated > n) {
      nIsolated = n - nSet - nSerialPair;
    }
    if (hasPair) nSerialPair++;

    return 13 - nSet * 3 - nSerialPair * 2 - nIsolated;
  }
}

export class BlockCalculator {
  hand: Hand;
  constructor(hand: Hand) {
    this.hand = hand;
  }

  /**
   * あがりの形になりうる手牌の構成の配列を返す。
   * 最後のあがり牌によっては、標準形でもカンチャン、リャンメンなど複数の構成になりうるのでその全てを返す。
   */
  calc(lastTile: Tile): readonly (readonly Block[])[] {
    return this.markedHands(
      [
        ...this.sevenPairs(),
        ...this.thirteenOrphans(),
        ...this.nineGates(),
        ...this.standardType(),
      ],
      lastTile
    );
  }

  /**
   * あがりの形になりうる手牌の構成の配列に対して、最後のあがり牌を考慮したあがりの形になりうる手牌の構成の配列を返す。
   */
  markedHands(
    hands: readonly (readonly Block[])[],
    lastTile: Tile
  ): readonly (readonly Block[])[] {
    if (hands.length == 0) return [];
    return hands.map((hand) => this.markedHand(hand, lastTile)).flat();
  }

  /**
   * あがりの形になりうる手牌の構成に対して、最後のあがり牌を考慮したあがりの形になりうる手牌の構成の配列を返す。
   */
  markedHand(
    hand: readonly Block[],
    lastTile: Tile
  ): readonly (readonly Block[])[] {
    if (hand.length == 0) return [];
    const op =
      this.hand.drawn != null || lastTile.has(OP.TSUMO) ? OP.TSUMO : OP.RON;

    const indexes: [number, number][] = []; // [block index, tile index]
    const m: { [key: string]: boolean } = {}; // reduce same blocks such as ["123m", "123m"]
    for (let bIdx = 0; bIdx < hand.length; bIdx++) {
      const block = hand[bIdx];
      if (block.isCalled()) continue;
      const tIdx = block.tiles.findIndex(
        (t) => t.equals(lastTile) && lastTile.has(OP.RED) == t.has(OP.RED)
      );
      if (tIdx < 0) continue;
      const key = buildBlockKey(block);
      if (m[key]) continue;
      m[key] = true;
      indexes.push([bIdx, tIdx]);
    }

    if (indexes.length == 0)
      throw new Error(
        `tile ${lastTile.toString()} not found in hand: ${hand.toString()}`
      );

    const newHands: Block[][] = [];
    for (const [bIdx, tIdx] of indexes) {
      const newHand = [...hand];
      const block = newHand[bIdx];
      const newTile = block.tiles[tIdx].clone({ add: op });
      newHand[bIdx] = block.clone({
        replace: { idx: tIdx, tile: newTile },
      }); // update with new block tiles with op
      newHands.push(newHand);
    }

    return newHands;
  }

  /**
   * 現在の手牌において、七対子のあがり形となりうる手牌の構成の配列を返す。
   * あがり牌は考慮されない。最大で要素は 1 となる。
   */
  sevenPairs(): readonly (readonly Block[])[] {
    if (this.hand.called.length > 0) return [];
    const ret: Block[] = [];
    for (const [t, n] of forHand({ skipBack: true })) {
      const count = this.hand.get(t, n);
      if (count == 0) continue;
      else if (count == 2) {
        // red に対応するため dec した tile を使用する
        const tiles = this.hand.dec(new Array(2).fill(new Tile(t, n)));
        ret.push(new BlockPair(tiles[0], tiles[1]));
        this.hand.inc(tiles);
      } else return [];
    }

    return [ret];
  }

  /**
   * 現在の手牌において、国士無双のあがり形となりうる手牌の構成の配列を返す。
   * あがり牌は考慮されない。
   */
  thirteenOrphans(): readonly (readonly Block[])[] {
    const ret: Block[] = [];
    let foundPairs = false;
    for (const t of Object.values(TYPE)) {
      if (t == TYPE.BACK) continue;
      const nn = t == TYPE.Z ? NZ : N19;
      for (let n of nn) {
        if (this.hand.get(t, n) == 1)
          ret.push(new BlockIsolated(new Tile(t, n)));
        else if (this.hand.get(t, n) == 2 && foundPairs == false) {
          ret.unshift(new BlockPair(new Tile(t, n), new Tile(t, n)));
          foundPairs = true;
        } else return [];
      }
    }
    return [ret];
  }

  /**
   * 現在の手牌において、九蓮宝燈のあがり形となりうる手牌の構成の配列を返す。
   * あがり牌は考慮されない。
   */
  nineGates(): readonly (readonly Block[])[] {
    const cond = (t: Type, n: number, wantCount: number[]) =>
      wantCount.includes(this.hand.get(t, n));
    for (const t of Object.values(TYPE)) {
      if (t == TYPE.BACK) continue;
      if (t == TYPE.Z) continue;
      const cond1 =
        cond(t, 1, [3, 4]) &&
        cond(t, 9, [3, 4]) &&
        cond(t, 2, [1, 2]) &&
        cond(t, 3, [1, 2]) &&
        cond(t, 4, [1, 2]) &&
        cond(t, 5, [1, 2]) &&
        cond(t, 6, [1, 2]) &&
        cond(t, 7, [1, 2]) &&
        cond(t, 8, [1, 2]);
      const cond2 = this.hand.sum(t) == 14;
      if (cond1 && cond2) {
        return [[new BlockHand(this.hand.hands)]];
      }
    }
    return [];
  }

  /**
   * 現在の手牌において、標準形のあがり形となりうる手牌の構成の配列を返す。
   * あがり牌は考慮されない。
   */
  standardType(): readonly (readonly Block[])[] {
    let ret: readonly (readonly Block[])[] = [];
    for (const [t, n] of forHand()) {
      if (this.hand.get(t, n) >= 2) {
        const toDec = new Array(2).fill(new Tile(t, n));
        // OP.RED をつけないと、最後の（面子の） dec で RED が消費される。
        // e.g. 5s が 3枚あり、頭で 5s を2枚消費すると、calcAllBlockCombinations() で r5s と 5s のパータンを計算できなくなる。
        // 明示的に OP.RED を頭で消費するようにする。
        if (n == 5 && this.hand.get(t, 0) > 0 && this.hand.get(t, n) >= 3) {
          toDec[1] = new Tile(t, n, [OP.RED]);
        }
        const tiles = this.hand.dec(toDec);
        // 1. calc all cases without two pairs
        // 2. remove non five blocks
        // 3. add two pairs to the head
        const v = this.calcAllBlockCombinations()
          .filter((arr) => arr.length == 4)
          .map((arr) => [new BlockPair(tiles[0], tiles[1]), ...arr]);
        ret = [...ret, ...v];
        this.hand.inc(tiles);
      }
    }

    return ret;
  }

  private calcAllBlockCombinations(): readonly (readonly Block[])[] {
    // [["123m", "123m"], ["222m", "333m"]]
    // [["123s", "123s"]]
    // result: [["123m", "123m", "123s", "123s"], ["111m", "333m", "123s", "123s"]]
    const vvv = [
      this.addRedPatterns(TYPE.M, this.handleNumType(TYPE.M)),
      this.addRedPatterns(TYPE.P, this.handleNumType(TYPE.P)),
      this.addRedPatterns(TYPE.S, this.handleNumType(TYPE.S)),
      this.handleZ(),
      this.handleBack(),
      [this.hand.called.concat()],
    ].sort((a, b) => b.length - a.length);
    // combine all patterns
    const ret = vvv.reduce(
      (acc, group) =>
        group.length === 0
          ? acc // 空の配列があればそのまま acc を返す
          : acc.flatMap((p) => group.map((choice) => [...p, ...choice])),
      [[]]
    );
    return ret;
  }

  // handle back tiles as same unknown tiles, Not joker tile.
  private handleBack(): readonly (readonly Block[])[] {
    const bt = TYPE.BACK;
    const sum = this.hand.get(bt, 0);
    if (sum < 3) return [];
    const p = new Tile(bt, 0);
    const b = Array(Math.floor(sum / 3)).fill(new BlockThree([p, p, p]));
    return b.length == 0 ? [] : [b];
  }

  private handleZ(): readonly (readonly Block[])[] {
    const z: Block[] = [];
    for (const [zt, n] of forHand({ filterBy: [TYPE.Z] })) {
      if (this.hand.get(zt, n) == 0) continue;
      else if (this.hand.get(zt, n) != 3) return [];
      const p = new Tile(zt, n);
      z.push(new BlockThree([p, p, p]));
    }
    return z.length == 0 ? [] : [z];
  }

  /**
   * 一つの手牌の構成において、赤牌ごとの手牌（晒したブロックを含まない）の構成を生成する。
   */
  private addRedPattern(t: Type, hand: readonly Block[]) {
    const nonRed = new Tile(t, 5);
    const red = new Tile(t, 5, [OP.RED]);
    const nonRedIndexes: [number, number][] = [];
    let redIndex: [number, number] | null = null;
    const m: { [key: string]: boolean } = {};
    for (let bIdx = 0; bIdx < hand.length; bIdx++) {
      const block = hand[bIdx];
      const nrtIdx = block.tiles.findIndex((t) => is5Tile(t) && !t.has(OP.RED));
      const rtIdx = block.tiles.findIndex((t) => is5Tile(t) && t.has(OP.RED));
      // red の位置情報
      if (rtIdx > -1) redIndex = [bIdx, rtIdx];
      // 一つのブロックに red と non red があるので BlockThree
      if (rtIdx > -1 && nrtIdx > -1) continue;
      if (nrtIdx < 0) continue;
      const key = buildBlockKey(block);
      if (m[key]) continue;
      m[key] = true;
      // non red の位置情報
      nonRedIndexes.push([bIdx, nrtIdx]);
    }

    // BlockThree などの場合
    if (redIndex == null) return [hand];

    // 5 と r5 に入れ替えたパータンを生成する
    const newHands = [hand];
    for (const [bIdx, tIdx] of nonRedIndexes) {
      const newHand = [...hand];

      // 5 のブロックを r5 のブロックに変換
      const nonRedblock = newHand[bIdx];
      newHand[bIdx] = nonRedblock.clone({
        replace: { idx: tIdx, tile: red },
      });

      // r5 のブロックを 5 のブロックに変換
      const redblock = newHand[redIndex[0]];
      newHand[redIndex[0]] = redblock.clone({
        replace: { idx: redIndex[1], tile: nonRed },
      });
      // 345 と 34r5 は入れ変えても同じ
      if (buildBlockKey(nonRedblock) == buildBlockKey(redblock)) continue;
      newHands.push(newHand);
    }
    return newHands;
  }

  /**
   * 全ての手牌の構成において、赤牌ごとの手牌（晒したブロックを含まない）の構成を生成する。
   */
  // TODO similar to markDrawn
  private addRedPatterns(t: Type, hands: readonly (readonly Block[])[]) {
    if (!(this.hand.get(t, 0) > 0 && this.hand.get(t, 5) >= 2)) return hands;
    return hands.map((hand) => this.addRedPattern(t, hand)).flat();
  }
  private handleNumType(
    t: typeof TYPE.M | typeof TYPE.S | typeof TYPE.P,
    n: number = 1
  ): readonly (readonly Block[])[] {
    if (n > 9) return [];

    if (this.hand.get(t, n) == 0) {
      return this.handleNumType(t, n + 1);
    }

    const ret: Block[][] = [];
    if (
      n <= 7 &&
      this.hand.get(t, n) > 0 &&
      this.hand.get(t, n + 1) > 0 &&
      this.hand.get(t, n + 2) > 0
    ) {
      const tiles = this.hand.dec([
        new Tile(t, n),
        new Tile(t, n + 1),
        new Tile(t, n + 2),
      ]);
      let nested = this.handleNumType(t, n);
      this.hand.inc(tiles);
      if (nested.length == 0) nested = [[]];
      for (const arr of nested) {
        ret.push([new BlockRun([tiles[0], tiles[1], tiles[2]]), ...arr]);
      }
    }

    if (this.hand.get(t, n) == 3) {
      const tiles = this.hand.dec(new Array(3).fill(new Tile(t, n)));
      let nested = this.handleNumType(t, n);
      this.hand.inc(tiles);
      if (nested.length == 0) nested = [[]];
      for (const arr of nested) {
        // Note insert it to the head due to handling recursively, 111333m
        // first arr will have [333m]
        ret.push([new BlockThree([tiles[0], tiles[1], tiles[2]]), ...arr]);
      }
    }
    return ret;
  }
}

export const NZ: readonly number[] = [1, 2, 3, 4, 5, 6, 7];
export const N19: readonly number[] = [1, 9];

export const deserializeWinResult = (ret: SerializedWinResult): WinResult => {
  const bc = ret.boardContext;
  return {
    ...ret,
    hand: ret.hand.map(Block.deserialize),
    boardContext: {
      ...bc,
      doraIndicators: bc.doraIndicators.map(Tile.from),
      hiddenDoraIndicators: bc.hiddenDoraIndicators?.map(Tile.from),
    },
  };
};

export const serializeWinResult = (ret: WinResult) => {
  const v = JSON.parse(JSON.stringify(ret)) as SerializedWinResult;
  return v;
};

type SerializedBoardContext = Omit<
  BoardContext,
  "doraIndicators" | "hiddenDoraIndicators"
> & {
  doraIndicators: readonly string[];
  hiddenDoraIndicators?: readonly string[];
};

export type SerializedWinResult = Omit<WinResult, "hand" | "boardContext"> & {
  hand: readonly SerializedBlock[];
  boardContext: SerializedBoardContext;
};

/**
 * あがり計算に必要な追加情報を表す。
 */
export interface BoardContext {
  doraIndicators: readonly Tile[];
  hiddenDoraIndicators?: readonly Tile[];
  round: Round;
  myWind: Wind;
  ronWind?: Wind;
  sticks?: { readonly reach: number; readonly dead: number };
  reached?: 1 | 2;
  replacementWin?: boolean;
  quadWin?: boolean;
  finalWallWin?: boolean;
  finalDiscardWin?: boolean;
  oneShotWin?: boolean;
  enableRoundUpMangan?: boolean;
  disableCountableYakuman?: boolean;
  disableDoubleYakuman?: boolean;
}

/**
 * あがりを表す
 */
export interface WinResult extends WinningHand {
  deltas: { readonly [w in Wind]: number };
  points: number;
  basePoints: number;
  boardContext: BoardContext;
  description: string;
}

/**
 * 役を表す
 */
export interface Yaku {
  name: string;
  han: number;
  isYakuman?: boolean;
}

/**
 * あがりの構成になる手牌の情報
 */
interface WinningHand {
  hand: readonly Block[];
  fu: number;
  yakus: readonly Yaku[];
  han: number;
  isYakuman?: boolean;
}

const SCORING = {
  MANGAN: 2000,
  HANEMAN: 3000,
  DOUBLE: 4000,
  TRIPLE: 6000,
  YAKUMAN: 8000,
  DOUBLE_YAKUMAN: 16000,
  DEAD_STICK: 300,
  REACH_STICK: 1000,
} as const;

const HAN_SCORING_TABLE = [
  { minHan: 26, points: SCORING.DOUBLE_YAKUMAN },
  { minHan: 13, points: SCORING.YAKUMAN },
  { minHan: 11, points: SCORING.TRIPLE },
  { minHan: 8, points: SCORING.DOUBLE },
  { minHan: 6, points: SCORING.HANEMAN },
  { minHan: 5, points: SCORING.MANGAN },
] as const;

const SCORE_NAMES = {
  [SCORING.MANGAN]: "満貫",
  [SCORING.HANEMAN]: "跳満",
  [SCORING.DOUBLE]: "倍満",
  [SCORING.TRIPLE]: "三倍満",
} as const;

const POINT_COEFFICIENT = {
  PARENT_RON: 6,
  CHILD_RON: 4,
  PARENT_TSUMO: 2,
  CHILD_TUMO_FROM_PARENT: 2,
  CHILD_TUMO_FROM_CHILD: 1,
} as const;

/**
 * あがりの説明を返す。
 */
export function getPointDescription(params: {
  base: number;
  fu: number;
  han: number;
  isTsumo: boolean;
  isParent: boolean;
  isYakuman?: boolean;
  isCountableYakuman?: boolean;
}): string {
  if (params.isYakuman) return "役満";
  if (params.isCountableYakuman) return "数え役満";

  const pointDesc = generatePointDescription(
    params.base,
    params.isTsumo,
    params.isParent
  );

  const scoreName = SCORE_NAMES[params.base as keyof typeof SCORE_NAMES];
  return scoreName
    ? `${params.fu}符${params.han}飜 ${scoreName}${pointDesc}`
    : `${params.fu}符${params.han}飜 ${pointDesc}`;
}

function generatePointDescription(
  base: number,
  isTsumo: boolean,
  isParent: boolean
): string {
  if (!isTsumo) {
    // RON: 単一の点数
    const coefficient = isParent
      ? POINT_COEFFICIENT.PARENT_RON
      : POINT_COEFFICIENT.CHILD_RON;
    return `${myCeil(base * coefficient)}`;
  } else if (isParent) {
    // 親のツモ: 単一の点数
    return `${myCeil(base * POINT_COEFFICIENT.PARENT_TSUMO)}`;
  } else {
    // 子のツモ: 範囲表示
    return `${myCeil(base * POINT_COEFFICIENT.CHILD_TUMO_FROM_CHILD)}-${myCeil(
      base * POINT_COEFFICIENT.CHILD_TUMO_FROM_PARENT
    )}`;
  }
}

const myCeil = (v: number, p = 100) => {
  return Math.ceil(v / p) * p;
};

export class PointCalculator {
  hand: Hand;
  cfg: {
    doras: readonly Tile[];
    hiddenDoras: readonly Tile[];
    roundWind: Tile;
    myWind: Tile;
    reached: 0 | 1 | 2;
    sticks: { readonly reach: number; readonly dead: number };
    replacementWin: boolean;
    quadWin: boolean;
    finalWallWin: boolean;
    finalDiscardWin: boolean;
    oneShotWin: boolean;
    enableRoundUpMangan: boolean;
    disableCountableYakuman: boolean;
    disableDoubleYakuman: boolean;
    orig: BoardContext;
  };
  constructor(hand: Hand, params: BoardContext) {
    this.hand = hand;
    this.cfg = {
      doras: params.doraIndicators.map((v) => toDora(v)), // convert to dora
      hiddenDoras:
        params.hiddenDoraIndicators == null
          ? []
          : params.hiddenDoraIndicators.map((v) => toDora(v)),
      roundWind: Tile.from(roundWind(params.round)),
      myWind: Tile.from(params.myWind),
      reached: params.reached ?? 0,
      sticks: params.sticks ?? { dead: 0, reach: 0 },
      replacementWin: params.replacementWin ?? false,
      quadWin: params.quadWin ?? false,
      finalWallWin: params.finalWallWin ?? false,
      finalDiscardWin: params.finalDiscardWin ?? false,
      oneShotWin: params.oneShotWin ?? false,
      enableRoundUpMangan: params.enableRoundUpMangan ?? false,
      disableCountableYakuman: params.disableCountableYakuman ?? false,
      disableDoubleYakuman: params.disableDoubleYakuman ?? false,
      orig: params,
    };
  }

  /**
   * 現在の手牌の構成の配列の中から、点数が最大になるあがりを返す。
   */
  calc(...hands: readonly (readonly Block[])[]): WinResult | false {
    const patterns = this.getWinningHands(hands);
    if (patterns.length === 0) return false;

    const bestHand = this.selectBestHand(patterns);
    const scoreInfo = this.calculateScore(bestHand);
    const deltas = this.calculateDeltas(
      scoreInfo.base,
      scoreInfo.isTsumo,
      scoreInfo.isParent,
      scoreInfo.myWind,
      this.cfg.orig.ronWind
    );

    const basePoints = deltas[scoreInfo.myWind];

    this.addStickPoints(deltas, scoreInfo.myWind, this.cfg.orig.ronWind);

    const description = getPointDescription({
      base: scoreInfo.base,
      fu: scoreInfo.fu,
      han: scoreInfo.han,
      isTsumo: scoreInfo.isTsumo,
      isParent: scoreInfo.isParent,
      isYakuman: scoreInfo.isYakuman,
      isCountableYakuman: scoreInfo.isCountableYakuman,
    });

    return {
      ...bestHand,
      fu: scoreInfo.fu, // ceiled value
      deltas,
      points: deltas[scoreInfo.myWind],
      basePoints,
      boardContext: this.cfg.orig,
      description,
    };
  }

  /**
   * 現在の手牌の構成の配列の中から、あがりになる構成の配列を返す。
   */
  getWinningHands(hands: readonly (readonly Block[])[]) {
    const ret: WinningHand[] = [];
    if (hands.length == 0) return ret;
    for (const hand of hands) {
      const v = [
        ...this.dA13(hand),
        ...this.dB13(hand),
        ...this.dC13(hand),
        ...this.dD13(hand),
        ...this.dE13(hand),
        ...this.dF13(hand),
        ...this.dG13(hand),
        ...this.dH13(hand),
        ...this.dI13(hand),
        ...this.dJ13(hand),
        ...this.dK13(hand),
      ].map((y) => {
        if (this.cfg.disableDoubleYakuman && y.han > 13) y.han = 13;
        return y;
      });
      if (v.length == 0) continue;
      ret.push({
        yakus: v,
        han: v.reduce((sum, yaku) => sum + yaku.han, 0),
        fu: 30,
        hand: hand,
        isYakuman: true,
      });
    }

    if (ret.length > 0) return ret;

    for (const hand of hands) {
      const fu = this.calcFu(hand);
      const v = [
        ...this.dA1(hand),
        ...this.dB1(hand),
        ...this.dC1(hand),
        ...this.dD1(hand),
        ...this.dE1(hand),
        ...this.dF1(hand),
        ...this.dG1(hand),
        ...this.dH1(hand),
        ...this.dI1(hand),
        ...this.dJ1(hand),
        ...this.dK1(hand),

        ...this.dA2(hand),
        ...this.dB2(hand),
        ...this.dC2(hand),
        ...this.dD2(hand),
        ...this.dE2(hand),
        ...this.dF2(hand),
        ...this.dG2(hand),
        ...this.dH2(hand),
        ...this.dI2(hand),
        ...this.dJ2(hand),

        ...this.dA3(hand),
        ...this.dB3(hand),
        ...this.dC3(hand),

        ...this.dA6(hand),
      ];
      if (v.length == 0) continue;
      // doras are evaluated when other yaku exists
      v.push(...this.dX1(hand));
      ret.push({
        yakus: v,
        han: v.reduce((sum, yaku) => sum + yaku.han, 0),
        fu: fu,
        hand: hand,
      });
    }

    return ret;
  }

  private selectBestHand(winningHands: readonly WinningHand[]) {
    return winningHands.reduce((best, current) => {
      const { han, fu } = current;
      const { han: bestHan, fu: bestFu } = best;
      return han > bestHan || (han === bestHan && fu > bestFu) ? current : best;
    });
  }

  private calculateScore(bestHand: WinningHand) {
    const { han } = bestHand;
    const fu = bestHand.fu !== 25 ? myCeil(bestHand.fu, 10) : 25;
    const isYakuman = bestHand.isYakuman ?? false;

    let base = this.getBasePoints(han, fu);
    let isCountableYakuman = false;

    // 数え役満処理
    if (han >= 13 && han < 26 && !this.hasYakuman(bestHand.yakus)) {
      base = this.cfg.disableCountableYakuman
        ? SCORING.TRIPLE
        : SCORING.YAKUMAN;
      isCountableYakuman = !this.cfg.disableCountableYakuman;
    }

    // 切り上げ満貫
    if (this.cfg.enableRoundUpMangan && this.isRoundUpMangan(fu, han)) {
      base = SCORING.MANGAN;
    }

    const isTsumo = this.isTsumoWin(bestHand.hand);
    const myWind = this.cfg.orig.myWind;
    const isParent = myWind === WIND.E;

    return {
      base,
      fu,
      han,
      isYakuman: isCountableYakuman ? true : isYakuman,
      isCountableYakuman,
      isTsumo,
      myWind,
      isParent,
    };
  }

  private hasYakuman(yakus: readonly Yaku[]): boolean {
    return yakus.some((yaku) => yaku.isYakuman);
  }

  private isRoundUpMangan(fu: number, han: number): boolean {
    return (fu === 30 && han === 4) || (fu === 60 && han === 3);
  }

  private isTsumoWin(hand: readonly Block[]): boolean {
    return hand.some((block) => block.tiles.some((tile) => tile.has(OP.TSUMO)));
  }

  /**
   * Wind をキーとした点数移動の構成を返す
   */
  private calculateDeltas(
    base: number,
    isTsumo: boolean,
    isParent: boolean,
    myWind: Wind,
    ronWind?: Wind
  ) {
    const deltas = createWindMap(0);

    if (!isTsumo) {
      assert(ronWind != null, "tumo is false but ron wind is null");
      this.calculateRonDeltas(deltas, base, isParent, myWind, ronWind);
    } else {
      this.calculateTsumoDeltas(deltas, base, isParent, myWind);
    }

    return deltas;
  }

  private calculateRonDeltas(
    deltas: { [key in Wind]: number },
    base: number,
    isParent: boolean,
    myWind: Wind,
    ronWind: Wind
  ) {
    const coefficient = isParent
      ? POINT_COEFFICIENT.PARENT_RON
      : POINT_COEFFICIENT.CHILD_RON;
    const points = myCeil(base * coefficient);

    deltas[myWind] += points;
    deltas[ronWind] -= points;
  }

  private calculateTsumoDeltas(
    deltas: { [w in Wind]: number },
    base: number,
    isParent: boolean,
    myWind: Wind
  ) {
    if (isParent) {
      const basePoints = myCeil(base * POINT_COEFFICIENT.PARENT_TSUMO);
      deltas[WIND.E] += basePoints * 3;
      deltas[WIND.S] -= basePoints;
      deltas[WIND.W] -= basePoints;
      deltas[WIND.N] -= basePoints;
      return;
    }
    for (const key of Object.values(WIND)) {
      if (key == myWind) continue;
      const coefficient =
        key == WIND.E
          ? POINT_COEFFICIENT.CHILD_TUMO_FROM_PARENT
          : POINT_COEFFICIENT.CHILD_TUMO_FROM_CHILD;
      const basePoints = myCeil(base * coefficient);
      deltas[key] -= basePoints;
      deltas[myWind] += basePoints;
    }
  }

  private addStickPoints(
    deltas: { [w in Wind]: number },
    myWind: Wind,
    ronWind: Wind | undefined
  ) {
    deltas[myWind] += SCORING.REACH_STICK * this.cfg.sticks.reach;
    const deadPoint = SCORING.DEAD_STICK * this.cfg.sticks.dead;
    if (ronWind != null) {
      deltas[myWind] += deadPoint;
      deltas[ronWind] -= deadPoint;
      return;
    }
    for (const key of Object.values(WIND)) {
      if (key == myWind) deltas[key] += deadPoint;
      else deltas[key] -= deadPoint / 3;
    }
  }

  private getBasePoints(han: number, fu: number): number {
    for (const { minHan, points } of HAN_SCORING_TABLE) {
      if (han >= minHan) return points;
    }
    // 40符以上の4飜は満貫の2000にする。
    return Math.min(fu * 2 ** (han + 2), SCORING.MANGAN);
  }

  private getCalledPenalty() {
    return this.hand.menzen ? 0 : 1;
  }

  dA1(h: readonly Block[]): readonly Yaku[] {
    if (this.cfg.reached == 1) return [{ name: "立直", han: 1 }];
    if (this.cfg.reached == 2) return [{ name: "ダブル立直", han: 2 }];
    return [];
  }
  dB1(h: readonly Block[]): readonly Yaku[] {
    if (this.hand.drawn == null) [];
    if (this.getCalledPenalty() != 0) return [];
    const cond = h.some((b) => b.tiles.some((t) => t.has(OP.TSUMO)));
    return cond ? [{ name: "門前清自摸和", han: 1 }] : [];
  }
  dC1(h: readonly Block[]): readonly Yaku[] {
    if (this.getCalledPenalty() != 0) return [];
    const name = "平和";
    const fu = this.calcFu(h);
    if (fu == 20) return [{ name: name, han: 1 }];
    if (!h.some((b) => b.tiles.some((t) => t.has(OP.TSUMO)))) {
      if (fu == 30) return [{ name: name, han: 1 }];
    }
    return [];
  }
  dD1(h: readonly Block[]): readonly Yaku[] {
    const cond = h.some((block) =>
      block.tiles.some((t) => t.t == TYPE.Z || N19.includes(t.n))
    );
    return cond ? [] : [{ name: "断么九", han: 1 }];
  }
  dE1(h: readonly Block[]): readonly Yaku[] {
    if (this.getCalledPenalty() != 0) return [];

    const count = countSameBlocks(h);
    return count == 1 ? [{ name: "一盃口", han: 1 }] : [];
  }
  dF1(h: readonly Block[]): readonly Yaku[] {
    const ret: Yaku[] = [];
    h.forEach((block) => {
      if (block instanceof BlockPair) return;
      const tile = block.tiles[0];
      if (tile.t == TYPE.Z) {
        if (tile.equals(this.cfg.myWind)) ret.push({ name: "自風", han: 1 });
        if (tile.equals(this.cfg.roundWind)) ret.push({ name: "場風", han: 1 });
        else if (tile.n == 5) ret.push({ name: "白", han: 1 });
        else if (tile.n == 6) ret.push({ name: "發", han: 1 });
        else if (tile.n == 7) ret.push({ name: "中", han: 1 });
      }
    });
    return ret;
  }
  dG1(h: readonly Block[]): readonly Yaku[] {
    return this.cfg.oneShotWin ? [{ name: "一発", han: 1 }] : [];
  }
  dH1(h: readonly Block[]): readonly Yaku[] {
    return this.cfg.replacementWin ? [{ name: "嶺上開花", han: 1 }] : [];
  }
  dI1(h: readonly Block[]): readonly Yaku[] {
    return this.cfg.quadWin ? [{ name: "搶槓", han: 1 }] : [];
  }
  dJ1(h: readonly Block[]): readonly Yaku[] {
    return this.cfg.finalWallWin ? [{ name: "海底摸月", han: 1 }] : [];
  }
  dK1(h: readonly Block[]): readonly Yaku[] {
    return this.cfg.finalDiscardWin ? [{ name: "河底撈魚", han: 1 }] : [];
  }
  dX1(h: readonly Block[]): readonly Yaku[] {
    const allTiles = h.flatMap((b) => b.tiles);
    const dcount = allTiles.reduce(
      (count, t) => count + this.cfg.doras.filter((d) => t.equals(d)).length,
      0
    );
    const bcount = allTiles.reduce(
      (count, t) =>
        count + this.cfg.hiddenDoras.filter((d) => t.equals(d)).length,
      0
    );
    const rcount = allTiles.filter((t) => t.has(OP.RED)).length;

    const ret: Yaku[] = [];
    if (dcount > 0) ret.push({ name: "ドラ", han: dcount });
    if (rcount > 0) ret.push({ name: "赤ドラ", han: rcount });
    if (this.hand.reached && bcount > 0)
      ret.push({ name: "裏ドラ", han: bcount });
    return ret;
  }

  dA2(h: readonly Block[]): readonly Yaku[] {
    return h.length == 7 ? [{ name: "七対子", han: 2 }] : [];
  }
  dB2(h: readonly Block[]): readonly Yaku[] {
    const check = (bb: Block) => {
      return bb instanceof BlockRun || bb instanceof BlockChi;
    };
    for (const block of h) {
      if (!check(block)) continue;
      if (block.tiles[0].t == TYPE.Z) continue;
      const tile = minTile(block);
      const excludedypes = [TYPE.M, TYPE.P, TYPE.S].filter((v) => v != tile.t);
      const cond1 = h.some((b) => {
        const newTile = new Tile(excludedypes[0], tile.n);
        return check(b) && newTile.equals(minTile(b));
      });
      const cond2 = h.some((b) => {
        const newTile = new Tile(excludedypes[1], tile.n);
        return check(b) && newTile.equals(minTile(b));
      });
      if (cond1 && cond2)
        return [{ name: "三色同順", han: 2 - this.getCalledPenalty() }];
    }
    return [];
  }
  dC2(h: readonly Block[]): readonly Yaku[] {
    if (h.length == 7) return [];
    const cond = h.every(
      (b) =>
        b instanceof BlockAnKan ||
        b instanceof BlockShoKan ||
        b instanceof BlockDaiKan ||
        b instanceof BlockThree ||
        b instanceof BlockPon ||
        b instanceof BlockPair
    );
    return cond ? [{ name: "対々和", han: 2 }] : [];
  }
  dD2(h: readonly Block[]): readonly Yaku[] {
    const l = h.filter((b) => {
      return (
        (b instanceof BlockAnKan || b instanceof BlockThree) &&
        !b.tiles.some((t) => t.has(OP.RON)) // ignore ron
      );
    }).length;
    return l >= 3 ? [{ name: "三暗刻", han: 2 }] : [];
  }
  dE2(h: readonly Block[]): readonly Yaku[] {
    const l = h.filter(
      (b) =>
        b instanceof BlockAnKan ||
        b instanceof BlockShoKan ||
        b instanceof BlockDaiKan
    ).length;
    return l >= 3 ? [{ name: "三槓子", han: 2 }] : [];
  }
  dF2(h: readonly Block[]): readonly Yaku[] {
    const check = (b: Block) => {
      return (
        b instanceof BlockAnKan ||
        b instanceof BlockShoKan ||
        b instanceof BlockDaiKan ||
        b instanceof BlockThree ||
        b instanceof BlockPon
      );
    };
    for (const block of h) {
      if (!check(block)) continue;
      const tile = minTile(block);
      if (tile.t == TYPE.Z) continue;
      const excludedTypes = [TYPE.M, TYPE.P, TYPE.S].filter((v) => v != tile.t);
      const cond1 = h.some((b) => {
        const newTile = new Tile(excludedTypes[0], tile.n);
        return check(b) && newTile.equals(minTile(b));
      });
      const cond2 = h.some((b) => {
        const newTile = new Tile(excludedTypes[1], tile.n);
        return check(b) && newTile.equals(minTile(b));
      });
      if (cond1 && cond2) return [{ name: "三色同刻", han: 2 }];
    }
    return [];
  }
  dG2(h: readonly Block[]): readonly Yaku[] {
    if (h.length == 7) return [];
    const l = h.filter((b) => {
      const t = b.tiles[0];
      return t.t == TYPE.Z && [5, 6, 7].includes(t.n);
    }).length;
    return l == 3 ? [{ name: "小三元", han: 2 }] : [];
  }
  dH2(h: readonly Block[]): readonly Yaku[] {
    const cond = h.every((b) => {
      const s = b.tiles[0];
      const values = s.t == TYPE.Z ? NZ : N19;
      return (
        (b instanceof BlockAnKan ||
          b instanceof BlockShoKan ||
          b instanceof BlockDaiKan ||
          b instanceof BlockThree ||
          b instanceof BlockPon ||
          b instanceof BlockPair) &&
        values.includes(s.n)
      );
    });
    return cond ? [{ name: "混老頭", han: 2 }] : [];
  }
  dI2(h: readonly Block[]): readonly Yaku[] {
    if (h.length == 7) return [];
    // 一つは BlockRun もしくは BlockChi がある。なければ、老頭に該当するため
    if (!h.some((b) => b instanceof BlockRun || b instanceof BlockChi))
      return [];
    if (!h.some((b) => b.tiles[0].t == TYPE.Z)) return [];

    const cond = h.every((block) => {
      const values = block.tiles[0].t == TYPE.Z ? NZ : N19;
      return block.tiles.some((t) => values.includes(t.n));
    });
    return cond
      ? [{ name: "混全帯么九", han: 2 - this.getCalledPenalty() }]
      : [];
  }
  dJ2(h: readonly Block[]): readonly Yaku[] {
    const m = {
      // 123m, 456m, 789m
      [TYPE.M]: [0, 0, 0],
      [TYPE.S]: [0, 0, 0],
      [TYPE.P]: [0, 0, 0],
    };

    for (const block of h) {
      const tile = minTile(block);
      if (tile.t == TYPE.BACK) continue;
      if (tile.t == TYPE.Z) continue;
      if (!(block instanceof BlockRun || block instanceof BlockChi)) continue;
      if (tile.n == 1) m[tile.t][0]++;
      else if (tile.n == 4) m[tile.t][1]++;
      else if (tile.n == 7) m[tile.t][2]++;
    }

    for (const arr of Object.values(m)) {
      if (arr[0] > 0 && arr[1] > 0 && arr[2] > 0)
        return [{ name: "一気通貫", han: 2 - this.getCalledPenalty() }];
    }
    return [];
  }

  dA3(h: readonly Block[]): readonly Yaku[] {
    const cond = !h.some((block) => block.tiles[0].t == TYPE.Z);
    if (cond) return [];
    for (const t of Object.values(TYPE)) {
      const ok = h.every((b) => b.tiles[0].t == TYPE.Z || b.tiles[0].t == t);
      if (ok) return [{ name: "混一色", han: 3 - this.getCalledPenalty() }];
    }
    return [];
  }
  dB3(h: readonly Block[]): readonly Yaku[] {
    if (h.length == 7) return [];
    if (!h.some((b) => b instanceof BlockRun || b instanceof BlockChi))
      return [];
    if (h.some((b) => b.tiles[0].t == TYPE.Z)) return [];

    const cond = h.every((b) => {
      return b.tiles.some((t) => N19.includes(t.n));
    });
    return cond
      ? [{ name: "純全帯么九色", han: 3 - this.getCalledPenalty() }]
      : [];
  }
  dC3(h: readonly Block[]): readonly Yaku[] {
    if (this.getCalledPenalty() != 0) return [];

    const count = countSameBlocks(h);
    return count == 2 ? [{ name: "ニ盃口", han: 3 }] : [];
  }
  dA6(h: readonly Block[]): readonly Yaku[] {
    if (h.some((block) => block.tiles[0].t == TYPE.Z)) return [];
    for (const t of Object.values(TYPE)) {
      if (t == TYPE.Z) continue;
      const ok = h.every((v) => v.tiles[0].t == t);
      if (ok) return [{ name: "清一色", han: 6 - this.getCalledPenalty() }];
    }
    return [];
  }

  dA13(h: readonly Block[]): readonly Yaku[] {
    if (h.length != 13) return [];
    const double = h.some(
      (b) =>
        b instanceof BlockPair &&
        b.tiles.some((t) => t.has(OP.TSUMO) || t.has(OP.RON))
    );
    return double
      ? [{ name: "国士無双13面待ち", han: 26, isYakuman: true }]
      : [{ name: "国士無双", han: 13, isYakuman: true }];
  }
  dB13(h: readonly Block[]): readonly Yaku[] {
    return h.length == 1
      ? [{ name: "九蓮宝燈", han: 13, isYakuman: true }]
      : [];
  }
  dC13(h: readonly Block[]): readonly Yaku[] {
    if (h.length == 7) return [];
    const cond1 = h.every(
      (b) =>
        b instanceof BlockAnKan ||
        (b instanceof BlockThree && b.tiles.every((t) => !t.has(OP.RON))) ||
        b instanceof BlockPair
    );
    if (!cond1) return [];
    const cond2 = h.some(
      (b) =>
        b instanceof BlockPair &&
        b.tiles.some((t) => t.has(OP.TSUMO) || t.has(OP.RON))
    );
    return cond2
      ? [{ name: "四暗刻単騎待ち", han: 26, isYakuman: true }]
      : [{ name: "四暗刻", han: 13, isYakuman: true }];
  }
  dD13(h: readonly Block[]): readonly Yaku[] {
    if (h.length == 13) return [];
    const z = [5, 6, 7];
    const cond =
      h.filter(
        (b) =>
          !(b instanceof BlockPair) &&
          b.tiles.some((t) => t.t == TYPE.Z && z.includes(t.n))
      ).length == 3;
    return cond ? [{ name: "大三元", han: 13, isYakuman: true }] : [];
  }
  dE13(h: readonly Block[]): readonly Yaku[] {
    const cond = h.every((b) => b.tiles[0].t == TYPE.Z);
    return cond ? [{ name: "字一色", han: 13, isYakuman: true }] : [];
  }
  dF13(h: readonly Block[]): readonly Yaku[] {
    const cond = h.every(
      (b) =>
        (b instanceof BlockAnKan ||
          b instanceof BlockShoKan ||
          b instanceof BlockDaiKan ||
          b instanceof BlockThree ||
          b instanceof BlockPon ||
          b instanceof BlockPair) &&
        N19.includes(b.tiles[0].n)
    );
    return cond ? [{ name: "清老頭", han: 13, isYakuman: true }] : [];
  }
  dG13(h: readonly Block[]): readonly Yaku[] {
    if (h.length == 7) return [];
    const cond = h.every(
      (b) =>
        b instanceof BlockAnKan ||
        b instanceof BlockShoKan ||
        b instanceof BlockDaiKan ||
        b instanceof BlockPair
    );
    return cond ? [{ name: "四槓子", han: 13, isYakuman: true }] : [];
  }
  dH13(h: readonly Block[]): readonly Yaku[] {
    if (h.length == 13) return [];
    if (h.length == 7) return [];
    const zn = [1, 2, 3, 4];
    const cond1 =
      h.filter((b) => {
        const s = b.tiles[0];
        return s.t == TYPE.Z && zn.includes(s.n);
      }).length == 4;
    if (!cond1) return [];
    const cond2 = h
      .find((b) => b instanceof BlockPair)!
      .tiles.some((t) => t.t == TYPE.Z && zn.includes(t.n));
    return cond2
      ? [{ name: "小四喜", han: 13, isYakuman: true }]
      : [{ name: "大四喜", han: 13, isYakuman: true }];
  }
  dI13(h: readonly Block[]): readonly Yaku[] {
    const check = (t: Tile) => {
      if (t.equals(new Tile(TYPE.Z, 6))) return true;
      if (t.t == TYPE.S && [2, 3, 4, 6, 8].includes(t.n)) return true;
      return false;
    };
    return h.every((b) => b.tiles.every((t) => check(t)))
      ? [{ name: "緑一色", han: 13, isYakuman: true }]
      : [];
  }
  // TODO 天和・地和
  dJ13(h: readonly Block[]): readonly Yaku[] {
    return [];
  }
  dK13(h: readonly Block[]): readonly Yaku[] {
    return [];
  }

  /**
   * 手牌の構成から符を計算する
   */
  calcFu(h: readonly Block[]) {
    if (h.length == 7) return 25;

    const base = 20;
    let fu = base;

    const myWind = this.cfg.myWind.n;
    const round = this.cfg.roundWind.n;

    const lastBlock = h.find((b) =>
      b.tiles.some((t) => t.has(OP.TSUMO) || t.has(OP.RON))
    )!;
    const isCalled = this.getCalledPenalty() == 1;
    const isTsumo = lastBlock.tiles.some((t) => t.has(OP.TSUMO));

    // 刻子
    const calcTriple = (b: Block, base: number) => {
      const tile = b.tiles[0];
      if (tile.t == TYPE.Z || N19.includes(tile.n)) return base * 2;
      else return base;
    };

    for (const b of h) {
      switch (true) {
        case b instanceof BlockThree:
          const base = b.tiles.some((t) => t.has(OP.RON)) ? 2 : 4;
          fu += calcTriple(b, base);
          break;
        case b instanceof BlockPon:
          fu += calcTriple(b, 2);
          break;
        case b instanceof BlockDaiKan || b instanceof BlockShoKan:
          fu += calcTriple(b, 8);
          break;
        case b instanceof BlockAnKan:
          fu += calcTriple(b, 16);
          break;
      }
    }

    // 待ち
    const calcLast = (b: Block) => {
      if (b instanceof BlockThree) return 0; // シャンポン
      if (b instanceof BlockPair) return 2; // 単騎
      const tiles = b.tiles;
      const idx = tiles.findIndex((t) => t.has(OP.TSUMO) || t.has(OP.RON));
      if (idx == 1) return 2; // カンチャン
      else if (idx == 0 && tiles[2].n == 9) return 2; //ペンチャン
      else if (idx == 2 && tiles[0].n == 1) return 2; //ペンチャン
      return 0; // リャンメン
    };

    fu += calcLast(lastBlock);

    // Pair
    const pair = h.find((b) => b instanceof BlockPair)!;
    const tile = pair.tiles[0];
    if (tile.t == TYPE.Z) {
      if ([5, 6, 7].includes(tile.n)) fu += 2;
      if (tile.n == round) fu += 2;
      // 連風対子は無効
      else if (tile.n == myWind) fu += 2;
    }

    // 平和
    let isAllRuns = false;
    if (!isCalled && fu == base) isAllRuns = true;
    if (isTsumo && !isAllRuns) fu += 2; // 平和以外のツモは2
    if (!isTsumo && !isCalled) fu += 10; // 面前ロン
    if (!isTsumo && !isCalled && fu == 30) isAllRuns = true; // 面前ロンで 30 は平和
    if (isCalled && fu == base) fu = 30; // 鳴きの 20 は 30 になる

    return fu;
  }
}

/**
 * オペレータを無視したブロックの文字列を返す
 */
const buildBlockKey = (b: Block) => {
  return b.tiles.reduce((a: string, b: Tile) => `${a}${b.n}${b.t}`, "");
};

const countSameBlocks = (h: readonly Block[]) => {
  const m = h
    .filter((b) => b instanceof BlockRun)
    .reduce((acc, b) => {
      const key = buildBlockKey(b);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as { [key: string]: number });

  return Object.values(m).filter((v) => v >= 2).length;
};

const minTile = (b: Block) => {
  return [...b.tiles].sort(compareTiles)[0];
};

/**
 * ドラ表示牌を入力としてドラの牌を返す
 */
export const toDora = (doraIndicator: Tile) => {
  const n = doraIndicator.n;
  const t = doraIndicator.t;
  if (t == TYPE.Z) {
    if (n == 4) return new Tile(t, 1);
    else if (n == 7) return new Tile(t, 5);
  }
  return new Tile(t, (n % 9) + 1);
};
