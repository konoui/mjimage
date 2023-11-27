import yaml from "yaml";
import { z } from "zod";

import { Tile, Parser, Block } from "./parser";
import { WIND_MAP, ROUND_MAP } from "./constants";

const windInputSchema = z
  .object({
    discard: z.string().max(50).optional().default(""),
    hand: z.string().max(25).optional().default(""),
    score: z.number().optional().default(25000),
  })
  .strict()
  .optional()
  .default({ discard: "", hand: "", score: 25000 });

const windInputsSchema = z
  .object({
    // FIXME merge WIND_MAP
    "1w": windInputSchema,
    "2w": windInputSchema,
    "3w": windInputSchema,
    "4w": windInputSchema,
  })
  .strict();

// https://github.com/colinhacks/zod/discussions/2790
function unionOfLiterals<T extends TableRound | TableWind>(
  constants: readonly T[]
) {
  const literals = constants.map((x) => z.literal(x)) as unknown as readonly [
    z.ZodLiteral<T>,
    z.ZodLiteral<T>,
    ...z.ZodLiteral<T>[]
  ];
  return z.union(literals);
}

const boardInputSchema = z
  .object({
    round: unionOfLiterals(Object.keys(ROUND_MAP) as TableRound[])
      .optional()
      .default("1w1"),
    sticks: z
      .object({
        reach: z.number().max(9).gte(0).optional().default(0),
        dead: z.number().max(9).gte(0).optional().default(0),
      })
      .optional()
      .default({ reach: 0, dead: 0 }),
    doras: z.array(z.string()).max(4).optional().default(["3w"]),
    front: unionOfLiterals(Object.keys(WIND_MAP) as TableWind[])
      .optional()
      .default("1w"),
  })
  .strict();

const tableInputSchema = windInputsSchema.extend({
  board: boardInputSchema,
});

type WindInput = z.infer<typeof windInputSchema>;
type WindInputs = z.infer<typeof windInputsSchema>;
type BoardInput = z.infer<typeof boardInputSchema>;

export type TableInput = z.infer<typeof tableInputSchema>;

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

type TableWind = keyof typeof WIND_MAP;
type TableRound = keyof typeof ROUND_MAP;
type BoardRound = (typeof ROUND_MAP)[keyof typeof ROUND_MAP];
type BoardWind = (typeof WIND_MAP)[keyof typeof WIND_MAP];

export const parse = (s: string) => {
  const d = parseTableInput(s);
  return convertInput(d);
};

export const parseTableInput = (s: string) => {
  const rawInput = yaml.parse(s) as { table: TableInput };

  const ret = tableInputSchema.safeParse(rawInput.table);
  if (!ret.success) {
    throw ret.error;
  }
  return ret.data;
};

export const convertInput = (i: TableInput) => {
  console.log("table input", i);

  const frontPlace = i.board.front;
  const m = createPlaceMap(frontPlace);
  const f = (w: TableWind) => {
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
