import { parse } from "yaml";
import { Tile, Parser, Block } from "./parser";
import { WIND_MAP, ROUND_MAP } from "./constants";

export interface TableInput {
  discards: {
    [K in tableWind]: string;
  };
  hands: {
    [K in tableWind]: string;
  };
  scores: {
    [K in tableWind]: number;
  };
  board: {
    round: tableRound;
    sticks: {
      reach: number;
      dead: number;
    };
    doras: string[];
    front?: tableWind;
  };
}

export interface DiscardsInput {
  front: Tile[];
  right: Tile[];
  opposite: Tile[];
  left: Tile[];
}

export interface HandsInput {
  front: Block[];
  right: Block[];
  opposite: Block[];
  left: Block[];
}

export interface ScoreBoardInput {
  doras: Tile[];
  round: boardRound;
  sticks: { reach: number; dead: number };
  scores: {
    front: number;
    right: number;
    opposite: number;
    left: number;
  };
  frontPlace: boardWind;
}

type tableWind = keyof typeof WIND_MAP;
type tableRound = keyof typeof ROUND_MAP;
type boardRound = (typeof ROUND_MAP)[keyof typeof ROUND_MAP];
type boardWind = (typeof WIND_MAP)[keyof typeof WIND_MAP];

export const parserTableInput = (s: string) => {
  const input = parse(s) as { table: TableInput };
  // TODO validate them
  return input.table;
};

export const convertInput = (
  i: TableInput
): [DiscardsInput, HandsInput, ScoreBoardInput] => {
  console.log("table input", i);
  const frontPlace = i.board.front || "1w";
  const m = createPlaceMap(frontPlace);
  const f = (w: tableWind) => {
    return i.discards[w].replace(/\r?\n/g, "");
  };
  const discards: DiscardsInput = {
    front: new Parser(f(m.front)).parseInput(),
    right: new Parser(f(m.right)).parseInput(),
    opposite: new Parser(f(m.opposite)).parseInput(),
    left: new Parser(f(m.left)).parseInput(),
  };
  const hands: HandsInput = {
    front: new Parser(i.hands[m.front]).parse(),
    right: new Parser(i.hands[m.right]).parse(),
    opposite: new Parser(i.hands[m.opposite]).parse(),
    left: new Parser(i.hands[m.left]).parse(),
  };

  const scoreBoard: ScoreBoardInput = {
    round: ROUND_MAP[i.board.round],
    frontPlace: WIND_MAP[frontPlace],
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
  front: tableWind
): {
  front: tableWind;
  right: tableWind;
  opposite: tableWind;
  left: tableWind;
} => {
  const f = (start: number, v: number): tableWind => {
    let ret = `${v}w`;
    if (v > 4) ret = `${v - start}w`;
    return ret as tableWind;
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
