import { describe, test, expect } from "@jest/globals";
import { Hand, HandData } from "../calculator";
import { BLOCK, KIND, OPERATOR } from "../constants";
import { Block, Parser, Tile } from "../parser";

describe("Hand", () => {
  test("init", () => {
    const c = new Hand("12234m123w1d, -123s, t2p");
    const got: HandData = {
      [KIND.M]: [0, 1, 2, 1, 1, 0, 0, 0, 0, 0],
      [KIND.S]: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [KIND.P]: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      [KIND.BACK]: [0],
      [KIND.Z]: [0, 1, 1, 1, 0, 1, 0, 0],
      called: new Parser("-123s").parse(),
      reached: false,
      tsumo: new Tile(KIND.P, 2, OPERATOR.TSUMO),
    };
    expect(c.data).toStrictEqual(got);
  });
  test("operations", () => {
    const c = new Hand("122234m123w1d");
    const got: HandData = {
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
    expect(c.data).toStrictEqual(got);

    const tsumo = new Tile(KIND.M, 2, OPERATOR.TSUMO);
    c.tsumo(tsumo);
    got.tsumo = tsumo;
    got[tsumo.k][tsumo.n] += 1;
    expect(c.data).toStrictEqual(got);

    const chi = new Parser("-534m").parse()[0];
    c.call(chi);
    got.called.push(chi);
    got.m[3] -= 1;
    got.m[4] -= 1;
    expect(c.data).toStrictEqual(got);

    const ankan = new Parser("_22_m").parse()[0];
    c.kan(ankan);
    got.called.push(ankan);
    got.m[2] -= 4;
    expect(c.data).toStrictEqual(got);

    expect(() => {
      c.discard(tsumo);
    }).toThrow(/unable to decrement/);
  });
});
