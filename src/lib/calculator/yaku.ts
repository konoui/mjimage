import {
  BLOCK,
  TYPE,
  OP,
  TERMINAL_NUMBERS,
  HONOR_NUMBERS,
  Tile,
  Block,
} from "../core";
import { countSameBlocks, minTile } from "./block-util";
import { Yaku } from "./types";

/**
 * 役の判定に必要な、手牌の構成以外の情報。
 * PointCalculator が BoardContext と Hand から組み立てる。
 */
export interface YakuContext {
  /** 暗槓以外の鳴きがあるか（食い下がりの判定に使う） */
  readonly isCalled: boolean;
  /** 0: 立直なし / 1: 立直 / 2: ダブル立直 */
  readonly reached: 0 | 1 | 2;
  /** 手牌が立直しているか（裏ドラを数えるかどうか） */
  readonly isHandReached: boolean;
  readonly myWind: Tile;
  readonly roundWind: Tile;
  readonly doras: readonly Tile[];
  readonly hiddenDoras: readonly Tile[];
  readonly oneShotWin: boolean;
  readonly replacementWin: boolean;
  readonly quadWin: boolean;
  readonly finalWallWin: boolean;
  readonly finalDiscardWin: boolean;
  readonly disableDoubleYakuman: boolean;
  /** 手牌の構成から符を計算する */
  readonly calcFu: (h: readonly Block[]) => number;
}

/**
 * 役の定義。名前・翻数・成立条件を 1 箇所にまとめる。
 */
export interface YakuDef {
  readonly name: string;
  /** 翻数。食い下がりのある役は関数で表す */
  readonly han: number | ((ctx: YakuContext) => number);
  readonly isYakuman?: boolean;
  /** 手牌の構成が役の条件を満たすか */
  readonly match: (h: readonly Block[], ctx: YakuContext) => boolean;
}

// 判定に使う述語

/** 鳴きによる食い下がりの飜数 */
const calledPenalty = (ctx: YakuContext) => (ctx.isCalled ? 1 : 0);

/** ツモあがりか。あがり牌に付いたオペレーターで判定する */
const isTsumo = (h: readonly Block[]) =>
  h.some((b) => b.tiles.some((t) => t.has(OP.TSUMO)));

/** 七対子の構成か */
const isSevenPairs = (h: readonly Block[]) => h.length == 7;

/** 国士無双の構成か */
const isThirteenOrphans = (h: readonly Block[]) => h.length == 13;

/** 九蓮宝燈の構成か（手牌全体で 1 ブロックになる） */
const isNineGates = (h: readonly Block[]) => h.length == 1;

const pairOf = (h: readonly Block[]) => h.find((b) => b.is(BLOCK.PAIR));

/** あがり牌が雀頭にあるか（単騎待ち） */
const isWaitingPair = (h: readonly Block[]) => {
  const pair = pairOf(h);
  return (
    pair != null && pair.tiles.some((t) => t.has(OP.TSUMO) || t.has(OP.RON))
  );
};

/** 役牌の刻子・槓子があるか。字牌は 4 枚しかないため高々 1 ブロック */
const hasHonorSet = (h: readonly Block[], match: (t: Tile) => boolean) =>
  h.some(
    (b) => !b.is(BLOCK.PAIR) && b.tiles[0].t == TYPE.Z && match(b.tiles[0]),
  );

/** 同じ数字の順子（刻子）が三色そろっているか */
const isThreeColor = (
  h: readonly Block[],
  isTarget: (b: Block) => boolean,
): boolean => {
  for (const block of h) {
    if (!isTarget(block)) continue;
    const tile = minTile(block);
    if (tile.t == TYPE.Z) continue;
    const rest = [TYPE.M, TYPE.P, TYPE.S].filter((v) => v != tile.t);
    const found = rest.every((t) =>
      h.some((b) => isTarget(b) && new Tile(t, tile.n).equals(minTile(b))),
    );
    if (found) return true;
  }
  return false;
};

/** 全てのブロックが么九牌（老頭牌・字牌）を含むか */
const allBlocksHaveTerminal = (h: readonly Block[]) =>
  h.every((b) => {
    const values = b.tiles[0].t == TYPE.Z ? HONOR_NUMBERS : TERMINAL_NUMBERS;
    return b.tiles.some((t) => values.includes(t.n));
  });

/** 雀頭以外が全て暗刻・暗槓か */
const isFourConcealedTriplets = (h: readonly Block[]) =>
  !isSevenPairs(h) &&
  h.every((b) => b.isConcealedTriplet() || b.is(BLOCK.PAIR));

/** 風牌のブロックが 4 つあるか（大四喜・小四喜の共通条件） */
const hasFourWinds = (h: readonly Block[]) => {
  if (isThirteenOrphans(h) || isSevenPairs(h)) return false;
  const winds = [1, 2, 3, 4];
  return (
    h.filter((b) => {
      const s = b.tiles[0];
      return s.t == TYPE.Z && winds.includes(s.n);
    }).length == 4
  );
};

/** 雀頭が風牌か（風牌 4 ブロックのうち一つが雀頭なら小四喜） */
const isWindPair = (h: readonly Block[]) => {
  const pair = pairOf(h);
  return (
    pair != null &&
    pair.tiles.some((t) => t.t == TYPE.Z && [1, 2, 3, 4].includes(t.n))
  );
};

/** 一色（門前 6 飜・混一色 3 飜）の判定 */
const isFlush = (h: readonly Block[], allowHonor: boolean) => {
  const hasHonor = h.some((b) => b.tiles[0].t == TYPE.Z);
  if (hasHonor != allowHonor) return false;
  return Object.values(TYPE).some((t) => {
    if (allowHonor && t == TYPE.Z) return false;
    return h.every(
      (b) => b.tiles[0].t == t || (allowHonor && b.tiles[0].t == TYPE.Z),
    );
  });
};

/**
 * 通常役の定義。ここに並べた順に評価され、WinResult.yakus もこの順になる。
 */
export const YAKU: readonly YakuDef[] = [
  // 1 飜
  { name: "立直", han: 1, match: (_h, ctx) => ctx.reached == 1 },
  { name: "ダブル立直", han: 2, match: (_h, ctx) => ctx.reached == 2 },
  {
    name: "門前清自摸和",
    han: 1,
    // ツモかどうかは BlockCalculator が付けた OP.TSUMO のみで決める。
    // Hand.drawn は打牌後に消えるため、あがり牌の判定には使わない。
    match: (h, ctx) => !ctx.isCalled && isTsumo(h),
  },
  {
    name: "平和",
    han: 1,
    match: (h, ctx) => {
      if (ctx.isCalled) return false;
      const fu = ctx.calcFu(h);
      if (fu == 20) return true;
      // ロンあがりは面前加符の 10 符が乗るため 30 符になる
      return !isTsumo(h) && fu == 30;
    },
  },
  {
    name: "断么九",
    han: 1,
    match: (h) =>
      !h.some((b) => b.tiles.some((t) => t.t == TYPE.Z || TERMINAL_NUMBERS.includes(t.n))),
  },
  {
    name: "一盃口",
    han: 1,
    match: (h, ctx) => !ctx.isCalled && countSameBlocks(h) == 1,
  },
  {
    name: "自風",
    han: 1,
    match: (h, ctx) => hasHonorSet(h, (t) => t.equals(ctx.myWind)),
  },
  {
    name: "場風",
    han: 1,
    match: (h, ctx) => hasHonorSet(h, (t) => t.equals(ctx.roundWind)),
  },
  { name: "白", han: 1, match: (h) => hasHonorSet(h, (t) => t.n == 5) },
  { name: "發", han: 1, match: (h) => hasHonorSet(h, (t) => t.n == 6) },
  { name: "中", han: 1, match: (h) => hasHonorSet(h, (t) => t.n == 7) },
  // 一発は立直が前提。oneShotWin は呼び出し側が渡す値なので、ここで立直と併せて見る。
  {
    name: "一発",
    han: 1,
    match: (_h, ctx) => ctx.reached > 0 && ctx.oneShotWin,
  },
  { name: "嶺上開花", han: 1, match: (_h, ctx) => ctx.replacementWin },
  { name: "搶槓", han: 1, match: (_h, ctx) => ctx.quadWin },
  { name: "海底摸月", han: 1, match: (_h, ctx) => ctx.finalWallWin },
  { name: "河底撈魚", han: 1, match: (_h, ctx) => ctx.finalDiscardWin },

  // 2 飜
  { name: "七対子", han: 2, match: (h) => isSevenPairs(h) },
  {
    name: "三色同順",
    han: (ctx) => 2 - calledPenalty(ctx),
    match: (h) => isThreeColor(h, (b) => b.isSequence()),
  },
  {
    name: "対々和",
    han: 2,
    match: (h) =>
      !isSevenPairs(h) && h.every((b) => b.isTriplet() || b.is(BLOCK.PAIR)),
  },
  {
    name: "三暗刻",
    han: 2,
    match: (h) => h.filter((b) => b.isConcealedTriplet()).length >= 3,
  },
  {
    name: "三槓子",
    han: 2,
    match: (h) => h.filter((b) => b.isQuad()).length >= 3,
  },
  {
    name: "三色同刻",
    han: 2,
    match: (h) => isThreeColor(h, (b) => b.isTriplet()),
  },
  {
    name: "小三元",
    han: 2,
    match: (h) =>
      !isSevenPairs(h) &&
      h.filter((b) => {
        const t = b.tiles[0];
        return t.t == TYPE.Z && [5, 6, 7].includes(t.n);
      }).length == 3,
  },
  {
    name: "混老頭",
    han: 2,
    match: (h) =>
      h.every((b) => {
        const s = b.tiles[0];
        const values = s.t == TYPE.Z ? HONOR_NUMBERS : TERMINAL_NUMBERS;
        return (b.isTriplet() || b.is(BLOCK.PAIR)) && values.includes(s.n);
      }),
  },
  {
    name: "混全帯么九",
    han: (ctx) => 2 - calledPenalty(ctx),
    match: (h) => {
      if (isSevenPairs(h)) return false;
      // 順子がないと混老頭に該当するため、順子と字牌の両方を要求する
      if (!h.some((b) => b.isSequence())) return false;
      if (!h.some((b) => b.tiles[0].t == TYPE.Z)) return false;
      return allBlocksHaveTerminal(h);
    },
  },
  {
    name: "一気通貫",
    han: (ctx) => 2 - calledPenalty(ctx),
    match: (h) => {
      // 123, 456, 789 の順子がそろっている色があるか
      const m = {
        [TYPE.M]: [0, 0, 0],
        [TYPE.S]: [0, 0, 0],
        [TYPE.P]: [0, 0, 0],
      };
      for (const block of h) {
        const tile = minTile(block);
        if (tile.t == TYPE.BACK || tile.t == TYPE.Z) continue;
        if (!block.isSequence()) continue;
        if (tile.n == 1) m[tile.t][0]++;
        else if (tile.n == 4) m[tile.t][1]++;
        else if (tile.n == 7) m[tile.t][2]++;
      }
      return Object.values(m).some((arr) => arr.every((v) => v > 0));
    },
  },

  // 3 飜
  {
    name: "混一色",
    han: (ctx) => 3 - calledPenalty(ctx),
    match: (h) => isFlush(h, true),
  },
  {
    name: "純全帯么九",
    han: (ctx) => 3 - calledPenalty(ctx),
    match: (h) => {
      if (isSevenPairs(h)) return false;
      if (!h.some((b) => b.isSequence())) return false;
      if (h.some((b) => b.tiles[0].t == TYPE.Z)) return false;
      return h.every((b) => b.tiles.some((t) => TERMINAL_NUMBERS.includes(t.n)));
    },
  },
  {
    name: "二盃口",
    han: 3,
    match: (h, ctx) => !ctx.isCalled && countSameBlocks(h) == 2,
  },

  // 6 飜
  {
    name: "清一色",
    han: (ctx) => 6 - calledPenalty(ctx),
    match: (h) => isFlush(h, false),
  },
];

/**
 * 役満の定義。一つでも成立した場合、通常役は評価しない。
 */
export const YAKUMAN: readonly YakuDef[] = [
  {
    name: "国士無双13面待ち",
    han: 26,
    isYakuman: true,
    match: (h, ctx) =>
      isThirteenOrphans(h) && isWaitingPair(h) && !ctx.disableDoubleYakuman,
  },
  {
    name: "国士無双",
    han: 13,
    isYakuman: true,
    match: (h, ctx) =>
      isThirteenOrphans(h) && !(isWaitingPair(h) && !ctx.disableDoubleYakuman),
  },
  { name: "九蓮宝燈", han: 13, isYakuman: true, match: (h) => isNineGates(h) },
  {
    name: "四暗刻単騎待ち",
    han: 26,
    isYakuman: true,
    match: (h, ctx) =>
      isFourConcealedTriplets(h) &&
      isWaitingPair(h) &&
      !ctx.disableDoubleYakuman,
  },
  {
    name: "四暗刻",
    han: 13,
    isYakuman: true,
    match: (h, ctx) =>
      isFourConcealedTriplets(h) &&
      !(isWaitingPair(h) && !ctx.disableDoubleYakuman),
  },
  {
    name: "大三元",
    han: 13,
    isYakuman: true,
    match: (h) =>
      !isThirteenOrphans(h) &&
      h.filter(
        (b) =>
          !b.is(BLOCK.PAIR) &&
          b.tiles.some((t) => t.t == TYPE.Z && [5, 6, 7].includes(t.n)),
      ).length == 3,
  },
  {
    name: "字一色",
    han: 13,
    isYakuman: true,
    match: (h) => h.every((b) => b.tiles[0].t == TYPE.Z),
  },
  {
    name: "清老頭",
    han: 13,
    isYakuman: true,
    match: (h) =>
      h.every(
        (b) =>
          (b.isTriplet() || b.is(BLOCK.PAIR)) && TERMINAL_NUMBERS.includes(b.tiles[0].n),
      ),
  },
  {
    name: "四槓子",
    han: 13,
    isYakuman: true,
    match: (h) =>
      !isSevenPairs(h) && h.every((b) => b.isQuad() || b.is(BLOCK.PAIR)),
  },
  {
    name: "小四喜",
    han: 13,
    isYakuman: true,
    match: (h) => hasFourWinds(h) && isWindPair(h),
  },
  {
    name: "大四喜",
    han: 13,
    isYakuman: true,
    match: (h) => hasFourWinds(h) && !isWindPair(h),
  },
  {
    name: "緑一色",
    han: 13,
    isYakuman: true,
    match: (h) =>
      h.every((b) =>
        b.tiles.every(
          (t) =>
            t.equals(new Tile(TYPE.Z, 6)) ||
            (t.t == TYPE.S && [2, 3, 4, 6, 8].includes(t.n)),
        ),
      ),
  },
  // TODO 天和・地和
];

const evaluate = (
  defs: readonly YakuDef[],
  h: readonly Block[],
  ctx: YakuContext,
): Yaku[] => {
  const ret: Yaku[] = [];
  for (const def of defs) {
    if (!def.match(h, ctx)) continue;
    const han = typeof def.han === "function" ? def.han(ctx) : def.han;
    ret.push(
      def.isYakuman
        ? { name: def.name, han, isYakuman: true }
        : { name: def.name, han },
    );
  }
  return ret;
};

/**
 * 手牌の構成が満たす通常役を返す。
 */
export const detectYaku = (h: readonly Block[], ctx: YakuContext): Yaku[] =>
  evaluate(YAKU, h, ctx);

/**
 * 手牌の構成が満たす役満を返す。
 */
export const detectYakuman = (
  h: readonly Block[],
  ctx: YakuContext,
): Yaku[] => {
  const ret = evaluate(YAKUMAN, h, ctx);
  // ダブル役満を無効にする設定の場合、翻数を役満に丸める
  if (!ctx.disableDoubleYakuman) return ret;
  return ret.map((y) => (y.han > 13 ? { ...y, han: 13 } : y));
};

/**
 * ドラ・赤ドラ・裏ドラを返す。ほかの役が成立している場合にだけ数える。
 */
export const detectDora = (h: readonly Block[], ctx: YakuContext): Yaku[] => {
  const tiles = h.flatMap((b) => b.tiles);
  const count = (doras: readonly Tile[]) =>
    tiles.reduce((sum, t) => sum + doras.filter((d) => t.equals(d)).length, 0);

  const ret: Yaku[] = [];
  const dora = count(ctx.doras);
  const red = tiles.filter((t) => t.has(OP.RED)).length;
  const hidden = count(ctx.hiddenDoras);
  if (dora > 0) ret.push({ name: "ドラ", han: dora });
  if (red > 0) ret.push({ name: "赤ドラ", han: red });
  if (ctx.isHandReached && hidden > 0)
    ret.push({ name: "裏ドラ", han: hidden });
  return ret;
};
