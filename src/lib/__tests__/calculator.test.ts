import { describe, test, expect } from "@jest/globals";
import {
  ShantenCalculator,
  TileCalculator,
  Hand,
  HandData,
} from "../calculator";
import { BLOCK, KIND, OPERATOR } from "../constants";
import { Block, Parser, Tile } from "../parser";

describe("Hand", () => {
  const getData = (h: Hand) => {
    return (h as any).data as HandData;
  };
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
    expect((c as any).data).toStrictEqual(want);
  });
  test("operations", () => {
    const h = new Hand("122234m123w1d");
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
    expect(getData(h)).toStrictEqual(want);

    const tsumo = new Tile(KIND.M, 2, OPERATOR.TSUMO);
    h.draw(tsumo);
    want.tsumo = tsumo;
    want[tsumo.k][tsumo.n] += 1;
    expect(getData(h)).toStrictEqual(want);

    const chi = new Parser("-534m").parse()[0];
    h.call(chi);
    want.called.push(chi);
    want.m[3] -= 1;
    want.m[4] -= 1;
    expect(getData(h)).toStrictEqual(want);

    const ankan = new Parser("_22_m").parse()[0];
    h.kan(ankan);
    want.called.push(ankan);
    want.m[2] -= 4;
    expect(getData(h)).toStrictEqual(want);

    expect(() => {
      h.discard(tsumo);
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
    {
      name: "common",
      input: "123m456m789m12s11p",
      want: 0,
      handler: "Common",
    },
    {
      name: "common",
      input: "123m456m789m12s1p1z",
      want: 1,
      handler: "Common",
    },
    {
      name: "common",
      input: "111m456m789m12s1p1z",
      want: 1,
      handler: "Common",
    },
  ];

  for (const tt of tests) {
    test(tt.name, () => {
      const h = new Hand(tt.input);
      const c = new ShantenCalculator(h);
      let got: number = -1;
      if (tt.handler == "Seven") got = c.sevenPairs();
      else if (tt.handler == "Orphans") got = c.thirteenOrphans();
      else if (tt.handler == "Common") got = c.fourSetsOnePair();
      else throw new Error(`unexpected handler ${tt.handler}`);
      expect(got).toBe(tt.want);
    });
  }
});

describe("Tile Calculator", () => {
  const tests = [
    {
      name: "seven pairs tenpai",
      input: "11223344556677m",
      want: [["11m", "22m", "33m", "44m", "55m", "66m", "77m"]],
      handler: "Seven",
    },
    {
      name: "thirteen orphans waiting 13 tiles",
      input: "19m19s19p1234567z1m",
      want: [
        [
          "11m",
          "9m",
          "1p",
          "9p",
          "1s",
          "9s",
          "1z",
          "2z",
          "3z",
          "4z",
          "5z",
          "6z",
          "7z",
        ],
      ],
      handler: "Orphans",
    },
    {
      name: "simple",
      input: "111m456m789m123s11p",
      want: [["11p", "111m", "456m", "789m", "123s"]],
      handler: "Common",
    },
    {
      name: "with called",
      input: "111m456m789m11p,1-23s",
      want: [["11p", "111m", "456m", "789m", "-213s"]],
      handler: "Common",
    },
    {
      name: "multiple",
      input: "111222333m123s11p",
      want: [
        ["11p", "123m", "123m", "123m", "123s"],
        ["11p", "111m", "222m", "333m", "123s"],
      ],
      handler: "Common",
    },
    {
      name: "two sets",
      input: "11223344556677m",
      want: [
        ["11m", "234m", "234m", "567m", "567m"],
        ["44m", "123m", "123m", "567m", "567m"],
        ["77m", "123m", "123m", "456m", "456m"],
      ],
      handler: "Common",
    },
    {
      name: "common",
      input: "111123m123s123p11z",
      want: [["11z", "123m", "111m", "123p", "123s"]],
      handler: "Common",
    },
  ];

  for (const tt of tests) {
    test(tt.name, () => {
      const h = new Hand(tt.input);
      const c = new TileCalculator(h);
      let got: string[][] = [];
      if (tt.handler == "Seven") got = c.sevenPairs();
      else if (tt.handler == "Orphans") got = c.thirteenOrphans();
      else if (tt.handler == "Common") got = c.fourSetsOnePair();
      else throw new Error(`unexpected handler ${tt.handler}`);
      expect(got).toStrictEqual(tt.want);
    });
  }
});

test("commonByKind", () => {
  const h = new Hand("111222333456m");
  const c = new TileCalculator(h);
  const got = (c as any).commonByKind(KIND.M);
  const want = [
    ["123m", "123m", "123m", "456m"],
    ["111m", "234m"],
    ["111m", "222m", "345m"],
    ["111m", "222m", "333m", "456m"],
  ];
  expect(got).toStrictEqual(want);
});

test("handleCommon", () => {
  const h = new Hand("111222333456m111s");
  const c = new TileCalculator(h);
  const got = (c as any).commonAll();
  const want = [
    ["123m", "123m", "123m", "456m", "111s"],
    ["111m", "234m", "111s"],
    ["111m", "222m", "345m", "111s"],
    ["111m", "222m", "333m", "456m", "111s"],
  ];
  expect(got).toStrictEqual(want);
});
