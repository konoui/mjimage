import { BLOCK, Block, Tile, compareTiles } from "../core";

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

/**
 * 手牌の中の牌 1 枚の位置。[ブロックの位置, ブロック内の牌の位置]。
 */
export type TilePosition = readonly [bIdx: number, tIdx: number];

/**
 * 条件に合う牌の位置を、ブロックごとに 1 つずつ集める。
 * 同じ形のブロック（"123m" が 2 つあるなど）はどちらを選んでも結果が同じなので、
 * オペレータを無視した形が一致するものは最初の 1 つに畳む。
 */
export const findTilePositions = (
  hand: readonly Block[],
  find: (t: Tile, b: Block) => boolean,
): readonly TilePosition[] => {
  const positions: TilePosition[] = [];
  const seen = new Set<string>();
  for (let bIdx = 0; bIdx < hand.length; bIdx++) {
    const block = hand[bIdx];
    const tIdx = block.tiles.findIndex((t) => find(t, block));
    if (tIdx < 0) continue;
    const key = buildBlockKey(block);
    if (seen.has(key)) continue;
    seen.add(key);
    positions.push([bIdx, tIdx]);
  }
  return positions;
};

/**
 * 指定した位置の牌を差し替えた手牌を作る。元の手牌は変えない。
 * 差し替えは前から順に適用するので、同じブロックを 2 度指しても積み重なる。
 */
export const replaceTiles = (
  hand: readonly Block[],
  replacements: readonly (readonly [TilePosition, (t: Tile) => Tile])[],
): readonly Block[] => {
  const newHand = [...hand];
  for (const [[bIdx, tIdx], make] of replacements) {
    const block = newHand[bIdx];
    newHand[bIdx] = block.clone({
      replace: { idx: tIdx, tile: make(block.tiles[tIdx]) },
    });
  }
  return newHand;
};
