// barrel（./index.ts）は外向きの公開面。兄弟モジュールは実体を直接参照する。
import { Round, Wind, WIND, TYPE } from "./constants";

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
  n = ((n + 2) % 4) + 1;
  return `${n}${TYPE.Z}` as Wind;
};
