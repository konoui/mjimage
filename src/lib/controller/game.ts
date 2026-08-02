import { Round } from "../core/";
import { Controller } from "./controller";
import { createEventPipe, EventHandler } from "./events";
import { Logger } from "./logger";
import { createSeededRand, Rand } from "./managers";
import { Player } from "./player";
import { IWall } from "./wall";

export const createLocalGame = (params?: {
  /** @deprecated `autoAdvance: false` を使うこと。 */
  debug?: boolean;
  /** false にすると `next()` で進まなくなる。テストで 1 手ずつ進めるときに使う。 */
  autoAdvance?: boolean;
  shuffle?: boolean;
  /** 席順と山を固定したいときに種を渡す。同じ種なら同じ対局になる。 */
  seed?: number;
  rand?: Rand;
  /** 局ごとに作られる山を差し替える。台本つきの山でテストするときに使う。 */
  newWall?: () => IWall;
  /** この局に達した時点で終局する。既定は西入り（＝東南戦）。 */
  endRound?: Round;
  /** 進行ログの出し先。既定は console。テストでは silentLogger を渡す。 */
  logger?: Logger;
  playerInjection?: {
    p1?: new (id: string, e: EventHandler) => Player;
    p2?: new (id: string, e: EventHandler) => Player;
    p3?: new (id: string, e: EventHandler) => Player;
    p4?: new (id: string, e: EventHandler) => Player;
  };
}) => {
  const [ce1, pe1] = createEventPipe();
  const [ce2, pe2] = createEventPipe();
  const [ce3, pe3] = createEventPipe();
  const [ce4, pe4] = createEventPipe();

  const playerIDs = ["player-1", "player-2", "player-3", "player-4"];

  const pi = params?.playerInjection;
  const newP1 = pi?.p1 ?? Player;
  const newP2 = pi?.p2 ?? Player;
  const newP3 = pi?.p3 ?? Player;
  const newP4 = pi?.p4 ?? Player;

  const p1 = new newP1(playerIDs[0], pe1);
  const p2 = new newP2(playerIDs[1], pe2);
  const p3 = new newP3(playerIDs[2], pe3);
  const p4 = new newP4(playerIDs[3], pe4);

  const players = [
    { handler: ce1, id: playerIDs[0] },
    { handler: ce2, id: playerIDs[1] },
    { handler: ce3, id: playerIDs[2] },
    { handler: ce4, id: playerIDs[3] },
  ];

  const rand =
    params?.rand ??
    (params?.seed != null ? createSeededRand(params.seed) : undefined);

  return {
    c: new Controller(players, {
      debug: params?.debug,
      autoAdvance: params?.autoAdvance,
      shuffle: params?.shuffle,
      rand: rand,
      newWall: params?.newWall,
      endRound: params?.endRound,
      logger: params?.logger,
    }),
    p1,
    p2,
    p3,
    p4,
  };
};
