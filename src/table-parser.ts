import { parse } from "yaml";
import { Pai, Parser, Block } from "./parser";

export interface TableInput {
  discards: {
    [K in tableWindow]: string;
  };
  hands: {
    [K in tableWindow]: string;
  };
  scores: {
    [K in tableWindow]: number;
  };
  board: {
    round: tableRound;
    sticks: {
      reach: number;
      dead: number;
    };
    doras: string[];
    front?: tableWindow;
  };
}

export interface Discards {
  front: Pai[];
  right: Pai[];
  opposite: Pai[];
  left: Pai[];
}

export interface Hands {
  front: Block[];
  right: Block[];
  opposite: Block[];
  left: Block[];
}

export interface ScoreBoard {
  doras: Pai[];
  round: boardRound;
  sticks: { reach: number; dead: number };
  scores: {
    front: number;
    right: number;
    opposite: number;
    left: number;
  };
  frontPlace: boardWindow;
}

const ROUND_MAP = {
  "1w1": "東１局",
  "1w2": "東２局",
  "1w3": "東３局",
  "1w4": "東４局",
  "2w1": "南１局",
  "2w2": "南２局",
  "2w3": "南３局",
  "2w4": "南４局",
} as const;

const WINDOW_MAP = {
  "1w": "東",
  "2w": "南",
  "3w": "西",
  "4w": "北",
} as const;

type tableWindow = keyof typeof WINDOW_MAP;
type tableRound = keyof typeof ROUND_MAP;
type boardRound = (typeof ROUND_MAP)[keyof typeof ROUND_MAP];
type boardWindow = (typeof WINDOW_MAP)[keyof typeof WINDOW_MAP];

export const parserTableInput = (s: string) => {
  const input = parse(s) as { table: TableInput };
  // TODO validate them
  return input.table;
};

export const convertInput = (i: TableInput): [Discards, Hands, ScoreBoard] => {
  console.log("table input", i);
  const frontPlace = i.board.front || "1w";
  const m = createPlaceMap(frontPlace);
  const discards: Discards = {
    front: new Parser(i.discards[m.front]).parseInput(),
    right: new Parser(i.discards[m.right]).parseInput(),
    opposite: new Parser(i.discards[m.opposite]).parseInput(),
    left: new Parser(i.discards[m.left]).parseInput(),
  };
  const hands: Hands = {
    front: new Parser(i.hands[m.front]).parse(),
    right: new Parser(i.hands[m.right]).parse(),
    opposite: new Parser(i.hands[m.opposite]).parse(),
    left: new Parser(i.hands[m.left]).parse(),
  };

  const scoreBoard: ScoreBoard = {
    round: ROUND_MAP[i.board.round],
    frontPlace: WINDOW_MAP[frontPlace],
    sticks: i.board.sticks,
    doras: i.board.doras.map((v) => {
      return new Parser(v).parseInput()[0];
    }),
    scores: {
      front: i.scores[m.front],
      right: i.scores[m.right],
      opposite: i.scores[m.opposite],
      left: i.scores[m.left],
    },
  };
  return [discards, hands, scoreBoard];
};

const createPlaceMap = (
  front: tableWindow
): {
  front: tableWindow;
  right: tableWindow;
  opposite: tableWindow;
  left: tableWindow;
} => {
  const f = (start: number, v: number): tableWindow => {
    let ret = `${v}w`;
    if (v > 4) ret = `${v - start}w`;
    return ret as tableWindow;
  };

  const start = Number(front[0]);
  const m = {
    front: front,
    right: f(start, start + 1),
    opposite: f(start, start + 2),
    left: f(start, start + 3),
  };
  return m;
};
