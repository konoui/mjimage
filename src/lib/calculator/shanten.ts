import { TYPE, Type } from "../core";
import { Tile } from "../core/parser";
import { Hand, withoutTiles } from "./hand";
import { forHand, N19, NZ } from "./tile";

export class ShantenCalculator {
  hand: Hand;
  constructor(hand: Hand) {
    this.hand = hand;
  }
  /**
   * シャンテン数を返す。
   */
  calc() {
    return this.hand.preserving(() =>
      Math.min(this.sevenPairs(), this.thirteenOrphans(), this.standardType()),
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
    return this.hand.preserving(() => this.calcStandardType());
  }
  private calcStandardType() {
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
        const r = withoutTiles(this.hand, new Array(2).fill(new Tile(t, n)), () =>
          calc(true),
        );
        if (r < min) {
          min = r;
        }
      }
    }
    return min;
  }
  private calcNumberTilePatterns(
    t: typeof TYPE.M | typeof TYPE.S | typeof TYPE.P,
    n = 1,
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
      const r = withoutTiles(
        this.hand,
        [new Tile(t, n), new Tile(t, n + 1), new Tile(t, n + 2)],
        () => this.calcNumberTilePatterns(t, n),
      );
      (r.patternA[0]++, r.patternB[0]++);
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
      const r = withoutTiles(this.hand, new Array(3).fill(new Tile(t, n)), () =>
        this.calcNumberTilePatterns(t, n),
      );
      (r.patternA[0]++, r.patternB[0]++);
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
    hasPair: boolean,
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
