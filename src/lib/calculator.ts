import { BLOCK, KIND, OPERATOR } from "./constants";
import {
  Tile,
  Parser,
  BlockPon,
  BlockChi,
  BlockShoKan,
  BlockAnKan,
  BlockDaiKan,
  Kind,
  Block,
  BlockPair,
  BlockSet,
  BlockIsolated,
} from "./parser";

type FixedNumber = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number
];

export interface HandData {
  [KIND.M]: FixedNumber;
  [KIND.S]: FixedNumber;
  [KIND.P]: FixedNumber;
  [KIND.Z]: [number, number, number, number, number, number, number, number];
  [KIND.BACK]: [number];
  called: (BlockChi | BlockPon | BlockAnKan | BlockDaiKan | BlockShoKan)[];
  tsumo: Tile | null;
  reached: boolean;
}

export class Hand {
  private data: HandData;
  input: string;
  constructor(input: string) {
    this.input = input;
    this.data = {
      [KIND.M]: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [KIND.P]: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [KIND.S]: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [KIND.Z]: [0, 0, 0, 0, 0, 0, 0, 0],
      [KIND.BACK]: [0],
      called: [],
      reached: false,
      tsumo: null,
    };
    this.init(input);
  }
  private init(input: string) {
    const blocks = new Parser(input).parse();
    for (let b of blocks) {
      if (b.isCalled()) this.data.called.push(b);
      if (b.is(BLOCK.TSUMO)) {
        const t = b.tiles[0];
        this.inc(t);
        this.data.tsumo = t;
      }

      if (b.is(BLOCK.HAND)) {
        this.inc(...b.tiles);
      }
    }
  }
  get called() {
    return this.data.called;
  }
  get reached() {
    return this.data.reached;
  }
  get(k: Kind, n: number, ignoreRed = true) {
    if (k == KIND.Z || k == KIND.BACK) return this.data[k][n];
    if (ignoreRed) {
      if (n == 5) return this.data[k][5] + this.data[k][0];
      if (n == 0) return 0;
    }
    return this.data[k][n];
  }
  get drawn() {
    return this.data.tsumo;
  }
  getArrayLen(k: Kind) {
    return this.data[k].length;
  }
  sum(k: Kind) {
    let sum = 0;
    for (let n = 1; n < this.getArrayLen(k); n++) sum += this.get(k, n);
    return sum;
  }
  inc(...tiles: Tile[]) {
    const backup: Tile[] = [];
    for (let t of tiles) {
      if (t.k != KIND.BACK && this.get(t.k, t.n) > 4) {
        this.dec(...backup);
        throw new Error(`unable to increase ${t}`);
      }
      backup.push(t);
      this.data[t.k][t.n] += 1;
    }
  }
  dec(...tiles: Tile[]) {
    const backup: Tile[] = [];
    for (let t of tiles) {
      if (this.get(t.k, t.n) < 1) {
        this.inc(...backup);
        throw new Error(`unable to decrease ${t}`);
      }
      backup.push(t);
      this.data[t.k][t.n] -= 1;
    }
  }
  draw(t: Tile) {
    t.add(OPERATOR.TSUMO);
    this.inc(t);
    this.data.tsumo = t;
    return this;
  }
  discard(t: Tile) {
    this.dec(t);
    this.data.tsumo = null;
    return this;
  }
  call(b: BlockPon | BlockChi | BlockDaiKan) {
    if (b instanceof BlockAnKan || b instanceof BlockShoKan)
      throw new Error(`unexpected input ${b}`);

    const toRemove = b.tiles.filter((v) => !v.has(OPERATOR.HORIZONTAL));
    if (toRemove == null) throw new Error(`unable to find ${b}`);

    this.dec(...toRemove);
    this.data.called.push(b);
    return this;
  }
  kan(b: BlockAnKan | BlockShoKan) {
    if (b instanceof BlockAnKan) {
      const t = b.tiles.filter((v) => v.k != KIND.BACK);
      this.dec(t[0], t[0], t[0], t[0]);
      this.data.called.push(b);
      return this;
    }

    if (b instanceof BlockShoKan) {
      const idx = this.data.called.findIndex(
        (v) => v.is(BLOCK.PON) && v.tiles[0].equals(b.tiles[0])
      );
      if (idx == -1) throw new Error(`unable to find ${b.tiles[0]}`);
      this.data.called.splice(idx, 1);
      this.data.called.push(b);
      return this;
    }

    throw new Error(`unexpected input ${b}`);
  }
  clone(): Hand {
    const c = new Hand(this.input);
    c.data[KIND.M] = this.data[KIND.M].concat() as FixedNumber;
    c.data[KIND.S] = this.data[KIND.S].concat() as FixedNumber;
    c.data[KIND.P] = this.data[KIND.P].concat() as FixedNumber;
    c.data[KIND.Z] = this.data[KIND.Z].concat() as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number
    ];
    c.data[KIND.BACK] = this.data[KIND.BACK] as [number];
    c.data.called = this.called.concat();
    c.data.reached = this.data.reached;
    c.data.tsumo = this.data.tsumo;
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
    for (let k of Object.values(KIND)) {
      for (let n = 1; n < this.hand.getArrayLen(k); n++) {
        if (this.hand.get(k, n) == 2) nPairs++;
        if (this.hand.get(k, n) == 1) nIsolated++;
      }
    }

    if (nPairs > 7) nPairs = 7;
    if (nPairs + nIsolated >= 7) nIsolated = 7 - nPairs;
    return 13 - 2 * nPairs - nIsolated;
  }

  thirteenOrphans() {
    if (this.hand.called.length > 0) return Infinity;
    let nOrphans = 0;
    let nPairs = 0;
    for (let k of Object.values(KIND)) {
      if (k == KIND.BACK) continue;
      const nn = k == KIND.Z ? [1, 2, 3, 4, 5, 6, 7] : [1, 9];
      for (let n of nn) {
        if (this.hand.get(k, n) >= 1) nOrphans++;
        if (this.hand.get(k, n) >= 2) nPairs++;
      }
    }
    return nPairs >= 1 ? 12 - nOrphans : 13 - nOrphans;
  }

  fourSetsOnePair() {
    const calc = (hasPair: boolean) => {
      const z = [0, 0, 0];
      const k = KIND.Z;
      for (let n = 1; n < this.hand.getArrayLen(k); n++) {
        if (this.hand.get(k, n) >= 3) z[0]++;
        else if (this.hand.get(k, n) == 2) z[1]++;
        else if (this.hand.get(k, n) == 1) z[2]++;
      }

      let min = 13;
      const mr = this.commonByKind(KIND.M);
      const pr = this.commonByKind(KIND.P);
      const sr = this.commonByKind(KIND.S);
      for (let m of [mr.patternA, mr.patternB]) {
        for (let p of [pr.patternA, pr.patternB]) {
          for (let s of [sr.patternA, sr.patternB]) {
            const v = [this.hand.called.length, 0, 0];
            for (let i = 0; i < 3; i++) {
              v[i] += m[i] + p[i] + s[i] + z[i];
            }
            let r = this.calcCommon(v[0], v[1], v[2], hasPair);
            if (r < min) {
              min = r;
            }
          }
        }
      }
      return min;
    };
    // case has no pairs
    let min = calc(false);

    // case has pairs
    for (let k of Object.values(KIND)) {
      for (let n = 1; n < this.hand.getArrayLen(k); n++) {
        if (this.hand.get(k, n) >= 2) {
          const tiles = [new Tile(k, n), new Tile(k, n)];
          this.hand.dec(...tiles);
          const r = calc(true);
          this.hand.inc(...tiles);
          if (r < min) {
            min = r;
          }
        }
      }
    }
    return min;
  }
  private commonByKind(
    k: Kind,
    n = 1
  ): {
    patternA: [number, number, number];
    patternB: [number, number, number];
  } {
    if (n > 9) return this.groupRemainingTiles(k);

    let max = this.commonByKind(k, n + 1);

    if (
      n <= 7 &&
      this.hand.get(k, n) > 0 &&
      this.hand.get(k, n + 1) > 0 &&
      this.hand.get(k, n + 2) > 0
    ) {
      const tiles = [new Tile(k, n), new Tile(k, n + 1), new Tile(k, n + 2)];
      this.hand.dec(...tiles);
      const r = this.commonByKind(k, n);
      this.hand.inc(...tiles);
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

    if (this.hand.get(k, n) >= 3) {
      const tiles = [new Tile(k, n), new Tile(k, n), new Tile(k, n)];
      this.hand.dec(...tiles);
      const r = this.commonByKind(k, n);
      this.hand.inc(...tiles);
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
  // http://crescent.s255.xrea.com/cabinet/others/mahjong/
  private groupRemainingTiles(k: Kind): {
    patternA: [number, number, number];
    patternB: [number, number, number];
  } {
    let nSerialPairs = 0;
    let nIsolated = 0;
    let nTiles = 0;
    for (let n = 1; n < this.hand.getArrayLen(k); n++) {
      nTiles += this.hand.get(k, n);
      if (
        n <= 7 &&
        this.hand.get(k, n + 1) == 0 &&
        this.hand.get(k, n + 2) == 0
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

export class TileCalculator {
  hand: Hand;
  constructor(hand: Hand) {
    this.hand = hand;
  }

  calc() {
    return this.markDrawn([
      ...this.sevenPairs(),
      ...this.thirteenOrphans(),
      ...this.nineGates(),
      ...this.fourSetsOnePair(),
    ]);
  }

  markDrawn(hands: Block[][]) {
    const drawn = this.hand.drawn;
    if (drawn == null) return hands;

    const indexes: [number, number, number][] = [];
    for (let i = 0; i < hands.length; i++) {
      const hand = hands[i];
      for (let j = 0; j < hand.length; j++) {
        const block = hand[j];
        if (block.isCalled()) continue;
        const k = block.tiles.findIndex((t) => t.equals(drawn));
        if (k < 0) continue;
        indexes.push([i, j, k]);
      }
    }

    const newHands: Block[][] = [];
    for (let i = 0; i < hands.length; i++) {
      const hand = hands[i];
      if (indexes.findIndex((v) => v[0] == i) < 0) {
        newHands.push(hand);
      }
    }

    // TODO [123m, 123m]
    for (let [hidx, bidx, tidx] of indexes) {
      const hand = hands[hidx];
      const newHand = hand.map((block) => block.clone());
      newHand[bidx].tiles[tidx].add(OPERATOR.TSUMO);
      newHands.push(newHand);
    }

    return newHands;
  }

  sevenPairs(): Block[][] {
    if (this.hand.called.length > 0) return [];
    const ret: Block[] = [];
    for (let k of Object.values(KIND)) {
      if (k == KIND.BACK) continue;
      for (let n = 1; n < this.hand.getArrayLen(k); n++) {
        const v = this.hand.get(k, n);
        if (v == 2) ret.push(new BlockPair(new Tile(k, n), new Tile(k, n)));
        else if (v == 0) continue;
        else return [];
      }
    }
    return [ret];
  }

  thirteenOrphans(): Block[][] {
    const ret: Block[] = [];
    let pairs: string = "";
    for (let k of Object.values(KIND)) {
      if (k == KIND.BACK) continue;
      const nn = k == KIND.Z ? [1, 2, 3, 4, 5, 6, 7] : [1, 9];
      for (let n of nn) {
        if (this.hand.get(k, n) == 1)
          ret.push(new BlockIsolated(new Tile(k, n)));
        else if (this.hand.get(k, n) == 2 && pairs == "")
          ret.unshift(new BlockPair(new Tile(k, n), new Tile(k, n)));
        else return [];
      }
    }
    return [ret];
  }

  nineGates(): Block[][] {
    const cond = (k: Kind, n: number, want: number[]) =>
      want.includes(this.hand.get(k, n));
    for (let k of Object.values(KIND)) {
      if (k == KIND.BACK) continue;
      if (k == KIND.Z) continue;
      const cond1 =
        cond(k, 1, [3, 4]) &&
        cond(k, 9, [3, 4]) &&
        cond(k, 2, [1, 2]) &&
        cond(k, 3, [1, 2]) &&
        cond(k, 4, [1, 2]) &&
        cond(k, 5, [1, 2]) &&
        cond(k, 6, [1, 2]) &&
        cond(k, 7, [1, 2]) &&
        cond(k, 8, [1, 2]);
      const cond2 = this.hand.sum(k) == 14;
      if (cond1 && cond2) {
        let tiles: Tile[] = [];
        for (let n = 1; n < this.hand.getArrayLen(k); n++) {
          const count = this.hand.get(k, n);
          if (n == 5) {
            const red = this.hand.get(k, 0, false);
            for (let i = 0; i < count - red; i++) tiles.push(new Tile(k, n));
            for (let i = 0; i < red; i++) tiles.push(new Tile(k, 0));
            continue;
          }
          for (let i = 0; i < count; i++) tiles.push(new Tile(k, n));
        }
        return [[new Block(tiles, BLOCK.HAND)]];
      }
    }
    return [];
  }

  fourSetsOnePair(): Block[][] {
    let ret: Block[][] = [];
    for (let k of Object.values(KIND)) {
      if (k == KIND.BACK) continue;
      for (let n = 1; n < this.hand.getArrayLen(k); n++) {
        if (this.hand.get(k, n) >= 2) {
          const tiles = [new Tile(k, n), new Tile(k, n)];
          this.hand.dec(...tiles);
          // 1. calc all cases without two pairs
          // 2. remove non five blocks
          // 3. add two pairs to the head
          const v = this.commonAll()
            .filter((arr) => arr.length == 4)
            .map((arr) => {
              arr.unshift(new BlockPair(tiles[0], tiles[1]));
              return arr;
            });
          ret = [...ret, ...v];
          this.hand.inc(...tiles);
        }
      }
    }
    return ret;
  }

  private commonAll(): Block[][] {
    const handleZ = (): Block[][] => {
      const z: Block[] = [];
      const k = KIND.Z;
      for (let n = 1; n < this.hand.getArrayLen(k); n++) {
        if (this.hand.get(k, n) == 0) continue;
        else if (this.hand.get(k, n) != 3) return [];
        z.push(new BlockSet([new Tile(k, n), new Tile(k, n), new Tile(k, n)]));
      }
      return z.length == 0 ? [] : [z];
    };

    // [["123m", "123m"], ["222m", "333m"]]
    // [["123s", "123s"]]
    // result: [["123m", "123m", "123s", "123s"], ["111m", "333m", "123s", "123s"]]
    const vvv = [
      this.commonByKind(KIND.M),
      this.commonByKind(KIND.P),
      this.commonByKind(KIND.S),
      handleZ(),
      [this.hand.called],
    ].sort((a, b) => b.length - a.length);
    const ret = vvv[0].concat();
    for (let i = 0; i < ret.length; i++) {
      for (let j = 1; j < vvv.length; j++) {
        for (let arr of vvv[j]) {
          ret[i] = [...ret[i], ...arr];
        }
      }
    }
    return ret;
  }

  private commonByKind(k: Kind, n: number = 1): Block[][] {
    if (n > 9) return [];

    if (this.hand.get(k, n) == 0) return this.commonByKind(k, n + 1);

    const ret: Block[][] = [];
    if (
      n <= 7 &&
      this.hand.get(k, n) > 0 &&
      this.hand.get(k, n + 1) > 0 &&
      this.hand.get(k, n + 2) > 0
    ) {
      const tiles: [Tile, Tile, Tile] = [
        new Tile(k, n),
        new Tile(k, n + 1),
        new Tile(k, n + 2),
      ];
      this.hand.dec(...tiles);
      const nested = this.commonByKind(k, n);
      this.hand.inc(...tiles);
      if (nested.length == 0) nested.push([]);
      for (let arr of nested) {
        arr.unshift(new BlockSet(tiles));
        ret.push(arr);
      }
    }

    if (this.hand.get(k, n) == 3) {
      const tiles: [Tile, Tile, Tile] = [
        new Tile(k, n),
        new Tile(k, n),
        new Tile(k, n),
      ];
      this.hand.dec(...tiles);
      const nested = this.commonByKind(k, n);
      this.hand.inc(...tiles);
      if (nested.length == 0) nested.push([]);
      for (let arr of nested) {
        // Note insert it to the head due to handling recursively, 111333m
        // first arr will have [333m]
        arr.unshift(new BlockSet(tiles));
        ret.push(arr);
      }
    }
    return ret;
  }
}
