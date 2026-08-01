import { HONOR_NUMBERS, TERMINAL_NUMBERS, TYPE, Type } from "../core";
import { Tile } from "../core/parser";
import { Counts, MutableCounts, countsOf } from "./counts";
import { Hand } from "./hand";
import { forHand } from "./tile";

/**
 * シャンテン数を返す。
 */
export const shanten = (counts: Counts) =>
  shantenOf(MutableCounts.from(counts));

/**
 * 七対子のシャンテン数を返す。
 */
export const sevenPairsShanten = (counts: Counts) =>
  sevenPairsOf(MutableCounts.from(counts));

/**
 * 国士無双のシャンテン数を返す。
 */
export const thirteenOrphansShanten = (counts: Counts) =>
  thirteenOrphansOf(MutableCounts.from(counts));

/**
 * 標準形のシャンテン数を返す。
 */
export const standardShanten = (counts: Counts) =>
  standardShantenOf(MutableCounts.from(counts));

/**
 * シャンテン数を返す。作業用の写しを受け取る版。
 * 探索は写しを書き換えながら進むが、呼び出しの前後で内容は変わらない。
 */
export const shantenOf = (w: MutableCounts) =>
  Math.min(sevenPairsOf(w), thirteenOrphansOf(w), standardShantenOf(w));

const sevenPairsOf = (w: MutableCounts) => {
  if (w.called > 0) return Number.POSITIVE_INFINITY;
  let nPairs = 0;
  let nIsolated = 0;
  for (const [t, n] of forHand({ skipBack: true })) {
    if (w.get(t, n) >= 2) nPairs++;
    if (w.get(t, n) == 1) nIsolated++;
  }

  if (nPairs > 7) nPairs = 7;
  if (nPairs + nIsolated >= 7) nIsolated = 7 - nPairs;
  return 13 - 2 * nPairs - nIsolated;
};

const thirteenOrphansOf = (w: MutableCounts) => {
  if (w.called > 0) return Number.POSITIVE_INFINITY;
  let nOrphans = 0;
  let nPairs = 0;
  for (const t of Object.values(TYPE)) {
    if (t == TYPE.BACK) continue;
    const nn = t == TYPE.Z ? HONOR_NUMBERS : TERMINAL_NUMBERS;
    for (const n of nn) {
      if (w.get(t, n) >= 1) nOrphans++;
      if (w.get(t, n) >= 2) nPairs++;
    }
  }
  return nPairs >= 1 ? 12 - nOrphans : 13 - nOrphans;
};

/**
 * 標準形のシャンテン数を返す。作業用の写しを受け取る版。
 */
export const standardShantenOf = (w: MutableCounts) => {
  const calc = (hasPair: boolean) => {
    // [set, pair, isolated]
    const z = [0, 0, 0];
    for (const [t, n] of forHand({ filterBy: [TYPE.Z] })) {
      if (w.get(t, n) >= 3) z[0]++;
      else if (w.get(t, n) == 2) z[1]++;
      else if (w.get(t, n) == 1) z[2]++;
    }

    const b = [0, 0, 0];
    const bn = w.back;
    const bb = bn % 3;
    b[0] = Math.floor(bn / 3);
    if (bb == 2) b[1] = 1;
    else if (bb == 1) b[2] = 1;

    let min = 13;
    const mr = numberTilePatterns(w, TYPE.M);
    const pr = numberTilePatterns(w, TYPE.P);
    const sr = numberTilePatterns(w, TYPE.S);
    for (const m of [mr.patternA, mr.patternB]) {
      for (const p of [pr.patternA, pr.patternB]) {
        for (const s of [sr.patternA, sr.patternB]) {
          // [set, pair, isolated]
          const v = [w.called, 0, 0];
          for (let i = 0; i < 3; i++) {
            v[i] += m[i] + p[i] + s[i] + z[i] + b[i];
          }
          const r = standardShantenFrom(v[0], v[1], v[2], hasPair);
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
    if (w.get(t, n) >= 2) {
      const r = w.without(new Array(2).fill(new Tile(t, n)), () => calc(true));
      if (r < min) {
        min = r;
      }
    }
  }
  return min;
};

const numberTilePatterns = (
  w: MutableCounts,
  t: typeof TYPE.M | typeof TYPE.S | typeof TYPE.P,
  n = 1,
): {
  patternA: [number, number, number];
  patternB: [number, number, number];
} => {
  if (n > 9) return groupRemainingTiles(w, t);

  let max = numberTilePatterns(w, t, n + 1);

  if (n <= 7 && w.get(t, n) > 0 && w.get(t, n + 1) > 0 && w.get(t, n + 2) > 0) {
    const r = w.without(
      [new Tile(t, n), new Tile(t, n + 1), new Tile(t, n + 2)],
      () => numberTilePatterns(w, t, n),
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

  if (w.get(t, n) >= 3) {
    const r = w.without(new Array(3).fill(new Tile(t, n)), () =>
      numberTilePatterns(w, t, n),
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
};

const groupRemainingTiles = (
  w: MutableCounts,
  type: Type,
): {
  patternA: [number, number, number];
  patternB: [number, number, number];
} => {
  let nSerialPairs = 0;
  let nIsolated = 0;
  let nTiles = 0;

  for (const [t, n] of forHand({ filterBy: [type] })) {
    nTiles += w.get(t, n);
    if (n <= 7 && w.get(t, n + 1) == 0 && w.get(t, n + 2) == 0) {
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
};

const standardShantenFrom = (
  nSet: number,
  nSerialPair: number,
  nIsolated: number,
  hasPair: boolean,
) => {
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
};

/**
 * 手牌のシャンテン数を計算する。
 * 計算のたびに手牌から枚数表の写しを取るので、手牌には触れない。
 */
export class ShantenCalculator {
  hand: Hand;
  constructor(hand: Hand) {
    this.hand = hand;
  }
  /**
   * シャンテン数を返す。
   */
  calc() {
    return shanten(countsOf(this.hand));
  }
  /**
   * 七対子のシャンテン数を返す。
   */
  sevenPairs() {
    return sevenPairsShanten(countsOf(this.hand));
  }
  /**
   * 国士無双のシャンテン数を返す。
   */
  thirteenOrphans() {
    return thirteenOrphansShanten(countsOf(this.hand));
  }
  /**
   * 標準形のシャンテン数を返す。
   */
  standardType() {
    return standardShanten(countsOf(this.hand));
  }
}
