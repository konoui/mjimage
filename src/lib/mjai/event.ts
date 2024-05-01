// see https://github.com/smly/mjai.app
// https://mjai.app/docs/mjai-protocol

import { DoubleCalculator } from "../calculator";
import { KIND, OPERATOR, Round, Wind } from "../constants";
import { BlockAnKan, BlockChi, BlockDaiKan, BlockPon, Tile } from "../parser";
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
  CallEvent,
  RonEvent,
  incrementalIDGenerator,
  Player,
  createEventPipe,
  EventHandler,
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
  | AnkanEvent
  | DaiminkanEvent
  | KakanEvent
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
  type: "chi";
  actor: IDs;
  target: IDs;
  pai: string;
  consumed: string[];
}

interface AnkanEvent {
  type: "ankan";
  actor: IDs;
  target: IDs;
  pai: string;
  consumed: string[];
}

interface DaiminkanEvent {
  type: "daiminkan";
  actor: IDs;
  target: IDs;
  pai: string;
  consumed: string[];
}

interface KakanEvent {
  type: "kakan";
  actor: IDs;
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

export class MJAIPlayer {
  genID = incrementalIDGenerator();
  reachEventRecorder: { [actor: string]: boolean } = {};
  from: EventHandler;
  to: EventHandler;
  player: Player;
  constructor() {
    const [ce, pe] = createEventPipe();
    this.from = ce;
    this.to = pe;
    this.player = new Player("-1", this.to); // initial id
    this.from.on((e) => {
      // TODO convert and response to bot
    });
  }
  react(e: string) {
    const events = JSON.parse(e) as MJAIEvent[];
    events.forEach((e) => {
      this.handle(e);
    });
  }
  handle(e: MJAIEvent) {
    switch (e.type) {
      case "start_game": {
        this.player.id = e.id.toString(); // set valid id
        break;
      }
      case "reach": {
        this.reachEventRecorder[e.actor] = true;
        break;
      }
      case "end_game":
        break;
      default:
        const pe = this.toPlayerEvent(
          this.player.myWind,
          this.player.placeManager,
          e
        );
        this.from.emit(pe);
    }
  }
  toPlayerEvent = (myWind: Wind, pm: PlaceManager, e: MJAIEvent) => {
    const kyoku = toKyoku(pm.round);
    switch (e.type) {
      case "start_kyoku": {
        const pe: DistributeEvent = {
          id: this.genID(),
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
          id: this.genID(),
          type: "DRAW",
          iam: toPlayerWind(e.actor, kyoku),
          wind: myWind,
          tile: toTile(e.pai),
        };
        return pe;
      }
      case "dahai": {
        // when after reached, two events must be created.
        // one is reach event, another is discard event.
        if (this.reachEventRecorder[e.actor]) {
          this.reachEventRecorder[e.actor] = false;
          const pe: PlayerReachEvent = {
            id: this.genID(),
            type: "REACH",
            wind: myWind,
            iam: toPlayerWind(e.actor, kyoku),
            tile: toTile(e.pai),
          };
          return pe;
        }
        const pe: DiscardEvent = {
          id: this.genID(),
          type: "DISCARD",
          iam: toPlayerWind(e.actor, kyoku),
          wind: myWind,
          tile: toTile(e.pai),
        };
        return pe;
      }
      case "dora": {
        const pe: NewDoraEvent = {
          id: this.genID(),
          type: "NEW_DORA",
          doraMarker: toTile(e.dora_marker),
          wind: myWind,
        };
        return pe;
      }
      case "ankan": {
        const tiles = [toTile(e.pai), ...toTiles(e.consumed)];
        const pe: CallEvent = {
          id: this.genID(),
          type: "AN_KAN",
          wind: myWind,
          iam: toPlayerWind(e.actor, kyoku),
          block: new BlockAnKan(tiles),
        };
        return pe;
      }
      case "chi": {
        const block = new BlockChi([
          toTile(e.pai).add(OPERATOR.HORIZONTAL),
          toTile(e.consumed[0]),
          toTile(e.consumed[1]),
        ]);
        const pe: CallEvent = {
          id: this.genID(),
          type: "CHI",
          wind: myWind,
          iam: toPlayerWind(e.actor, kyoku),
          block: block,
        };
        return pe;
      }
      case "pon": {
        let idx = Math.abs(e.actor - e.target);
        if (idx == 3) idx = 0;
        if (idx == 2) idx = 1;
        if (idx == 1) idx = 2;
        const block = new BlockPon([
          toTile(e.pai).add(OPERATOR.HORIZONTAL),
          toTile(e.consumed[0]),
          toTile(e.consumed[1]),
        ]);
        [block.tiles[0], block.tiles[idx]] = [block.tiles[idx], block.tiles[0]];
        const pe: CallEvent = {
          id: this.genID(),
          type: "CHI",
          wind: myWind,
          iam: toPlayerWind(e.actor, kyoku),
          block: block,
        };
        return pe;
      }
      case "daiminkan": {
        let idx = Math.abs(e.actor - e.target);
        if (idx == 3) idx = 0;
        if (idx == 2) idx = 1;
        if (idx == 1) idx = 2;
        const block = new BlockDaiKan([
          toTile(e.pai).add(OPERATOR.HORIZONTAL),
          toTile(e.consumed[0]),
          toTile(e.consumed[1]),
          toTile(e.consumed[2]),
        ]);
        [block.tiles[0], block.tiles[idx]] = [block.tiles[idx], block.tiles[0]];
        const pe: CallEvent = {
          id: this.genID(),
          type: "CHI",
          wind: myWind,
          iam: toPlayerWind(e.actor, kyoku),
          block: block,
        };
        return pe;
      }
      case "kakan": {
        // FIXME
        const block = new BlockAnKan([
          toTile(e.pai).add(OPERATOR.HORIZONTAL),
          toTile(e.consumed[0]).add(OPERATOR.HORIZONTAL),
          toTile(e.consumed[1]),
          toTile(e.consumed[2]),
        ]);
        const pe: CallEvent = {
          id: this.genID(),
          type: "CHI",
          wind: myWind,
          iam: toPlayerWind(e.actor, kyoku),
          block: block,
        };
        return pe;
      }
      case "hora": {
        if (e.actor != e.target) {
          const pe: RonEvent = {
            id: this.genID(),
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
          return pe;
        } else {
          const pe: PlayerTsumoEvent = {
            id: this.genID(),
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
          return pe;
        }
      }
      default:
        throw new Error(`unexpected MJAI event ${e}`);
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
