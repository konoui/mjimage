import { parse } from "yaml";
import Ajv from "ajv";

import { Tile, Parser, Block } from "./parser";
import { WIND_MAP, ROUND_MAP } from "./constants";

import TABLE_SCHEMA from "./table-schema.json";

interface WindInput {
  discard: string;
  hand: string;
  score: number;
}

type WindInputs = { [K in tableWind]: WindInput };

export interface TableInput extends WindInputs {
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

export const parseTableInput = (s: string) => {
  const rawInput = parse(s) as { table: TableInput };

  const ajv = new Ajv();
  const validate = ajv.compile(TABLE_SCHEMA);
  const valid = validate(rawInput.table);
  if (!valid) {
    throw validate.errors;
  }

  const input = rawInput;
  return input.table;
};

export const convertInput = (
  i: TableInput
): [DiscardsInput, HandsInput, ScoreBoardInput] => {
  console.log("table input", i);

  const frontPlace = i.board.front || "1w";
  const m = createPlaceMap(frontPlace);
  const f = (w: tableWind) => {
    return i[w].discard.replace(/\r?\n/g, "");
  };
  const discards: DiscardsInput = {
    front: new Parser(f(m.front)).parseInput(),
    right: new Parser(f(m.right)).parseInput(),
    opposite: new Parser(f(m.opposite)).parseInput(),
    left: new Parser(f(m.left)).parseInput(),
  };
  const hands: HandsInput = {
    front: new Parser(i[m.front].hand).parse(),
    right: new Parser(i[m.right].hand).parse(),
    opposite: new Parser(i[m.opposite].hand).parse(),
    left: new Parser(i[m.left].hand).parse(),
  };

  const scoreBoard: ScoreBoardInput = {
    round: ROUND_MAP[i.board.round],
    frontPlace: WIND_MAP[frontPlace],
    sticks: i.board.sticks,
    doras: i.board.doras.map((v) => {
      return new Parser(v).parseInput()[0];
    }),
    scores: {
      front: i[m.front].score,
      right: i[m.right].score,
      opposite: i[m.opposite].score,
      left: i[m.left].score,
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
