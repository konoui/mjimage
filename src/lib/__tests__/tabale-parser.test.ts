import { parseTableInput, TableInput } from "../table/table-parser";
import { WIND } from "../core";
describe("parse-table", () => {
  test("simple", () => {
    const input = `
  table:
    1w:
      discard: 1m
      hand: 1m
      score: 0
    2w:
      discard: 2m
      hand: 2m
      score: 3000
    3w:
      discard: 3m
      hand: 3m
      score: 25000
    4w:
      discard: 4m
      hand: 4m
      score: 12000
    board:
      doras:
        - 1m
      sticks:
        reach: 1
        dead: 3
      round: 1w1
    `;
    const want: TableInput = {
      [WIND.E]: {
        discard: "1m",
        hand: "1m",
        score: 0,
      },
      [WIND.S]: {
        discard: "2m",
        hand: "2m",
        score: 3000,
      },
      [WIND.W]: {
        discard: "3m",
        hand: "3m",
        score: 25000,
      },
      [WIND.N]: {
        discard: "4m",
        hand: "4m",
        score: 12000,
      },
      board: {
        round: "1w1",
        sticks: {
          reach: 1,
          dead: 3,
        },
        doras: ["1m"],
        front: "1w",
      },
    };
    const got = parseTableInput(input);
    expect(got).toStrictEqual(want);
  });
});
