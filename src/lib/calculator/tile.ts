import { TILE_NUMBERS, TYPE, Type, Tile } from "../core";

/** 牌種と数字の組。forHand が返す並びの要素。 */
type TileKey = readonly [Type, number];

const ALL_TYPES: readonly Type[] = Object.values(TYPE);

const buildKeys = (
  types: readonly Type[],
  skipBack: boolean,
): readonly TileKey[] => {
  const keys: TileKey[] = [];
  for (const t of types) {
    if (skipBack && t == TYPE.BACK) continue;
    for (const n of TILE_NUMBERS[t]) {
      // 数牌の 0 は赤 5 の別名なので、数字としては回さない
      if (n == 0 && t != TYPE.BACK) continue;
      keys.push([t, n]);
    }
  }
  return keys;
};

// 並びは牌種の組み合わせだけで決まるので、初回に作って使い回す。
// 探索の内側から何度も呼ばれるため、呼び出しごとに作り直さない。
const ALL_KEYS = buildKeys(ALL_TYPES, false);
const ALL_KEYS_NO_BACK = buildKeys(ALL_TYPES, true);
const SINGLE_TYPE_KEYS = new Map<Type, readonly TileKey[]>(
  ALL_TYPES.map((t) => [t, buildKeys([t], false)]),
);

/**
 * 全ての牌を順番に返す。値域は TILE_NUMBERS から導く。
 * 返す配列は使い回すので、呼び出し側で書き換えてはならない。
 */
export const forHand = (options?: {
  skipBack?: boolean;
  filterBy?: readonly Type[];
}): readonly TileKey[] => {
  const filterBy = options?.filterBy;
  const skipBack = options?.skipBack ?? false;

  if (filterBy == null || filterBy.length == 0)
    return skipBack ? ALL_KEYS_NO_BACK : ALL_KEYS;

  if (filterBy.length == 1) {
    const t = filterBy[0];
    if (skipBack && t == TYPE.BACK) return [];
    return SINGLE_TYPE_KEYS.get(t) ?? buildKeys([t], skipBack);
  }

  // 複数の牌種を指定するのは外から牌種を絞る場合だけで、探索の内側からは呼ばれない。
  // 並びは指定した順に従うので、作り置きはせずその場で組み立てる。
  return buildKeys(filterBy, skipBack);
};

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
