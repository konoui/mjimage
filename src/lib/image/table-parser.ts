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

/**
 * 麻雀卓の文字列をパースし、内部表現に変換する
 */
export const parse = (s: string) => {
  const d = parseTableInput(s);
  return convertInput(d);
};

/**
 * 麻雀卓の文字列をパースする。
 * パース後さらに内部表現に変換する必要がある。
 */
export const parseTableInput = (s: string) => {
  const rawInput = parseStringInput(s);

  const ret = safeParse(tableInputSchema, rawInput);
  if (!ret.success) {
    throw ret.issues;
  }
  return ret.output;
};

// ====

// YAMLライクな形式をパースして構造化データに変換
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

  const result: RawTableInput = {};

  // 1w,2w,3w,4w エイリアスをサポート
  let labels = [WIND.E, WIND.S, WIND.W, WIND.N, board];
  for (;;) {
    const line = lines.shift();
    if (line == undefined) break;

    const label = labels.find((l) => line.startsWith(l))!;
    if (label == null) throw new Error(`encountered unexpected line ${line}`);

    // 処理済みラベルを除去
    labels = labels.filter((l) => !line.startsWith(l));
    if (label == board) {
      const [boardInput, count] = parseBoardSection([...lines]);
      result.board = boardInput;
      lines.splice(0, count);
    } else {
      const [windInput, count] = parseWindSection([...lines]);
      result[label as Wind] = windInput;
      lines.splice(0, count);
    }
  }
  return result;
};

// キー値ペアから値部分を抽出
const extractValue = (s: string, label: string) => {
  return s.replace(label, "").replace(":", "").trim();
};

// 風牌セクションをパース
const parseWindSection = (lines: string[]) => {
  const hand = "hand";
  const discard = "discard";
  const score = "score";
  const result: RawWindInput = {};
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith(hand)) result.hand = extractValue(line, hand);
    else if (line.startsWith(discard))
      result.discard = extractValue(line, discard);
    else if (line.startsWith(score))
      result.score = Number(extractValue(line, score));
    else break;
  }
  return [result, i] as const;
};

// ボードセクションをパース
const parseBoardSection = (lines: string[]) => {
  const doras = "doras";
  const round = "round";
  const front = "front";
  const sticks = "sticks";
  const reach = "reach";
  const dead = "dead";

  const result: RawBoardInput = {};

  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith(doras)) {
      result.doras = extractValue(line, doras);
    } else if (line.startsWith(round)) {
      result.round = extractValue(line, round) as Round;
    } else if (line.startsWith(front)) {
      result.front = extractValue(line, front) as Wind;
    } else if (line.startsWith(sticks)) {
      result.sticks = {};
      const next = lines[i + 1] ?? "";
      const nextNext = lines[i + 2] ?? "";
      if (next.startsWith(reach))
        result.sticks.reach = Number(extractValue(next, reach));
      if (next.startsWith(dead))
        result.sticks.dead = Number(extractValue(next, dead));
      if (nextNext.startsWith(reach))
        result.sticks.reach = Number(extractValue(nextNext, reach));
      if (nextNext.startsWith(dead))
        result.sticks.dead = Number(extractValue(nextNext, dead));
      if (result.sticks.dead != null) i++;
      if (result.sticks.reach != null) i++;
    } else break;
  }
  return [result, i] as const;
};

// ====

/**
 * パースした入力を内部表現へ変換する。
 */
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
