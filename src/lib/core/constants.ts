export const FONT_FAMILY = "MS Gothic, sans-serif";
// 0.8 results sum of 4 string
export const TILE_CONTEXT = {
  WIDTH: 66,
  HEIGHT: 90,
  TEXT_SCALE: 0.8,
  BLOCK_MARGIN_SCALE: 0.3,
} as const;

export const STICK_CONTEXT = {
  WIDTH: 125,
  HEIGHT: 27.5,
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
export const OP = {
  TSUMO: "t",
  RON: "v",
  DORA: "d",
  HORIZONTAL: "-",
  RED: "r",
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
  PAIR: "pair",
  ISOLATED: "isolated",
  THREE: "three",
  RUN: "run",
  HAND: "hand",
  IMAGE_DORA: "dora",
  IMAGE_DISCARD: "simple-discard",
  UNKNOWN: "unknown",
} as const;

export const WIND = {
  E: "1z",
  S: "2z",
  W: "3z",
  N: "4z",
} as const;

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
  [ROUND.W1]: "西1局",
  [ROUND.W2]: "西2局",
  [ROUND.W3]: "西3局",
  [ROUND.W4]: "西4局",
  [ROUND.N1]: "北1局",
  [ROUND.N2]: "北2局",
  [ROUND.N3]: "北3局",
  [ROUND.N4]: "北４局",
} as const;

export type Type = (typeof TYPE)[keyof typeof TYPE];
export type Wind = (typeof WIND)[keyof typeof WIND];
export type Round = (typeof ROUND)[keyof typeof ROUND];
