import { assert } from "../assert";
import { BLOCK, OP, Wind, nextWind } from "../core/";
import {
  BlockAnKan,
  BlockChi,
  BlockDaiKan,
  BlockPon,
  BlockShoKan,
  Tile,
  is5Tile,
} from "../core";
import {
  BoardContext,
  Hand,
  ShantenCalculator,
  BlockCalculator,
  PointCalculator,
  calcEffectiveTiles,
  getEffectiveTiles,
  TileAnalysis,
  forHand,
} from "../calculator";
import { getCallBlockIndex } from "./call-index";

// 手牌と盤面から「その行動が取れるか、取れるなら鳴きブロックはどの形か」を返す。
// controller の進行からは独立していて、Controller への参照を持たない。

export function doWin(
  hand: Hand,
  env: BoardContext,
  t: Tile,
  riverDiscarded: readonly { t: Tile }[]
) {
  const isRon = env.winBy.type === "ron";
  const cloned = isRon ? hand.clone() : hand;
  // ロン牌を手牌に加える
  if (isRon) cloned.inc([t]);
  const tc = new BlockCalculator(cloned);
  const dc = new PointCalculator(cloned, env);
  const hands = tc.calc(t);
  const ret = dc.calc(...hands);
  if (!ret) return false;

  // 自分捨てた牌へのフリテン対応
  if (isRon) {
    const c = getEffectiveTiles(hand).effectiveTiles;
    if (riverDiscarded.some((v) => c.some((ct) => ct.equals(v.t))))
      return false;
  }
  return ret;
}
export function doChi(
  hand: Hand,
  iam: Wind,
  discardedBy: Wind,
  t: Tile
): false | readonly BlockChi[] {
  if (!t.isNum()) return false;
  if (nextWind(discardedBy) != iam) return false;
  if (hand.reached) return false;
  if (hand.hands.length < 3) return false;

  const called = t.clone({
    remove: OP.TSUMO,
    add: [OP.HORIZONTAL],
  });
  const blocks: BlockChi[] = [];
  const left =
    called.n - 2 >= 1 &&
    hand.get(t.t, called.n - 2) > 0 &&
    hand.get(t.t, called.n - 1) > 0;
  if (left)
    blocks.push(
      new BlockChi([
        called,
        new Tile(t.t, called.n - 1),
        new Tile(t.t, called.n - 2),
      ])
    );

  const right =
    called.n + 2 <= 9 &&
    hand.get(t.t, called.n + 1) > 0 &&
    hand.get(t.t, called.n + 2) > 0;
  if (right)
    blocks.push(
      new BlockChi([
        called,
        new Tile(t.t, called.n + 1),
        new Tile(t.t, called.n + 2),
      ])
    );

  const center =
    called.n - 1 >= 1 &&
    called.n + 1 <= 9 &&
    hand.get(t.t, called.n - 1) > 0 &&
    hand.get(t.t, called.n + 1) > 0;
  if (center)
    blocks.push(
      new BlockChi([
        called,
        new Tile(t.t, called.n - 1),
        new Tile(t.t, called.n + 1),
      ])
    );

  // 鳴いた後の手配が全て食い替え対象だとチーできない。
  // 打6 で 333345666 はチーできない。
  // 鳴く牌とスジの牌を削除し、手配が0になればそのブロックでは鳴けない。
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const tiles = getForbiddenDiscardTiles(b);
    const toDec: Tile[] = [];
    for (const t of tiles) {
      const n = hand.get(t.t, t.n);
      for (let j = 0; j < n; j++) toDec.push(t.clone({ remove: OP.RED }));
    }

    const ltiles = hand.dec([...toDec, b.tiles[1], b.tiles[2]]);
    const cannotCall = hand.hands.length == 0;
    hand.inc(ltiles);

    if (cannotCall) blocks.splice(i, 1);
  }

  if (blocks.length == 0) return false;

  const blocksWith5 = blocks.filter(
    (b) => is5Tile(b.tiles[1]) || is5Tile(b.tiles[2])
  );
  if (blocksWith5.length == 0) return blocks;

  const blocksWithout5 = blocks.filter(
    (b) => !is5Tile(b.tiles[1]) && !is5Tile(b.tiles[2])
  );

  // 0. if hand has red tile then get red blocks
  // 1. if hand has non red tiles return original blocks
  // 2. if hand has only tile red return red blocks and original block excluding blocks with 5
  // 3. else if hand has non red tiles return original blocks
  // 4. else if hand as red and non red tiles return original blocks and red blocks
  const hasRed = hand.get(t.t, 0) > 0;
  if (!hasRed) return blocks;
  const redBlocks = hasRed ? getRedPatterns(blocksWith5) : [];
  if (redBlocks.length > 0 && hasRed && hand.get(t.t, 5) == 1)
    return [...blocksWithout5, ...redBlocks];
  return [...blocks, ...redBlocks];
}
export function doPon(
  hand: Hand,
  iam: Wind,
  discardedBy: Wind,
  t: Tile
): false | readonly BlockPon[] {
  if (iam == discardedBy) return false;
  if (hand.reached) return false;
  if (hand.hands.length < 3) return false;
  if (hand.get(t.t, t.n) < 2) return false;

  const sample = t.clone({ removeAll: true });
  const idx = getCallBlockIndex(iam, discardedBy, BLOCK.PON);

  const base = new BlockPon([sample, sample, sample]).clone({
    replace: { idx, tile: t.clone({ add: OP.HORIZONTAL }) },
  });

  // if discarded tile is RED
  if (is5Tile(t) && t.has(OP.RED)) {
    const newBlock = base.clone({
      replace: {
        idx: idx,
        tile: sample.clone({
          add: [OP.RED, OP.HORIZONTAL],
        }),
      },
    });
    return [newBlock];
  }
  // if the hand has red
  const ridx = (idx % 2) + 1;
  if (is5Tile(t) && hand.get(t.t, 0) > 0) {
    const red = base.clone({
      replace: { idx: ridx, tile: sample.clone({ add: OP.RED }) },
    });
    // red and non red case if the hand has 3 tiles including red
    if (hand.get(sample.t, 5) == 3) {
      const nonRed = base.clone({
        replace: { idx: ridx, tile: sample },
      });
      return [red, nonRed];
    } else return [red];
  }

  return [base];
}
export function doReach(hand: Hand): false | readonly TileAnalysis[] {
  if (hand.reached) return false;
  if (!hand.menzen) return false;
  const s = new ShantenCalculator(hand).calc();
  if (s > 0) return false;
  const r = calcEffectiveTiles(hand, hand.hands);
  return r;
}
export function doDiscard(hand: Hand, called?: BlockChi | BlockPon): readonly Tile[] {
  if (hand.reached) return [hand.drawn!];
  const handTiles = hand.hands;
  if (called == null) return handTiles;
  if (called instanceof BlockPon) {
    return handTiles.filter((v) => !v.equals(called.tiles[0]));
  }
  const tiles = getForbiddenDiscardTiles(called);
  const ret = handTiles.filter((v) => !tiles.some((t) => v.equals(t)));
  assert(
    ret.length > 0,
    `[bug] no tiles to discard. hand: ${hand}, forbidden tiles: ${tiles}, block-chi: ${called}`
  );
  return ret;
}
export function doDaiKan(
  hand: Hand,
  iam: Wind,
  discardedBy: Wind,
  t: Tile
): false | BlockDaiKan {
  if (hand.reached) return false;
  if (iam == discardedBy) return false;

  const sample = t.clone({ removeAll: true });
  if (hand.get(sample.t, sample.n) != 3) return false;

  const idx = getCallBlockIndex(iam, discardedBy, BLOCK.DAI_KAN);
  const base = new BlockDaiKan([sample, sample, sample, sample]).clone({
    replace: { idx, tile: sample.clone({ add: OP.HORIZONTAL }) },
  });

  let block = base;
  // 捨て牌が red ならその idx を red にする
  if (is5Tile(t) && t.has(OP.RED)) {
    block = base.clone({
      replace: {
        idx: idx,
        tile: sample.clone({ add: [OP.HORIZONTAL, OP.RED] }),
      },
    });
  }
  // 捨て牌が non red なら鳴いた位置からずらして red にする
  else if (is5Tile(t) && !t.has(OP.RED)) {
    assert(
      hand.get(t.t, 0) > 0,
      `[bug] hand does not have red tile to daikan: ${hand.toString()}`
    );
    const ridx = (idx % 3) + 1;
    block = base.clone({
      replace: { idx: ridx, tile: sample.clone({ add: OP.RED }) },
    });
  }

  assert(
    block.tiles.filter((t) => t.has(OP.HORIZONTAL)).length == 1,
    `[bug] daikan has unexpected horizontal operators: ${block.toString()}`
  );
  return block;
}
export function doAnKan(hand: Hand): false | BlockAnKan[] {
  if (hand.reached) return false; // FIXME 待ち変更がなければできる
  const blocks: BlockAnKan[] = [];
  for (const [t, n] of forHand()) {
    if (hand.get(t, n) == 4) {
      const tile = new Tile(t, n);
      const tiles = [tile, tile, tile, tile];
      if (is5Tile(tile)) tiles[1] = tile.clone({ add: OP.RED });
      blocks.push(new BlockAnKan(tiles));
    }
  }
  if (blocks.length == 0) return false;
  for (const b of blocks)
    assert(
      b.tiles.filter((t) => t.has(OP.HORIZONTAL)).length == 0,
      `[bug] ankan has horizontal op: ${b.toString()}`
    );
  return blocks;
}
export function doShoKan(hand: Hand): false | BlockShoKan[] {
  if (hand.reached) return false;
  // TODO ハイテイ ではカンできない
  const called = hand.called.filter((b) => b instanceof BlockPon);
  if (called.length == 0) return false;
  const blocks: BlockShoKan[] = [];
  for (const cb of called) {
    const pick = cb.tiles[0].clone({
      removeAll: true,
      add: OP.HORIZONTAL,
    });
    if (hand.get(pick.t, pick.n) == 1) {
      const tile =
        is5Tile(pick) && hand.get(pick.t, 0) > 0
          ? pick.clone({ add: OP.RED })
          : pick;
      blocks.push(BlockShoKan.fromPon(cb, tile));
    }
  }
  if (blocks.length == 0) return false;
  for (const b of blocks)
    assert(
      b.tiles.filter((t) => t.has(OP.HORIZONTAL)).length == 2,
      `[bug] shokan has unexpected horizontal operators: ${b.toString()}`
    );
  return blocks;
}
/**
 * 赤なしのチーブロックを赤ありのチーブロックにして返す。
 */
function getRedPatterns(blocksWith5: readonly BlockChi[]): readonly BlockChi[] {
  if (blocksWith5.length == 0) return [];
  return blocksWith5
    .map((b) => {
      if (is5Tile(b.tiles[1])) {
        const rt = b.tiles[1].clone({ add: OP.RED });
        const n = b.clone({ replace: { idx: 1, tile: rt } });
        return n;
      } else if (is5Tile(b.tiles[2])) {
        const rt = b.tiles[2].clone({ add: OP.RED });
        const n = b.clone({ replace: { idx: 2, tile: rt } });
        return n;
      }
    })
    .filter((b) => b != null);
}

/**
 * 食いかえ対象の牌を返す
 */
function getForbiddenDiscardTiles(b: BlockChi): readonly Tile[] {
  const called = b.tiles[0];
  const h1 = b.tiles[1].n;
  // -423 の 1 , -978　の 6
  if (h1 != 1 && called.n - 2 == h1)
    return [new Tile(called.t, called.n - 3), called];
  // -123 の 4,
  if (h1 != 8 && called.n + 1 == h1)
    return [new Tile(called.t, called.n + 3), called];
  // -324 -789 -312 のカンチャンは対応牌なし
  return [called];
}
