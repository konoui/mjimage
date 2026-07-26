import { TYPE, OP, Type } from "../core";
import {
  Tile,
  BlockPair,
  Block,
  BlockIsolated,
  BlockThree,
  BlockRun,
  BlockHand,
  is5Tile,
} from "../core/parser";
import { Hand, withoutTiles } from "./hand";
import { buildBlockKey } from "./block-util";
import { forHand, N19, NZ } from "./tile";

export class BlockCalculator {
  hand: Hand;
  constructor(hand: Hand) {
    this.hand = hand;
  }

  /**
   * あがりの形になりうる手牌の構成の配列を返す。
   * 最後のあがり牌によっては、標準形でもカンチャン、リャンメンなど複数の構成になりうるのでその全てを返す。
   */
  calc(lastTile: Tile): readonly (readonly Block[])[] {
    return this.hand.preserving(() =>
      this.markedHands(
        [
          ...this.sevenPairs(),
          ...this.thirteenOrphans(),
          ...this.nineGates(),
          ...this.standardType(),
        ],
        lastTile,
      ),
    );
  }

  /**
   * あがりの形になりうる手牌の構成の配列に対して、最後のあがり牌を考慮したあがりの形になりうる手牌の構成の配列を返す。
   */
  markedHands(
    hands: readonly (readonly Block[])[],
    lastTile: Tile,
  ): readonly (readonly Block[])[] {
    if (hands.length == 0) return [];
    return hands.map((hand) => this.markedHand(hand, lastTile)).flat();
  }

  /**
   * あがりの形になりうる手牌の構成に対して、最後のあがり牌を考慮したあがりの形になりうる手牌の構成の配列を返す。
   */
  markedHand(
    hand: readonly Block[],
    lastTile: Tile,
  ): readonly (readonly Block[])[] {
    if (hand.length == 0) return [];
    const op = lastTile.has(OP.RON)
      ? OP.RON
      : lastTile.has(OP.TSUMO) || this.hand.drawn != null
        ? OP.TSUMO
        : OP.RON;

    const indexes: [number, number][] = []; // [block index, tile index]
    const seen = new Set<string>(); // reduce same blocks such as ["123m", "123m"]
    for (let bIdx = 0; bIdx < hand.length; bIdx++) {
      const block = hand[bIdx];
      if (block.isCalled()) continue;
      const tIdx = block.tiles.findIndex(
        (t) => t.equals(lastTile) && lastTile.has(OP.RED) == t.has(OP.RED),
      );
      if (tIdx < 0) continue;
      const key = buildBlockKey(block);
      if (seen.has(key)) continue;
      seen.add(key);
      indexes.push([bIdx, tIdx]);
    }

    if (indexes.length == 0)
      throw new Error(
        `tile ${lastTile.toString()} not found in hand: ${hand.toString()}`,
      );

    const newHands: Block[][] = [];
    for (const [bIdx, tIdx] of indexes) {
      const newHand = [...hand];
      const block = newHand[bIdx];
      const newTile = block.tiles[tIdx].clone({ add: op });
      newHand[bIdx] = block.clone({
        replace: { idx: tIdx, tile: newTile },
      }); // update with new block tiles with op
      newHands.push(newHand);
    }

    return newHands;
  }

  /**
   * 現在の手牌において、七対子のあがり形となりうる手牌の構成の配列を返す。
   * あがり牌は考慮されない。最大で要素は 1 となる。
   */
  sevenPairs(): readonly (readonly Block[])[] {
    return this.hand.preserving(() => this.calcSevenPairs());
  }
  private calcSevenPairs(): readonly (readonly Block[])[] {
    if (this.hand.called.length > 0) return [];
    const ret: Block[] = [];
    for (const [t, n] of forHand({ skipBack: true })) {
      const count = this.hand.get(t, n);
      if (count == 0) continue;
      else if (count == 2) {
        // red に対応するため dec した tile を使用する
        withoutTiles(this.hand, new Array(2).fill(new Tile(t, n)), (tiles) => {
          ret.push(new BlockPair(tiles[0], tiles[1]));
        });
      } else return [];
    }

    return [ret];
  }

  /**
   * 現在の手牌において、国士無双のあがり形となりうる手牌の構成の配列を返す。
   * あがり牌は考慮されない。
   */
  thirteenOrphans(): readonly (readonly Block[])[] {
    const ret: Block[] = [];
    let foundPairs = false;
    for (const t of Object.values(TYPE)) {
      if (t == TYPE.BACK) continue;
      const nn = t == TYPE.Z ? NZ : N19;
      for (let n of nn) {
        if (this.hand.get(t, n) == 1)
          ret.push(new BlockIsolated(new Tile(t, n)));
        else if (this.hand.get(t, n) == 2 && foundPairs == false) {
          ret.unshift(new BlockPair(new Tile(t, n), new Tile(t, n)));
          foundPairs = true;
        } else return [];
      }
    }
    return [ret];
  }

  /**
   * 現在の手牌において、九蓮宝燈のあがり形となりうる手牌の構成の配列を返す。
   * あがり牌は考慮されない。
   */
  nineGates(): readonly (readonly Block[])[] {
    const cond = (t: Type, n: number, wantCount: number[]) =>
      wantCount.includes(this.hand.get(t, n));
    for (const t of Object.values(TYPE)) {
      if (t == TYPE.BACK) continue;
      if (t == TYPE.Z) continue;
      const cond1 =
        cond(t, 1, [3, 4]) &&
        cond(t, 9, [3, 4]) &&
        cond(t, 2, [1, 2]) &&
        cond(t, 3, [1, 2]) &&
        cond(t, 4, [1, 2]) &&
        cond(t, 5, [1, 2]) &&
        cond(t, 6, [1, 2]) &&
        cond(t, 7, [1, 2]) &&
        cond(t, 8, [1, 2]);
      const cond2 = this.hand.sum(t) == 14;
      if (cond1 && cond2) {
        return [[new BlockHand(this.hand.hands)]];
      }
    }
    return [];
  }

  /**
   * 現在の手牌において、標準形のあがり形となりうる手牌の構成の配列を返す。
   * あがり牌は考慮されない。
   */
  standardType(): readonly (readonly Block[])[] {
    return this.hand.preserving(() => this.calcStandardType());
  }
  private calcStandardType(): readonly (readonly Block[])[] {
    let ret: readonly (readonly Block[])[] = [];
    for (const [t, n] of forHand()) {
      if (this.hand.get(t, n) >= 2) {
        const toDec = new Array(2).fill(new Tile(t, n));
        // OP.RED をつけないと、最後の（面子の） dec で RED が消費される。
        // e.g. 5s が 3枚あり、頭で 5s を2枚消費すると、calcAllBlockCombinations() で r5s と 5s のパータンを計算できなくなる。
        // 明示的に OP.RED を頭で消費するようにする。
        if (n == 5 && this.hand.get(t, 0) > 0 && this.hand.get(t, n) >= 3) {
          toDec[1] = new Tile(t, n, [OP.RED]);
        }
        // 1. calc all cases without two pairs
        // 2. remove non five blocks
        // 3. add two pairs to the head
        const v = withoutTiles(this.hand, toDec, (tiles) =>
          this.calcAllBlockCombinations()
            .filter((arr) => arr.length == 4)
            .map((arr) => [new BlockPair(tiles[0], tiles[1]), ...arr]),
        );
        ret = [...ret, ...v];
      }
    }

    return ret;
  }

  private calcAllBlockCombinations(): readonly (readonly Block[])[] {
    // [["123m", "123m"], ["222m", "333m"]]
    // [["123s", "123s"]]
    // result: [["123m", "123m", "123s", "123s"], ["111m", "333m", "123s", "123s"]]
    const vvv = [
      this.addRedPatterns(TYPE.M, this.handleNumType(TYPE.M)),
      this.addRedPatterns(TYPE.P, this.handleNumType(TYPE.P)),
      this.addRedPatterns(TYPE.S, this.handleNumType(TYPE.S)),
      this.handleZ(),
      this.handleBack(),
      [this.hand.called.concat()],
    ].sort((a, b) => b.length - a.length);
    // combine all patterns
    const ret = vvv.reduce(
      (acc, group) =>
        group.length === 0
          ? acc // 空の配列があればそのまま acc を返す
          : acc.flatMap((p) => group.map((choice) => [...p, ...choice])),
      [[]],
    );
    return ret;
  }

  // handle back tiles as same unknown tiles, Not joker tile.
  private handleBack(): readonly (readonly Block[])[] {
    const bt = TYPE.BACK;
    const sum = this.hand.get(bt, 0);
    if (sum < 3) return [];
    const p = new Tile(bt, 0);
    const b = Array(Math.floor(sum / 3)).fill(new BlockThree([p, p, p]));
    return b.length == 0 ? [] : [b];
  }

  private handleZ(): readonly (readonly Block[])[] {
    const z: Block[] = [];
    for (const [zt, n] of forHand({ filterBy: [TYPE.Z] })) {
      if (this.hand.get(zt, n) == 0) continue;
      else if (this.hand.get(zt, n) != 3) return [];
      const p = new Tile(zt, n);
      z.push(new BlockThree([p, p, p]));
    }
    return z.length == 0 ? [] : [z];
  }

  /**
   * 一つの手牌の構成において、赤牌ごとの手牌（晒したブロックを含まない）の構成を生成する。
   */
  private addRedPattern(t: Type, hand: readonly Block[]) {
    const nonRed = new Tile(t, 5);
    const red = new Tile(t, 5, [OP.RED]);
    const nonRedIndexes: [number, number][] = [];
    let redIndex: [number, number] | null = null;
    const seen = new Set<string>();
    for (let bIdx = 0; bIdx < hand.length; bIdx++) {
      const block = hand[bIdx];
      const nrtIdx = block.tiles.findIndex((t) => is5Tile(t) && !t.has(OP.RED));
      const rtIdx = block.tiles.findIndex((t) => is5Tile(t) && t.has(OP.RED));
      // red の位置情報
      if (rtIdx > -1) redIndex = [bIdx, rtIdx];
      // 一つのブロックに red と non red があるので BlockThree
      if (rtIdx > -1 && nrtIdx > -1) continue;
      if (nrtIdx < 0) continue;
      const key = buildBlockKey(block);
      if (seen.has(key)) continue;
      seen.add(key);
      // non red の位置情報
      nonRedIndexes.push([bIdx, nrtIdx]);
    }

    // BlockThree などの場合
    if (redIndex == null) return [hand];

    // 5 と r5 に入れ替えたパータンを生成する
    const newHands = [hand];
    for (const [bIdx, tIdx] of nonRedIndexes) {
      const newHand = [...hand];

      // 5 のブロックを r5 のブロックに変換
      const nonRedblock = newHand[bIdx];
      newHand[bIdx] = nonRedblock.clone({
        replace: { idx: tIdx, tile: red },
      });

      // r5 のブロックを 5 のブロックに変換
      const redblock = newHand[redIndex[0]];
      newHand[redIndex[0]] = redblock.clone({
        replace: { idx: redIndex[1], tile: nonRed },
      });
      // 345 と 34r5 は入れ変えても同じ
      if (buildBlockKey(nonRedblock) == buildBlockKey(redblock)) continue;
      newHands.push(newHand);
    }
    return newHands;
  }

  /**
   * 全ての手牌の構成において、赤牌ごとの手牌（晒したブロックを含まない）の構成を生成する。
   */
  // TODO similar to markDrawn
  private addRedPatterns(t: Type, hands: readonly (readonly Block[])[]) {
    if (!(this.hand.get(t, 0) > 0 && this.hand.get(t, 5) >= 2)) return hands;
    return hands.map((hand) => this.addRedPattern(t, hand)).flat();
  }
  private handleNumType(
    t: typeof TYPE.M | typeof TYPE.S | typeof TYPE.P,
    n: number = 1,
  ): readonly (readonly Block[])[] {
    if (n > 9) return [];

    if (this.hand.get(t, n) == 0) {
      return this.handleNumType(t, n + 1);
    }

    const ret: Block[][] = [];
    if (
      n <= 7 &&
      this.hand.get(t, n) > 0 &&
      this.hand.get(t, n + 1) > 0 &&
      this.hand.get(t, n + 2) > 0
    ) {
      const runs = withoutTiles(
        this.hand,
        [new Tile(t, n), new Tile(t, n + 1), new Tile(t, n + 2)],
        (tiles) => {
          const nested = this.handleNumType(t, n);
          const arrs = nested.length == 0 ? [[]] : nested;
          return arrs.map((arr) => [
            new BlockRun([tiles[0], tiles[1], tiles[2]]),
            ...arr,
          ]);
        },
      );
      ret.push(...runs);
    }

    if (this.hand.get(t, n) == 3) {
      const triples = withoutTiles(
        this.hand,
        new Array(3).fill(new Tile(t, n)),
        (tiles) => {
          const nested = this.handleNumType(t, n);
          const arrs = nested.length == 0 ? [[]] : nested;
          // Note insert it to the head due to handling recursively, 111333m
          // first arr will have [333m]
          return arrs.map((arr) => [
            new BlockThree([tiles[0], tiles[1], tiles[2]]),
            ...arr,
          ]);
        },
      );
      ret.push(...triples);
    }
    return ret;
  }
}
