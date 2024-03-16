import { Controller, createEventPipe, Player } from "../controller";

export const createLocalGame = (params?: {
  playerIDs?: string[];
  debug?: boolean;
}) => {
  const [ce1, pe1] = createEventPipe();
  const [ce2, pe2] = createEventPipe();
  const [ce3, pe3] = createEventPipe();
  const [ce4, pe4] = createEventPipe();

  const playerIDs = params?.playerIDs ?? [
    "player-1",
    "player-2",
    "player-3",
    "player-4",
  ];
  new Player(playerIDs[0], pe1);
  new Player(playerIDs[1], pe2);
  new Player(playerIDs[2], pe3);
  new Player(playerIDs[3], pe4);
  const players = [
    { handler: ce1, id: playerIDs[0] },
    { handler: ce2, id: playerIDs[1] },
    { handler: ce3, id: playerIDs[2] },
    { handler: ce4, id: playerIDs[3] },
  ];

  return new Controller(players, { debug: params?.debug });
};
