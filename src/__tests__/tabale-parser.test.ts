import { describe, test, expect } from "@jest/globals";
import { parserTableInput, TableInput } from "./../table-parser";

test("parse-table", () => {
  const input = `
table:
  discards:
    1w: 1m
    2w: 2m
    3w: 3m
    4w: 4m
  hands:
    1w: 1m
    2w: 2m
    3w: 3m
    4w: 4m
  scores:
    1w: 0
    2w: 3000
    3w: 25000
    4w: 12000
  board:
    doras:
      - 1m
    sticks:
      reach: 1
      dead: 3
    round: 1w1
  `;
  const want: TableInput = {
    discards: {
      "1w": "1m",
      "2w": "2m",
      "3w": "3m",
      "4w": "4m",
    },
    hands: {
      "1w": "1m",
      "2w": "2m",
      "3w": "3m",
      "4w": "4m",
    },
    scores: {
      "1w": 0,
      "2w": 3000,
      "3w": 25000,
      "4w": 12000,
    },
    board: {
      round: "1w1",
      sticks: {
        reach: 1,
        dead: 3,
      },
      doras: ["1m"],
    },
  };
  const got = parserTableInput(input);
  expect(got).toStrictEqual(want);
});
