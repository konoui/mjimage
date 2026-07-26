import {
  BLOCK,
  TYPE,
  OP,
  Wind,
  WIND,
  createWindMap,
  roundWind,
} from "../core";
import { Tile, Block } from "../core/parser";
import { assert } from "../assert";
import { Hand } from "./hand";
import { countSameBlocks, minTile } from "./block-util";
import { calcFu } from "./fu";
import {
  HAN_SCORING_TABLE,
  POINT_COEFFICIENT,
  SCORING,
  getPointDescription,
  myCeil,
} from "./score";
import { N19, NZ, toDora } from "./tile";
import {
  BoardContext,
  WINNING_TILE_BLOCK_TYPE,
  WinResult,
  WinningHand,
  Yaku,
} from "./types";

export class PointCalculator {
  hand: Hand;
  cfg: {
    doras: readonly Tile[];
    hiddenDoras: readonly Tile[];
    roundWind: Tile;
    myWind: Tile;
    reached: 0 | 1 | 2;
    sticks: { readonly reach: number; readonly dead: number };
    replacementWin: boolean;
    quadWin: boolean;
    finalWallWin: boolean;
    finalDiscardWin: boolean;
    oneShotWin: boolean;
    enableRoundUpMangan: boolean;
    disableCountableYakuman: boolean;
    disableDoubleYakuman: boolean;
    orig: BoardContext;
  };
  constructor(hand: Hand, params: BoardContext) {
    this.hand = hand;
    this.cfg = {
      doras: params.doraIndicators.map((v) => toDora(v)), // convert to dora
      hiddenDoras:
        params.hiddenDoraIndicators == null
          ? []
          : params.hiddenDoraIndicators.map((v) => toDora(v)),
      roundWind: Tile.from(roundWind(params.round)),
      myWind: Tile.from(params.myWind),
      reached: params.doubleReached ? 2 : hand.reached ? 1 : 0,
      sticks: params.sticks ?? { dead: 0, reach: 0 },
      replacementWin: params.replacementWin ?? false,
      quadWin: params.quadWin ?? false,
      finalWallWin: params.finalWallWin ?? false,
      finalDiscardWin: params.finalDiscardWin ?? false,
      oneShotWin: params.oneShotWin ?? false,
      enableRoundUpMangan: params.enableRoundUpMangan ?? false,
      disableCountableYakuman: params.disableCountableYakuman ?? false,
      disableDoubleYakuman: params.disableDoubleYakuman ?? false,
      orig: params,
    };
  }

  /**
   * 現在の手牌の構成の配列の中から、点数が最大になるあがりを返す。
   */
  calc(...hands: readonly (readonly Block[])[]): WinResult | false {
    const patterns = this.getWinningHands(hands);
    if (patterns.length === 0) return false;

    const bestHand = this.selectBestHand(patterns);
    const scoreInfo = this.calculateScore(bestHand);
    const deltas = this.calculateDeltas(
      scoreInfo.base,
      scoreInfo.isTsumo,
      scoreInfo.isParent,
      scoreInfo.myWind,
      this.cfg.orig.ronWind,
    );

    const basePoints = deltas[scoreInfo.myWind];

    this.addStickPoints(deltas, scoreInfo.myWind, this.cfg.orig.ronWind);

    const description = getPointDescription({
      base: scoreInfo.base,
      fu: scoreInfo.fu,
      han: scoreInfo.han,
      isTsumo: scoreInfo.isTsumo,
      isParent: scoreInfo.isParent,
      isYakuman: scoreInfo.isYakuman,
      isCountableYakuman: scoreInfo.isCountableYakuman,
    });

    return {
      ...bestHand,
      fu: scoreInfo.fu, // ceiled value
      deltas,
      points: deltas[scoreInfo.myWind],
      basePoints,
      boardContext: this.cfg.orig,
      description,
    };
  }

  /**
   * 現在の手牌の構成の配列の中から、あがりになる構成の配列を返す。
   */
  getWinningHands(hands: readonly (readonly Block[])[]) {
    const ret: WinningHand[] = [];
    if (hands.length == 0) return ret;
    for (const hand of hands) {
      const v = [
        ...this.dA13(hand),
        ...this.dB13(hand),
        ...this.dC13(hand),
        ...this.dD13(hand),
        ...this.dE13(hand),
        ...this.dF13(hand),
        ...this.dG13(hand),
        ...this.dH13(hand),
        ...this.dI13(hand),
        ...this.dJ13(hand),
        ...this.dK13(hand),
      ].map((y) => {
        if (this.cfg.disableDoubleYakuman && y.han > 13) y.han = 13;
        return y;
      });
      if (v.length == 0) continue;
      ret.push({
        yakus: v,
        han: v.reduce((sum, yaku) => sum + yaku.han, 0),
        fu: 30,
        hand: hand,
        isYakuman: true,
        metadata: {
          winningTileBlockType: getWinningTileBlockType(hand),
        },
      });
    }

    if (ret.length > 0) return ret;

    for (const hand of hands) {
      const fu = this.calcFu(hand);
      const v = [
        ...this.dA1(hand),
        ...this.dB1(hand),
        ...this.dC1(hand),
        ...this.dD1(hand),
        ...this.dE1(hand),
        ...this.dF1(hand),
        ...this.dG1(hand),
        ...this.dH1(hand),
        ...this.dI1(hand),
        ...this.dJ1(hand),
        ...this.dK1(hand),

        ...this.dA2(hand),
        ...this.dB2(hand),
        ...this.dC2(hand),
        ...this.dD2(hand),
        ...this.dE2(hand),
        ...this.dF2(hand),
        ...this.dG2(hand),
        ...this.dH2(hand),
        ...this.dI2(hand),
        ...this.dJ2(hand),

        ...this.dA3(hand),
        ...this.dB3(hand),
        ...this.dC3(hand),

        ...this.dA6(hand),
      ];
      if (v.length == 0) continue;
      // doras are evaluated when other yaku exists
      v.push(...this.dX1(hand));
      ret.push({
        yakus: v,
        han: v.reduce((sum, yaku) => sum + yaku.han, 0),
        fu: fu,
        hand: hand,
        metadata: {
          winningTileBlockType: getWinningTileBlockType(hand),
        },
      });
    }

    return ret;
  }

  private selectBestHand(winningHands: readonly WinningHand[]) {
    return winningHands.reduce((best, current) => {
      const { han, fu } = current;
      const { han: bestHan, fu: bestFu } = best;
      return han > bestHan || (han === bestHan && fu > bestFu) ? current : best;
    });
  }

  private calculateScore(bestHand: WinningHand) {
    const { han } = bestHand;
    const fu = bestHand.fu !== 25 ? myCeil(bestHand.fu, 10) : 25;
    const isYakuman = bestHand.isYakuman ?? false;

    let base = this.getBasePoints(han, fu);
    let isCountableYakuman = false;

    // 数え役満処理
    if (han >= 13 && han < 26 && !this.hasYakuman(bestHand.yakus)) {
      base = this.cfg.disableCountableYakuman
        ? SCORING.TRIPLE
        : SCORING.YAKUMAN;
      isCountableYakuman = !this.cfg.disableCountableYakuman;
    }

    // 切り上げ満貫
    if (this.cfg.enableRoundUpMangan && this.isRoundUpMangan(fu, han)) {
      base = SCORING.MANGAN;
    }

    const isTsumo = this.isTsumoWin(bestHand.hand);
    const myWind = this.cfg.orig.myWind;
    const isParent = myWind === WIND.E;

    return {
      base,
      fu,
      han,
      isYakuman: isCountableYakuman ? true : isYakuman,
      isCountableYakuman,
      isTsumo,
      myWind,
      isParent,
    };
  }

  private hasYakuman(yakus: readonly Yaku[]): boolean {
    return yakus.some((yaku) => yaku.isYakuman);
  }

  private isRoundUpMangan(fu: number, han: number): boolean {
    return (fu === 30 && han === 4) || (fu === 60 && han === 3);
  }

  private isTsumoWin(hand: readonly Block[]): boolean {
    return hand.some((block) => block.tiles.some((tile) => tile.has(OP.TSUMO)));
  }

  /**
   * Wind をキーとした点数移動の構成を返す
   */
  private calculateDeltas(
    base: number,
    isTsumo: boolean,
    isParent: boolean,
    myWind: Wind,
    ronWind?: Wind,
  ) {
    const deltas = createWindMap(() => 0);

    if (!isTsumo) {
      assert(ronWind != null, "tumo is false but ron wind is null");
      this.calculateRonDeltas(deltas, base, isParent, myWind, ronWind);
    } else {
      this.calculateTsumoDeltas(deltas, base, isParent, myWind);
    }

    return deltas;
  }

  private calculateRonDeltas(
    deltas: { [key in Wind]: number },
    base: number,
    isParent: boolean,
    myWind: Wind,
    ronWind: Wind,
  ) {
    const coefficient = isParent
      ? POINT_COEFFICIENT.PARENT_RON
      : POINT_COEFFICIENT.CHILD_RON;
    const points = myCeil(base * coefficient);

    deltas[myWind] += points;
    deltas[ronWind] -= points;
  }

  private calculateTsumoDeltas(
    deltas: { [w in Wind]: number },
    base: number,
    isParent: boolean,
    myWind: Wind,
  ) {
    if (isParent) {
      const basePoints = myCeil(base * POINT_COEFFICIENT.PARENT_TSUMO);
      deltas[WIND.E] += basePoints * 3;
      deltas[WIND.S] -= basePoints;
      deltas[WIND.W] -= basePoints;
      deltas[WIND.N] -= basePoints;
      return;
    }
    for (const key of Object.values(WIND)) {
      if (key == myWind) continue;
      const coefficient =
        key == WIND.E
          ? POINT_COEFFICIENT.CHILD_TUMO_FROM_PARENT
          : POINT_COEFFICIENT.CHILD_TUMO_FROM_CHILD;
      const basePoints = myCeil(base * coefficient);
      deltas[key] -= basePoints;
      deltas[myWind] += basePoints;
    }
  }

  private addStickPoints(
    deltas: { [w in Wind]: number },
    myWind: Wind,
    ronWind: Wind | undefined,
  ) {
    deltas[myWind] += SCORING.REACH_STICK * this.cfg.sticks.reach;
    const deadPoint = SCORING.DEAD_STICK * this.cfg.sticks.dead;
    if (ronWind != null) {
      deltas[myWind] += deadPoint;
      deltas[ronWind] -= deadPoint;
      return;
    }
    for (const key of Object.values(WIND)) {
      if (key == myWind) deltas[key] += deadPoint;
      else deltas[key] -= deadPoint / 3;
    }
  }

  private getBasePoints(han: number, fu: number): number {
    for (const { minHan, points } of HAN_SCORING_TABLE) {
      if (han >= minHan) return points;
    }
    // 40符以上の4飜は満貫の2000にする。
    return Math.min(fu * 2 ** (han + 2), SCORING.MANGAN);
  }

  private getCalledPenalty() {
    return this.hand.menzen ? 0 : 1;
  }

  dA1(_h: readonly Block[]): readonly Yaku[] {
    if (this.cfg.reached == 1) return [{ name: "立直", han: 1 }];
    if (this.cfg.reached == 2) return [{ name: "ダブル立直", han: 2 }];
    return [];
  }
  dB1(h: readonly Block[]): readonly Yaku[] {
    if (this.hand.drawn == null) [];
    if (this.getCalledPenalty() != 0) return [];
    const cond = h.some((b) => b.tiles.some((t) => t.has(OP.TSUMO)));
    return cond ? [{ name: "門前清自摸和", han: 1 }] : [];
  }
  dC1(h: readonly Block[]): readonly Yaku[] {
    if (this.getCalledPenalty() != 0) return [];
    const name = "平和";
    const fu = this.calcFu(h);
    if (fu == 20) return [{ name: name, han: 1 }];
    if (!h.some((b) => b.tiles.some((t) => t.has(OP.TSUMO)))) {
      if (fu == 30) return [{ name: name, han: 1 }];
    }
    return [];
  }
  dD1(h: readonly Block[]): readonly Yaku[] {
    const cond = h.some((block) =>
      block.tiles.some((t) => t.t == TYPE.Z || N19.includes(t.n)),
    );
    return cond ? [] : [{ name: "断么九", han: 1 }];
  }
  dE1(h: readonly Block[]): readonly Yaku[] {
    if (this.getCalledPenalty() != 0) return [];

    const count = countSameBlocks(h);
    return count == 1 ? [{ name: "一盃口", han: 1 }] : [];
  }
  dF1(h: readonly Block[]): readonly Yaku[] {
    const ret: Yaku[] = [];
    h.forEach((block) => {
      if (block.is(BLOCK.PAIR)) return;
      const tile = block.tiles[0];
      if (tile.t == TYPE.Z) {
        if (tile.equals(this.cfg.myWind)) ret.push({ name: "自風", han: 1 });
        if (tile.equals(this.cfg.roundWind)) ret.push({ name: "場風", han: 1 });
        else if (tile.n == 5) ret.push({ name: "白", han: 1 });
        else if (tile.n == 6) ret.push({ name: "發", han: 1 });
        else if (tile.n == 7) ret.push({ name: "中", han: 1 });
      }
    });
    return ret;
  }
  dG1(_h: readonly Block[]): readonly Yaku[] {
    return this.cfg.oneShotWin ? [{ name: "一発", han: 1 }] : [];
  }
  dH1(_h: readonly Block[]): readonly Yaku[] {
    return this.cfg.replacementWin ? [{ name: "嶺上開花", han: 1 }] : [];
  }
  dI1(_h: readonly Block[]): readonly Yaku[] {
    return this.cfg.quadWin ? [{ name: "搶槓", han: 1 }] : [];
  }
  dJ1(_h: readonly Block[]): readonly Yaku[] {
    return this.cfg.finalWallWin ? [{ name: "海底摸月", han: 1 }] : [];
  }
  dK1(_h: readonly Block[]): readonly Yaku[] {
    return this.cfg.finalDiscardWin ? [{ name: "河底撈魚", han: 1 }] : [];
  }
  dX1(h: readonly Block[]): readonly Yaku[] {
    const allTiles = h.flatMap((b) => b.tiles);
    const dcount = allTiles.reduce(
      (count, t) => count + this.cfg.doras.filter((d) => t.equals(d)).length,
      0,
    );
    const bcount = allTiles.reduce(
      (count, t) =>
        count + this.cfg.hiddenDoras.filter((d) => t.equals(d)).length,
      0,
    );
    const rcount = allTiles.filter((t) => t.has(OP.RED)).length;

    const ret: Yaku[] = [];
    if (dcount > 0) ret.push({ name: "ドラ", han: dcount });
    if (rcount > 0) ret.push({ name: "赤ドラ", han: rcount });
    if (this.hand.reached && bcount > 0)
      ret.push({ name: "裏ドラ", han: bcount });
    return ret;
  }

  dA2(h: readonly Block[]): readonly Yaku[] {
    return h.length == 7 ? [{ name: "七対子", han: 2 }] : [];
  }
  dB2(h: readonly Block[]): readonly Yaku[] {
    for (const block of h) {
      if (!block.isSequence()) continue;
      if (block.tiles[0].t == TYPE.Z) continue;
      const tile = minTile(block);
      const excludedTypes = [TYPE.M, TYPE.P, TYPE.S].filter((v) => v != tile.t);
      const cond1 = h.some((b) => {
        const newTile = new Tile(excludedTypes[0], tile.n);
        return b.isSequence() && newTile.equals(minTile(b));
      });
      const cond2 = h.some((b) => {
        const newTile = new Tile(excludedTypes[1], tile.n);
        return b.isSequence() && newTile.equals(minTile(b));
      });
      if (cond1 && cond2)
        return [{ name: "三色同順", han: 2 - this.getCalledPenalty() }];
    }
    return [];
  }
  dC2(h: readonly Block[]): readonly Yaku[] {
    if (h.length == 7) return [];
    const cond = h.every((b) => b.isTriplet() || b.is(BLOCK.PAIR));
    return cond ? [{ name: "対々和", han: 2 }] : [];
  }
  dD2(h: readonly Block[]): readonly Yaku[] {
    const l = h.filter((b) => b.isConcealedTriplet()).length;
    return l >= 3 ? [{ name: "三暗刻", han: 2 }] : [];
  }
  dE2(h: readonly Block[]): readonly Yaku[] {
    const l = h.filter((b) => b.isQuad()).length;
    return l >= 3 ? [{ name: "三槓子", han: 2 }] : [];
  }
  dF2(h: readonly Block[]): readonly Yaku[] {
    for (const block of h) {
      if (!block.isTriplet()) continue;
      const tile = minTile(block);
      if (tile.t == TYPE.Z) continue;
      const excludedTypes = [TYPE.M, TYPE.P, TYPE.S].filter((v) => v != tile.t);
      const cond1 = h.some((b) => {
        const newTile = new Tile(excludedTypes[0], tile.n);
        return b.isTriplet() && newTile.equals(minTile(b));
      });
      const cond2 = h.some((b) => {
        const newTile = new Tile(excludedTypes[1], tile.n);
        return b.isTriplet() && newTile.equals(minTile(b));
      });
      if (cond1 && cond2) return [{ name: "三色同刻", han: 2 }];
    }
    return [];
  }
  dG2(h: readonly Block[]): readonly Yaku[] {
    if (h.length == 7) return [];
    const l = h.filter((b) => {
      const t = b.tiles[0];
      return t.t == TYPE.Z && [5, 6, 7].includes(t.n);
    }).length;
    return l == 3 ? [{ name: "小三元", han: 2 }] : [];
  }
  dH2(h: readonly Block[]): readonly Yaku[] {
    const cond = h.every((b) => {
      const s = b.tiles[0];
      const values = s.t == TYPE.Z ? NZ : N19;
      return (b.isTriplet() || b.is(BLOCK.PAIR)) && values.includes(s.n);
    });
    return cond ? [{ name: "混老頭", han: 2 }] : [];
  }
  dI2(h: readonly Block[]): readonly Yaku[] {
    if (h.length == 7) return [];
    // 一つは順子がある。なければ、老頭に該当するため
    if (!h.some((b) => b.isSequence())) return [];
    if (!h.some((b) => b.tiles[0].t == TYPE.Z)) return [];

    const cond = h.every((block) => {
      const values = block.tiles[0].t == TYPE.Z ? NZ : N19;
      return block.tiles.some((t) => values.includes(t.n));
    });
    return cond
      ? [{ name: "混全帯么九", han: 2 - this.getCalledPenalty() }]
      : [];
  }
  dJ2(h: readonly Block[]): readonly Yaku[] {
    const m = {
      // 123m, 456m, 789m
      [TYPE.M]: [0, 0, 0],
      [TYPE.S]: [0, 0, 0],
      [TYPE.P]: [0, 0, 0],
    };

    for (const block of h) {
      const tile = minTile(block);
      if (tile.t == TYPE.BACK) continue;
      if (tile.t == TYPE.Z) continue;
      if (!block.isSequence()) continue;
      if (tile.n == 1) m[tile.t][0]++;
      else if (tile.n == 4) m[tile.t][1]++;
      else if (tile.n == 7) m[tile.t][2]++;
    }

    for (const arr of Object.values(m)) {
      if (arr[0] > 0 && arr[1] > 0 && arr[2] > 0)
        return [{ name: "一気通貫", han: 2 - this.getCalledPenalty() }];
    }
    return [];
  }

  dA3(h: readonly Block[]): readonly Yaku[] {
    const cond = !h.some((block) => block.tiles[0].t == TYPE.Z);
    if (cond) return [];
    for (const t of Object.values(TYPE)) {
      const ok = h.every((b) => b.tiles[0].t == TYPE.Z || b.tiles[0].t == t);
      if (ok) return [{ name: "混一色", han: 3 - this.getCalledPenalty() }];
    }
    return [];
  }
  dB3(h: readonly Block[]): readonly Yaku[] {
    if (h.length == 7) return [];
    if (!h.some((b) => b.isSequence())) return [];
    if (h.some((b) => b.tiles[0].t == TYPE.Z)) return [];

    const cond = h.every((b) => {
      return b.tiles.some((t) => N19.includes(t.n));
    });
    return cond
      ? [{ name: "純全帯么九", han: 3 - this.getCalledPenalty() }]
      : [];
  }
  dC3(h: readonly Block[]): readonly Yaku[] {
    if (this.getCalledPenalty() != 0) return [];

    const count = countSameBlocks(h);
    return count == 2 ? [{ name: "二盃口", han: 3 }] : [];
  }
  dA6(h: readonly Block[]): readonly Yaku[] {
    if (h.some((block) => block.tiles[0].t == TYPE.Z)) return [];
    for (const t of Object.values(TYPE)) {
      if (t == TYPE.Z) continue;
      const ok = h.every((v) => v.tiles[0].t == t);
      if (ok) return [{ name: "清一色", han: 6 - this.getCalledPenalty() }];
    }
    return [];
  }

  dA13(h: readonly Block[]): readonly Yaku[] {
    if (h.length != 13) return [];
    const double = h.some(
      (b) =>
        b.is(BLOCK.PAIR) &&
        b.tiles.some((t) => t.has(OP.TSUMO) || t.has(OP.RON)),
    );
    return double && this.cfg.disableDoubleYakuman !== true
      ? [{ name: "国士無双13面待ち", han: 26, isYakuman: true }]
      : [{ name: "国士無双", han: 13, isYakuman: true }];
  }
  dB13(h: readonly Block[]): readonly Yaku[] {
    return h.length == 1
      ? [{ name: "九蓮宝燈", han: 13, isYakuman: true }]
      : [];
  }
  dC13(h: readonly Block[]): readonly Yaku[] {
    if (h.length == 7) return [];
    const cond1 = h.every((b) => b.isConcealedTriplet() || b.is(BLOCK.PAIR));
    if (!cond1) return [];
    const cond2 = h.some(
      (b) =>
        b.is(BLOCK.PAIR) &&
        b.tiles.some((t) => t.has(OP.TSUMO) || t.has(OP.RON)),
    );
    return cond2 && this.cfg.disableDoubleYakuman !== true
      ? [{ name: "四暗刻単騎待ち", han: 26, isYakuman: true }]
      : [{ name: "四暗刻", han: 13, isYakuman: true }];
  }
  dD13(h: readonly Block[]): readonly Yaku[] {
    if (h.length == 13) return [];
    const z = [5, 6, 7];
    const cond =
      h.filter(
        (b) =>
          !b.is(BLOCK.PAIR) &&
          b.tiles.some((t) => t.t == TYPE.Z && z.includes(t.n)),
      ).length == 3;
    return cond ? [{ name: "大三元", han: 13, isYakuman: true }] : [];
  }
  dE13(h: readonly Block[]): readonly Yaku[] {
    const cond = h.every((b) => b.tiles[0].t == TYPE.Z);
    return cond ? [{ name: "字一色", han: 13, isYakuman: true }] : [];
  }
  dF13(h: readonly Block[]): readonly Yaku[] {
    const cond = h.every(
      (b) => (b.isTriplet() || b.is(BLOCK.PAIR)) && N19.includes(b.tiles[0].n),
    );
    return cond ? [{ name: "清老頭", han: 13, isYakuman: true }] : [];
  }
  dG13(h: readonly Block[]): readonly Yaku[] {
    if (h.length == 7) return [];
    const cond = h.every((b) => b.isQuad() || b.is(BLOCK.PAIR));
    return cond ? [{ name: "四槓子", han: 13, isYakuman: true }] : [];
  }
  dH13(h: readonly Block[]): readonly Yaku[] {
    if (h.length == 13) return [];
    if (h.length == 7) return [];
    const zn = [1, 2, 3, 4];
    const cond1 =
      h.filter((b) => {
        const s = b.tiles[0];
        return s.t == TYPE.Z && zn.includes(s.n);
      }).length == 4;
    if (!cond1) return [];
    const cond2 = h
      .find((b) => b.is(BLOCK.PAIR))!
      .tiles.some((t) => t.t == TYPE.Z && zn.includes(t.n));
    return cond2
      ? [{ name: "小四喜", han: 13, isYakuman: true }]
      : [{ name: "大四喜", han: 13, isYakuman: true }];
  }
  dI13(h: readonly Block[]): readonly Yaku[] {
    const check = (t: Tile) => {
      if (t.equals(new Tile(TYPE.Z, 6))) return true;
      if (t.t == TYPE.S && [2, 3, 4, 6, 8].includes(t.n)) return true;
      return false;
    };
    return h.every((b) => b.tiles.every((t) => check(t)))
      ? [{ name: "緑一色", han: 13, isYakuman: true }]
      : [];
  }
  // TODO 天和・地和
  dJ13(_h: readonly Block[]): readonly Yaku[] {
    return [];
  }
  dK13(_h: readonly Block[]): readonly Yaku[] {
    return [];
  }

  /**
   * 手牌の構成から符を計算する
   */
  calcFu(h: readonly Block[]) {
    return calcFu(h, {
      myWind: this.cfg.myWind,
      roundWind: this.cfg.roundWind,
      isCalled: this.getCalledPenalty() == 1,
    });
  }
}

function getWinningTileBlockType(hand: readonly Block[]) {
  const op = hand.some((b) => b.tiles.some((t) => t.has(OP.RON)))
    ? OP.RON
    : OP.TSUMO;
  const lastBlocks = hand.filter((b) => {
    return b.tiles.some((tb) => tb.has(op));
  });
  assert(
    lastBlocks.length == 1,
    `last block must be 1: ${lastBlocks}, ${hand.join("")}, isTusmo: ${op}`,
  );
  const lastBlock = lastBlocks[0];
  if (lastBlock.is(BLOCK.RUN)) {
    const idx = lastBlock.tiles.findIndex((t) => t.has(op));
    if (idx == 1) return WINNING_TILE_BLOCK_TYPE.KANCHAN;
    // 12v3p / v789p
    const isPenchan =
      (idx == 2 && lastBlock.tiles[0].n == 1) ||
      (idx == 0 && lastBlock.tiles[2].n == 9);
    if (isPenchan) return WINNING_TILE_BLOCK_TYPE.PENCHAN;
    return WINNING_TILE_BLOCK_TYPE.RYANMEN;
  } else if (lastBlock.is(BLOCK.PAIR)) return WINNING_TILE_BLOCK_TYPE.TANKI;
  else if (lastBlock.is(BLOCK.THREE)) return WINNING_TILE_BLOCK_TYPE.SHANPON;
  // 国士無双
  // TODO 13面待ちの場合は、thriteen にしても良いかも
  if (lastBlock.is(BLOCK.ISOLATED)) return WINNING_TILE_BLOCK_TYPE.TANKI;
  else
    throw new Error(
      `unexpected agari type ${lastBlock}, ${hand.join("").toString()}`,
    );
}
