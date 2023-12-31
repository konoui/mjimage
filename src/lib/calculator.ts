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
  data: HandData;
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
  get(k: Kind, n: number, ignoreRed = true) {
    if (k == KIND.Z || k == KIND.BACK) return this.data[k][n];
    if (ignoreRed) {
      if (n == 5) return this.data[k][5] + this.data[k][0];
      if (n == 0) return 0;
    }
    return this.data[k][n];
  }
  inc(...tiles: Tile[]) {
    const backup: Tile[] = [];
    for (let t of tiles) {
      if (t.k != KIND.BACK && this.data[t.k][t.n] > 4) {
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
      if (this.data[t.k][t.n] < 1) {
        this.inc(...backup);
        throw new Error(`unable to decrease ${t}`);
      }
      backup.push(t);
      this.data[t.k][t.n] -= 1;
    }
  }
  tsumo(t: Tile) {
    t.op = OPERATOR.TSUMO;
    this.data.tsumo = t;
    this.inc(t);
    return this;
  }
  discard(t: Tile) {
    this.dec(t);
    return this;
  }
  call(b: BlockPon | BlockChi | BlockDaiKan) {
    if (b instanceof BlockAnKan || b instanceof BlockShoKan)
      throw new Error(`unexpected input ${b}`);

    const toRemove = b.tiles.filter((v) => v.op != OPERATOR.HORIZONTAL);
    if (toRemove == null) throw new Error(`unable to find ${b}`);

    for (let t of toRemove) this.dec(t);
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
    c.data[KIND.BACK] = this.data[KIND.BACK];
    c.data.called = this.data.called.concat();
    c.data.reached = this.data.reached;
    c.data.tsumo = this.data.tsumo;
    return c;
  }
}

export class Calculator {
  hand: Hand;
  constructor(hand: Hand) {
    this.hand = hand;
  }
  sevenParis() {
    if (this.hand.data.called.length > 0) return Infinity;
    let nPairs = 0;
    let nIsolated = 0;
    for (let k of Object.values(KIND)) {
      for (let n = 1; n < this.hand.data[k].length; n++) {
        if (this.hand.get(k, n) == 2) nPairs++;
        if (this.hand.get(k, n) == 1) nIsolated++;
      }
    }

    if (nPairs > 7) nPairs = 7;
    if (nPairs + nIsolated >= 7) nIsolated = 7 - nPairs;
    return 13 - 2 * nPairs - nIsolated;
  }
  thirteenOrphans() {
    if (this.hand.data.called.length > 0) return Infinity;
    let numOfOrphans = 0;
    let numOfPairs = 0;
    for (let k of Object.values(KIND)) {
      if (k == KIND.BACK) continue;
      const nn = k == KIND.Z ? [1, 2, 3, 4, 5, 6, 7] : [1, 9];
      for (let n of nn) {
        if (this.hand.get(k, n) >= 1) numOfOrphans++;
        if (this.hand.get(k, n) >= 2) numOfPairs++;
      }
    }
    return numOfPairs >= 1 ? 12 - numOfOrphans : 13 - numOfOrphans;
  }
  // http://crescent.s255.xrea.com/cabinet/others/mahjong/
  private groupSet(k: Kind) {
    let nSerialPairs = 0;
    let nIsolated = 0;
    let nTiles = 0;
    const arr = this.hand.data[k];
    for (let n = 1; n < arr.length; n++) {
      nTiles = arr[n];
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
  private shanten(
    nSet: number,
    nSerialPair: number,
    nIsolated: number,
    hasPair: boolean
  ) {
    let n = hasPair ? 4 : 5;
    if (nSet > 4) {
      nSerialPair += nSerialPair - 4;
      nSet = 4;
    }
    if (nSet + nSerialPair > 4) {
      nIsolated += nSet + nSerialPair - 4;
      nSerialPair = 4 - nSet;
    }
    if (nSet + nSerialPair + nIsolated > n) {
      nIsolated += n - nSet - nSerialPair;
    }
    if (hasPair) n++;
    return 13 - nSet * 3 - nSerialPair * 2 - nIsolated;
  }
  common() {
    return 0;
  }
}
