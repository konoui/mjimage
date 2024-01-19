import { BLOCK, KIND, OPERATOR, WIND_MAP, ROUND_MAP } from "./constants";
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
  BlockIsolated,
  BlockThree,
  BlockRun,
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
      if (b.isCalled()) {
        this.data.called.push(b);
        continue;
      } else if (b.is(BLOCK.TSUMO)) {
        const t = b.tiles[0];
        this.inc(t);
        this.data.tsumo = t;
        continue;
      } else if (b.is(BLOCK.HAND)) {
        this.inc(...b.tiles);
        continue;
      }
      throw new Error(`unexpected block ${b.type} ${b.toString()}`);
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
    if (toRemove == null)
      throw new Error(`${b} does not have horizontal operator`);

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

  calc(lastTile: Tile) {
    if (this.hand.drawn != null) lastTile = this.hand.drawn;
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

  markDrawn(hands: Block[][], lastTile: Tile) {
    const op =
      this.hand.drawn != null
        ? OPERATOR.TSUMO
        : lastTile.has(OPERATOR.TSUMO)
        ? OPERATOR.TSUMO
        : OPERATOR.RON;

    const indexes: [number, number, number][] = [];
    for (let i = 0; i < hands.length; i++) {
      const hand = hands[i];
      const m: { [key: string]: boolean } = {}; // map to reduce same blocks such as ["123m", "123m"]
      for (let j = 0; j < hand.length; j++) {
        const block = hand[j];
        if (block.isCalled()) continue;
        const k = block.tiles.findIndex((t) => t.equals(lastTile));
        if (k < 0) continue;
        const key = buildKey(block);
        if (m[key]) continue;
        m[key] = true;
        indexes.push([i, j, k]);
      }
    }

    if (indexes.length == 0)
      throw new Error(`found no tile ${lastTile.toString()} in hands`);

    const newHands: Block[][] = [];
    for (let [hidx, bidx, tidx] of indexes) {
      const hand = hands[hidx];
      const newHand = hand.map((block) => block.clone());
      newHand[bidx].tiles[tidx].add(op);
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
        z.push(
          new BlockThree([new Tile(k, n), new Tile(k, n), new Tile(k, n)])
        );
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
        arr.unshift(new BlockRun(tiles));
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
        arr.unshift(new BlockThree(tiles));
        ret.push(arr);
      }
    }
    return ret;
  }
}

type Wind = keyof typeof WIND_MAP;

export interface BoardConfig {
  dora: Tile[];
  placeWind: Wind;
  myWind: Wind;
}

export class DoubleCalculator {
  hand: Hand;
  cfg: {
    doras: Tile[];
    placeWind: Tile;
    myWind: Tile;
    orig: BoardConfig;
  };
  constructor(hand: Hand, cfg: BoardConfig) {
    this.hand = hand;
    this.cfg = {
      doras: [...cfg.dora],
      placeWind: new Parser(cfg.placeWind).parse()[0].tiles[0],
      myWind: new Parser(cfg.myWind).parse()[0].tiles[0],
      orig: cfg,
    };
  }
  calc(hands: Block[][]) {
    const ret: {
      points: { name: string; double: number }[];
      fu: number;
    }[] = [];
    //const ret: { name: string; double: number }[][] = [];
    for (let hand of hands) {
      const fu = this.calcFu(hand);
      const v = [
        ...this.dA1(hand),
        ...this.dB1(hand),
        ...this.dC1(hand),
        ...this.dD1(hand),
        ...this.dE1(hand),
        ...this.dF1(hand),
        ...this.dG1(hand),

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
      ret.push({
        points: v,
        fu: fu,
      });
    }

    return ret;
  }
  private minus() {
    return this.hand.called.filter((block) => !(block instanceof BlockAnKan))
      .length == 0
      ? 0
      : 1;
  }
  dA1(h: Block[]) {
    return this.hand.reached ? [{ name: "立直", double: 1 }] : [];
  }
  dB1(h: Block[]) {
    if (this.minus() != 0) return [];
    if (this.hand.drawn == null) [];
    const cond = h.some((b) => b.tiles.some((t) => t.has(OPERATOR.TSUMO)));
    return cond ? [{ name: "門前清自摸和", double: 1 }] : [];
  }

  dC1(h: Block[]) {
    if (this.minus() != 0) return [];
    return this.calcFu(h) == 20 ? [{ name: "平和", double: 1 }] : [];
  }
  dD1(h: Block[]) {
    const cond = h.some((block) =>
      block.tiles.some((t) => t.k == KIND.Z || [1, 9].includes(t.n))
    );
    return cond ? [] : [{ name: "断么九", double: 1 }];
  }
  dE1(h: Block[]) {
    if (this.minus() != 0) return [];

    const count = countSameBlocks(h);
    return count == 1 ? [{ name: "一盃口", double: 1 }] : [];
  }
  dF1(h: Block[]) {
    let dcount = 0;
    let rcount = 0;
    for (let b of h) {
      for (let t of b.tiles) {
        for (let d of this.cfg.doras) {
          if (d.equals(t, true)) dcount++;
        }
        if (t.n == 0) rcount++;
      }
    }

    const ret: { name: string; double: number }[] = [];
    if (dcount > 0) ret.push({ name: "ドラ", double: dcount });
    if (rcount > 0) ret.push({ name: "赤ドラ", double: rcount });
    return ret;
  }
  dG1(h: Block[]) {
    const ret: { name: string; double: number }[] = [];
    h.forEach((block) => {
      if (!(block instanceof BlockPair)) return;
      const tile = block.tiles[0];
      if (tile.k == KIND.Z) {
        if (tile.equals(this.cfg.myWind)) ret.push({ name: "自風", double: 1 });
        if (tile.equals(this.cfg.placeWind))
          ret.push({ name: "場風", double: 1 });
        if (tile.n == 5) ret.push({ name: "白", double: 1 });
        if (tile.n == 6) ret.push({ name: "發", double: 1 });
        if (tile.n == 7) ret.push({ name: "中", double: 1 });
      }
    });
    return ret;
  }

  dA2(h: Block[]) {
    return h.length == 7 ? [{ name: "七対子", double: 2 }] : [];
  }
  dB2(h: Block[]) {
    const check = (bb: Block) => {
      return bb instanceof BlockRun || bb instanceof BlockChi;
    };
    for (let block of h) {
      if (!check(block)) continue;
      const tile = block.minTile();
      if (tile.k == KIND.Z) continue;
      const filteredKinds = [KIND.M, KIND.P, KIND.S].filter((v) => v != tile.k);
      const cond1 = h.some((b) => {
        const newTile = new Tile(filteredKinds[0], tile.n);
        return check(b) && newTile.equals(b.minTile(), true);
      });
      const cond2 = h.some((b) => {
        const newTile = new Tile(filteredKinds[1], tile.n);
        return check(b) && newTile.equals(b.minTile(), true);
      });
      if (cond1 && cond2)
        return [{ name: "三色同順", double: 2 - this.minus() }];
    }
    return [];
  }
  dC2(h: Block[]) {
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
    return cond ? [{ name: "対々和", double: 2 }] : [];
  }
  dD2(h: Block[]) {
    if (this.minus() != 0) return [];
    const l = h.filter((b) => {
      return (
        (b instanceof BlockAnKan || b instanceof BlockThree) &&
        !b.tiles.some((t) => t.has(OPERATOR.RON)) // ignore ron
      );
    }).length;
    return l >= 3 ? [{ name: "三暗刻", double: 2 }] : [];
  }
  dE2(h: Block[]) {
    const l = h.filter(
      (b) =>
        b instanceof BlockAnKan ||
        b instanceof BlockShoKan ||
        b instanceof BlockDaiKan
    ).length;
    return l >= 3 ? [{ name: "三槓子", double: 2 }] : [];
  }
  dF2(h: Block[]) {
    const check = (b: Block) => {
      return (
        b instanceof BlockAnKan ||
        b instanceof BlockShoKan ||
        b instanceof BlockDaiKan ||
        b instanceof BlockThree ||
        b instanceof BlockPon
      );
    };
    for (let block of h) {
      if (!check(block)) continue;
      const tile = block.minTile();
      if (tile.k == KIND.Z) continue;
      const filteredKinds = [KIND.M, KIND.P, KIND.S].filter((v) => v != tile.k);
      const cond1 = h.some((b) => {
        const newTile = new Tile(filteredKinds[0], tile.n);
        return check(b) && newTile.equals(b.minTile(), true);
      });
      const cond2 = h.some((b) => {
        const newTile = new Tile(filteredKinds[1], tile.n);
        return check(b) && newTile.equals(b.minTile(), true);
      });
      if (cond1 && cond2) return [{ name: "三色同刻", double: 2 }];
    }
    return [];
  }
  dG2(h: Block[]) {
    const l = h.filter((b) => {
      const t = b.tiles[0];
      return t.k == KIND.Z && [5, 6, 7].includes(t.n);
    }).length;
    return l == 3 ? [{ name: "小三元", double: 2 }] : [];
  }
  dH2(h: Block[]) {
    const cond = h.every((b) => {
      const values = b.tiles[0].k == KIND.Z ? [1, 2, 3, 4, 5, 6, 7] : [1, 9];
      return b.tiles.every((t) => values.includes(t.n));
    });
    return cond ? [{ name: "混老頭", double: 2 }] : [];
  }
  dI2(h: Block[]) {
    if (!h.some((b) => b instanceof BlockRun) && !(h.length == 7)) return []; // ignore seven pairs
    if (!h.some((b) => b.tiles[0].k == KIND.Z)) return [];

    const cond = h.every((block) => {
      const values =
        block.tiles[0].k == KIND.Z ? [1, 2, 3, 4, 5, 6, 7] : [1, 9];
      return block.tiles.some((t) => values.includes(t.n));
    });
    return cond ? [{ name: "混全帯么九", double: 2 - this.minus() }] : [];
  }
  dJ2(h: Block[]) {
    if (this.minus() != 0) return [];

    let m = {
      // 123m, 456m, 789m
      [KIND.M]: [0, 0, 0],
      [KIND.S]: [0, 0, 0],
      [KIND.P]: [0, 0, 0],
    };

    for (let block of h) {
      const tile = block.minTile();
      if (tile.k == KIND.BACK) continue;
      if (tile.k == KIND.Z) continue;
      if (!(block instanceof BlockRun)) continue;
      if (tile.n == 1) m[tile.k][0]++;
      if (tile.n == 4) m[tile.k][1]++;
      if (tile.n == 7) m[tile.k][2]++;
    }

    for (let v of Object.values(m)) {
      if (v.filter((v) => v > 0).length == v.length)
        return [{ name: "一気通貫", double: 2 - this.minus() }];
    }
    return [];
  }
  dA3(h: Block[]) {
    const cond = !h.some((block) => block.tiles[0].k == KIND.Z);
    if (cond) return [];
    for (let k of Object.values(KIND)) {
      const ok = h.every((b) => b.tiles[0].k == KIND.Z || b.tiles[0].k == k);
      if (ok) return [{ name: "混一色", double: 3 - this.minus() }];
    }
    return [];
  }
  dB3(h: Block[]) {
    if (!h.some((b) => b instanceof BlockRun) && !(h.length == 7)) return [];
    if (h.some((b) => b.tiles[0].k == KIND.Z)) return [];

    const cond = h.every((b) => {
      const values = b.tiles[0].k == KIND.Z ? [1, 2, 3, 4, 5, 6, 7] : [1, 9];
      return b.tiles.some((t) => values.includes(t.n));
    });
    return cond ? [{ name: "純全帯么九色", double: 3 - this.minus() }] : [];
  }
  dC3(h: Block[]) {
    if (this.minus() != 0) return [];

    const count = countSameBlocks(h);
    return count == 2 ? [{ name: "ニ盃口", double: 3 }] : [];
  }
  dA6(h: Block[]) {
    if (h.some((block) => block.tiles[0].k == KIND.Z)) return [];
    for (let k of Object.values(KIND)) {
      if (k == KIND.Z) continue;
      const ok = h.every((v) => v.tiles[0].k == k);
      if (ok) return [{ name: "清一色", double: 6 - this.minus() }];
    }
    return [];
  }

  calcFu(h: Block[]) {
    const base = 20;
    let fu = base;

    const myWind = this.cfg.myWind.n;
    const round = this.cfg.placeWind.n;

    if (h.length == 7) return 25;

    const lastBlock = h.find((b) =>
      b.tiles.some((t) => t.has(OPERATOR.TSUMO) || t.has(OPERATOR.RON))
    )!;
    const isCalled = this.minus() == 1;
    const isTsumo = lastBlock.tiles.some((t) => t.has(OPERATOR.TSUMO));

    // 刻子
    const calcTriple = (b: Block, base: number) => {
      const tile = b.tiles[0];
      if (tile.k == KIND.Z && [5, 6, 7].includes(tile.n)) return base * 2;
      else if (tile.k == KIND.Z && [myWind, round].includes(tile.n))
        return base * 2;
      else if ([1, 9].includes(tile.n)) return base * 2;
      else return base;
    };

    for (let b of h) {
      switch (true) {
        case b instanceof BlockThree:
          let v = b.tiles.some((t) => t.has(OPERATOR.RON)) ? 2 : 4;
          fu += calcTriple(b, v);
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
      const idx = tiles.findIndex(
        (t) => t.has(OPERATOR.TSUMO) || t.has(OPERATOR.RON)
      );
      if (idx == 1) return 2; // カンチャン
      else if (idx == 0 && tiles[2].n == 9) return 2; //ペンチャン
      else if (idx == 2 && tiles[0].n == 1) return 2; //ペンチャン
      return 0; // リャンメン
    };

    fu += calcLast(lastBlock);

    // Pair
    const pair = h.find((b) => b instanceof BlockPair)!;
    let tile = pair.tiles[0];
    if (tile.k == KIND.Z) {
      if ([5, 6, 7].includes(tile.n)) fu += 2;
      if (tile.n == round) fu += 2;
      if (tile.n == myWind) fu += 2;
    }

    // 平和
    let isAllRuns = false;
    if (!isCalled && fu == base) isAllRuns = true;
    if (isTsumo && !isAllRuns) fu += 2; // 平和以外のツモは2
    if (!isTsumo && !isCalled) fu += 10; // 面前ロン

    if (isCalled && fu == base) fu = 30; // 鳴きの 20 は 30 になる

    return fu;
  }
}

const buildKey = (b: Block) => {
  return b.tiles.reduce((a: string, b: Tile) => `${a}${b.n}${b.k}`, "");
};

const countSameBlocks = (h: Block[]) => {
  let m: { [key: string]: number } = {};
  for (let b of h) {
    if (!(b instanceof BlockRun)) continue;
    // instead of b.toString() to ignore operators
    const key = buildKey(b);
    if (m[key] == null) m[key] = 1;
    else m[key]++;
  }

  let count = 0;
  for (let key in m) {
    const v = m[key];
    if (v >= 2) count++;
  }
  return count;
};
