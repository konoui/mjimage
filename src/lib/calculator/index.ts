import assert from "assert";
import { BLOCK, KIND, OPERATOR, Round, Wind, WIND } from "../constants";
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
} from "../parser";

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
  constructor(input: string) {
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
        this.inc([t]);
        this.data.tsumo = t;
        continue;
      } else if (b.is(BLOCK.HAND)) {
        this.inc(b.tiles);
        continue;
      }
      throw new Error(`unexpected block ${b.type} ${b.toString()}`);
    }
  }
  get hands() {
    const tiles: Tile[] = [];
    for (let k of Object.values(KIND)) {
      for (let n = 0; n < this.getArrayLen(k); n++) {
        let count = this.get(k, n);
        if (k != KIND.Z && n == 5) count -= this.get(k, 0); // for retd
        for (let i = 0; i < count; i++) {
          tiles.push(new Tile(k, n));
        }
      }
    }
    if (this.drawn != null) {
      const idx = tiles.findIndex((t) => t.equals(t));
      assert(idx >= 0, `hand has drawn: ${this.drawn} but no tile in hands`);
      tiles[idx].add(OPERATOR.TSUMO);
    }
    assert(
      tiles.length > 0,
      `no tiles in hand ${tiles.length}, called: ${
        this.called
      }, data: ${JSON.stringify(this.data, null, 2)}`
    );
    return tiles;
  }
  toString() {
    let c = "";
    for (let b of this.called) c = `${c},${b.toString()}`;

    const tiles = this.hands;
    const b = new Block(tiles, BLOCK.HAND).toString();
    return `${b} ${c}`;
  }
  get called() {
    return this.data.called.concat();
  }
  get reached() {
    return this.data.reached;
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
  get(k: Kind, n: number) {
    return this.data[k][n];
  }
  inc(tiles: Tile[]) {
    const backup: Tile[] = [];
    for (let t of tiles) {
      if (t.k != KIND.BACK && this.get(t.k, t.n) > 4) {
        this.dec(backup);
        throw new Error(`unable to increase ${t} in ${this.toString()}`);
      }
      backup.push(t);
      if (!(t.k == KIND.Z || t.k == KIND.BACK) && t.n == 0)
        this.data[t.k][t.n + 5] += 1;
      this.data[t.k][t.n] += 1;
    }
  }
  dec(tiles: Tile[]) {
    const backup: Tile[] = [];
    for (let t of tiles) {
      if (this.get(t.k, t.n) < 1) {
        this.inc(backup);
        throw new Error(`unable to decrease ${t} in ${this.toString()}`);
      }
      backup.push(t);
      if (!(t.k == KIND.Z || t.k == KIND.BACK) && t.n == 0)
        this.data[t.k][t.n + 5] -= 1;
      this.data[t.k][t.n] -= 1;
    }
  }
  draw(t: Tile) {
    t.add(OPERATOR.TSUMO);
    this.inc([t]);
    this.data.tsumo = t;
    return this;
  }
  discard(t: Tile) {
    this.dec([t]);
    this.data.tsumo = null;
    return this;
  }
  reach() {
    if (!this.canReach) throw new Error("cannot reach");
    if (this.data.reached) throw new Error("already reached");
    this.data.reached = true;
  }
  call(b: BlockPon | BlockChi | BlockDaiKan) {
    if (
      !(
        b instanceof BlockPon ||
        b instanceof BlockChi ||
        b instanceof BlockDaiKan
      )
    )
      throw new Error(`unexpected input ${b} ${(b as Block).type}`);

    const toRemove = b.tiles.filter((v) => !v.has(OPERATOR.HORIZONTAL));
    if (toRemove.length != b.tiles.length - 1)
      throw new Error(`removal: ${toRemove} block: ${b}`);

    this.dec(toRemove);
    this.data.called.push(b);
    this.data.tsumo = null;
    return this;
  }
  kan(b: BlockAnKan | BlockShoKan) {
    if (b instanceof BlockAnKan) {
      const t = b.tiles.filter((v) => v.k != KIND.BACK);
      this.dec([t[0].clone(), t[0].clone(), t[0].clone(), t[0].clone()]);
      this.data.called.push(b);
      this.data.tsumo = null;
      return this;
    }

    if (b instanceof BlockShoKan) {
      const idx = this.data.called.findIndex(
        (v) => v.is(BLOCK.PON) && v.tiles[0].equals(b.tiles[0])
      );
      if (idx == -1) throw new Error(`unable to find ${b.tiles[0]}`);
      this.data.called.splice(idx, 1);
      this.dec([b.tiles[0].clone()]); // FIXME which tile is kakanned
      this.data.called.push(b);
      this.data.tsumo = null;
      return this;
    }

    throw new Error(`unexpected input ${b}`);
  }
  get canReach() {
    return this.called.filter((b) => !(b instanceof BlockAnKan)).length == 0;
  }
  clone(): Hand {
    const c = new Hand(this.toString());
    c.data.called = this.called.map((b) => b.clone());
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
          this.hand.dec(tiles);
          const r = calc(true);
          this.hand.inc(tiles);
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
      this.hand.dec(tiles);
      const r = this.commonByKind(k, n);
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

    if (this.hand.get(k, n) >= 3) {
      const tiles = [new Tile(k, n), new Tile(k, n), new Tile(k, n)];
      this.hand.dec(tiles);
      const r = this.commonByKind(k, n);
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
    if (hands.length == 0) return [];
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
        const k = block.tiles.findIndex((t) => t.equals(lastTile, true));
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
        return [[new Block(this.hand.hands, BLOCK.HAND)]];
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
          this.hand.dec(tiles);
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
          this.hand.inc(tiles);
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
      this.hand.dec(tiles);
      const nested = this.commonByKind(k, n);
      this.hand.inc(tiles);
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
      this.hand.dec(tiles);
      const nested = this.commonByKind(k, n);
      this.hand.inc(tiles);
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

export interface BoardParams {
  dora: Tile[];
  blindDora?: Tile[];
  round: Round;
  myWind: Wind;
  ronWind?: Wind;
  sticks?: { reach: number; dead: number };
  reached?: 1 | 2;
  replacementWin?: boolean;
  quadWin?: boolean;
  finalWallWin?: boolean;
  finalDiscardWin?: boolean;
  oneShotWin?: boolean;
}

export interface WinResult {
  result: { [w in Wind]: number };
  sum: number;
  fu: number;
  points: {
    name: string;
    double: number;
  }[];
  point: number;
  hand: Block[];
}

export class DoubleCalculator {
  hand: Hand;
  cfg: {
    doras: Tile[];
    blindDoras: Tile[];
    roundWind: Tile;
    myWind: Tile;
    reached: 0 | 1 | 2;
    sticks: { reach: number; dead: number };
    replacementWin: boolean;
    quadWin: boolean;
    finalWallWin: boolean;
    finalDiscardWin: boolean;
    oneShotWin: boolean;
    orig: BoardParams;
  };
  constructor(hand: Hand, cfg: BoardParams) {
    this.hand = hand;
    this.cfg = {
      doras: [...cfg.dora],
      blindDoras: cfg.blindDora == null ? [] : [...cfg.blindDora],
      roundWind: new Parser(cfg.round.substring(0, 2)).parse()[0].tiles[0],
      myWind: new Parser(cfg.myWind).parse()[0].tiles[0],
      reached: cfg.reached ?? 0,
      sticks: cfg.sticks ?? { dead: 0, reach: 0 },
      replacementWin: cfg.replacementWin ?? false,
      quadWin: cfg.quadWin ?? false,
      finalWallWin: cfg.finalWallWin ?? false,
      finalDiscardWin: cfg.finalDiscardWin ?? false,
      oneShotWin: cfg.oneShotWin ?? false,
      orig: cfg,
    };
  }

  calc(hands: Block[][]): WinResult | 0 {
    const patterns = this.calcPatterns(hands);
    if (patterns.length == 0) return 0;
    let max = [0, 0];
    let idx = 0;
    for (let i = 0; i < patterns.length; i++) {
      const pt = patterns[i];
      const sum = pt.points.reduce(
        (a: number, b: { name: string; double: number }) => {
          return a + b.double;
        },
        0
      );
      if (sum > max[0]) {
        idx = i;
        max[0] = sum;
        max[1] = pt.fu;
      } else if (sum == max[0] && pt.fu > max[1]) {
        idx = i;
        max[0] = sum;
        max[1] = pt.fu;
      }
    }

    const ceil = (v: number, p = 100) => {
      return Math.ceil(v / p) * p;
    };

    const fu = max[1] != 25 ? ceil(max[1], 10) : 25; // 七対子
    const sum = max[0];
    let base = fu * 2 ** (sum + 2);
    switch (sum) {
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
        base = 6000;
        break;
      case 7:
      case 6:
        base = 4000;
        break;
      case 5:
        base = 2000;
        break;
    }
    if (sum > 13 && sum < 26) base = 8000; // 数え役満

    const isTsumo = patterns[idx].hand.some((b) =>
      b.tiles.some((t) => t.has(OPERATOR.TSUMO))
    );
    const myWind = this.cfg.orig.myWind;
    const isParent = myWind == "1w";

    const result: { [key in Wind]: number } = {
      "1w": 0,
      "2w": 0,
      "3w": 0,
      "4w": 0,
    };
    if (!isTsumo) {
      const deadPoint = this.cfg.sticks.dead * 300;
      if (this.cfg.orig.ronWind == null)
        throw new Error("ron wind is not specified in the parameters");
      const coefficient = isParent ? 6 : 4;
      const point = ceil(base * coefficient) + deadPoint;
      result[myWind] += point;
      result[this.cfg.orig.ronWind] -= point;
    } else {
      const deadPoint = this.cfg.sticks.dead * 100;
      if (isParent) {
        const point = ceil(base * 2);
        result["1w"] += point * 3 + deadPoint * 3;
        result["2w"] -= point + deadPoint;
        result["3w"] -= point + deadPoint;
        result["4w"] -= point + deadPoint;
      } else {
        for (let key of Object.values(WIND)) {
          if (key == myWind) continue;
          const coefficient = key == "1w" ? 2 : 1;
          const point = ceil(base * coefficient) + deadPoint;
          result[key] -= point;
          result[myWind] += point;
        }
      }
    }

    result[myWind] += 1000 * this.cfg.sticks.reach;

    const v = {
      result: result,
      sum: sum,
      fu: fu,
      points: patterns[idx].points,
      point: result[myWind],
      hand: patterns[idx].hand,
    };
    return v;
  }
  calcPatterns(hands: Block[][]) {
    const ret: {
      points: { name: string; double: number }[];
      fu: number;
      hand: Block[];
    }[] = [];
    if (hands.length == 0) return ret;
    for (let hand of hands) {
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
      ];

      if (v.length == 0) continue;
      ret.push({
        points: v,
        fu: 30,
        hand: hand,
      });
    }

    if (ret.length > 0) return ret;

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
      if (v.length > 0) v.push(...this.dX1(hand)); // doras are evaluated when other double exists
      ret.push({
        points: v,
        fu: fu,
        hand: hand,
      });
    }

    return ret;
  }
  private minus() {
    return this.hand.canReach ? 0 : 1;
  }

  dA1(h: Block[]) {
    if (this.cfg.reached == 1) return [{ name: "立直", double: 1 }];
    if (this.cfg.reached == 2) return [{ name: "ダブルリーチ", double: 2 }];
    return [];
  }
  dB1(h: Block[]) {
    if (this.minus() != 0) return [];
    if (this.hand.drawn == null) [];
    const cond = h.some((b) => b.tiles.some((t) => t.has(OPERATOR.TSUMO)));
    return cond ? [{ name: "門前清自摸和", double: 1 }] : [];
  }
  dC1(h: Block[]) {
    if (this.minus() != 0) return [];
    const fu = this.calcFu(h);
    if (fu == 20) return [{ name: "平和", double: 1 }];
    if (!h.some((b) => b.tiles.some((t) => t.has(OPERATOR.TSUMO)))) {
      if (fu == 30) return [{ name: "平和", double: 1 }];
    }
    return [];
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
    const ret: { name: string; double: number }[] = [];
    h.forEach((block) => {
      if (block instanceof BlockPair) return;
      const tile = block.tiles[0];
      if (tile.k == KIND.Z) {
        if (tile.equals(this.cfg.myWind)) ret.push({ name: "自風", double: 1 });
        if (tile.equals(this.cfg.roundWind))
          ret.push({ name: "場風", double: 1 });
        if (tile.n == 5) ret.push({ name: "白", double: 1 });
        if (tile.n == 6) ret.push({ name: "發", double: 1 });
        if (tile.n == 7) ret.push({ name: "中", double: 1 });
      }
    });
    return ret;
  }
  dG1(h: Block[]) {
    return this.cfg.oneShotWin ? [{ name: "一発", double: 1 }] : [];
  }
  dH1(h: Block[]): { name: string; double: number }[] {
    return this.cfg.replacementWin ? [{ name: "嶺上開花", double: 1 }] : [];
  }
  dI1(h: Block[]) {
    return this.cfg.quadWin ? [{ name: "搶槓", double: 1 }] : [];
  }
  dJ1(h: Block[]) {
    return this.cfg.finalWallWin ? [{ name: "海底摸月", double: 1 }] : [];
  }
  dK1(h: Block[]) {
    return this.cfg.finalDiscardWin ? [{ name: "河底撈魚", double: 1 }] : [];
  }
  dX1(h: Block[]) {
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

  dA13(h: Block[]) {
    if (h.length != 13) return [];
    const double = h.some(
      (b) =>
        b instanceof BlockPair &&
        b.tiles.some((t) => t.has(OPERATOR.TSUMO) || t.has(OPERATOR.RON))
    );
    return double
      ? [{ name: "国士無双13面待ち", double: 26 }]
      : [{ name: "国士無双", double: 13 }];
  }
  dB13(h: Block[]) {
    return h.length == 1 ? [{ name: "九蓮宝燈", double: 13 }] : [];
  }
  dC13(h: Block[]) {
    if (h.length == 7) return [];
    const cond1 = h.every(
      (b) =>
        b instanceof BlockAnKan ||
        (b instanceof BlockThree &&
          !b.tiles.some((t) => t.has(OPERATOR.RON))) ||
        b instanceof BlockPair
    );
    if (!cond1) return [];
    const cond2 = h.some(
      (b) =>
        b instanceof BlockPair &&
        b.tiles.every((t) => t.has(OPERATOR.TSUMO) || t.has(OPERATOR.RON))
    );
    return cond2
      ? [{ name: "四暗刻単騎待ち", double: 26 }]
      : [{ name: "四暗刻", double: 13 }];
  }
  dD13(h: Block[]) {
    if (h.length == 13) return [];
    const z = [5, 6, 7];
    const cond =
      h.filter(
        (b) =>
          !(b instanceof BlockPair) &&
          b.tiles.some((t) => t.k == KIND.Z && z.includes(t.n))
      ).length == 3;
    return cond ? [{ name: "大三元", double: 13 }] : [];
  }
  dE13(h: Block[]) {
    const cond = h.every((b) => b.tiles.every((t) => t.k == KIND.Z));
    return cond ? [{ name: "字一色", double: 13 }] : [];
  }
  dF13(h: Block[]) {
    const cond = h.every((b) =>
      b.tiles.every((t) => t.k != KIND.Z && [1, 9].includes(t.n))
    );
    return cond ? [{ name: "清老頭", double: 13 }] : [];
  }
  dG13(h: Block[]) {
    const cond =
      h.filter(
        (b) =>
          b instanceof BlockAnKan ||
          b instanceof BlockShoKan ||
          b instanceof BlockDaiKan
      ).length == 4;
    return cond ? [{ name: "四槓子", double: 13 }] : [];
  }
  dH13(h: Block[]) {
    if (h.length == 13) return [];
    if (h.length == 7) return [];
    const zn = [1, 2, 3, 4];
    const cond1 =
      h.filter((b) => b.tiles.some((t) => t.k == KIND.Z && zn.includes(t.n)))
        .length == 4;
    if (!cond1) return [];
    const cond2 = h
      .find((b) => b instanceof BlockPair)!
      .tiles.some((t) => t.k == KIND.Z && zn.includes(t.n));
    return cond2
      ? [{ name: "小四喜", double: 13 }]
      : [{ name: "大四喜", double: 13 }];
  }
  dI13(h: Block[]) {
    const check = (t: Tile) => {
      if (t.equals(new Tile(KIND.Z, 6))) return true;
      if (t.k == KIND.S && [2, 3, 4, 6, 8].includes(t.n)) return true;
      return false;
    };
    return h.every((b) => b.tiles.every((t) => check(t)))
      ? [{ name: "緑一色", double: 13 }]
      : [];
  }
  // TODO 天和・地和
  dJ13(h: Block[]) {
    return [];
  }
  dK13(h: Block[]) {
    return [];
  }

  calcFu(h: Block[]) {
    const base = 20;
    let fu = base;

    const myWind = this.cfg.myWind.n;
    const round = this.cfg.roundWind.n;

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
    if (!isTsumo && !isCalled && fu == 30) isAllRuns = true; // 面前ロンで 30 は平和
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
