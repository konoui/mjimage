import { Round, Wind, Tile, Block } from "../core";

/**
 * あがり方。ロンの場合は放銃した家を持つ。
 *
 * どちらであがったかは手牌（あがり牌に付く t / v の印）にも現れるが、
 * そちらは「どの牌であがったか」を表すもので、点数の受け渡しには足りない
 * （ロンは放銃者が誰かで点数移動が変わる）。ここが唯一の指定になる。
 */
export type WinBy =
  | { readonly type: "tsumo" }
  | { readonly type: "ron"; readonly from: Wind };

/**
 * あがり計算に必要な追加情報を表す。
 */
export interface BoardContext {
  doraIndicators: readonly Tile[];
  hiddenDoraIndicators?: readonly Tile[];
  round: Round;
  myWind: Wind;
  /** あがり方。手牌のあがり牌に付く印と一致している必要がある。 */
  winBy: WinBy;
  sticks?: { readonly reach: number; readonly dead: number };
  doubleReached?: boolean;
  replacementWin?: boolean;
  quadWin?: boolean;
  finalWallWin?: boolean;
  finalDiscardWin?: boolean;
  oneShotWin?: boolean;
  enableRoundUpMangan?: boolean;
  disableCountableYakuman?: boolean;
  disableDoubleYakuman?: boolean;
}

/**
 * あがりを表す
 */
export interface WinResult extends WinningHand {
  /** 各家の点数移動。供託（立直棒）と積み棒を含む。 */
  deltas: { readonly [w in Wind]: number };
  /** あがった人が受け取る点数。供託と積み棒を含む（`deltas[myWind]` と同じ）。 */
  points: number;
  /** 供託と積み棒を含まない、手牌だけのあがり点。 */
  pointsWithoutSticks: number;
  boardContext: BoardContext;
  description: string;
}

/**
 * 役を表す
 */
export interface Yaku {
  name: string;
  han: number;
  isYakuman?: boolean;
}

/**
 * あがりの構成になる手牌の情報
 */
export interface WinningHand {
  hand: readonly Block[];
  fu: number;
  yakus: readonly Yaku[];
  han: number;
  isYakuman?: boolean;
  metadata: {
    winningTileBlockType: (typeof WINNING_TILE_BLOCK_TYPE)[keyof typeof WINNING_TILE_BLOCK_TYPE];
  };
}

/**
 * あがり形におけるあがり牌の形を表す。
 * 多面待ちであっても、あがり形はどれかひとつに決まる。
 *
 * 待ちの広さは表さない。あがり牌を含むブロックの形だけを見るため、
 * 国士無双は 13 面待ちでも TANKI になる。
 * 九蓮宝燈だけは手牌をブロックに分解しないので、専用の値を持つ。
 */
export const WINNING_TILE_BLOCK_TYPE = {
  PENCHAN: "penchan",
  KANCHAN: "kanchan",
  RYANMEN: "ryanmen",
  SHANPON: "shanpon",
  TANKI: "tanki",
  NINE_GATES: "nineGates",
} as const;
