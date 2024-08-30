import { load } from "js-yaml";
import {
  string,
  number,
  optional,
  array,
  maxValue,
  minValue,
  pipe,
  picklist,
  safeParse,
  InferOutput,
  strictObject,
} from "valibot";
import { Tile, Parser, Block } from "../core/parser";
import { WIND_MAP, ROUND_MAP, WIND } from "../core/constants";

// windInputSchema の定義
const windInputSchema = optional(
  strictObject({
    discard: optional(string(), ""),
    hand: optional(string(), ""),
    score: optional(number(), 25000),
  }),
  { discard: "", hand: "", score: 25000 }
);

// windInputsSchema の定義
const windInputsSchema = strictObject({
  [WIND.EAST]: windInputSchema,
  [WIND.SOUTH]: windInputSchema,
  [WIND.WEST]: windInputSchema,
  [WIND.NORTH]: windInputSchema,
});

// boardInputSchema の定義
const boardInputSchema = strictObject({
  round: optional(picklist(Object.keys(ROUND_MAP) as TableRound[]), "1w1"),
  sticks: optional(
    strictObject({
      reach: optional(pipe(number(), minValue(0, ""), maxValue(9, "")), 0),
      dead: optional(pipe(number(), minValue(0, ""), maxValue(9, "")), 0),
    }),
    { reach: 0, dead: 0 }
  ),
  doras: optional(array(string()), ["3w"]),
  front: optional(picklist(Object.keys(WIND_MAP) as TableWind[]), "1w"),
});

// tableInputSchema の定義
const tableInputSchema = strictObject({
  ...windInputsSchema.entries,
  board: boardInputSchema,
});

// 型定義
type WindInput = InferOutput<typeof windInputSchema>;
type WindInputs = InferOutput<typeof windInputsSchema>;
type BoardInput = InferOutput<typeof boardInputSchema>;

export type TableInput = InferOutput<typeof tableInputSchema>;

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
  round: BoardRound;
  sticks: { reach: number; dead: number };
  scores: {
    front: number;
    right: number;
    opposite: number;
    left: number;
  };
  frontPlace: BoardWind;
}

export type TableWind = keyof typeof WIND_MAP;
export type TableRound = keyof typeof ROUND_MAP;
type BoardRound = (typeof ROUND_MAP)[keyof typeof ROUND_MAP];
type BoardWind = (typeof WIND_MAP)[keyof typeof WIND_MAP];

export const parse = (s: string) => {
  const d = parseTableInput(s);
  return convertInput(d);
};

export const parseTableInput = (s: string) => {
  const rawInput = load(s) as { table: TableInput };

  const ret = safeParse(tableInputSchema, rawInput.table);
  if (!ret.success) {
    throw ret.issues;
  }
  return ret.output;
};

export const convertInput = (i: TableInput) => {
  const frontPlace = i.board.front;
  const m = createPlaceMap(frontPlace);
  const f = (w: TableWind) => {
    return i[w].discard.replace(/\r?\n/g, "");
  };
  const discards: DiscardsInput = {
    front: new Parser(f(m.front)).tiles(),
    right: new Parser(f(m.right)).tiles(),
    opposite: new Parser(f(m.opposite)).tiles(),
    left: new Parser(f(m.left)).tiles(),
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
    doras: i.board!.doras.map((v) => {
      return new Parser(v).tiles()[0];
    }),
    scores: {
      front: i[m.front].score,
      right: i[m.right].score,
      opposite: i[m.opposite].score,
      left: i[m.left].score,
    },
  };
  return { discards, hands, scoreBoard };
};

const createPlaceMap = (
  front: TableWind
): {
  front: TableWind;
  right: TableWind;
  opposite: TableWind;
  left: TableWind;
} => {
  const f = (start: number, v: number): TableWind => {
    let ret = `${v}w`;
    if (v > 4) ret = `${v - start}w`;
    return ret as TableWind;
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
