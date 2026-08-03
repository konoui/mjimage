import {
  SVG as newSvg,
  asRenderedSvg,
  asSvg,
  RenderedSvg,
} from "./lib/svgjs/svg";
import { optimizeSVG as optimize } from "./lib/image/image";

// 公開 API はここに列挙した名前だけ。barrel の再輸出（export *）は使わない。
// 内部実装まで semver で凍結されるため、公開したい面を明示的に選ぶ。

// 入力言語の語彙。牌・ブロック・風の定数と、その型。
export {
  INPUT_SEPARATOR,
  TYPE,
  OP,
  BLOCK,
  WIND,
  ROUND,
  WIND_MAP,
  ROUND_MAP,
  TILE_NUMBERS,
} from "./lib/core/constants";
export type { Type, Operator, Wind, Round } from "./lib/core/constants";

// 牌とブロック。入力のパースと、計算・描画の共通の受け渡し形式。
// core は「牌 → ブロック → パーサ」の順に積んである（依存もこの向き）。
export { Tile } from "./lib/core/tile";
export {
  Block,
  BlockChi,
  BlockPon,
  BlockAnKan,
  BlockDaiKan,
  BlockShoKan,
  BlockPair,
  BlockThree,
  BlockRun,
  BlockIsolated,
  BlockHand,
  BlockOther,
} from "./lib/core/block";
export type { SerializedBlock } from "./lib/core/block";
export { Parser } from "./lib/core/parser";

// 風・局の操作。
export {
  createWindMap,
  nextRound,
  roundWind,
  nextWind,
  prevWind,
} from "./lib/core/wind-util";
export type { WindMap } from "./lib/core/wind-util";

// 手牌と計算器。
export { Hand } from "./lib/calculator/hand";
export { ShantenCalculator } from "./lib/calculator/shanten";
export { BlockCalculator } from "./lib/calculator/block-calculator";
export { PointCalculator } from "./lib/calculator/point-calculator";
export { getPointDescription } from "./lib/calculator/score";
export { toDora } from "./lib/calculator/tile";
export { WINNING_TILE_BLOCK_TYPE } from "./lib/calculator/types";
export type {
  BoardContext,
  WinResult,
  Yaku,
} from "./lib/calculator/types";
export {
  serializeWinResult,
  deserializeWinResult,
} from "./lib/calculator/serialize";
export type { SerializedWinResult } from "./lib/calculator/serialize";
// 名前空間としてまとめて公開する。static だけのクラスと違い、
// この形なら利用者が使った関数だけが束にされる（tree-shaking が効く）。
export * as Efficiency from "./lib/calculator/efficiency";
export type {
  TileAnalysis,
  SerializedTileAnalysis,
} from "./lib/calculator/efficiency";

// 対局の進行。
export { Controller } from "./lib/controller/controller";
export { consoleLogger, silentLogger } from "./lib/controller/logger";
export type { Logger } from "./lib/controller/logger";
export type { PlayerSession } from "./lib/controller/controller";
export { ActorHand, BaseActor, Observer } from "./lib/controller/actor";
export type { RoundHistory } from "./lib/controller/history";
export { createLocalGame } from "./lib/controller/game";
export { Player } from "./lib/controller/player";
export { Replayer } from "./lib/controller/replay";
export { Wall } from "./lib/controller/wall";
export type { IWall, WallProps } from "./lib/controller/wall";
export { River } from "./lib/controller/river";
export type { IRiver } from "./lib/controller/river";
export { ScoreManager, PlaceManager, Counter } from "./lib/controller/managers";
export * as PlayerEfficiency from "./lib/controller/player-efficiency";
export * as RiskRank from "./lib/controller/risk-rank";
export type {
  PlayerTileAnalysis,
  PriorityContext,
} from "./lib/controller/player-efficiency";
export {
  createEventPipe,
  createEventEmitter,
} from "./lib/controller/events";
export type {
  PlayerEvent,
  EventHandler,
  EventHandlerFunc,
  DistributeEvent,
  DrawEvent,
  DiscardEvent,
  CallEvent,
  RonEvent,
  TsumoEvent,
  ReachEvent,
  ReachAcceptedEvent,
  NewDoraEvent,
  EndEvent,
  ChoiceAfterDrawnEvent,
  ChoiceAfterDiscardedEvent,
  ChoiceAfterCalled,
  ChoiceForReachAcceptance,
  ChoiceForChanKan,
} from "./lib/controller/events";

// 卓の入力言語。
export { parseTableInput } from "./lib/input/table-input";
export type {
  TableInput,
  Discards,
  Hands,
  ScoreBoard,
} from "./lib/input/table-input";
// 各家を並べた入れ物。Discards / Hands / ScoreBoard.scores がこの形を取る。
export type { Seats } from "./lib/input/seats";

// 描画。高抽象（render）と中抽象（createHand / createTable）だけを公開し、
// 牌 1 枚を組み立てるヘルパや SVG の要素クラスは内部に留める。
export { render, isTableInput } from "./lib/image/render";
export type { Rendered } from "./lib/image/render";
export { createHand } from "./lib/image/image";
export type { RenderOptions, SVGFragment } from "./lib/image/image";
export { createTable } from "./lib/image/table";

// 中抽象で組み立てた要素を置くための最小限の入れ物。
// 具象クラスは公開せず、操作を絞ったインターフェースだけを見せる。
export type { RenderedSvg, Placeable } from "./lib/svgjs/svg";

/** 断片を合成するための SVG を作る。 */
export const SVG = (): RenderedSvg => asRenderedSvg(newSvg());

/** スプライトの未使用 symbol を落とす。svgSprite で組み立てた場合に使う。 */
export const optimizeSVG = (svg: RenderedSvg): void => optimize(asSvg(svg));
