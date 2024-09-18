import { describe, test, expect } from "@jest/globals";
import {
  BlockCalculator,
  Hand,
  ShantenCalculator,
  Efficiency,
} from "../calculator";
import { TYPE, OPERATOR } from "../core/constants";
import { Block, BlockAnKan, BlockHand, Parser, Tile } from "../core/parser";
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
  test("partial-shanten", () => {
    let n = Efficiency.partialShanten("23456s11z");
    expect(n).toBe(0);

    n = Efficiency.partialShanten("23456s");
    expect(n).toBe(0);

    n = Efficiency.partialShanten("246s");
    expect(n).toBe(1);
  });
  test("partial-candidate", () => {
    let candidates = Efficiency.partialCandidateTiles("23456s11z");
    expect(candidates.candidates.toString()).toBe("1s,4s,7s");

    candidates = Efficiency.partialCandidateTiles("23456s");
    expect(candidates.candidates.toString()).toBe("1s,4s,7s");
  });
});

describe("toString", () => {
  test("anakn", () => {
    const t = new Tile(TYPE.M, 1);
    const b = new BlockAnKan([t, t, t, t]);
    expect(b.toString()).toEqual("_11m_");
  });
  test("hand", () => {
    const t1 = new Tile(TYPE.M, 1);
    const t2 = new Tile(TYPE.S, 1);
    const t3 = new Tile(TYPE.BACK, 0);
    const b = new BlockHand([t1, t2, t2, t3, t1, t2, t3]);
    expect(b.toString()).toEqual("11m111s__");
  });
});
