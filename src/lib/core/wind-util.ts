import { Round, Wind, WIND, BLOCK, TYPE } from ".";
import { assert } from "../myassert";

export type WindMap<T> = Record<Wind, T>;

export function createWindMap<T>(factory: () => T): WindMap<T> {
  return {
    [WIND.E]: factory(),
    [WIND.S]: factory(),
    [WIND.W]: factory(),
    [WIND.N]: factory(),
  };
}

/**
 * 次の局を返す
 */
export const nextRound = (r: Round) => {
  let w = r.substring(0, 2) as Wind;
  let n = Number(r.substring(2, 3));
  if (n == 4) {
    n = 1;
    w = nextWind(w);
  } else n++;
  return `${w}${n}` as Round;
};

/**
 * 前の局を返す
 */
export const prevRound = (r: Round) => {
  return nextRound(nextRound(nextRound(r)));
};

/**
 * ラウンドから場風を返す
 */
export const roundWind = (r: Round) => {
  return r.substring(0, 2) as Wind;
};

/**
 * 次の風を返す。 e.g.) 1z => 2z
 */
export const nextWind = (w: Wind): Wind => {
  let n = Number(w.toString()[0]);
  n = (n % 4) + 1;
  return `${n}${TYPE.Z}` as Wind;
};

/**
 * 前の風を返す。 e.g.) 1z => 4z
 */
export const prevWind = (w: Wind): Wind => {
  let n = Number(w.toString()[0]);
  const cycle = [1, 4, 3, 2];
  const index = cycle.indexOf(n);
  const prev = cycle[(index + 1) % cycle.length];
  return `${prev}${TYPE.Z}` as Wind;
};

/**
 * 鳴いた人と捨てた人からブロック作成時の鳴いた牌を示すインデックスを返す。
 */
export const getCallBlockIndex = (
  caller: Wind,
  discardedBy: Wind,
  type: typeof BLOCK.PON | typeof BLOCK.DAI_KAN
) => {
  const distance = Math.abs(Number(caller[0]) - Number(discardedBy[0]));
  assert(1 == distance || distance == 2 || distance == 3);
  if (type == BLOCK.PON) {
    if (distance == 3) return 0;
    else if (distance == 2) return 1;
    return 2;
  } else {
    if (distance == 3) return 0;
    else if (distance == 1) return 3;
    return 2;
  }
};
