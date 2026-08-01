import { BlockCalculator, Hand, PointCalculator } from "../calculator";
import {
  BoardContext,
  WINNING_TILE_BLOCK_TYPE,
  Yaku,
} from "../calculator/types";
import { YAKU, YAKUMAN } from "../calculator/yaku";
import { TYPE, OP, WIND, ROUND } from "../core/constants";
import { Tile } from "../core/parser";

/**
 * 役ごとの判定を固定する。
 * あがり形の全パターンから出た役を集め、期待する役が含まれることだけを見る。
 * （どの構成に付いたか・順序には依存しない）
 */
const yakusOf = (
  input: string,
  lastTile: Tile,
  opts?: { board?: Partial<BoardContext>; reach?: boolean },
) => {
  const hand = new Hand(input);
  if (opts?.reach) hand.reach();
  const board: BoardContext = {
    doraIndicators: [],
    myWind: WIND.E,
    round: ROUND.E1,
    ...opts?.board,
  };
  const c = new BlockCalculator(hand);
  const dc = new PointCalculator(hand, board);
  return dc.getWinningHands(c.calc(lastTile)).flatMap((v) => v.yakus);
};

interface YakuCase {
  input: string;
  lastTile: Tile;
  board?: Partial<BoardContext>;
  reach?: boolean;
  want: Yaku[];
  notWant?: string[];
}

describe("役ごとの判定/1飜", () => {
  const tests: { [name: string]: YakuCase } = {
    立直: {
      input: "123m456m789m123s11z",
      lastTile: new Tile(TYPE.Z, 1),
      reach: true,
      want: [{ name: "立直", han: 1 }],
    },
    ダブル立直: {
      input: "123m456m789m123s11z",
      lastTile: new Tile(TYPE.Z, 1),
      reach: true,
      board: { doubleReached: true },
      want: [{ name: "ダブル立直", han: 2 }],
      notWant: ["立直"],
    },
    "門前清自摸和/あがり牌のツモ演算子で判定する": {
      // 手牌にツモ牌（t）を設定していなくても、あがり牌が t ならツモあがり
      input: "123123s111222m22z",
      lastTile: new Tile(TYPE.S, 1, [OP.TSUMO]),
      want: [{ name: "門前清自摸和", han: 1 }],
    },
    "門前清自摸和/手牌のツモ牌でも判定する": {
      // BlockCalculator が Hand.drawn からあがり牌に t を付ける
      input: "23123s111222m22z, t1s",
      lastTile: new Tile(TYPE.S, 1),
      want: [{ name: "門前清自摸和", han: 1 }],
    },
    "門前清自摸和/鳴いていると付かない": {
      input: "123s111222m22z, -123s",
      lastTile: new Tile(TYPE.S, 1, [OP.TSUMO]),
      want: [],
      notWant: ["門前清自摸和"],
    },
    平和: {
      input: "123123s123m123p22z",
      lastTile: new Tile(TYPE.S, 1),
      want: [{ name: "平和", han: 1 }],
    },
    断么九: {
      input: "222333s234m88567s",
      lastTile: new Tile(TYPE.S, 2),
      want: [{ name: "断么九", han: 1 }],
    },
    一盃口: {
      input: "123123s111222m22z",
      lastTile: new Tile(TYPE.S, 1, [OP.TSUMO]),
      want: [{ name: "一盃口", han: 1 }],
    },
    "自風・場風": {
      input: "111w123s456m33m, -678m",
      lastTile: new Tile(TYPE.M, 3, [OP.TSUMO]),
      want: [
        { name: "自風", han: 1 },
        { name: "場風", han: 1 },
      ],
    },
    自風のみ: {
      input: "222z123s456m789m11m",
      lastTile: new Tile(TYPE.M, 1),
      board: { myWind: WIND.S },
      want: [{ name: "自風", han: 1 }],
      notWant: ["場風"],
    },
    場風のみ: {
      input: "111z123s456m789m11m",
      lastTile: new Tile(TYPE.M, 1),
      board: { myWind: WIND.S },
      want: [{ name: "場風", han: 1 }],
      notWant: ["自風"],
    },
    白: {
      input: "555z123m456p789s11m",
      lastTile: new Tile(TYPE.M, 1),
      want: [{ name: "白", han: 1 }],
    },
    發: {
      input: "666z123m456p789s11m",
      lastTile: new Tile(TYPE.M, 1),
      want: [{ name: "發", han: 1 }],
    },
    中: {
      input: "777z123m456p789s11m",
      lastTile: new Tile(TYPE.M, 1),
      want: [{ name: "中", han: 1 }],
    },
    一発: {
      input: "123m456m789m123s11z",
      lastTile: new Tile(TYPE.Z, 1),
      reach: true,
      board: { oneShotWin: true },
      want: [{ name: "一発", han: 1 }],
    },
    嶺上開花: {
      input: "123m456m789m123s11z",
      lastTile: new Tile(TYPE.Z, 1, [OP.TSUMO]),
      board: { replacementWin: true },
      want: [{ name: "嶺上開花", han: 1 }],
    },
    搶槓: {
      input: "123m456m789m123s11z",
      lastTile: new Tile(TYPE.Z, 1),
      board: { quadWin: true },
      want: [{ name: "搶槓", han: 1 }],
    },
    海底摸月: {
      input: "123m456m789m123s11z",
      lastTile: new Tile(TYPE.Z, 1, [OP.TSUMO]),
      board: { finalWallWin: true },
      want: [{ name: "海底摸月", han: 1 }],
    },
    河底撈魚: {
      input: "123m456m789m123s11z",
      lastTile: new Tile(TYPE.Z, 1),
      board: { finalDiscardWin: true },
      want: [{ name: "河底撈魚", han: 1 }],
    },
  };
  runCases(tests);
});

describe("役ごとの判定/2飜", () => {
  const tests: { [name: string]: YakuCase } = {
    七対子: {
      input: "112233m223344s22z",
      lastTile: new Tile(TYPE.M, 1),
      want: [{ name: "七対子", han: 2 }],
    },
    三色同順: {
      input: "123123s123m123p22z",
      lastTile: new Tile(TYPE.S, 1),
      want: [{ name: "三色同順", han: 2 }],
    },
    "三色同順/食い下がり": {
      input: "23456788m, -234s, 2-34p",
      lastTile: new Tile(TYPE.M, 3, [OP.TSUMO]),
      want: [{ name: "三色同順", han: 1 }],
    },
    対々和: {
      input: "111333m11p,5-5-55s, -3333s",
      lastTile: new Tile(TYPE.M, 3, [OP.TSUMO]),
      want: [{ name: "対々和", han: 2 }],
    },
    三暗刻: {
      input: "111333555s123m99s",
      lastTile: new Tile(TYPE.S, 9),
      want: [{ name: "三暗刻", han: 2 }],
    },
    三槓子: {
      input: "456p99s,_11m_,_22m_,_33m_",
      lastTile: new Tile(TYPE.S, 9),
      want: [{ name: "三槓子", han: 2 }],
    },
    三色同刻: {
      input: "111m111p111s456m11z",
      lastTile: new Tile(TYPE.Z, 1),
      want: [{ name: "三色同刻", han: 2 }],
    },
    小三元: {
      input: "555z666z77z123m456m",
      lastTile: new Tile(TYPE.Z, 7),
      want: [{ name: "小三元", han: 2 }],
    },
    混老頭: {
      // 面前だと四暗刻（役満）になり通常役が評価されないため、一つ鳴いている
      input: "111m999m999s55z, 1-11z",
      lastTile: new Tile(TYPE.Z, 5),
      want: [{ name: "混老頭", han: 2 }],
    },
    混全帯么九: {
      input: "123123s123m123p22z",
      lastTile: new Tile(TYPE.S, 1),
      want: [{ name: "混全帯么九", han: 2 }],
    },
    "混全帯么九/食い下がり": {
      input: "123s789p11z123m, -123p",
      lastTile: new Tile(TYPE.S, 1),
      want: [{ name: "混全帯么九", han: 1 }],
    },
    一気通貫: {
      input: "12344456789m123s",
      lastTile: new Tile(TYPE.S, 3),
      want: [{ name: "一気通貫", han: 2 }],
    },
    "一気通貫/食い下がり": {
      input: "124r56p66s3p, -789p, -213p",
      lastTile: new Tile(TYPE.P, 3, [OP.RON]),
      want: [{ name: "一気通貫", han: 1 }],
    },
  };
  runCases(tests);
});

describe("役ごとの判定/3飜以上", () => {
  const tests: { [name: string]: YakuCase } = {
    混一色: {
      input: "123m456m789m111z11m",
      lastTile: new Tile(TYPE.M, 1),
      want: [{ name: "混一色", han: 3 }],
    },
    "混一色/食い下がり": {
      input: "123m789m111z11m, -456m",
      lastTile: new Tile(TYPE.M, 1),
      want: [{ name: "混一色", han: 2 }],
    },
    純全帯么九: {
      input: "111222333s123m99s",
      lastTile: new Tile(TYPE.S, 1, [OP.TSUMO]),
      want: [{ name: "純全帯么九", han: 3 }],
    },
    二盃口: {
      input: "112233m223344s22z",
      lastTile: new Tile(TYPE.M, 1),
      want: [{ name: "二盃口", han: 3 }],
    },
    清一色: {
      input: "111222333456m99m",
      lastTile: new Tile(TYPE.M, 9),
      want: [{ name: "清一色", han: 6 }],
    },
    "清一色/食い下がり": {
      input: "111222333m99m, -456m",
      lastTile: new Tile(TYPE.M, 9),
      want: [{ name: "清一色", han: 5 }],
    },
  };
  runCases(tests);
});

describe("役ごとの判定/役満", () => {
  const tests: { [name: string]: YakuCase } = {
    国士無双: {
      input: "19m19p19s12345677z",
      lastTile: new Tile(TYPE.M, 1),
      want: [{ name: "国士無双", han: 13, isYakuman: true }],
    },
    国士無双13面待ち: {
      input: "19m19p19s12345677z",
      lastTile: new Tile(TYPE.Z, 7),
      want: [{ name: "国士無双13面待ち", han: 26, isYakuman: true }],
    },
    "国士無双13面待ち/ダブル役満を無効にすると単の国士無双": {
      input: "19m19p19s12345677z",
      lastTile: new Tile(TYPE.Z, 7),
      board: { disableDoubleYakuman: true },
      want: [{ name: "国士無双", han: 13, isYakuman: true }],
      notWant: ["国士無双13面待ち"],
    },
    四暗刻: {
      input: "111222333m444p99s",
      lastTile: new Tile(TYPE.M, 1, [OP.TSUMO]),
      want: [{ name: "四暗刻", han: 13, isYakuman: true }],
    },
    四暗刻単騎待ち: {
      input: "111222333m444p99s",
      lastTile: new Tile(TYPE.S, 9, [OP.TSUMO]),
      want: [{ name: "四暗刻単騎待ち", han: 26, isYakuman: true }],
    },
    大三元: {
      input: "555z666z777z123m11m",
      lastTile: new Tile(TYPE.M, 1),
      want: [{ name: "大三元", han: 13, isYakuman: true }],
    },
    字一色: {
      input: "111z222z333z444z55z",
      lastTile: new Tile(TYPE.Z, 5),
      want: [{ name: "字一色", han: 13, isYakuman: true }],
    },
    清老頭: {
      input: "111m999m111p999p11s",
      lastTile: new Tile(TYPE.S, 1),
      want: [{ name: "清老頭", han: 13, isYakuman: true }],
    },
    四槓子: {
      input: "55m,_11m_,_22m_,_33m_,_44m_",
      lastTile: new Tile(TYPE.M, 5),
      want: [{ name: "四槓子", han: 13, isYakuman: true }],
    },
    小四喜: {
      input: "111z222z333z44z123m",
      lastTile: new Tile(TYPE.Z, 4),
      want: [{ name: "小四喜", han: 13, isYakuman: true }],
    },
    大四喜: {
      input: "111z222z333z444z11m",
      lastTile: new Tile(TYPE.M, 1),
      want: [{ name: "大四喜", han: 13, isYakuman: true }],
    },
    緑一色: {
      input: "222s333s444s666s88s",
      lastTile: new Tile(TYPE.S, 8),
      want: [{ name: "緑一色", han: 13, isYakuman: true }],
    },
  };
  runCases(tests);

  // 九蓮宝燈は手牌 14 枚が BlockHand 1 つのままの構成になる。
  // あがり牌の形を取り出せないため、専用の NINE_GATES を返す（M28）。
  test("九蓮宝燈/あがり牌の形は nineGates になる", () => {
    const input = "11112345678999m";
    const lastTile = new Tile(TYPE.M, 1);
    expect(yakusOf(input, lastTile)).toContainEqual({
      name: "九蓮宝燈",
      han: 13,
      isYakuman: true,
    });

    const hand = new Hand(input);
    const got = new PointCalculator(hand, {
      doraIndicators: [],
      myWind: WIND.E,
      round: ROUND.E1,
    }).getWinningHands(new BlockCalculator(hand).calc(lastTile));
    expect(
      got.map((v) => v.metadata.winningTileBlockType),
    ).toContain(WINNING_TILE_BLOCK_TYPE.NINE_GATES);
  });
});

describe("役ごとの判定/ドラ", () => {
  test("ドラ表示牌の次の牌がドラになる", () => {
    const got = yakusOf("12344456789m123s", new Tile(TYPE.S, 3), {
      board: { doraIndicators: [new Tile(TYPE.M, 8)] },
    });
    expect(got).toContainEqual({ name: "ドラ", han: 1 });
  });
  test("赤牌は赤ドラになる", () => {
    const got = yakusOf("124r56p66s3p, -789p, -213p", new Tile(TYPE.P, 3), {
      board: { doraIndicators: [] },
    });
    expect(got).toContainEqual({ name: "赤ドラ", han: 1 });
  });
  test("裏ドラは立直しているときだけ数える", () => {
    const lastTile = new Tile(TYPE.Z, 1);
    const board = { hiddenDoraIndicators: [new Tile(TYPE.M, 9)] };
    const reached = yakusOf("123m456m789m123s11z", lastTile, {
      board,
      reach: true,
    });
    expect(reached).toContainEqual({ name: "裏ドラ", han: 1 });

    const notReached = yakusOf("123m456m789m123s11z", lastTile, {
      board: { ...board, finalDiscardWin: true },
    });
    expect(notReached.map((v) => v.name)).not.toContain("裏ドラ");
  });
  test("役がないときはドラだけではあがれない", () => {
    const got = yakusOf("234m567m234p678s11z", new Tile(TYPE.Z, 1), {
      board: { doraIndicators: [new Tile(TYPE.Z, 7)] },
    });
    expect(got).toStrictEqual([]);
  });
});

describe("役の定義テーブル", () => {
  test("役の名前は一意", () => {
    const names = [...YAKU, ...YAKUMAN].map((v) => v.name);
    expect(new Set(names).size).toBe(names.length);
  });
  test("役満の定義には isYakuman が付く", () => {
    expect(YAKUMAN.every((v) => v.isYakuman)).toBe(true);
    expect(YAKU.some((v) => v.isYakuman)).toBe(false);
  });
  test("役は定義した順に並ぶ", () => {
    // ダブル東で自風・場風が同時に付く場合、ブロックの順ではなくテーブルの順になる
    const got = yakusOf("111z222z123m456m11p", new Tile(TYPE.P, 1), {
      board: { myWind: WIND.S },
    });
    expect(got.map((v) => v.name)).toStrictEqual(["自風", "場風"]);
  });
});

function runCases(tests: { [name: string]: YakuCase }) {
  for (const [name, tt] of Object.entries(tests)) {
    test(name, () => {
      const got = yakusOf(tt.input, tt.lastTile, {
        board: tt.board,
        reach: tt.reach,
      });
      for (const want of tt.want) expect(got).toContainEqual(want);
      for (const notWant of tt.notWant ?? [])
        expect(got.map((v) => v.name)).not.toContain(notWant);
    });
  }
}
