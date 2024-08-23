import { describe, test, expect } from "@jest/globals";
import { BlockCalculator, Hand, ShantenCalculator } from "../calculator";
import { Efficiency } from "../controller/efficiency";
import { TYPE, OPERATOR } from "../constants";
import { Block, Parser, Tile } from "../parser";
import { handsToString } from "./utils/helper";

describe("block", () => {
  test("mixed-back-block", () => {
    const h = new Hand("23456m11z______", true);
    const sc = new ShantenCalculator(h);
    const candidates = Efficiency.candidateTiles(h);
    expect(sc.calc()).toBe(0);
    expect("1m,4m,7m").toBe(candidates.candidates.toString());

    h.draw(new Tile(TYPE.S, 1));
    expect(sc.calc()).toBe(0);

    h.discard(new Tile(TYPE.M, 2));
    expect(sc.calc()).toBe(1);
  });
});
