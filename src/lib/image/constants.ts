/**
 * 描画にだけ関わる寸法・書体の定数。
 * 入力言語の語彙（牌・ブロック・風）は core が持ち、こちらは image の関心事。
 */

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

export const TABLE_CONTEXT = {
  BASE: 40,
  /** 河 1 行に並べる牌の枚数。 */
  RIVER_ROW_SIZE: 6,
  /**
   * 局表示の下に空ける余白。文字の高さに対する比率で持つ。
   * 牌のスケールではなくフォントに追従させるための係数。
   */
  ROUND_MARGIN_SCALE: 0.625,
} as const;
