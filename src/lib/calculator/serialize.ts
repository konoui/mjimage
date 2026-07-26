import { Tile, Block, SerializedBlock } from "../core/parser";
import { BoardContext, WinResult } from "./types";

type SerializedBoardContext = Omit<
  BoardContext,
  "doraIndicators" | "hiddenDoraIndicators"
> & {
  doraIndicators: readonly string[];
  hiddenDoraIndicators?: readonly string[];
};

export type SerializedWinResult = Omit<WinResult, "hand" | "boardContext"> & {
  hand: readonly SerializedBlock[];
  boardContext: SerializedBoardContext;
};

export const deserializeWinResult = (ret: SerializedWinResult): WinResult => {
  const bc = ret.boardContext;
  return {
    ...ret,
    hand: ret.hand.map(Block.deserialize),
    boardContext: {
      ...bc,
      doraIndicators: bc.doraIndicators.map(Tile.from),
      hiddenDoraIndicators: bc.hiddenDoraIndicators?.map(Tile.from),
    },
  };
};

export const serializeWinResult = (ret: WinResult) => {
  const v = JSON.parse(JSON.stringify(ret)) as SerializedWinResult;
  return v;
};
