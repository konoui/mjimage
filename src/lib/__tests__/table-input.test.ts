import {
  parseTableInput,
  parseYamlStringInput,
  ValidatedTableInput,
} from "../input";
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
    const want: ValidatedTableInput = {
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

  // ドラ表示牌は牌の記述をそのまま受け取るので、複数枚まとめて指定できる。
  test("multiple dora indicators", () => {
    const board = (doraIndicators: string) => `
  table:
    1z:
      hand: 1m
    board:
      dora_indicators: ${doraIndicators}
    `;
    for (const [input, want] of [
      ["1m", ["1m"]],
      ["1m2p3s4z0m", ["1m", "2p", "3s", "4z", "r5m"]],
      ["1m, 2p, 3s", ["1m", "2p", "3s"]],
    ] as const) {
      const got = parseTableInput(board(input));
      expect(got.scoreBoard.doraIndicators.map((t) => t.toString())).toEqual(
        want,
      );
    }
  });

  // 表示牌の省略時は既定の 2z が使われる。
  test("dora indicators default", () => {
    const got = parseTableInput(`
  table:
    1z:
      hand: 1m
    `);
    expect(got.scoreBoard.doraIndicators.map((t) => t.toString())).toEqual([
      "2z",
    ]);
  });

  // 階層はインデントで決まる。sticks の外にある reach/dead は sticks の値にしない。
  test("nested keys belong to the section they are indented under", () => {
    expect(() =>
      parseYamlStringInput(`
  table:
    board:
      sticks:
      reach: 1
    `),
    ).toThrow(/unexpected key: reach/);
  });

  // sticks の子は 2 つとも省略でき、順序にも依存しない。
  test("sticks children are optional and order independent", () => {
    const sticks = (children: string) =>
      parseYamlStringInput(`
  table:
    board:
      sticks:
${children}
      round: 1z1
    `).board.sticks;

    expect(sticks("        reach: 1\n        dead: 3")).toStrictEqual({
      reach: 1,
      dead: 3,
    });
    expect(sticks("        dead: 3\n        reach: 1")).toStrictEqual({
      reach: 1,
      dead: 3,
    });
    // 片方だけでも、残りは schema の既定値（0）で埋まる。
    expect(sticks("        dead: 3")).toStrictEqual({ reach: 0, dead: 3 });
    expect(sticks("")).toStrictEqual({ reach: 0, dead: 0 });
  });

  // 綴りの誤りは黙って捨てずに弾く。
  test("unknown keys are rejected", () => {
    expect(() =>
      parseYamlStringInput(`
  table:
    1z:
      hands: 1m
    `),
    ).toThrow(/unexpected key: hands/);
    expect(() =>
      parseYamlStringInput(`
  table:
    5z:
      hand: 1m
    `),
    ).toThrow(/unexpected key: 5z/);
  });

  // 同じキーが 2 度現れたら、どちらを採るか決められないので弾く。
  test("duplicated keys are rejected", () => {
    expect(() =>
      parseYamlStringInput(`
  table:
    1z:
      hand: 1m
      hand: 2m
    `),
    ).toThrow(/duplicated key: hand/);
  });
});
