import {
  BLOCK,
  OP,
  Wind,
  WIND,
  createWindMap,
  roundWind,
  Tile,
  Block,
} from "../core";
import { assert } from "../assert";
import { Hand } from "./hand";
import { calcFu } from "./fu";
import {
  HAN_SCORING_TABLE,
  SCORING,
  getPointDescription,
  myCeil,
  ronPoints,
  tsumoPoints,
} from "./score";
import { toDora } from "./tile";
import { YakuContext, detectDora, detectYaku, detectYakuman } from "./yaku";
import {
  BoardContext,
  WINNING_TILE_BLOCK_TYPE,
  WinResult,
  WinningHand,
  Yaku,
} from "./types";

export class PointCalculator {
  private readonly hand: Hand;
  /**
   * BoardContext を計算しやすい形に正規化したもの。実装都合の表現なので外へ出さない。
   * 利用者へ返すのは元の BoardContext（`orig`）の方で、WinResult.boardContext がそれになる。
   */
  private readonly cfg: {
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
    this.assertWinByMatchesHand(scoreInfo.isTsumo);

    // 手牌のあがり点と供託・積み棒を別々に出して足す。
    // 一つの表を書き換えていくと、どの時点で読んだ値かで意味が変わってしまう。
    const winDeltas = this.calculateDeltas(
      scoreInfo.baseScore,
      scoreInfo.isParent,
      scoreInfo.myWind,
    );
    const stickDeltas = this.stickDeltas(scoreInfo.myWind);
    const deltas = createWindMap(() => 0);
    for (const w of Object.values(WIND)) deltas[w] = winDeltas[w] + stickDeltas[w];

    const description = getPointDescription({
      baseScore: scoreInfo.baseScore,
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
      pointsWithoutSticks: winDeltas[scoreInfo.myWind],
      boardContext: this.cfg.orig,
      description,
    };
  }

  /** あがり方の指定が、手牌のあがり牌に付いた印と食い違っていないか確かめる。 */
  private assertWinByMatchesHand(isTsumo: boolean) {
    const declared = this.winBy.type;
    const actual = isTsumo ? "tsumo" : "ron";
    assert(
      declared === actual,
      `win type mismatch: boardContext says ${declared} but the winning tile is marked as ${actual}`,
    );
  }

  private get winBy() {
    return this.cfg.orig.winBy;
  }

  /**
   * 現在の手牌の構成の配列の中から、あがりになる構成の配列を返す。
   */
  getWinningHands(hands: readonly (readonly Block[])[]) {
    const ret: WinningHand[] = [];
    if (hands.length == 0) return ret;
    const ctx = this.yakuContext();
    for (const hand of hands) {
      const v = detectYakuman(hand, ctx);
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
      const v = detectYaku(hand, ctx);
      if (v.length == 0) continue;
      // doras are evaluated when other yaku exists
      v.push(...detectDora(hand, ctx));
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

    let baseScore = this.baseScoreOf(han, fu);
    let isCountableYakuman = false;

    // 数え役満処理
    if (han >= 13 && han < 26 && !this.hasYakuman(bestHand.yakus)) {
      baseScore = this.cfg.disableCountableYakuman
        ? SCORING.TRIPLE
        : SCORING.YAKUMAN;
      isCountableYakuman = !this.cfg.disableCountableYakuman;
    }

    // 切り上げ満貫
    if (this.cfg.enableRoundUpMangan && this.isRoundUpMangan(fu, han)) {
      baseScore = SCORING.MANGAN;
    }

    const isTsumo = this.isTsumoWin(bestHand.hand);
    const myWind = this.cfg.orig.myWind;
    const isParent = myWind === WIND.E;

    return {
      baseScore,
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
   * 手牌のあがり点による点数移動を Wind ごとに返す。供託・積み棒は含まない。
   */
  private calculateDeltas(baseScore: number, isParent: boolean, myWind: Wind) {
    const deltas = createWindMap(() => 0);
    const winBy = this.winBy;

    if (winBy.type === "ron") {
      this.calculateRonDeltas(deltas, baseScore, isParent, myWind, winBy.from);
    } else {
      this.calculateTsumoDeltas(deltas, baseScore, isParent, myWind);
    }

    return deltas;
  }

  private calculateRonDeltas(
    deltas: { [key in Wind]: number },
    baseScore: number,
    isParent: boolean,
    myWind: Wind,
    ronWind: Wind,
  ) {
    const points = ronPoints(baseScore, isParent);

    deltas[myWind] += points;
    deltas[ronWind] -= points;
  }

  private calculateTsumoDeltas(
    deltas: { [w in Wind]: number },
    baseScore: number,
    isParent: boolean,
    myWind: Wind,
  ) {
    const { fromParent, fromChild } = tsumoPoints(baseScore, isParent);

    if (isParent) {
      deltas[WIND.E] += fromChild * 3;
      deltas[WIND.S] -= fromChild;
      deltas[WIND.W] -= fromChild;
      deltas[WIND.N] -= fromChild;
      return;
    }
    for (const key of Object.values(WIND)) {
      if (key == myWind) continue;
      const payment = key == WIND.E ? fromParent : fromChild;
      deltas[key] -= payment;
      deltas[myWind] += payment;
    }
  }

  /**
   * 供託（立直棒）と積み棒による点数移動を Wind ごとに返す。
   * 立直棒はあがった人がまとめて取り、積み棒はロンなら放銃者、ツモなら他家 3 人が払う。
   */
  private stickDeltas(myWind: Wind) {
    const deltas = createWindMap(() => 0);
    deltas[myWind] += SCORING.REACH_STICK * this.cfg.sticks.reach;

    const deadPoint = SCORING.DEAD_STICK * this.cfg.sticks.dead;
    const winBy = this.winBy;
    if (winBy.type === "ron") {
      deltas[myWind] += deadPoint;
      deltas[winBy.from] -= deadPoint;
      return deltas;
    }
    for (const key of Object.values(WIND)) {
      if (key == myWind) deltas[key] += deadPoint;
      else deltas[key] -= deadPoint / 3;
    }
    return deltas;
  }

  /**
   * 翻数と符から基礎点を返す。ロン・ツモの係数を掛ける前の値。
   */
  private baseScoreOf(han: number, fu: number): number {
    for (const { minHan, baseScore } of HAN_SCORING_TABLE) {
      if (han >= minHan) return baseScore;
    }
    // 40符以上の4飜は満貫の2000にする。
    return Math.min(fu * 2 ** (han + 2), SCORING.MANGAN);
  }

  private getCalledPenalty() {
    return this.hand.menzen ? 0 : 1;
  }

  /**
   * 役の判定に必要な情報を組み立てる。
   */
  private yakuContext(): YakuContext {
    return {
      isCalled: this.getCalledPenalty() == 1,
      reached: this.cfg.reached,
      isHandReached: this.hand.reached,
      myWind: this.cfg.myWind,
      roundWind: this.cfg.roundWind,
      doras: this.cfg.doras,
      hiddenDoras: this.cfg.hiddenDoras,
      oneShotWin: this.cfg.oneShotWin,
      replacementWin: this.cfg.replacementWin,
      quadWin: this.cfg.quadWin,
      finalWallWin: this.cfg.finalWallWin,
      finalDiscardWin: this.cfg.finalDiscardWin,
      disableDoubleYakuman: this.cfg.disableDoubleYakuman,
      calcFu: (h) => this.calcFu(h),
    };
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
  }
  if (lastBlock.is(BLOCK.PAIR)) return WINNING_TILE_BLOCK_TYPE.TANKI;
  if (lastBlock.is(BLOCK.THREE)) return WINNING_TILE_BLOCK_TYPE.SHANPON;
  // 国士無双。13 面待ちも含め、あがり牌はブロック 1 つを単独で埋める。
  if (lastBlock.is(BLOCK.ISOLATED)) return WINNING_TILE_BLOCK_TYPE.TANKI;
  // 九蓮宝燈。手牌 14 枚が 1 ブロックのまま（分解しない）なので、待ちの形を取り出せない。
  if (lastBlock.is(BLOCK.HAND)) return WINNING_TILE_BLOCK_TYPE.NINE_GATES;
  throw new Error(
    `unexpected agari type ${lastBlock}, ${hand.join("").toString()}`,
  );
}
