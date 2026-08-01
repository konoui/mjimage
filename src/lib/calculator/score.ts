export const SCORING = {
  MANGAN: 2000,
  HANEMAN: 3000,
  DOUBLE: 4000,
  TRIPLE: 6000,
  YAKUMAN: 8000,
  DOUBLE_YAKUMAN: 16000,
  DEAD_STICK: 300,
  REACH_STICK: 1000,
} as const;

export const HAN_SCORING_TABLE = [
  { minHan: 26, points: SCORING.DOUBLE_YAKUMAN },
  { minHan: 13, points: SCORING.YAKUMAN },
  { minHan: 11, points: SCORING.TRIPLE },
  { minHan: 8, points: SCORING.DOUBLE },
  { minHan: 6, points: SCORING.HANEMAN },
  { minHan: 5, points: SCORING.MANGAN },
] as const;

const SCORE_NAMES = {
  [SCORING.MANGAN]: "満貫",
  [SCORING.HANEMAN]: "跳満",
  [SCORING.DOUBLE]: "倍満",
  [SCORING.TRIPLE]: "三倍満",
} as const;

export const POINT_COEFFICIENT = {
  PARENT_RON: 6,
  CHILD_RON: 4,
  PARENT_TSUMO: 2,
  CHILD_TUMO_FROM_PARENT: 2,
  CHILD_TUMO_FROM_CHILD: 1,
} as const;

export const myCeil = (v: number, p = 100) => {
  return Math.ceil(v / p) * p;
};

/**
 * ロンあがりの支払い点。放銃者が 1 人でこの全額を払う。
 */
export const ronPoints = (base: number, isParent: boolean): number =>
  myCeil(
    base *
      (isParent ? POINT_COEFFICIENT.PARENT_RON : POINT_COEFFICIENT.CHILD_RON),
  );

/**
 * ツモあがりの支払い点を、払う側の立場ごとに返す。
 * 親のあがりでは親の払い手がいないため fromParent は 0 で、
 * 子 3 人が fromChild を等しく払う。
 */
export const tsumoPoints = (
  base: number,
  isParent: boolean,
): { fromParent: number; fromChild: number } =>
  isParent
    ? {
        fromParent: 0,
        fromChild: myCeil(base * POINT_COEFFICIENT.PARENT_TSUMO),
      }
    : {
        fromParent: myCeil(base * POINT_COEFFICIENT.CHILD_TUMO_FROM_PARENT),
        fromChild: myCeil(base * POINT_COEFFICIENT.CHILD_TUMO_FROM_CHILD),
      };

/**
 * あがりの説明を返す。
 */
export function getPointDescription(params: {
  base: number;
  fu: number;
  han: number;
  isTsumo: boolean;
  isParent: boolean;
  isYakuman?: boolean;
  isCountableYakuman?: boolean;
}): string {
  if (params.isYakuman) return "役満";
  if (params.isCountableYakuman) return "数え役満";

  const pointDesc = generatePointDescription(
    params.base,
    params.isTsumo,
    params.isParent,
  );

  const scoreName = SCORE_NAMES[params.base as keyof typeof SCORE_NAMES];
  return scoreName
    ? `${params.fu}符${params.han}飜 ${scoreName}${pointDesc}`
    : `${params.fu}符${params.han}飜 ${pointDesc}`;
}

function generatePointDescription(
  base: number,
  isTsumo: boolean,
  isParent: boolean,
): string {
  // RON: 単一の点数
  if (!isTsumo) return `${ronPoints(base, isParent)}`;

  const { fromParent, fromChild } = tsumoPoints(base, isParent);
  // 親のツモ: 子 3 人が同額なので単一の点数
  if (isParent) return `${fromChild}`;
  // 子のツモ: 子から-親から の範囲表示
  return `${fromChild}-${fromParent}`;
}
