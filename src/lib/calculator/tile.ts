import { TILE_NUMBERS, TYPE, Type } from "../core";
import { Tile } from "../core/parser";

/**
 * 全ての牌を順番に返すジェネレーター。値域は TILE_NUMBERS から導く。
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
    for (const n of TILE_NUMBERS[t]) {
      // 数牌の 0 は赤 5 の別名なので、数字としては回さない
      if (n == 0 && t != TYPE.BACK) continue;
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
