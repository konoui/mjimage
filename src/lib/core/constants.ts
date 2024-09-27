export const FONT_FAMILY = "MS Gothic, sans-serif";
// 0.8 results sum of 4 string
export const TILE_CONTEXT = {
  WIDTH: 66,
  HEIGHT: 90,
  TEXT_SCALE: 0.8,
  BLOCK_MARGIN_SCALE: 0.3,
} as const;
export const TABLE_CONTEXT = { BASE: 40 } as const;
export const INPUT_SEPARATOR = ",";
export const TYPE = {
  M: "m",
  P: "p",
  S: "s",
  Z: "z",
  BACK: "_",
} as const;
export const OPERATOR = {
  TSUMO: "t",
  RON: "r",
  DORA: "d",
  HORIZONTAL: "-",
  COLOR_GRAYSCALE: "^",
} as const;

export const BLOCK = {
  PON: "pon",
  CHI: "chi",
  SHO_KAN: "shokan",
  DAI_KAN: "daikan",
  AN_KAN: "ankan",
  TSUMO: "tsumo",
  //  RON: "ron",
  THREE: "three",
  PAIR: "pair",
  ISOLATED: "isolated",
  RUN: "run",
  HAND: "hand",
  IMAGE_DORA: "dora",
  IMAGE_DISCARD: "simple-discard",
  UNKNOWN: "unknown",
} as const;

export const WIND = {
  E: "1w",
  S: "2w",
  W: "3w",
  N: "4w",
} as const;

export const ROUND = {
  E1: "1w1",
  E2: "1w2",
  E3: "1w3",
  E4: "1w4",
  S1: "2w1",
  S2: "2w2",
  S3: "2w3",
  S4: "2w4",
  W1: "3w1",
  W2: "3w2",
  W3: "3w3",
  W4: "3w4",
  N1: "4w1",
  N2: "4w2",
  N3: "4w3",
  N4: "4w4",
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
  [ROUND.W1]: "西1局",
  [ROUND.W2]: "西2局",
  [ROUND.W3]: "西3局",
  [ROUND.W4]: "西4局",
  [ROUND.N1]: "北1局",
  [ROUND.N2]: "北2局",
  [ROUND.N3]: "北3局",
  [ROUND.N4]: "北４局",
} as const;

export type Wind = (typeof WIND)[keyof typeof WIND];
export type Round = (typeof ROUND)[keyof typeof ROUND];
