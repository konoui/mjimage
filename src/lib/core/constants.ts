/**
 * ブロックの塊を表す区切り文字を表す。
 */
export const INPUT_SEPARATOR = ",";
export const TYPE = {
  /**
   * 萬子
   */
  M: "m",
  /**
   * 筒子
   */
  P: "p",
  /**
   * 索子
   */
  S: "s",
  /**
   * 字牌
   */
  Z: "z",
  /**
   * 裏牌
   */
  BACK: "_",
} as const;
export const OP = {
  /**
   * ツモ牌を表す
   */
  TSUMO: "t",
  /**
   * ロン牌を表す
   */
  RON: "v",
  /**
   * ドラ牌を表す。
   * SVG の生成でのみ使される。
   */
  IMAGE_DORA: "d",
  /**
   * 横にする牌を表す。
   */
  HORIZONTAL: "-",
  /**
   * 赤牌を表す。
   */
  RED: "r",
  /**
   * ツモ切りを表す。
   */
  COLOR_GRAYSCALE: "^",
} as const;

export const BLOCK = {
  /**
   * ポンを表す。
   */
  PON: "pon",
  /**
   * チーを表す。
   */
  CHI: "chi",
  /**
   * 小明槓を表す。
   */
  SHO_KAN: "shokan",
  /**
   * 大明槓を表す。
   */
  DAI_KAN: "daikan",
  /**
   * 暗槓を表す。
   */
  AN_KAN: "ankan",
  /**
   * ツモブロックを表す
   */
  TSUMO: "tsumo",
  //  RON: "ron",
  /**
   * 手牌のヘッドを表す。
   * 計算時に使用され、SVG 生成では使用されない。
   */
  PAIR: "pair",
  /**
   * 手牌の孤立牌を表す。
   * 計算時に使用され、SVG 生成では使用されない。
   * 計算時では国士無双で使用される。
   */
  ISOLATED: "isolated",
  /**
   * 手牌の暗刻を表す。
   * 計算時に使用され、SVG 生成では使用されない。
   */
  THREE: "three",
  /**
   * 手牌の順子を表す。
   * 計算時に使用され、SVG 生成では使用されない。
   */
  RUN: "run",
  /**
   * 手牌の手牌全体を表す。
   * 計算時では、面前の手牌だけを表し、九蓮宝燈で使用される。
   * SVG 生成では面前関係なく使用される。
   */
  HAND: "hand",
  /**
   * SVG 生成時のドラ牌を表す。
   * SVG の生成でのみ使される。
   */
  IMAGE_DORA: "dora",
  /**
   * SVG 生成時の捨て牌を表す。
   * SVG の生成でのみ使される。
   */
  IMAGE_DISCARD: "simple-discard",
  /**
   * 不明を表す。
   * 現状使用されない。
   */
  UNKNOWN: "unknown",
} as const;

export const WIND = {
  E: "1z",
  S: "2z",
  W: "3z",
  N: "4z",
} as const;

/**
 * ラウンドの内部表現
 * e.g.) ROUND.E > 東1局1本場
 */
export const ROUND = {
  E1: "1z1",
  E2: "1z2",
  E3: "1z3",
  E4: "1z4",
  S1: "2z1",
  S2: "2z2",
  S3: "2z3",
  S4: "2z4",
  W1: "3z1",
  W2: "3z2",
  W3: "3z3",
  W4: "3z4",
  N1: "4z1",
  N2: "4z2",
  N3: "4z3",
  N4: "4z4",
} as const;

export const WIND_MAP = {
  [WIND.E]: "東",
  [WIND.S]: "南",
  [WIND.W]: "西",
  [WIND.N]: "北",
} as const;

export const ROUND_MAP = {
  [ROUND.E1]: "東１局",
  [ROUND.E2]: "東２局",
  [ROUND.E3]: "東３局",
  [ROUND.E4]: "東４局",
  [ROUND.S1]: "南１局",
  [ROUND.S2]: "南２局",
  [ROUND.S3]: "南３局",
  [ROUND.S4]: "南４局",
  [ROUND.W1]: "西１局",
  [ROUND.W2]: "西２局",
  [ROUND.W3]: "西３局",
  [ROUND.W4]: "西４局",
  [ROUND.N1]: "北１局",
  [ROUND.N2]: "北２局",
  [ROUND.N3]: "北３局",
  [ROUND.N4]: "北４局",
} as const;

/**
 * 牌種ごとに存在する数字。
 * 数牌の 0 は赤 5 の別名。字牌は 1z-7z（東南西北白發中）の 7 種しかない。
 * 入力の検証と、牌画像の ID 一覧の生成で同じ定義を使う。
 */
export const TILE_NUMBERS = {
  [TYPE.M]: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [TYPE.P]: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [TYPE.S]: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [TYPE.Z]: [1, 2, 3, 4, 5, 6, 7],
  [TYPE.BACK]: [0],
} as const satisfies { [key in (typeof TYPE)[keyof typeof TYPE]]: number[] };

export type Type = (typeof TYPE)[keyof typeof TYPE];
export type Wind = (typeof WIND)[keyof typeof WIND];
export type Round = (typeof ROUND)[keyof typeof ROUND];
export type Operator = (typeof OP)[keyof typeof OP];
