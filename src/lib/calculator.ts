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
        this.data.tsumo = t;
        this.inc(t);
      }

      if (b.is(BLOCK.HAND)) {
        for (let t of b.tiles) this.inc(t);
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
  getArray(k: Kind) {
    return this.data[k];
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
    t.op = OPERATOR.TSUMO;
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

    const toRemove = b.tiles.filter((v) => v.op != OPERATOR.HORIZONTAL);
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
    c.data[KIND.M] = this.getArray(KIND.M).concat() as FixedNumber;
    c.data[KIND.S] = this.getArray(KIND.S).concat() as FixedNumber;
    c.data[KIND.P] = this.getArray(KIND.P).concat() as FixedNumber;
    c.data[KIND.Z] = this.getArray(KIND.BACK) as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number
    ];
    c.data[KIND.BACK] = this.getArray(KIND.BACK) as [number];
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
      for (let n = 1; n < this.hand.getArray(k).length; n++) {
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
      const r = {
        [KIND.M]: this.commonByKind(KIND.M),
        [KIND.P]: this.commonByKind(KIND.P),
        [KIND.S]: this.commonByKind(KIND.S),
      };

      const z = [0, 0, 0];
      const arr = this.hand.getArray(KIND.Z);
      for (let n = 1; n < arr.length; n++) {
        if (arr[n] >= 3) z[0]++;
        else if (arr[n] == 2) z[1]++;
        else if (arr[n] == 1) z[2]++;
      }

      let min = 13;
      for (let m of [r[KIND.M].patternA, r[KIND.M].patternB]) {
        for (let p of [r[KIND.P].patternA, r[KIND.P].patternB]) {
          for (let s of [r[KIND.S].patternA, r[KIND.S].patternB]) {
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
      const arr = this.hand.getArray(k);
      for (let n = 1; n < arr.length; n++) {
        if (arr[n] >= 2) {
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

    const arr = this.hand.getArray(k);
    let max = this.commonByKind(k, n + 1);

    if (n <= 7 && arr[n] > 0 && arr[n + 1] > 0 && arr[n + 2] > 0) {
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

    if (arr[n] >= 3) {
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
    const arr = this.hand.getArray(k);
    for (let n = 1; n < arr.length; n++) {
      nTiles += arr[n];
      if (n <= 7 && arr[n + 1] == 0 && arr[n + 2] == 0) {
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
    return [
      ...this.sevenPairs(),
      ...this.thirteenOrphans(),
      ...this.fourSetsOnePair(),
    ];
  }

  sevenPairs(): string[][] {
    if (this.hand.called.length > 0) return [];
    const ret: string[] = [];
    for (let k of Object.values(KIND)) {
      if (k == KIND.BACK) continue;
      for (let n = 1; n < this.hand.getArray(k).length; n++) {
        const v = this.hand.get(k, n);
        if (v == 2) ret.push(`${n}${n}${k}`);
        else if (v == 0) continue;
        else return [];
      }
    }
    return [ret];
  }

  thirteenOrphans(): string[][] {
    if (this.hand.called.length > 0) return [[]];
    const ret: string[] = [];
    let pairs: string = "";
    for (let k of Object.values(KIND)) {
      if (k == KIND.BACK) continue;
      const nn = k == KIND.Z ? [1, 2, 3, 4, 5, 6, 7] : [1, 9];
      for (let n of nn) {
        if (this.hand.get(k, n) == 1) ret.push(`${n}${k}`);
        else if (this.hand.get(k, n) == 2 && pairs == "")
          ret.unshift(`${n}${n}${k}`);
        else return [[]];
      }
    }
    return [ret];
  }

  fourSetsOnePair(): string[][] {
    let ret: string[][] = [];
    for (let k of Object.values(KIND)) {
      if (k == KIND.BACK) continue;
      for (let n = 1; n < this.hand.getArray(k).length; n++) {
        if (this.hand.get(k, n) == 2) {
          const tiles = [new Tile(k, n), new Tile(k, n)];
          this.hand.dec(...tiles);
          // 1. calc all cases without two pairs
          // 2. remove non five blocks
          // 3. add two pairs to the head
          const v = this.commonAll()
            .filter((arr) => arr.length == 4)
            .map((arr) => {
              arr.unshift(`${n}${n}${k}`);
              return arr;
            });
          ret = [...ret, ...v];
          this.hand.inc(...tiles);
        }
      }
    }
    return ret;
  }

  private commonAll(): string[][] {
    const handleZ = (): string[][] => {
      const z: string[] = [];
      const k = KIND.Z;
      const arr = this.hand.getArray(k);
      for (let n = 1; n < arr.length; n++) {
        if (arr[n] == 0) continue;
        else if (arr[n] != 3) return [];
        z.push(`${n}${n}${n}${k}`);
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
      [this.hand.called.map((b) => b.toString())],
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

  private commonByKind(k: Kind, n: number = 1): string[][] {
    if (n > 9) return [];

    if (this.hand.get(k, n) == 0) return this.commonByKind(k, n + 1);

    const ret: string[][] = [];
    if (
      n <= 7 &&
      this.hand.get(k, n) > 0 &&
      this.hand.get(k, n + 1) > 0 &&
      this.hand.get(k, n + 2) > 0
    ) {
      const tiles = [new Tile(k, n), new Tile(k, n + 1), new Tile(k, n + 2)];
      this.hand.dec(...tiles);
      const nested = this.commonByKind(k, n);
      this.hand.inc(...tiles);
      if (nested.length == 0) nested.push([]);
      for (let arr of nested) {
        arr.unshift(`${n}${n + 1}${n + 2}${k}`);
        ret.push(arr);
      }
    }

    if (this.hand.get(k, n) == 3) {
      const tiles = [new Tile(k, n), new Tile(k, n), new Tile(k, n)];
      this.hand.dec(...tiles);
      const nested = this.commonByKind(k, n);
      this.hand.inc(...tiles);
      if (nested.length == 0) nested.push([]);
      for (let arr of nested) {
        // Note insert it to the head due to handling recursively, 111333m
        // first arr will have [333m]
        arr.unshift(`${n}${n}${n}${k}`);
        ret.push(arr);
      }
    }
    return ret;
  }
}
