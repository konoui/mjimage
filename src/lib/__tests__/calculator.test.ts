import { describe, test, expect } from "@jest/globals";
import { Calculator, Hand, HandData } from "../calculator";
import { BLOCK, KIND, OPERATOR } from "../constants";
import { Block, Parser, Tile } from "../parser";

describe("Hand", () => {
  test("init", () => {
    const c = new Hand("12234m123w1d, -123s, t2p");
    const want: HandData = {
      [KIND.M]: [0, 1, 2, 1, 1, 0, 0, 0, 0, 0],
      [KIND.S]: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [KIND.P]: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      [KIND.BACK]: [0],
      [KIND.Z]: [0, 1, 1, 1, 0, 1, 0, 0],
      called: new Parser("-123s").parse(),
      reached: false,
      tsumo: new Tile(KIND.P, 2, OPERATOR.TSUMO),
    };
    expect(c.data).toStrictEqual(want);
  });
  test("operations", () => {
    const c = new Hand("122234m123w1d");
    const want: HandData = {
      [KIND.M]: [0, 1, 3, 1, 1, 0, 0, 0, 0, 0],
      [KIND.S]: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [KIND.P]: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [KIND.BACK]: [0],
      [KIND.Z]: [0, 1, 1, 1, 0, 1, 0, 0],
      called: [],
      reached: false,
      tsumo: null,
    };
    // initial check
    expect(c.data).toStrictEqual(want);

    const tsumo = new Tile(KIND.M, 2, OPERATOR.TSUMO);
    c.tsumo(tsumo);
    want.tsumo = tsumo;
    want[tsumo.k][tsumo.n] += 1;
    expect(c.data).toStrictEqual(want);

    const chi = new Parser("-534m").parse()[0];
    c.call(chi);
    want.called.push(chi);
    want.m[3] -= 1;
    want.m[4] -= 1;
    expect(c.data).toStrictEqual(want);

    const ankan = new Parser("_22_m").parse()[0];
    c.kan(ankan);
    want.called.push(ankan);
    want.m[2] -= 4;
    expect(c.data).toStrictEqual(want);

    expect(() => {
      c.discard(tsumo);
    }).toThrow(/unable to decrease/);
  });
});

describe("Shanten Calculator", () => {
  const tests = [
    {
      name: "seven pairs tenpai",
      input: "1122334455667m",
      want: 0,
      handler: "Seven",
    },
    {
      name: "seven pairs 1 shanten",
      input: "1122334455678m",
      want: 1,
      handler: "Seven",
    },
    {
      name: "seven pairs 2 shanten",
      input: "1122334456789m",
      want: 2,
      handler: "Seven",
    },
    {
      name: "seven pairs 3 shanten",
      input: "112233456789m1s",
      want: 3,
      handler: "Seven",
    },
    {
      name: "seven pairs 3 shanten",
      input: "1123456789m123s",
      want: 5,
      handler: "Seven",
    },
    {
      name: "thirteen orphans waiting 13 tiles",
      input: "19m19s19p1234567z",
      want: 0,
      handler: "Orphans",
    },
    {
      name: "thirteen orphans waiting 7z",
      input: "19m19s19p123456z1p",
      want: 0,
      handler: "Orphans",
    },
    {
      name: "thirteen orphans 13 tiles",
      input: "19m19s19p123456w2p",
      want: 1,
      handler: "Orphans",
    },
    {
      name: "common",
      input: "123m456m789m123s1p",
      want: 0,
      handler: "Common",
    },
  ];

  for (const tt of tests) {
    test(tt.name, () => {
      const h = new Hand(tt.input);
      const c = new Calculator(h);
      let got: number = -1;
      if (tt.handler == "Seven") got = c.sevenParis();
      else if (tt.handler == "Orphans") got = c.thirteenOrphans();
      else if (tt.handler == "Common") got = c.common();
      else throw new Error(`unexpected handler ${tt.handler}`);
      expect(got).toBe(tt.want);
    });
  }
});
