// controller の外向きの公開面。controller 内部のモジュール同士はここを経由しない。
// actions.ts / call-index.ts は controller の内部だけで使うので出さない。
export * from "./events";
export * from "./logger";
export * from "./managers";
export * from "./river";
export * from "./state-machine";
export * from "./wall";
export * from "./actor";
export * from "./history";
export * from "./controller";
export * from "./player";
export * from "./replay";
export * from "./game";
// 打牌の評価は名前空間として出す（素の関数名は controller の語彙として広すぎる）。
export * as PlayerEfficiency from "./player-efficiency";
export * as RiskRank from "./risk-rank";
export type {
  PlayerTileAnalysis,
  PriorityContext,
} from "./player-efficiency";
