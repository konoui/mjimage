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
import {
  WIND_MAP,
  ROUND_MAP,
  WIND,
  ROUND,
  Wind,
  Round,
} from "../core/constants";

// windInputSchema の定義
const windInputSchema = optional(
  strictObject({
    discard: optional(string(), ""),
    hand: optional(string(), ""),
    score: optional(number(), 25000),
  }),
  { discard: "", hand: "", score: 25000 },
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
  doraIndicators: WIND.S,
  front: WIND.E,
};

const boardInputSchema = optional(
  strictObject({
    round: optional(
      picklist(Object.keys(ROUND_MAP) as Round[]),
      defaultBoard.round,
    ),
    sticks: optional(
      strictObject({
        reach: optional(
          pipe(number(), minValue(0, ""), maxValue(9, "")),
          defaultBoard.sticks.reach,
        ),
        dead: optional(
          pipe(number(), minValue(0, ""), maxValue(9, "")),
          defaultBoard.sticks.dead,
        ),
      }),
      defaultBoard.sticks,
    ),
    doraIndicators: optional(string(), defaultBoard.doraIndicators),
    front: optional(
      picklist(Object.keys(WIND_MAP) as Wind[]),
      defaultBoard.front,
    ),
  }),
  defaultBoard,
);

// tableInputSchema の定義
const tableInputSchema = strictObject({
  ...windInputsSchema.entries,
  board: boardInputSchema,
});

// 型定義
export type RawWindInput = InferInput<typeof windInputSchema>;
export type RawWindInputs = InferInput<typeof windInputsSchema>;
export type RawBoardInput = InferInput<typeof boardInputSchema>;
export type RawTableInput = InferInput<typeof tableInputSchema>;

export type ValidatedTableInput = InferOutput<typeof tableInputSchema>;

/**
 * Raw 形式の入力を ValidatedTableInput に変換する
 */
export function parseRawTableInput(
  rawInput: RawTableInput,
): ValidatedTableInput {
  const ret = safeParse(tableInputSchema, rawInput);
  if (!ret.success) {
    throw ret.issues;
  }
  return ret.output;
}
