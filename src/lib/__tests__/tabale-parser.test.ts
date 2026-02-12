import { parseYamlStringInput, TableInput } from "../image/table-parser";
import { ROUND, WIND } from "../core";
describe("parse-table", () => {
  test("simple", () => {
    const input = `
  table:
    1z:
      discard: 1m
      hand: 1m
      score: 0
    2z:
      discard: 2m
      hand: 2m
      score: 3000
    3z:
      discard: 3m
      hand: 3m
      score: 25000
    4z:
      discard: 4m
      hand: 4m
      score: 12000
    board:
      dora_indicators: 1m
      sticks:
        reach: 1
        dead: 3
      round: 1z1
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
        round: ROUND.E1,
        sticks: {
          reach: 1,
          dead: 3,
        },
        doraIndicators: "1m",
        front: WIND.E,
      },
    };
    const got = parseYamlStringInput(input);
    expect(got).toStrictEqual(want);
  });
});
