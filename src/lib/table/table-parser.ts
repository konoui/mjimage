import { load } from "js-yaml";
import {
  string,
  number,
  optional,
  maxValue,
  minValue,
  pipe,
  picklist,
  safeParse,
  InferOutput,
  strictObject,
} from "valibot";
import { Tile, Parser, Block } from "../core/parser";
import {
  WIND_MAP,
  ROUND_MAP,
  WIND,
  ROUND,
  Wind,
  Round,
} from "../core/constants";
import { nextWind, prevWind } from "../core";

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
  [WIND.E]: windInputSchema,
  [WIND.S]: windInputSchema,
  [WIND.W]: windInputSchema,
  [WIND.N]: windInputSchema,
});

// boardInputSchema の定義
const boardInputSchema = strictObject({
  round: optional(picklist(Object.keys(ROUND_MAP) as TableRound[]), ROUND.E1),
  sticks: optional(
    strictObject({
      reach: optional(pipe(number(), minValue(0, ""), maxValue(9, "")), 0),
      dead: optional(pipe(number(), minValue(0, ""), maxValue(9, "")), 0),
    }),
    { reach: 0, dead: 0 }
  ),
  doras: optional(string(), WIND.S),
  front: optional(picklist(Object.keys(WIND_MAP) as TableWind[]), WIND.E),
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

// 変換後の型
// TableInput => {DiscardsInput, HandsInput, ScoreBoardInput}
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

export type TableWind = Wind;
export type TableRound = Round;
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
    doras: new Parser(i.board.doras).tiles(),
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
  return {
    front: front,
    right: nextWind(front),
    opposite: nextWind(nextWind(front)),
    left: prevWind(front),
  };
};
