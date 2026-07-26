import { BLOCK } from "../core";
import { Block, Tile, compareTiles } from "../core/parser";

/**
 * オペレータを無視したブロックの文字列を返す
 */
export const buildBlockKey = (b: Block) => {
  return b.tiles.reduce((a: string, b: Tile) => `${a}${b.n}${b.t}`, "");
};

/**
 * 同じ順子が 2 つ以上ある組の数を返す。一盃口・二盃口の判定に使う。
 */
export const countSameBlocks = (h: readonly Block[]) => {
  const counts = new Map<string, number>();
  for (const b of h) {
    if (!b.is(BLOCK.RUN)) continue;
    const key = buildBlockKey(b);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.values()].filter((v) => v >= 2).length;
};

/**
 * ブロックの中で最も小さい牌を返す。
 */
export const minTile = (b: Block) => {
  return [...b.tiles].sort(compareTiles)[0];
};
