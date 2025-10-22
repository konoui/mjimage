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
  nextWind,
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
  tileSortFunc,
  SerializedBlock,
  isNum5,
} from "../core/parser";
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

export function* forHand(options?: { skipBack?: boolean; filterBy?: Type[] }) {
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
  constructor(input: string | Block[], allowBackBlock = false) {
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
  private init(input: string | Block[], allowBackBlock: boolean) {
    const blocks = Array.isArray(input) ? input : new Parser(input).parse();
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
        !Array.isArray(input) &&
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
        `hand has drawn: ${this.drawn} but no tile in hands: ${tiles.join("")}`
      );
      tiles[idx] = tiles[idx].clone({ add: OP.TSUMO });
    }
    return tiles;
  }
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
  get called() {
    return this.data.called;
  }
  get reached() {
    return this.data.reached;
  }
  get drawn() {
    return this.data.tsumo;
  }
  get menzen() {
    return !this.called.some((v) => !(v instanceof BlockAnKan));
  }
  sum(type: Type) {
    let sum = 0;
    for (const [t, n] of forHand({ filterBy: [type] })) sum += this.get(t, n);
    return sum;
  }
  get(t: Type, n: number) {
    if (t == TYPE.BACK) return this.data[t][1];
    return this.data[t][n];
  }
  inc(tiles: readonly Tile[]): readonly Tile[] {
    const backup: Tile[] = [];
    for (const t of tiles) {
      const isInvalidCount = t.t != TYPE.BACK && this.get(t.t, t.n) >= 4;
      const isInvalidRed = t.has(OP.RED) && this.get(t.t, 0) > 0;
      if (isInvalidCount || isInvalidRed) {
        this.dec(backup);
        const msg = isInvalidCount
          ? `tile ${t} exists more than 4 times`
          : `red tile ${t} appears more than 1 times`;
        throw new Error(`invalid hand: ${msg} in ${this.toString()}`);
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
  dec(tiles: readonly Tile[]): readonly Tile[] {
    const backup: Tile[] = [];
    for (const t of tiles) {
      const isInvalidCount = this.get(t.t, t.n) < 1;
      const isInvalidRed = t.has(OP.RED) && this.get(t.t, 0) <= 0;
      if (isInvalidCount || isInvalidRed) {
        this.inc(backup);
        const msg = isInvalidCount
          ? `tile ${t} is not in`
          : `red tile ${t} is not in`;
        throw new Error(`invalid hand: ${msg} in ${this.toString()}`);
      }

      backup.push(t);

      if (t.t == TYPE.BACK) this.data[t.t][1] -= 1;
      else {
        this.data[t.t][t.n] -= 1;
        if (t.has(OP.RED)) this.data[t.t][0] -= 1;
      }

      // r5 ではなく 5 で減算される際に最後の牌が red であれば red を 0 にする。
      if (isNum5(t) && this.get(t.t, 5) == 0 && this.get(t.t, 0) > 0) {
        this.data[t.t][0] = 0;
        const c = backup.pop()!.clone({ add: OP.RED });
        backup.push(c);
      }
    }

    return backup;
  }
  draw(t: Tile) {
    const ts = t.clone({ add: OP.TSUMO });
    this.inc([ts]);
    this.data.tsumo = ts;
    return;
  }
  discard(t: Tile) {
    this.dec([t]);
    this.data.tsumo = null;
    return;
  }
  reach() {
    if (!this.menzen) throw new Error("cannot reach");
    if (this.data.reached) throw new Error("already reached");
    this.data.reached = true;
  }
  call(b: BlockPon | BlockChi | BlockDaiKan) {
    const toRemove = b.tiles.filter((v) => !v.has(OP.HORIZONTAL));
    if (toRemove.length != b.tiles.length - 1)
      throw new Error(`removal: ${toRemove} block: ${b}`);

    this.dec(toRemove);
    this.data.called = [...this.called, b];
    this.data.tsumo = null;
    return;
  }
  kan(b: BlockAnKan | BlockShoKan) {
    if (b instanceof BlockAnKan) {
      this.dec(b.tiles);
      this.data.called = [...this.called, b];
      this.data.tsumo = null;
      return;
    }

    if (b instanceof BlockShoKan) {
      const idx = this.data.called.findIndex(
        (v) => v.is(BLOCK.PON) && v.tiles[0].equals(b.tiles[0]) // FIXME handle which tile is called
      );
      if (idx == -1) throw new Error(`unable to find ${b.tiles[0]}`);
      let t = b.tiles[0];
      // 適当に選んだ牌が red であればエラーが発生しないように red を削除して dec する
      t = isNum5(t) ? t.clone({ remove: OP.RED }) : t;
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

    throw new Error(`unexpected input ${b}`);
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
  calc() {
    return Math.min(
      this.sevenPairs(),
      this.thirteenOrphans(),
      this.fourSetsOnePair()
    );
  }
  sevenPairs() {
    if (this.hand.called.length > 0) return Infinity;
    let nPairs = 0;
    let nIsolated = 0;
    for (const [t, n] of forHand({ skipBack: true })) {
      if (this.hand.get(t, n) == 2) nPairs++;
      if (this.hand.get(t, n) == 1) nIsolated++;
    }

    if (nPairs > 7) nPairs = 7;
    if (nPairs + nIsolated >= 7) nIsolated = 7 - nPairs;
    return 13 - 2 * nPairs - nIsolated;
  }

  thirteenOrphans() {
    if (this.hand.called.length > 0) return Infinity;
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

  fourSetsOnePair() {
    const calc = (hasPair: boolean) => {
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
      const mr = this.patternNumType(TYPE.M);
      const pr = this.patternNumType(TYPE.P);
      const sr = this.patternNumType(TYPE.S);
      for (const m of [mr.patternA, mr.patternB]) {
        for (const p of [pr.patternA, pr.patternB]) {
          for (const s of [sr.patternA, sr.patternB]) {
            // [set, pair, isolated]
            const v = [this.hand.called.length, 0, 0];
            for (let i = 0; i < 3; i++) {
              v[i] += m[i] + p[i] + s[i] + z[i] + b[i];
            }
            const r = this.calcCommon(v[0], v[1], v[2], hasPair);
            if (r < min) min = r;
          }
        }
      }
      return min;
    };
    // not having pairs case for initial
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
  private patternNumType(
    t: typeof TYPE.M | typeof TYPE.S | typeof TYPE.P,
    n = 1
  ): {
    patternA: [number, number, number];
    patternB: [number, number, number];
  } {
    if (n > 9) return this.groupRemainingTiles(t);

    let max = this.patternNumType(t, n + 1);

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
      const r = this.patternNumType(t, n);
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
      const r = this.patternNumType(t, n);
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
  private calcCommon(
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

  calc(lastTile: Tile): readonly Block[][] {
    return this.markDrawn(
      [
        ...this.sevenPairs(),
        ...this.thirteenOrphans(),
        ...this.nineGates(),
        ...this.fourSetsOnePair(),
      ],
      lastTile
    );
  }

  markDrawn(hands: readonly Block[][], lastTile: Tile): readonly Block[][] {
    if (hands.length == 0) return [];
    const op =
      this.hand.drawn != null || lastTile.has(OP.TSUMO) ? OP.TSUMO : OP.RON;

    const indexes: [number, number, number][] = [];
    for (let i = 0; i < hands.length; i++) {
      const hand = hands[i];
      const m: { [key: string]: boolean } = {}; // map to reduce same blocks such as ["123m", "123m"]
      for (let j = 0; j < hand.length; j++) {
        const block = hand[j];
        if (block.isCalled()) continue;
        const k = block.tiles.findIndex(
          (t) => t.equals(lastTile) && lastTile.has(OP.RED) == t.has(OP.RED)
        );
        if (k < 0) continue;
        const key = buildKey(block);
        if (m[key]) continue;
        m[key] = true;
        indexes.push([i, j, k]);
      }
    }

    if (indexes.length == 0)
      throw new Error(
        `found no tile ${lastTile.toString()} in hands ${hands[0].toString()}`
      );

    const newHands: Block[][] = [];
    for (const [hidx, bidx, tidx] of indexes) {
      const hand = hands[hidx];
      const newHand = [...hand];

      const block = newHand[bidx];
      const newTile = block.tiles[tidx].clone({ add: op });
      newHand[bidx] = block.clone({
        replace: { idx: tidx, tile: newTile },
      }); // update with new block tiles with op
      newHands.push(newHand);
    }

    return newHands;
  }

  sevenPairs(): readonly Block[][] {
    if (this.hand.called.length > 0) return [];
    const ret: Block[] = [];
    for (const [t, n] of forHand({ skipBack: true })) {
      const count = this.hand.get(t, n);
      if (count == 2) {
        // red に対応するため dec した tile を使用する
        const tiles = this.hand.dec(new Array(2).fill(new Tile(t, n)));
        ret.push(new BlockPair(tiles[0], tiles[1]));
        this.hand.inc(tiles);
      } else if (count == 0) continue;
      else return [];
    }

    return [ret];
  }

  thirteenOrphans(): readonly Block[][] {
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

  nineGates(): readonly Block[][] {
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

  fourSetsOnePair(): readonly Block[][] {
    let ret: Block[][] = [];
    for (const [t, n] of forHand()) {
      if (this.hand.get(t, n) >= 2) {
        const toDec = new Array(2).fill(new Tile(t, n));
        // OP.RED をつけないと、最後の（面子の） dec で RED が消費される。
        // e.g. 5s が 3枚あり、頭で 5s を2枚消費すると、patternAll で r5s と 5s のパータンを計算できなくなる。
        // 明示的に OP.RED を頭で消費するようにする。
        if (n == 5 && this.hand.get(t, 0) > 0 && this.hand.get(t, n) >= 3) {
          toDec[1] = new Tile(t, n, [OP.RED]);
        }
        const tiles = this.hand.dec(toDec);
        // 1. calc all cases without two pairs
        // 2. remove non five blocks
        // 3. add two pairs to the head
        const v = this.patternAll()
          .filter((arr) => arr.length == 4)
          .map((arr) => {
            arr.unshift(new BlockPair(tiles[0], tiles[1]));
            return arr;
          });
        ret = [...ret, ...v];
        this.hand.inc(tiles);
      }
    }

    return ret;
  }

  private patternAll(): readonly Block[][] {
    // [["123m", "123m"], ["222m", "333m"]]
    // [["123s", "123s"]]
    // result: [["123m", "123m", "123s", "123s"], ["111m", "333m", "123s", "123s"]]
    const vvv = [
      this.addRedPattern(TYPE.M, this.handleNumType(TYPE.M)),
      this.addRedPattern(TYPE.P, this.handleNumType(TYPE.P)),
      this.addRedPattern(TYPE.S, this.handleNumType(TYPE.S)),
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
  private handleBack(): readonly Block[][] {
    const bt = TYPE.BACK;
    const sum = this.hand.get(bt, 0);
    if (sum < 3) return [];
    const p = new Tile(bt, 0);
    const b = Array(Math.floor(sum / 3)).fill(new BlockThree([p, p, p]));
    return b.length == 0 ? [] : [b];
  }

  private handleZ(): readonly Block[][] {
    const z: Block[] = [];
    for (const [zt, n] of forHand({ filterBy: [TYPE.Z] })) {
      if (this.hand.get(zt, n) == 0) continue;
      else if (this.hand.get(zt, n) != 3) return [];
      const p = new Tile(zt, n);
      z.push(new BlockThree([p, p, p]));
    }
    return z.length == 0 ? [] : [z];
  }

  // TODO similar to markDrawn
  private addRedPattern(t: Type, hands: readonly Block[][]) {
    if (!(this.hand.get(t, 0) > 0 && this.hand.get(t, 5) >= 2)) return hands;

    const nonRed = new Tile(t, 5);
    const red = new Tile(t, 5, [OP.RED]);
    const nonRedIndexes: [number, number, number][] = [];
    const redIndexes: [number, number, number][] = [];
    for (let i = 0; i < hands.length; i++) {
      const hand = hands[i];
      const m: { [key: string]: boolean } = {};
      for (let j = 0; j < hand.length; j++) {
        const block = hand[j];
        const k = block.tiles.findIndex(
          (t) => t.equals(nonRed) && !t.has(OP.RED)
        );
        const rk = block.tiles.findIndex((t) => t.equals(red) && t.has(OP.RED));
        if (rk > -1) redIndexes.push([i, j, rk]);
        if (rk > -1 && k > -1) continue; // blockThree
        if (k < 0) continue;
        const key = buildKey(block);
        if (m[key]) continue;
        m[key] = true;
        nonRedIndexes.push([i, j, k]);
      }
    }

    if (redIndexes.length == 0) return hands;

    const newHands: Block[][] = [];
    for (const [hidx, bidx, tidx] of nonRedIndexes) {
      const hand = hands[hidx];
      const newHand = [...hand];

      // 5 を r5 に変換
      const nonRedblock = newHand[bidx];
      newHand[bidx] = nonRedblock.clone({
        replace: { idx: tidx, tile: red },
      });

      // r5 を 5 に変換
      const redIndex = redIndexes.find((index) => index[0] == hidx);
      if (redIndex == null) continue;
      const redblock = newHand[redIndex[1]];
      if (redblock == null) console.error(redIndex, nonRedIndexes);
      newHand[redIndex[1]] = redblock.clone({
        replace: { idx: redIndex[2], tile: nonRed },
      });
      // 345 と 34r5 入れ変えても同じ
      if (buildKey(nonRedblock) == buildKey(redblock)) continue;
      newHands.push(newHand);
    }

    return [...hands, ...newHands];
  }
  private handleNumType(
    t: typeof TYPE.M | typeof TYPE.S | typeof TYPE.P,
    n: number = 1
  ): readonly Block[][] {
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
        arr.unshift(new BlockRun([tiles[0], tiles[1], tiles[2]]));
        ret.push(arr);
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
        arr.unshift(new BlockThree([tiles[0], tiles[1], tiles[2]]));
        ret.push(arr);
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
  enableRoundUp8000?: boolean;
  disableCountable32000?: boolean;
  disableDouble32000?: boolean;
}

export interface WinResult {
  deltas: { readonly [w in Wind]: number };
  han: number;
  fu: number;
  yakus: readonly Yaku[];
  points: number;
  rawPoints: number;
  hand: Block[]; // TODO readonly
  boardContext: BoardContext;
  description: string;
}

export interface Yaku {
  name: string;
  han: number;
  is32000?: boolean;
}

export class PointCalculator {
  hand: Hand;
  cfg: {
    doras: readonly Tile[];
    blindDoras: readonly Tile[];
    roundWind: Tile;
    myWind: Tile;
    reached: 0 | 1 | 2;
    sticks: { readonly reach: number; readonly dead: number };
    replacementWin: boolean;
    quadWin: boolean;
    finalWallWin: boolean;
    finalDiscardWin: boolean;
    oneShotWin: boolean;
    enableRoundUp8000: boolean;
    disableCountable32000: boolean;
    disableDouble32000: boolean;
    orig: BoardContext;
  };
  constructor(hand: Hand, params: BoardContext) {
    this.hand = hand;
    this.cfg = {
      doras: params.doraIndicators.map((v) => toDora(v)), // convert to dora
      blindDoras:
        params.hiddenDoraIndicators == null
          ? []
          : params.hiddenDoraIndicators.map((v) => toDora(v)),
      roundWind: Tile.from(params.round.substring(0, 2)),
      myWind: Tile.from(params.myWind),
      reached: params.reached ?? 0,
      sticks: params.sticks ?? { dead: 0, reach: 0 },
      replacementWin: params.replacementWin ?? false,
      quadWin: params.quadWin ?? false,
      finalWallWin: params.finalWallWin ?? false,
      finalDiscardWin: params.finalDiscardWin ?? false,
      oneShotWin: params.oneShotWin ?? false,
      enableRoundUp8000: params.enableRoundUp8000 ?? false,
      disableCountable32000: params.disableCountable32000 ?? false,
      disableDouble32000: params.disableDouble32000 ?? false,
      orig: params,
    };
  }

  calc(...hands: readonly Block[][]): WinResult | false {
    const patterns = this.calcPatterns(hands);
    let is32000 = false;
    let isCountable32000 = false;
    if (patterns.length == 0) return false;
    let max = [0, 0]; // [yayu, fu]
    let idx = 0;
    for (let i = 0; i < patterns.length; i++) {
      const pt = patterns[i];
      is32000 = pt.is32000 ?? false;
      const han = pt.yakus.reduce((a: number, b: Yaku) => {
        return a + b.han;
      }, 0);
      if (han > max[0]) {
        idx = i;
        max = [han, pt.fu];
      } else if (han == max[0] && pt.fu > max[1]) {
        idx = i;
        max = [han, pt.fu];
      }
    }

    const ceil = (v: number, p = 100) => {
      return Math.ceil(v / p) * p;
    };

    const fu = max[1] != 25 ? ceil(max[1], 10) : 25; // 七対子
    const han = max[0];
    // 40符以上の4飜は満貫の2000にする。
    let base = Math.min(fu * 2 ** (han + 2), 2000);
    switch (han) {
      case 26:
        base = 16000;
        break;
      case 13:
        base = 8000;
        break;
      case 12:
      case 11:
        base = 6000;
        break;
      case 10:
      case 9:
      case 8:
        base = 4000;
        break;
      case 7:
      case 6:
        base = 3000;
        break;
      case 5:
        base = 2000;
        break;
    }
    // 数え役満
    if (
      han >= 13 &&
      han < 26 &&
      patterns[idx].yakus.every((v) => v.is32000 == null || v.is32000 == false)
    ) {
      base = this.cfg.disableCountable32000 ? 6000 : 8000; // 3倍満にする
      isCountable32000 = !this.cfg.disableCountable32000;
    }
    // 切り上げ満貫
    if (this.cfg.enableRoundUp8000) {
      if ((fu == 30 && han == 4) || (fu == 60 && han == 3)) {
        base = 2000;
      }
    }

    const isTsumo = patterns[idx].hand.some((b) =>
      b.tiles.some((t) => t.has(OP.TSUMO))
    );
    const myWind = this.cfg.orig.myWind;
    const isParent = myWind == WIND.E;

    let desc = "";
    const deltas = createWindMap(0);
    if (!isTsumo) {
      const deadPoint = this.cfg.sticks.dead * 300;
      if (this.cfg.orig.ronWind == null)
        throw new Error("ron wind is not specified in the parameters");
      const coefficient = isParent ? 6 : 4;
      const basePoint = ceil(base * coefficient);
      const point = basePoint + deadPoint;
      deltas[myWind] += point;
      deltas[this.cfg.orig.ronWind] -= point;
      desc = `${point}`;
    } else {
      const deadPoint = this.cfg.sticks.dead * 100;
      if (isParent) {
        const basePoint = ceil(base * 2);
        deltas[WIND.E] += basePoint * 3 + deadPoint * 3;
        deltas[WIND.S] -= basePoint + deadPoint;
        deltas[WIND.W] -= basePoint + deadPoint;
        deltas[WIND.N] -= basePoint + deadPoint;
        desc = `${basePoint}`;
      } else {
        for (const key of Object.values(WIND)) {
          if (key == myWind) continue;
          const coefficient = key == WIND.E ? 2 : 1;
          const basePoint = ceil(base * coefficient);
          deltas[key] -= basePoint + deadPoint;
          deltas[myWind] += basePoint + deadPoint;
        }
        desc = `${ceil(base * 1)}-${ceil(base * 2)}`;
      }
    }

    const rawPoint = deltas[myWind] - this.cfg.sticks.dead * 300;
    deltas[myWind] += 1000 * this.cfg.sticks.reach;

    let description;
    if (is32000) description = "役満";
    else if (isCountable32000) description = "数え役満";
    else if (base == 2000) description = `${fu}符${han}飜 満貫${desc}`;
    else if (base == 3000) description = `${fu}符${han}飜 跳満${desc}`;
    else if (base == 4000) description = `${fu}符${han}飜 倍満${desc}`;
    else if (base == 6000) description = `${fu}符${han}飜 三倍満${desc}`;
    else description = `${fu}符${han}飜 ${desc}`;
    const v: WinResult = {
      deltas: deltas,
      han: han,
      fu: fu,
      yakus: patterns[idx].yakus,
      points: deltas[myWind],
      rawPoints: rawPoint,
      hand: patterns[idx].hand,
      boardContext: this.cfg.orig,
      description,
    };
    return v;
  }
  calcPatterns(hands: readonly Block[][]) {
    const ret: {
      yakus: Yaku[];
      fu: number;
      hand: Block[];
      is32000?: boolean;
    }[] = [];
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
        if (this.cfg.disableDouble32000 && y.han > 13) y.han = 13;
        return y;
      });
      if (v.length == 0) continue;
      ret.push({
        yakus: v,
        fu: 30,
        hand: hand,
        is32000: true,
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
        fu: fu,
        hand: hand,
      });
    }

    return ret;
  }
  private minus() {
    return this.hand.menzen ? 0 : 1;
  }

  dA1(h: readonly Block[]): Yaku[] {
    if (this.cfg.reached == 1) return [{ name: "立直", han: 1 }];
    if (this.cfg.reached == 2) return [{ name: "ダブル立直", han: 2 }];
    return [];
  }
  dB1(h: readonly Block[]): Yaku[] {
    if (this.minus() != 0) return [];
    if (this.hand.drawn == null) [];
    const cond = h.some((b) => b.tiles.some((t) => t.has(OP.TSUMO)));
    return cond ? [{ name: "門前清自摸和", han: 1 }] : [];
  }
  dC1(h: readonly Block[]): Yaku[] {
    if (this.minus() != 0) return [];
    const name = "平和";
    const fu = this.calcFu(h);
    if (fu == 20) return [{ name: name, han: 1 }];
    if (!h.some((b) => b.tiles.some((t) => t.has(OP.TSUMO)))) {
      if (fu == 30) return [{ name: name, han: 1 }];
    }
    return [];
  }
  dD1(h: readonly Block[]): Yaku[] {
    const cond = h.some((block) =>
      block.tiles.some((t) => t.t == TYPE.Z || N19.includes(t.n))
    );
    return cond ? [] : [{ name: "断么九", han: 1 }];
  }
  dE1(h: readonly Block[]): Yaku[] {
    if (this.minus() != 0) return [];

    const count = countSameBlocks(h);
    return count == 1 ? [{ name: "一盃口", han: 1 }] : [];
  }
  dF1(h: readonly Block[]): Yaku[] {
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
  dG1(h: readonly Block[]): Yaku[] {
    return this.cfg.oneShotWin ? [{ name: "一発", han: 1 }] : [];
  }
  dH1(h: readonly Block[]): Yaku[] {
    return this.cfg.replacementWin ? [{ name: "嶺上開花", han: 1 }] : [];
  }
  dI1(h: readonly Block[]): Yaku[] {
    return this.cfg.quadWin ? [{ name: "搶槓", han: 1 }] : [];
  }
  dJ1(h: readonly Block[]): Yaku[] {
    return this.cfg.finalWallWin ? [{ name: "海底摸月", han: 1 }] : [];
  }
  dK1(h: readonly Block[]): Yaku[] {
    return this.cfg.finalDiscardWin ? [{ name: "河底撈魚", han: 1 }] : [];
  }
  dX1(h: readonly Block[]): Yaku[] {
    let dcount = 0;
    let bcount = 0;
    let rcount = 0;
    for (const b of h) {
      for (const t of b.tiles) {
        for (const d of this.cfg.doras) if (t.equals(d)) dcount++;
        for (const d of this.cfg.blindDoras) if (t.equals(d)) bcount++;
        if (t.has(OP.RED)) rcount++;
      }
    }

    const ret: Yaku[] = [];
    if (dcount > 0) ret.push({ name: "ドラ", han: dcount });
    if (rcount > 0) ret.push({ name: "赤ドラ", han: rcount });
    if (this.hand.reached && bcount > 0)
      ret.push({ name: "裏ドラ", han: bcount });
    return ret;
  }

  dA2(h: readonly Block[]): Yaku[] {
    return h.length == 7 ? [{ name: "七対子", han: 2 }] : [];
  }
  dB2(h: readonly Block[]): Yaku[] {
    const check = (bb: Block) => {
      return bb instanceof BlockRun || bb instanceof BlockChi;
    };
    for (const block of h) {
      if (!check(block)) continue;
      const tile = minTile(block);
      if (tile.t == TYPE.Z) continue;
      const filteredTypes = [TYPE.M, TYPE.P, TYPE.S].filter((v) => v != tile.t);
      const cond1 = h.some((b) => {
        const newTile = new Tile(filteredTypes[0], tile.n);
        return check(b) && newTile.equals(minTile(b));
      });
      const cond2 = h.some((b) => {
        const newTile = new Tile(filteredTypes[1], tile.n);
        return check(b) && newTile.equals(minTile(b));
      });
      if (cond1 && cond2) return [{ name: "三色同順", han: 2 - this.minus() }];
    }
    return [];
  }
  dC2(h: readonly Block[]): Yaku[] {
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
  dD2(h: readonly Block[]): Yaku[] {
    const l = h.filter((b) => {
      return (
        (b instanceof BlockAnKan || b instanceof BlockThree) &&
        !b.tiles.some((t) => t.has(OP.RON)) // ignore ron
      );
    }).length;
    return l >= 3 ? [{ name: "三暗刻", han: 2 }] : [];
  }
  dE2(h: readonly Block[]): Yaku[] {
    const l = h.filter(
      (b) =>
        b instanceof BlockAnKan ||
        b instanceof BlockShoKan ||
        b instanceof BlockDaiKan
    ).length;
    return l >= 3 ? [{ name: "三槓子", han: 2 }] : [];
  }
  dF2(h: readonly Block[]): Yaku[] {
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
      const filteredTypes = [TYPE.M, TYPE.P, TYPE.S].filter((v) => v != tile.t);
      const cond1 = h.some((b) => {
        const newTile = new Tile(filteredTypes[0], tile.n);
        return check(b) && newTile.equals(minTile(b));
      });
      const cond2 = h.some((b) => {
        const newTile = new Tile(filteredTypes[1], tile.n);
        return check(b) && newTile.equals(minTile(b));
      });
      if (cond1 && cond2) return [{ name: "三色同刻", han: 2 }];
    }
    return [];
  }
  dG2(h: readonly Block[]): Yaku[] {
    if (h.length == 7) return [];
    const l = h.filter((b) => {
      const t = b.tiles[0];
      return t.t == TYPE.Z && [5, 6, 7].includes(t.n);
    }).length;
    return l == 3 ? [{ name: "小三元", han: 2 }] : [];
  }
  dH2(h: readonly Block[]): Yaku[] {
    const cond = h.every((b) => {
      const values = b.tiles[0].t == TYPE.Z ? NZ : N19;
      return b.tiles.every((t) => values.includes(t.n));
    });
    return cond ? [{ name: "混老頭", han: 2 }] : [];
  }
  dI2(h: readonly Block[]): Yaku[] {
    if (h.length == 7) return [];
    // 一つは BlockRun もしくは BlockChi がある。なければ、老頭に該当するため
    if (!h.some((b) => b instanceof BlockRun || b instanceof BlockChi))
      return [];
    if (!h.some((b) => b.tiles[0].t == TYPE.Z)) return [];

    const cond = h.every((block) => {
      const values = block.tiles[0].t == TYPE.Z ? NZ : N19;
      return block.tiles.some((t) => values.includes(t.n));
    });
    return cond ? [{ name: "混全帯么九", han: 2 - this.minus() }] : [];
  }
  dJ2(h: readonly Block[]): Yaku[] {
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
        return [{ name: "一気通貫", han: 2 - this.minus() }];
    }
    return [];
  }

  dA3(h: readonly Block[]): Yaku[] {
    const cond = !h.some((block) => block.tiles[0].t == TYPE.Z);
    if (cond) return [];
    for (const t of Object.values(TYPE)) {
      const ok = h.every((b) => b.tiles[0].t == TYPE.Z || b.tiles[0].t == t);
      if (ok) return [{ name: "混一色", han: 3 - this.minus() }];
    }
    return [];
  }
  dB3(h: readonly Block[]): Yaku[] {
    if (h.length == 7) return [];
    if (!h.some((b) => b instanceof BlockRun || b instanceof BlockChi))
      return [];
    if (h.some((b) => b.tiles[0].t == TYPE.Z)) return [];

    const cond = h.every((b) => {
      return b.tiles.some((t) => N19.includes(t.n));
    });
    return cond ? [{ name: "純全帯么九色", han: 3 - this.minus() }] : [];
  }
  dC3(h: readonly Block[]): Yaku[] {
    if (this.minus() != 0) return [];

    const count = countSameBlocks(h);
    return count == 2 ? [{ name: "ニ盃口", han: 3 }] : [];
  }
  dA6(h: readonly Block[]): Yaku[] {
    if (h.some((block) => block.tiles[0].t == TYPE.Z)) return [];
    for (const t of Object.values(TYPE)) {
      if (t == TYPE.Z) continue;
      const ok = h.every((v) => v.tiles[0].t == t);
      if (ok) return [{ name: "清一色", han: 6 - this.minus() }];
    }
    return [];
  }

  dA13(h: readonly Block[]): Yaku[] {
    if (h.length != 13) return [];
    const double = h.some(
      (b) =>
        b instanceof BlockPair &&
        b.tiles.some((t) => t.has(OP.TSUMO) || t.has(OP.RON))
    );
    return double
      ? [{ name: "国士無双13面待ち", han: 26, is32000: true }]
      : [{ name: "国士無双", han: 13, is32000: true }];
  }
  dB13(h: readonly Block[]): Yaku[] {
    return h.length == 1 ? [{ name: "九蓮宝燈", han: 13, is32000: true }] : [];
  }
  dC13(h: readonly Block[]): Yaku[] {
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
      ? [{ name: "四暗刻単騎待ち", han: 26, is32000: true }]
      : [{ name: "四暗刻", han: 13, is32000: true }];
  }
  dD13(h: readonly Block[]): Yaku[] {
    if (h.length == 13) return [];
    const z = [5, 6, 7];
    const cond =
      h.filter(
        (b) =>
          !(b instanceof BlockPair) &&
          b.tiles.some((t) => t.t == TYPE.Z && z.includes(t.n))
      ).length == 3;
    return cond ? [{ name: "大三元", han: 13, is32000: true }] : [];
  }
  dE13(h: readonly Block[]): Yaku[] {
    const cond = h.every((b) => b.tiles[0].t == TYPE.Z);
    return cond ? [{ name: "字一色", han: 13, is32000: true }] : [];
  }
  dF13(h: readonly Block[]): Yaku[] {
    const cond = h.every((b) =>
      b.tiles.every((t) => t.t != TYPE.Z && N19.includes(t.n))
    );
    return cond ? [{ name: "清老頭", han: 13, is32000: true }] : [];
  }
  dG13(h: readonly Block[]): Yaku[] {
    const cond =
      h.filter(
        (b) =>
          b instanceof BlockAnKan ||
          b instanceof BlockShoKan ||
          b instanceof BlockDaiKan
      ).length == 4;
    return cond ? [{ name: "四槓子", han: 13, is32000: true }] : [];
  }
  dH13(h: readonly Block[]): Yaku[] {
    if (h.length == 13) return [];
    if (h.length == 7) return [];
    const zn = [1, 2, 3, 4];
    const cond1 =
      h.filter((b) => b.tiles.some((t) => t.t == TYPE.Z && zn.includes(t.n)))
        .length == 4;
    if (!cond1) return [];
    const cond2 = h
      .find((b) => b instanceof BlockPair)!
      .tiles.some((t) => t.t == TYPE.Z && zn.includes(t.n));
    return cond2
      ? [{ name: "小四喜", han: 13, is32000: true }]
      : [{ name: "大四喜", han: 13, is32000: true }];
  }
  dI13(h: readonly Block[]): Yaku[] {
    const check = (t: Tile) => {
      if (t.equals(new Tile(TYPE.Z, 6))) return true;
      if (t.t == TYPE.S && [2, 3, 4, 6, 8].includes(t.n)) return true;
      return false;
    };
    return h.every((b) => b.tiles.every((t) => check(t)))
      ? [{ name: "緑一色", han: 13, is32000: true }]
      : [];
  }
  // TODO 天和・地和
  dJ13(h: readonly Block[]): Yaku[] {
    return [];
  }
  dK13(h: readonly Block[]): Yaku[] {
    return [];
  }

  calcFu(h: readonly Block[]) {
    const base = 20;
    let fu = base;

    const myWind = this.cfg.myWind.n;
    const round = this.cfg.roundWind.n;

    if (h.length == 7) return 25;

    const lastBlock = h.find((b) =>
      b.tiles.some((t) => t.has(OP.TSUMO) || t.has(OP.RON))
    )!;
    const isCalled = this.minus() == 1;
    const isTsumo = lastBlock.tiles.some((t) => t.has(OP.TSUMO));

    // 刻子
    const calcTriple = (b: Block, base: number) => {
      const tile = b.tiles[0];
      if (tile.t == TYPE.Z) return base * 2;
      else if (N19.includes(tile.n)) return base * 2;
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

const buildKey = (b: Block) => {
  return b.tiles.reduce((a: string, b: Tile) => `${a}${b.n}${b.t}`, "");
};

const countSameBlocks = (h: readonly Block[]) => {
  const m: { [key: string]: number } = {};
  for (const b of h) {
    if (!(b instanceof BlockRun)) continue;
    // instead of b.toString() to ignore operators
    const key = buildKey(b);
    if (m[key] == null) m[key] = 1;
    else m[key]++;
  }

  let count = 0;
  for (const key in m) {
    const v = m[key];
    if (v >= 2) count++;
  }
  return count;
};

const minTile = (b: Block) => {
  return [...b.tiles].sort(tileSortFunc)[0];
};

export const toDora = (doraIndicator: Tile) => {
  const n = doraIndicator.n;
  const t = doraIndicator.t;
  if (t == TYPE.Z) {
    if (n == 4) return new Tile(t, 1);
    else if (n == 7) return new Tile(t, 5);
  }
  return new Tile(t, (n % 9) + 1);
};
