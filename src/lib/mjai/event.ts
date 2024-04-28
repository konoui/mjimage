// see https://github.com/smly/mjai.app
// https://mjai.app/docs/mjai-protocol

type IDs = 0 | 1 | 2 | 3;

type Wind = "E" | "S" | "W" | "N";

const M = ["5mr", "1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m"];
const S = ["5sr", "1s", "2s", "3s", "4s", "5s", "6s", "7s", "8s", "9s"];
const P = ["5pr", "1p", "2p", "3p", "4p", "5p", "6p", "7p", "8p", "9p"];
const W = ["ERROR-WIND", "E", "S", "W", "N", "P", "F", "C"];
const UNSCREEN = ["?"];

interface NoneEvent {
  type: "none";
}

interface StartGameEvent {
  type: "start_game";
  id: IDs;
}

interface StartKyokuEvent {
  type: "start_kyoku";
  bakaze: Wind;
  dora_marker: string;
  kyoku: number;
  honba: number;
  kyotaku: number;
  oya: IDs;
  scores: [];
  tehais: string[][];
}

interface TsumoEvent {
  type: "tsumo";
  actor: IDs;
  pai: string;
}

interface DahaiEvent {
  type: "dahai";
  actor: IDs;
  pai: string;
  tsumogiri: boolean;
}

interface PonEvent {
  type: "pon";
  actor: IDs;
  target: IDs;
  pai: string;
  consumed: string[];
}

interface ChiEvent {
  type: "pon";
  actor: IDs;
  target: IDs;
  pai: string;
  consumed: string[];
}

interface AnKanEvent {
  type: "ankan";
  actor: IDs;
  target: IDs;
  pai: string;
  consumed: string[];
}

interface DaiKanEvent {
  type: "daiminkan";
  actor: IDs;
  target: IDs;
  pai: string;
  consumed: string[];
}

interface ShoKanEvent {
  type: "kakan";
  actor: IDs;
  target: IDs;
  pai: string;
  consumed: string[];
}

interface DoraEvent {
  type: "dora";
  dora_marker: string;
}

interface ReachEvent {
  type: "reach";
  actor: IDs;
}

interface ReachAcceptedEvent {
  type: "reach_accepted";
  actor: IDs;
}

interface HoraEvent {
  type: "hora";
  actor: IDs;
  target: IDs;
  pai?: string; // the tile exists, it means ron
}

interface RyukyokuEvent {
  type: "ryukyoku";
}

interface EndKyokuEvent {
  type: "end_kyoku";
}

interface EndGameEvent {
  type: "end_game";
}
