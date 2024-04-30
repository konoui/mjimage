// see https://github.com/smly/mjai.app
// https://mjai.app/docs/mjai-protocol

import { DoubleCalculator } from "../calculator";
import { KIND, Round, Wind } from "../constants";
import { Tile } from "../parser";
import {
  PlaceManager,
  NewDoraEvent,
  PlayerEvent,
  DistributeEvent,
  createWindMap,
  DrawEvent,
  DiscardEvent,
  ReachEvent as PlayerReachEvent,
  TsumoEvent as PlayerTsumoEvent,
  RonEvent,
} from "./../controller";
import { Hand, WinResult } from "../calculator";

type IDs = 0 | 1 | 2 | 3;

type Bakaze = "E" | "S" | "W" | "N";

const M = ["5mr", "1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m"];
const S = ["5sr", "1s", "2s", "3s", "4s", "5s", "6s", "7s", "8s", "9s"];
const P = ["5pr", "1p", "2p", "3p", "4p", "5p", "6p", "7p", "8p", "9p"];
const Z = ["ERROR-WIND", "E", "S", "W", "N", "P", "F", "C"];
const UNSCREEN = "?";

export type MJAIEvent =
  | NoneEvent
  | StartGameEvent
  | StartKyokuEvent
  | TsumoEvent
  | DahaiEvent
  | PonEvent
  | ChiEvent
  | AnKanEvent
  | DaiKanEvent
  | ShoKanEvent
  | DoraEvent
  | ReachEvent
  | ReachAcceptedEvent
  | HoraEvent
  | RyukyokuEvent
  | EndKyokuEvent
  | EndGameEvent;

interface NoneEvent {
  type: "none";
}

interface StartGameEvent {
  type: "start_game";
  id: IDs;
}

interface StartKyokuEvent {
  type: "start_kyoku";
  bakaze: Bakaze;
  dora_marker: string;
  kyoku: number;
  honba: number;
  kyotaku: number;
  oya: IDs;
  scores: number[];
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
  pai: string;
  uradora_markers: string[];
  hora_tehais: string[];
  yakus: [string, number][];
  fu: number;
  fan: number;
  hora_points: number;
  deltas: number[];
  scores: number[];
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

const toMJAIEvent = (pm: PlaceManager, e: PlayerEvent) => {};

class EventBackwarder {
  reachUserMap: { [actor: string]: boolean } = {};
  toMyEvent = (myWind: Wind, pm: PlaceManager, e: MJAIEvent) => {
    const kyoku = toKyoku(pm.round);
    switch (e.type) {
      case "start_game":
        {
        }
        break;
      case "start_kyoku": {
        const pe: DistributeEvent = {
          id: "0",
          type: "DISTRIBUTE",
          hands: toHands(e.tehais, e.kyoku),
          wind: myWind,
          doraMarker: toTile(e.dora_marker),
          sticks: { reach: e.kyotaku, dead: e.honba },
          scores: toScores(e.scores),
          round: toRound(e.bakaze, e.kyotaku),
          places: toPlaces(e.kyoku),
          players: ["0", "1", "2", "3"],
        };
        return pe;
      }
      case "tsumo": {
        const pe: DrawEvent = {
          id: "0", // FIXME
          type: "DRAW",
          iam: toPlayerWind(e.actor, kyoku),
          wind: myWind,
          tile: toTile(e.pai),
        };
        break;
      }
      case "dahai": {
        // when after reached, two events must be created.
        // one is reach event, another is discard event.
        if (this.reachUserMap[e.actor]) {
          this.reachUserMap[e.actor] = false;
          const pe: PlayerReachEvent = {
            id: "0", // FIXME
            type: "REACH",
            wind: myWind,
            iam: toPlayerWind(e.actor, kyoku),
            tile: toTile(e.pai),
          };
        }
        const pe: DiscardEvent = {
          id: "0", // FIXME
          type: "DISCARD",
          iam: toPlayerWind(e.actor, kyoku),
          wind: myWind,
          tile: toTile(e.pai),
        };
        break;
      }
      case "reach": {
        this.reachUserMap[e.actor] = true;
        break;
      }
      case "dora": {
        const pe: NewDoraEvent = {
          id: "0", // FIXME
          type: "NEW_DORA",
          doraMarker: toTile(e.dora_marker),
          wind: myWind,
        };
        break;
      }
      case "hora": {
        if (e.actor != e.target) {
          const pe: RonEvent = {
            id: "0", // FIXME
            wind: myWind,
            type: "RON",
            iam: toPlayerWind(e.actor, kyoku),
            targetInfo: {
              wind: toPlayerWind(e.target, kyoku),
              tile: toTile(e.pai),
            },
            pushBackReachStick: false, // FIXME
            ret: toWinResult(
              e.hora_tehais,
              e.fan,
              e.fu,
              e.yakus,
              e.hora_points,
              e.deltas,
              toKyoku(pm.round)
            ),
          };
        } else {
          const pe: PlayerTsumoEvent = {
            id: "0", // FIXME
            wind: myWind,
            type: "TSUMO",
            iam: toPlayerWind(e.actor, kyoku),
            lastTile: toTile(e.pai),
            ret: toWinResult(
              e.hora_tehais,
              e.fan,
              e.fu,
              e.yakus,
              e.hora_points,
              e.deltas,
              toKyoku(pm.round)
            ),
          };
        }
      }
    }
  };
}

const toWinResult = (
  tehais: string[],
  fan: number,
  fu: number,
  yaku: [string, number][],
  hora_points: number,
  deltas: number[],
  kyoku: number
) => {
  const d = createWindMap(0);
  d[toPlayerWind(0, kyoku)] = deltas[0];
  d[toPlayerWind(1, kyoku)] = deltas[1];
  d[toPlayerWind(2, kyoku)] = deltas[2];
  d[toPlayerWind(3, kyoku)] = deltas[3];

  const points = yaku.map((v) => {
    return { double: v[1], name: v[0] };
  });
  const ret: WinResult = {
    deltas: d,
    fu: fu,
    sum: fan,
    points: points,
    point: hora_points,
    hand: [], // TODO empty
    params: {
      doraMarkers: [new Tile(KIND.BACK, 0)],
      round: "1w1",
      myWind: "1w",
    }, // TODO dummy
  };
  return ret;
};

const toPlaces = (kyoku: number) => {
  return {
    "0": toPlayerWind(0, kyoku),
    "1": toPlayerWind(1, kyoku),
    "2": toPlayerWind(2, kyoku),
    "3": toPlayerWind(3, kyoku),
  };
};

const toScores = (scores: number[]) => {
  return {
    "0": scores[0],
    "1": scores[1],
    "2": scores[2],
    "3": scores[3],
  };
};

const toHands = (tehais: string[][], kyoku: number) => {
  const hands = createWindMap("");
  for (let actor = 0; actor < tehais.length; actor++) {
    const w = toPlayerWind(actor, kyoku);
    const tehai = tehais[actor];
    hands[w] = toTiles(tehai).toString();
  }
  return hands;
};

const toPlayerWind = (actor: number, kyoku: number) => {
  const idx = Math.abs(actor + 1 - kyoku) + 1; // actor starts 0
  return toWind(Z[idx] as Bakaze);
};

const toRound = (b: Bakaze, kyoku: number) => {
  return `${toWind(b)}${kyoku}` as Round;
};

const toKyoku = (round: Round) => {
  return Number(round[2]);
};

const toWind = (b: Bakaze): Wind => {
  const idx = Z.findIndex((v) => v == b);
  return `${idx}w` as Wind;
};

const toBakaze = (b: Wind): Bakaze => {
  const idx = b[0];
  return Z[Number(idx)] as Bakaze;
};

const toTile = (hai: string) => {
  let idx = Z.findIndex((v) => v == hai);
  if (idx >= 0) return new Tile(KIND.Z, idx);

  idx = M.findIndex((v) => v == hai);
  if (idx >= 0) return new Tile(KIND.M, idx);

  idx = S.findIndex((v) => v == hai);
  if (idx >= 0) return new Tile(KIND.S, idx);

  idx = P.findIndex((v) => v == hai);
  if (idx >= 0) return new Tile(KIND.P, idx);

  return new Tile(KIND.BACK, 0);
};

const toTiles = (hais: string[]) => {
  const tiles: Tile[] = [];
  for (let hai of hais) tiles.push(toTile(hai));
  return tiles;
};

const toHais = (tiles: Tile[]) => {
  const hais: string[] = [];
  for (let tile of tiles) {
    const n = tile.n;
    const k = tile.k;
    if (k == KIND.Z) hais.push(Z[n]);
    if (k == KIND.M) hais.push(M[n]);
    if (k == KIND.S) hais.push(S[n]);
    if (k == KIND.P) hais.push(P[n]);
    if (k == KIND.BACK) hais.push(UNSCREEN);
  }
  return hais;
};
