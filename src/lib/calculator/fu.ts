import { BLOCK, OP, TERMINAL_NUMBERS, TYPE, Block, Tile } from "../core";
import { assert } from "../assert";

/**
 * 手牌の構成から符を計算する。
 *
 * あがり牌を含むブロックと雀頭がある構成（七対子・標準形）を前提とする。
 * 国士無双と九蓮宝燈はここへ来ない（役満が成立した時点で通常役を評価しないため）。
 */
export const calcFu = (
  h: readonly Block[],
  ctx: { myWind: Tile; roundWind: Tile; isCalled: boolean },
) => {
  if (h.length == 7) return 25;

  const base = 20;
  let fu = base;

  const myWind = ctx.myWind.n;
  const round = ctx.roundWind.n;

  const lastBlock = h.find((b) =>
    b.tiles.some((t) => t.has(OP.TSUMO) || t.has(OP.RON)),
  );
  assert(lastBlock != null, `hand does not have a winning tile: ${h.join("")}`);
  const isCalled = ctx.isCalled;
  const isTsumo = lastBlock.tiles.some((t) => t.has(OP.TSUMO));

  // 刻子
  const calcTriple = (b: Block, base: number) => {
    const tile = b.tiles[0];
    if (tile.t == TYPE.Z || TERMINAL_NUMBERS.includes(tile.n)) return base * 2;
    else return base;
  };

  for (const b of h) {
    if (!b.isTriplet()) continue;
    if (b.is(BLOCK.THREE))
      fu += calcTriple(b, b.tiles.some((t) => t.has(OP.RON)) ? 2 : 4);
    else if (b.is(BLOCK.PON)) fu += calcTriple(b, 2);
    else if (b.is(BLOCK.DAI_KAN) || b.is(BLOCK.SHO_KAN))
      fu += calcTriple(b, 8);
    else if (b.is(BLOCK.AN_KAN)) fu += calcTriple(b, 16);
  }

  // 待ち
  const calcLast = (b: Block) => {
    if (b.is(BLOCK.THREE)) return 0; // シャンポン
    if (b.is(BLOCK.PAIR)) return 2; // 単騎
    const tiles = b.tiles;
    const idx = tiles.findIndex((t) => t.has(OP.TSUMO) || t.has(OP.RON));
    if (idx == 1)
      return 2; // カンチャン
    else if (idx == 0 && tiles[2].n == 9)
      return 2; //ペンチャン
    else if (idx == 2 && tiles[0].n == 1) return 2; //ペンチャン
    return 0; // リャンメン
  };

  fu += calcLast(lastBlock);

  // Pair
  const pair = h.find((b) => b.is(BLOCK.PAIR));
  assert(pair != null, `hand does not have a pair: ${h.join("")}`);
  const tile = pair.tiles[0];
  if (tile.t == TYPE.Z) {
    if ([5, 6, 7].includes(tile.n)) fu += 2;
    if (tile.n == round) fu += 2;
    // 連風対子は無効
    else if (tile.n == myWind) fu += 2;
  }

  // 平和は面前で符の付く要素が一つもない形。ここまでで基本符のままなら該当する。
  // 役としての判定は yaku.ts が符の値（ツモ 20 符 / ロン 30 符）から行う。
  const isPinfu = !isCalled && fu == base;
  if (isTsumo && !isPinfu) fu += 2; // 平和以外のツモは2
  if (!isTsumo && !isCalled) fu += 10; // 面前ロン
  if (isCalled && fu == base) fu = 30; // 鳴きの 20 は 30 になる

  return fu;
};
