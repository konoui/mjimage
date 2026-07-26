import { TYPE, Type } from "../core";
import { Tile } from "../core/parser";

/**
 * 么九牌の数字。字牌は 1z-7z、数牌は 1 と 9。
 */
export const NZ: readonly number[] = [1, 2, 3, 4, 5, 6, 7];
export const N19: readonly number[] = [1, 9];

/**
 * 全ての牌を順番に返すジェネレーター
 */
export function* forHand(options?: {
  skipBack?: boolean;
  filterBy?: readonly Type[];
}) {
  const types =
    options?.filterBy && options.filterBy.length > 0
      ? options?.filterBy
      : Object.values(TYPE);
  for (const t of types) {
    if (options?.skipBack && t == TYPE.BACK) continue;
    // Note: the value is related to data length of hand(data[type].length -1)
    const upper = t == TYPE.Z ? 7 : t == TYPE.BACK ? 1 : 9;
    for (let n = 1; n <= upper; n++) {
      yield [t, n] as const;
    }
  }
}

/**
 * ドラ表示牌を入力としてドラの牌を返す
 */
export const toDora = (doraIndicator: Tile) => {
  const n = doraIndicator.n;
  const t = doraIndicator.t;
  if (t == TYPE.Z) {
    if (n == 4) return new Tile(t, 1);
    else if (n == 7) return new Tile(t, 5);
  }
  return new Tile(t, (n % 9) + 1);
};
