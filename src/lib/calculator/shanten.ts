import { HONOR_NUMBERS, TERMINAL_NUMBERS, TYPE, Type, Tile } from "../core";
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
 * 手牌を「面子・ブロック候補・浮き牌」の数に均した形。
 * 標準形のシャンテン数はこの 3 つの数だけから決まる。
 *
 * - sets:     完成した面子（順子・刻子）の数
 * - partials: あと 1 枚で面子になる組（搭子・対子）の数
 * - isolated: どちらにもならない浮き牌の数
 */
interface Grouping {
  readonly sets: number;
  readonly partials: number;
  readonly isolated: number;
}

/**
 * 数牌の一つの種類から取れる、意味の違う 2 通りの分け方。
 *
 * 面子を最大に取る分け方が常に最善とは限らない（面子を 1 つ諦めて
 * ブロック候補を 2 つ残す方が近いことがある）ため、両方を残して
 * 最後にシャンテン数が小さい方を採る。
 */
interface Groupings {
  /** 浮き牌が最も少ない分け方 */
  readonly fewestIsolated: Grouping;
  /** 面子が最も多い分け方 */
  readonly mostSets: Grouping;
}

const EMPTY: Grouping = { sets: 0, partials: 0, isolated: 0 };

const addGroupings = (a: Grouping, b: Grouping): Grouping => ({
  sets: a.sets + b.sets,
  partials: a.partials + b.partials,
  isolated: a.isolated + b.isolated,
});

const withSet = (g: Grouping): Grouping => ({ ...g, sets: g.sets + 1 });

/** 浮き牌が少ない方を良しとする。同じなら組が少ない方（面子に寄っている方）。 */
const hasFewerIsolated = (a: Grouping, b: Grouping) =>
  a.isolated < b.isolated ||
  (a.isolated == b.isolated && a.partials < b.partials);

/** 面子が多い方を良しとする。同じなら組が多い方。 */
const hasMoreSets = (a: Grouping, b: Grouping) =>
  a.sets > b.sets || (a.sets == b.sets && a.partials > b.partials);

/** 面子を 1 つ取った候補を、それぞれの観点で今の best と比べて残す。 */
const pickBetter = (best: Groupings, taken: Groupings): Groupings => {
  const fewestIsolated = withSet(taken.fewestIsolated);
  const mostSets = withSet(taken.mostSets);
  return {
    fewestIsolated: hasFewerIsolated(fewestIsolated, best.fewestIsolated)
      ? fewestIsolated
      : best.fewestIsolated,
    mostSets: hasMoreSets(mostSets, best.mostSets)
      ? mostSets
      : best.mostSets,
  };
};

/**
 * 標準形のシャンテン数を返す。作業用の写しを受け取る版。
 */
export const standardShantenOf = (w: MutableCounts) => {
  const calc = (hasPair: boolean) => {
    const honors = honorGrouping(w);
    const backs = backGrouping(w);
    const called: Grouping = { ...EMPTY, sets: w.called };

    let min = 13;
    const mr = numberTilePatterns(w, TYPE.M);
    const pr = numberTilePatterns(w, TYPE.P);
    const sr = numberTilePatterns(w, TYPE.S);
    for (const m of [mr.fewestIsolated, mr.mostSets]) {
      for (const p of [pr.fewestIsolated, pr.mostSets]) {
        for (const s of [sr.fewestIsolated, sr.mostSets]) {
          const total = [m, p, s, honors, backs].reduce(
            addGroupings,
            called,
          );
          const r = shantenOfGrouping(total, hasPair);
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

/** 字牌は順子にならないので、枚数だけで分け方が決まる。 */
const honorGrouping = (w: MutableCounts): Grouping => {
  let sets = 0;
  let partials = 0;
  let isolated = 0;
  for (const [t, n] of forHand({ filterBy: [TYPE.Z] })) {
    if (w.get(t, n) >= 3) sets++;
    else if (w.get(t, n) == 2) partials++;
    else if (w.get(t, n) == 1) isolated++;
  }
  return { sets, partials, isolated };
};

/** 裏牌は「種類の分からない同じ牌」として 3 枚ずつ面子にする。 */
const backGrouping = (w: MutableCounts): Grouping => {
  const count = w.back;
  const rest = count % 3;
  return {
    sets: Math.floor(count / 3),
    partials: rest == 2 ? 1 : 0,
    isolated: rest == 1 ? 1 : 0,
  };
};

/**
 * 数牌の一つの種類について、n 以降の牌の分け方を返す。
 * 面子を取る場合と取らない場合を両方試し、観点ごとに良い方を残す。
 */
const numberTilePatterns = (
  w: MutableCounts,
  t: typeof TYPE.M | typeof TYPE.S | typeof TYPE.P,
  n = 1,
): Groupings => {
  if (n > 9) return groupRemainingTiles(w, t);

  // 面子を取らずに次の数字へ進んだ場合
  let best = numberTilePatterns(w, t, n + 1);

  // 順子を取る場合
  if (n <= 7 && w.get(t, n) > 0 && w.get(t, n + 1) > 0 && w.get(t, n + 2) > 0) {
    const taken = w.without(
      [new Tile(t, n), new Tile(t, n + 1), new Tile(t, n + 2)],
      () => numberTilePatterns(w, t, n),
    );
    best = pickBetter(best, taken);
  }

  // 刻子を取る場合
  if (w.get(t, n) >= 3) {
    const taken = w.without(new Array(3).fill(new Tile(t, n)), () =>
      numberTilePatterns(w, t, n),
    );
    best = pickBetter(best, taken);
  }
  return best;
};

/**
 * 面子を取り終えた後に残った牌を、隣り合う塊ごとに組と浮き牌へ均す。
 * 面子は残っていないので、2 つの観点で違いは出ない。
 */
const groupRemainingTiles = (w: MutableCounts, type: Type): Groupings => {
  let partials = 0;
  let isolated = 0;
  let nTiles = 0;

  for (const [t, n] of forHand({ filterBy: [type] })) {
    nTiles += w.get(t, n);
    if (n <= 7 && w.get(t, n + 1) == 0 && w.get(t, n + 2) == 0) {
      partials += nTiles >> 1;
      isolated += nTiles % 2;
      nTiles = 0;
    }
  }

  partials += nTiles >> 1;
  isolated += nTiles % 2;

  const g: Grouping = { sets: 0, partials, isolated };
  return { fewestIsolated: g, mostSets: g };
};

/**
 * 分け方からシャンテン数を出す。
 * 手牌に置けるのは雀頭 1 つと 4 ブロックまでなので、溢れた分は下の種類へ落とす。
 */
const shantenOfGrouping = (g: Grouping, hasPair: boolean) => {
  // 雀頭を別に確保しているなら残りは 4 ブロック、していないなら雀頭候補の分だけ 1 つ多く数える。
  const maxBlocks = hasPair ? 4 : 5;

  let { sets, partials, isolated } = g;

  if (sets > 4) {
    partials += sets - 4;
    sets = 4;
  }
  if (sets + partials > 4) {
    isolated += sets + partials - 4;
    partials = 4 - sets;
  }
  if (sets + partials + isolated > maxBlocks) {
    isolated = maxBlocks - sets - partials;
  }
  if (hasPair) partials++;

  return 13 - sets * 3 - partials * 2 - isolated;
};

/**
 * 手牌のシャンテン数を計算する。
 * 計算のたびに手牌から枚数表の写しを取るので、手牌には触れない。
 */
export class ShantenCalculator {
  private readonly hand: Hand;
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
