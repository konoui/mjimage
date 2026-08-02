import {
  HONOR_NUMBERS,
  OP,
  TERMINAL_NUMBERS,
  TYPE,
  Type,
  Tile,
  BlockPair,
  Block,
  BlockIsolated,
  BlockThree,
  BlockRun,
  BlockHand,
  is5Tile,
} from "../core";
import { MutableCounts, tilesOf } from "./counts";
import { Hand } from "./hand";
import {
  buildBlockKey,
  findTilePositions,
  replaceTiles,
  TilePosition,
} from "./block-util";
import { forHand } from "./tile";

/**
 * あがりの形になりうる手牌の構成の配列を返す。あがり牌は考慮されない。
 * 探索は作業用の写しの上で行われるので、手牌には触れない。
 */
export const decompose = (
  w: MutableCounts,
  called: readonly Block[],
): readonly (readonly Block[])[] => [
  ...decomposeSevenPairs(w),
  ...decomposeThirteenOrphans(w),
  ...decomposeNineGates(w),
  ...decomposeStandard(w, called),
];

/**
 * 七対子のあがり形となりうる手牌の構成の配列を返す。最大で要素は 1 となる。
 */
export const decomposeSevenPairs = (
  w: MutableCounts,
): readonly (readonly Block[])[] => {
  if (w.called > 0) return [];
  const ret: Block[] = [];
  for (const [t, n] of forHand({ skipBack: true })) {
    const count = w.get(t, n);
    if (count == 0) continue;
    else if (count == 2) {
      // red に対応するため dec した tile を使用する
      w.without(new Array(2).fill(new Tile(t, n)), (tiles) => {
        ret.push(new BlockPair(tiles[0], tiles[1]));
      });
    } else return [];
  }

  return [ret];
};

/**
 * 国士無双のあがり形となりうる手牌の構成の配列を返す。
 */
export const decomposeThirteenOrphans = (
  w: MutableCounts,
): readonly (readonly Block[])[] => {
  const ret: Block[] = [];
  let foundPairs = false;
  for (const t of Object.values(TYPE)) {
    if (t == TYPE.BACK) continue;
    const nn = t == TYPE.Z ? HONOR_NUMBERS : TERMINAL_NUMBERS;
    for (const n of nn) {
      if (w.get(t, n) == 1) ret.push(new BlockIsolated(new Tile(t, n)));
      else if (w.get(t, n) == 2 && foundPairs == false) {
        ret.unshift(new BlockPair(new Tile(t, n), new Tile(t, n)));
        foundPairs = true;
      } else return [];
    }
  }
  return [ret];
};

/**
 * 九蓮宝燈のあがり形となりうる手牌の構成の配列を返す。
 * 待ちの形を取り出せないため、手牌 14 枚を 1 ブロックのままにする。
 */
export const decomposeNineGates = (
  w: MutableCounts,
): readonly (readonly Block[])[] => {
  const cond = (t: Type, n: number, wantCount: number[]) =>
    wantCount.includes(w.get(t, n));
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
    const cond2 = w.sum(t) == 14;
    if (cond1 && cond2) {
      return [[new BlockHand(tilesOf(w))]];
    }
  }
  return [];
};

/**
 * 標準形のあがり形となりうる手牌の構成の配列を返す。
 */
export const decomposeStandard = (
  w: MutableCounts,
  called: readonly Block[],
): readonly (readonly Block[])[] => {
  let ret: readonly (readonly Block[])[] = [];
  for (const [t, n] of forHand()) {
    if (w.get(t, n) >= 2) {
      const toDec = new Array(2).fill(new Tile(t, n));
      // OP.RED をつけないと、最後の（面子の） dec で RED が消費される。
      // e.g. 5s が 3枚あり、頭で 5s を2枚消費すると、allBlockCombinations() で r5s と 5s のパータンを計算できなくなる。
      // 明示的に OP.RED を頭で消費するようにする。
      if (n == 5 && w.get(t, 0) > 0 && w.get(t, n) >= 3) {
        toDec[1] = new Tile(t, n, [OP.RED]);
      }
      // 1. calc all cases without two pairs
      // 2. remove non five blocks
      // 3. add two pairs to the head
      const v = w.without(toDec, (tiles) =>
        allBlockCombinations(w, called)
          .filter((arr) => arr.length == 4)
          .map((arr) => [new BlockPair(tiles[0], tiles[1]), ...arr]),
      );
      ret = [...ret, ...v];
    }
  }

  return ret;
};

/**
 * 晒したブロックを含む、あがり形の面子の組み合わせを全て返す。頭は含まない。
 */
export const allBlockCombinations = (
  w: MutableCounts,
  called: readonly Block[],
): readonly (readonly Block[])[] => {
  // [["123m", "123m"], ["222m", "333m"]]
  // [["123s", "123s"]]
  // result: [["123m", "123m", "123s", "123s"], ["111m", "333m", "123s", "123s"]]
  //
  // 並べ替えは組み合わせの数には影響しない（積の順序が変わるだけ）。効くのは
  // 出来上がる構成のブロックの並び順で、それは WinResult.hand としてそのまま外へ出る。
  // TODO 何のための並び順なのかは不明。外してもテストは通るが、利用側が並び順に
  // 依存していないことを確かめられていないため、いまは残している。
  const groups = [
    addRedPatterns(w, TYPE.M, combinationsOfNumType(w, TYPE.M)),
    addRedPatterns(w, TYPE.P, combinationsOfNumType(w, TYPE.P)),
    addRedPatterns(w, TYPE.S, combinationsOfNumType(w, TYPE.S)),
    combinationsOfHonors(w),
    combinationsOfBacks(w),
    [called.concat()],
  ].sort((a, b) => b.length - a.length);
  // combine all patterns
  const ret = groups.reduce(
    (acc, group) =>
      group.length === 0
        ? acc // 空の配列があればそのまま acc を返す
        : acc.flatMap((p) => group.map((choice) => [...p, ...choice])),
    [[]],
  );
  return ret;
};

/**
 * 裏牌から作れる面子の組み合わせを返す。
 * 裏牌は「種類の分からない同じ牌」として扱う（万能牌ではない）。
 */
const combinationsOfBacks = (
  w: MutableCounts,
): readonly (readonly Block[])[] => {
  const bt = TYPE.BACK;
  const sum = w.get(bt, 0);
  if (sum < 3) return [];
  const p = new Tile(bt, 0);
  const b = Array(Math.floor(sum / 3)).fill(new BlockThree([p, p, p]));
  return b.length == 0 ? [] : [b];
};

/**
 * 字牌から作れる面子の組み合わせを返す。字牌は順子にならないので刻子だけ。
 */
const combinationsOfHonors = (
  w: MutableCounts,
): readonly (readonly Block[])[] => {
  const z: Block[] = [];
  for (const [zt, n] of forHand({ filterBy: [TYPE.Z] })) {
    if (w.get(zt, n) == 0) continue;
    else if (w.get(zt, n) != 3) return [];
    const p = new Tile(zt, n);
    z.push(new BlockThree([p, p, p]));
  }
  return z.length == 0 ? [] : [z];
};

/**
 * 一つの手牌の構成において、赤牌ごとの手牌（晒したブロックを含まない）の構成を生成する。
 */
const addRedPattern = (
  t: Type,
  hand: readonly Block[],
): readonly (readonly Block[])[] => {
  const nonRed = new Tile(t, 5);
  const red = new Tile(t, 5, [OP.RED]);
  const isRed = (v: Tile) => is5Tile(v) && v.has(OP.RED);

  // red は 1 枚しかないので位置は 1 つに定まる。
  let redPosition: TilePosition | null = null;
  for (let bIdx = 0; bIdx < hand.length; bIdx++) {
    const tIdx = hand[bIdx].tiles.findIndex(isRed);
    if (tIdx > -1) redPosition = [bIdx, tIdx];
  }
  // BlockThree などの場合
  if (redPosition == null) return [hand];
  const redBlock = hand[redPosition[0]];

  // 一つのブロックに red と non red がある場合（BlockThree）は入れ替えても同じ形になる。
  const nonRedPositions = findTilePositions(
    hand,
    (v, b) => is5Tile(v) && !v.has(OP.RED) && !b.tiles.some(isRed),
  );

  // 5 と r5 に入れ替えたパータンを生成する
  const newHands: (readonly Block[])[] = [hand];
  for (const position of nonRedPositions) {
    // 345 と 34r5 は入れ変えても同じ
    if (buildBlockKey(hand[position[0]]) == buildBlockKey(redBlock)) continue;
    newHands.push(
      replaceTiles(hand, [
        [position, () => red],
        [redPosition, () => nonRed],
      ]),
    );
  }
  return newHands;
};

/**
 * 全ての手牌の構成において、赤牌ごとの手牌（晒したブロックを含まない）の構成を生成する。
 */
const addRedPatterns = (
  w: MutableCounts,
  t: Type,
  hands: readonly (readonly Block[])[],
) => {
  if (!(w.get(t, 0) > 0 && w.get(t, 5) >= 2)) return hands;
  return hands.map((hand) => addRedPattern(t, hand)).flat();
};

/**
 * 数牌の一つの種類について、面子の組み合わせを全て返す。
 */
export const combinationsOfNumType = (
  w: MutableCounts,
  t: typeof TYPE.M | typeof TYPE.S | typeof TYPE.P,
  n: number = 1,
): readonly (readonly Block[])[] => {
  if (n > 9) return [];

  if (w.get(t, n) == 0) {
    return combinationsOfNumType(w, t, n + 1);
  }

  const ret: Block[][] = [];
  if (n <= 7 && w.get(t, n) > 0 && w.get(t, n + 1) > 0 && w.get(t, n + 2) > 0) {
    const runs = w.without(
      [new Tile(t, n), new Tile(t, n + 1), new Tile(t, n + 2)],
      (tiles) => {
        const nested = combinationsOfNumType(w, t, n);
        const arrs = nested.length == 0 ? [[]] : nested;
        return arrs.map((arr) => [
          new BlockRun([tiles[0], tiles[1], tiles[2]]),
          ...arr,
        ]);
      },
    );
    ret.push(...runs);
  }

  if (w.get(t, n) == 3) {
    const triples = w.without(new Array(3).fill(new Tile(t, n)), (tiles) => {
      const nested = combinationsOfNumType(w, t, n);
      const arrs = nested.length == 0 ? [[]] : nested;
      // Note insert it to the head due to handling recursively, 111333m
      // first arr will have [333m]
      return arrs.map((arr) => [
        new BlockThree([tiles[0], tiles[1], tiles[2]]),
        ...arr,
      ]);
    });
    ret.push(...triples);
  }
  return ret;
};

/**
 * 手牌をあがりの形に分解する。
 * 計算のたびに手牌から枚数表の写しを取るので、手牌には触れない。
 */
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
      decompose(MutableCounts.of(this.hand), this.hand.called),
      lastTile,
    );
  }

  /**
   * あがりの形になりうる手牌の構成の配列に対して、最後のあがり牌を考慮したあがりの形になりうる手牌の構成の配列を返す。
   */
  markedHands(
    hands: readonly (readonly Block[])[],
    lastTile: Tile,
  ): readonly (readonly Block[])[] {
    if (hands.length == 0) return [];
    return hands.map((hand) => this.markedHand(hand, lastTile)).flat();
  }

  /**
   * あがりの形になりうる手牌の構成に対して、最後のあがり牌を考慮したあがりの形になりうる手牌の構成の配列を返す。
   */
  markedHand(
    hand: readonly Block[],
    lastTile: Tile,
  ): readonly (readonly Block[])[] {
    if (hand.length == 0) return [];
    const op = lastTile.has(OP.RON)
      ? OP.RON
      : lastTile.has(OP.TSUMO) || this.hand.drawn != null
        ? OP.TSUMO
        : OP.RON;

    // 晒したブロックにあがり牌の印は付かない。
    const positions = findTilePositions(
      hand,
      (t, b) =>
        !b.isCalled() &&
        t.equals(lastTile) &&
        lastTile.has(OP.RED) == t.has(OP.RED),
    );

    if (positions.length == 0)
      throw new Error(
        `tile ${lastTile.toString()} not found in hand: ${hand.toString()}`,
      );

    // あがり牌がどのブロックに属するかで待ちの形が変わるので、位置ごとに 1 つ返す。
    return positions.map((position) =>
      replaceTiles(hand, [[position, (t) => t.clone({ add: op })]]),
    );
  }

  /**
   * 現在の手牌において、七対子のあがり形となりうる手牌の構成の配列を返す。
   * あがり牌は考慮されない。最大で要素は 1 となる。
   */
  sevenPairs(): readonly (readonly Block[])[] {
    return decomposeSevenPairs(MutableCounts.of(this.hand));
  }

  /**
   * 現在の手牌において、国士無双のあがり形となりうる手牌の構成の配列を返す。
   * あがり牌は考慮されない。
   */
  thirteenOrphans(): readonly (readonly Block[])[] {
    return decomposeThirteenOrphans(MutableCounts.of(this.hand));
  }

  /**
   * 現在の手牌において、九蓮宝燈のあがり形となりうる手牌の構成の配列を返す。
   * あがり牌は考慮されない。
   */
  nineGates(): readonly (readonly Block[])[] {
    return decomposeNineGates(MutableCounts.of(this.hand));
  }

  /**
   * 現在の手牌において、標準形のあがり形となりうる手牌の構成の配列を返す。
   * あがり牌は考慮されない。
   */
  standardType(): readonly (readonly Block[])[] {
    return decomposeStandard(MutableCounts.of(this.hand), this.hand.called);
  }
}
