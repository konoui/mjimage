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

  // キーだけ書いて値を省いた場合は「指定なし」として既定値で埋める。
  // Number("") は 0 なので、素通しすると 0 点・供託 0 本を指定したことになる。
  test("a key without a value falls back to the default", () => {
    const got = parseYamlStringInput(`
  table:
    1z:
      score:
    `);
    expect(got[WIND.E].score).toBe(25000);
  });

  // 入力の誤りは Error として飛ぶ。原因が message から読めること。
  test("schema violations are thrown as Error with a readable message", () => {
    const parse = (board: string) =>
      parseYamlStringInput(`
  table:
    board:
${board}
    `);

    // 範囲外（メッセージを空文字にしていると何も表示されない）
    expect(() => parse("      sticks:\n        reach: 99")).toThrow(
      /Expected <=9 but received 99/,
    );
    // 未知の局
    expect(() => parse("      round: 9z9")).toThrow(/invalid table input/);
    // 投げる値が Error であること（issue の配列をそのまま投げない）
    try {
      parse("      sticks:\n        reach: 99");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      // 元の issue は cause から辿れる
      expect(Array.isArray((e as Error).cause)).toBe(true);
    }
  });

  // 数値として読めない値は、どのキーが悪いか分かる形で弾く。
  test("a non numeric value is rejected", () => {
    expect(() =>
      parseYamlStringInput(`
  table:
    1z:
      score: abc
    `),
    ).toThrow(/score must be a number: abc/);
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
