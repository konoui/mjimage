import { Round, Wind } from "../core/";
import { PlayerEvent } from "./events";
import { PlaceManager, ScoreManager } from "./managers";
import { Wall, WallProps } from "./wall";
import type { Controller } from "./controller";

// 局を再開するための記録。局の途中の状態は持たず、
// 「その局を最初から同じようにやり直すのに要るもの」だけを持つ。

export interface RoundHistory {
  round: Round;
  scores: { [wind in string]: number };
  players: { [id in string]: Wind };
  sticks: { reach: number; dead: number };
  wall: WallProps;
  choiceEvents: { [id: string]: PlayerEvent[] };
}

/** 局を始める直前の状態を記録する。 */
export const snapshotRound = (c: Controller): RoundHistory => ({
  scores: c.scoreManager.summary,
  round: c.placeManager.round,
  players: c.placeManager.playerMap,
  wall: c.wall.export(),
  choiceEvents: c.mailBox,
  sticks: c.placeManager.sticks,
});

/** 記録した局を controller に載せ直す。 */
export const restoreRound = (c: Controller, h: RoundHistory) => {
  c.playerIDs = Object.keys(h.players);
  c.mailBox = h.choiceEvents;
  c.observer.placeManager = new PlaceManager(h.players, {
    round: h.round,
    sticks: h.sticks,
  });
  c.observer.scoreManager = new ScoreManager(h.scores);
  c.wall = new Wall(h.wall);
};
