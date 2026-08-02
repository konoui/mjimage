import { OP, Type, Tile } from "../core";
import { MutableCounts } from "./counts";
import { Hand } from "./hand";
import { shantenOf, standardShantenOf } from "./shanten";
import { forHand } from "./tile";

export interface SerializedTileAnalysis {
  tile: string;
  effectiveTiles: readonly string[];
  shanten: number;
}

/**
 * 打牌した場合の有効牌の情報を表す。
 */
export interface TileAnalysis {
  /**
   * 想定する打牌を表す。
   */
  tile: Tile;
  /**
   * 打牌した場合の有効牌を表す。
   */
  effectiveTiles: readonly Tile[];
  /**
   * 打牌し有効牌を引いた場合のシャンテン数を表す。
   * 多くの場合、現在のシャンテン数 -1 となる。
   */
  shanten: number;
}

/**
 * ツモ後の14枚の手配から、シャンテン数が最小になる打牌候補の配列を返す。
 * choices は、通常なら hand.hands を指定する。ただし、リーチしている場合は打牌が限られているので choices で制限する。
 */
export const calcEffectiveTiles = (
  hand: Hand,
  choices: readonly Tile[],
  options?: {
    arrangeRed?: boolean;
    standardTypeOnly?: boolean;
  },
): readonly TileAnalysis[] => {
  if (choices.length == 0) throw new Error(`no tiles available to discard`);
  const w = MutableCounts.of(hand);
  const map = new Map<string, TileAnalysis>();
  let minShanten = Number.POSITIVE_INFINITY;
  for (const t of choices) {
    const c = w.without([t], () => effectiveTilesOf(w, options));
    // convert 0 and remove operators
    // arrangeRed の場合は赤も通常の牌として扱うため、赤の印を残さない。
    const keepRed = !options?.arrangeRed && t.has(OP.RED);
    const da = keepRed
      ? t.clone({ removeAll: true, add: OP.RED })
      : t.clone({ removeAll: true });
    if (c.shanten < minShanten) {
      map.clear();
      map.set(da.toString(), {
        shanten: c.shanten,
        effectiveTiles: c.effectiveTiles,
        tile: da,
      });
      // update
      minShanten = c.shanten;
    } else if (c.shanten == minShanten) {
      map.set(da.toString(), {
        shanten: c.shanten,
        effectiveTiles: c.effectiveTiles,
        tile: da,
      });
    }
  }
  return Array.from(map.values());
};

/**
 * ツモ前の13枚の手配から、有効牌の一覧とシャンテン数を返す
 * シャンテン数は有効牌を引いた場合の値となる。多くの場合、現在のシャンテン数 -1 となる。
 */
export const getEffectiveTiles = (
  hand: Hand,
  options?: {
    standardTypeOnly?: boolean;
    typeFilter?: readonly Type[];
  },
) => effectiveTilesOf(MutableCounts.of(hand), options);

const effectiveTilesOf = (
  w: MutableCounts,
  options?: {
    standardTypeOnly?: boolean;
    typeFilter?: readonly Type[];
  },
) => {
  let r = Number.POSITIVE_INFINITY;
  let effectiveTiles: Tile[] = [];

  for (const [t, n] of forHand({
    skipBack: true,
    filterBy: options?.typeFilter,
  })) {
    if (w.get(t, n) >= 4) continue;
    const tile = new Tile(t, n);
    const s = w.with([tile], () =>
      options?.standardTypeOnly ? standardShantenOf(w) : shantenOf(w),
    );

    if (s < r) {
      r = s;
      effectiveTiles = [tile];
    } else if (s == r) effectiveTiles.push(tile);
  }
  return {
    shanten: r,
    effectiveTiles: effectiveTiles,
  };
};
