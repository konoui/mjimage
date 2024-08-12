export const FONT_FAMILY = "MS Gothic, sans-serif";
export const TILE_CONTEXT = { WIDTH: 66, HEIGHT: 90 };
export const TABLE_CONTEXT = { BASE: 40 };
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
  DORA: "dora",
  TSUMO: "tsumo",
  //  RON: "ron",
  HAND: "hand",
  DISCARD: "simple-discard",
  UNKNOWN: "unknown",
  PAIR: "pair",
  SET: "set",
  ISOLATED: "isolated",
} as const;

export const WIND = {
  EAST: "1w",
  SOUTH: "2w",
  WEST: "3w",
  NORTH: "4w",
} as const;

export const ROUND_MAP = {
  "1w1": "東１局",
  "1w2": "東２局",
  "1w3": "東３局",
  "1w4": "東４局",
  "2w1": "南１局",
  "2w2": "南２局",
  "2w3": "南３局",
  "2w4": "南４局",
  "3w1": "西1局",
  "3w2": "西2局",
  "3w3": "西3局",
  "3w4": "西4局",
  "4w1": "北1局",
  "4w2": "北2局",
  "4w3": "北3局",
  "4w4": "北４局",
} as const;

export const WIND_MAP = {
  [WIND.EAST]: "東",
  [WIND.SOUTH]: "南",
  [WIND.WEST]: "西",
  [WIND.NORTH]: "北",
} as const;

export type Wind = keyof typeof WIND_MAP;
export type Round = keyof typeof ROUND_MAP;
