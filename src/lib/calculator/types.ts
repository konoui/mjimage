import { Round, Wind } from "../core";
import { Tile, Block } from "../core/parser";

/**
 * あがり計算に必要な追加情報を表す。
 */
export interface BoardContext {
  doraIndicators: readonly Tile[];
  hiddenDoraIndicators?: readonly Tile[];
  round: Round;
  myWind: Wind;
  ronWind?: Wind;
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
  deltas: { readonly [w in Wind]: number };
  points: number;
  basePoints: number;
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
 * 多面待ちであってあがり形はどれかになる。
 */
export const WINNING_TILE_BLOCK_TYPE = {
  PENCHAN: "penchan",
  KANCHAN: "kanchan",
  RYANMEN: "ryanmen",
  SHANPON: "shanpon",
  TANKI: "tanki",
  //  THIRTEEN: "thirteen ",
} as const;
