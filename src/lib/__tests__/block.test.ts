import { describe, test, expect } from "@jest/globals";
import { BlockCalculator, Hand, ShantenCalculator } from "../calculator";
import { Efficiency } from "../controller/efficiency";
import { TYPE, OPERATOR } from "../constants";
import { Block, Parser, Tile } from "../parser";
import { handsToString } from "./utils/helper";

describe("block", () => {
  test("mixed-back-block", () => {
    const h = new Hand("23456m11z123s___", true);
    const sc = new ShantenCalculator(h);
    expect(sc.calc()).toBe(0);

    const candidates = Efficiency.candidateTiles(h);
    expect("1m,4m,7m").toBe(candidates.candidates.toString());

    h.discard(new Tile(TYPE.M, 2));
    expect(sc.calc()).toBe(1);
  });
  test("divide-mixed-block", () => {
    const h = new Hand("23456m11z______", true);
    const t = new Tile(TYPE.M, 1);
    h.draw(t);

    const bc = new BlockCalculator(h);
    const res = handsToString(bc.calc(t));
    expect(res).toStrictEqual([["11z", "t123m", "456m", "___", "___"]]);
  });
  test("divide-mixed-block-with-no-head", () => {
    const h = new Hand("23456m___,___,__", true);

    const sc = new ShantenCalculator(h);
    expect(sc.calc()).toBe(0);

    const t = new Tile(TYPE.M, 1);
    h.draw(t);
    expect(sc.calc()).toBe(-1);

    const bc = new BlockCalculator(h);
    const res = handsToString(bc.calc(t));
    expect(res).toStrictEqual([["__", "t123m", "456m", "___", "___"]]);
  });
  test("partial-candidate", () => {
    let candidates = Efficiency.partialCandidateTiles("23456s11z");
    expect(candidates.candidates.toString()).toBe("1s,4s,7s");

    candidates = Efficiency.partialCandidateTiles("23456s");
    expect(candidates.candidates.toString()).toBe("1s,4s,7s");
  });
});
