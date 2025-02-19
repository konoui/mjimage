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
  InferInput,
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
const defaultBoard = {
  round: ROUND.E1,
  sticks: { reach: 0, dead: 0 },
  doras: WIND.S,
  front: WIND.E,
};

const boardInputSchema = optional(
  strictObject({
    round: optional(
      picklist(Object.keys(ROUND_MAP) as Round[]),
      defaultBoard.round
    ),
    sticks: optional(
      strictObject({
        reach: optional(
          pipe(number(), minValue(0, ""), maxValue(9, "")),
          defaultBoard.sticks.reach
        ),
        dead: optional(
          pipe(number(), minValue(0, ""), maxValue(9, "")),
          defaultBoard.sticks.dead
        ),
      }),
      defaultBoard.sticks
    ),
    doras: optional(string(), defaultBoard.doras),
    front: optional(
      picklist(Object.keys(WIND_MAP) as Wind[]),
      defaultBoard.front
    ),
  }),
  defaultBoard
);

// tableInputSchema の定義
const tableInputSchema = strictObject({
  ...windInputsSchema.entries,
  board: boardInputSchema,
});

// 型定義
type RawWindInput = InferInput<typeof windInputSchema>;
type RawWindInputs = InferInput<typeof windInputsSchema>;
type RawBoardInput = InferInput<typeof boardInputSchema>;
type RawTableInput = InferInput<typeof tableInputSchema>;

export type TableInput = InferOutput<typeof tableInputSchema>;

// 変換後の型
// TableInput => {DiscardsInput, HandsInput, ScoreBoardInput}
export interface DiscardsInput {
  front: readonly Tile[];
  right: readonly Tile[];
  opposite: readonly Tile[];
  left: readonly Tile[];
}

export interface HandsInput {
  front: Block[];
  right: Block[];
  opposite: Block[];
  left: Block[];
}

export interface ScoreBoardInput {
  doras: readonly Tile[];
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

type BoardRound = (typeof ROUND_MAP)[keyof typeof ROUND_MAP];
type BoardWind = (typeof WIND_MAP)[keyof typeof WIND_MAP];

export const parse = (s: string) => {
  const d = parseTableInput(s);
  return convertInput(d);
};

export const parseTableInput = (s: string) => {
  const rawInput = parseStringInput(s);

  const ret = safeParse(tableInputSchema, rawInput);
  if (!ret.success) {
    throw ret.issues;
  }
  return ret.output;
};

// ====

const parseStringInput = (input: string): RawTableInput => {
  const table = "table";
  const board = "board";
  const lines = input
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line != "");
  if (lines.length == 0) throw new Error("empty input");
  const tableLabel = lines.shift()!;
  if (!tableLabel.startsWith(table))
    throw new Error(`input does not start with table: ${tableLabel}`);

  const i: RawTableInput = {};

  let labels = [WIND.E, WIND.S, WIND.W, WIND.N, board];
  for (;;) {
    const line = lines.shift();
    if (line == undefined) break;

    const label = labels.find((l) => line.startsWith(l))!;
    if (label == null) throw new Error(`encountered unexpected line ${line}`);

    // update
    labels = labels.filter((l) => !line.startsWith(l));
    if (label == board) {
      const [bi, count] = handleBoard([...lines]);
      i.board = bi;
      for (let i = 0; i < count; i++) lines.shift();
    } else {
      const [wi, count] = handleWind([...lines]);
      i[label as Wind] = wi;
      for (let i = 0; i < count; i++) lines.shift();
    }
  }
  return i;
};

const trim = (s: string, label: string) => {
  return s.replace(label, "").replace(":", "").trim();
};

const handleWind = (lines: string[]) => {
  const hand = "hand";
  const discard = "discard";
  const score = "score";
  const r: RawWindInput = {};
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith(hand)) r.hand = trim(line, hand);
    else if (line.startsWith(discard)) r.discard = trim(line, discard);
    else if (line.startsWith(score)) r.score = Number(trim(line, score));
    else break;
  }
  return [r, i] as const;
};

const handleBoard = (lines: string[]) => {
  const doras = "doras";
  const round = "round";
  const front = "front";
  const sticks = "sticks";
  const reach = "reach";
  const dead = "dead";

  const r: RawBoardInput = {};

  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith(doras)) {
      r.doras = trim(line, doras);
    } else if (line.startsWith(round)) {
      r.round = trim(line, round) as Round;
    } else if (line.startsWith(front)) {
      r.front = trim(line, front) as Wind;
    } else if (line.startsWith(sticks)) {
      r.sticks = {};
      const next = lines[i + 1] ?? "";
      const nextNext = lines[i + 2] ?? "";
      if (next.startsWith(reach)) r.sticks.reach = Number(trim(next, reach));
      if (next.startsWith(dead)) r.sticks.dead = Number(trim(next, dead));
      if (nextNext.startsWith(reach))
        r.sticks.reach = Number(trim(nextNext, reach));
      if (nextNext.startsWith(dead))
        r.sticks.dead = Number(trim(nextNext, dead));
      if (r.sticks.dead != null) i++;
      if (r.sticks.reach != null) i++;
    } else break;
  }
  return [r, i] as const;
};

// ====

export const convertInput = (i: TableInput) => {
  const frontPlace = i.board.front;
  const m = createPlaceMap(frontPlace);
  const f = (w: Wind) => {
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

const createPlaceMap = (front: Wind) => {
  return {
    front: front,
    right: nextWind(front),
    opposite: nextWind(nextWind(front)),
    left: prevWind(front),
  };
};
