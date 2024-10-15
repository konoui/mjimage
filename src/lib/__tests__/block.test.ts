import {
  BlockCalculator,
  Hand,
  ShantenCalculator,
  Efficiency,
} from "../calculator";
import { TYPE, OPERATOR } from "../core/constants";
import { Block, BlockAnKan, BlockHand, Parser, Tile } from "../core/parser";
import { handsToString } from "./utils/helper";

describe("efficiency", () => {
  test("duplicated da tile", () => {
    const h = new Hand("5678m05p4567p055s,t6s");
    const ret = Efficiency.calcCandidates(h, h.hands, { arrangeRed: true });
    expect(ret.length).toBe(6);
  });

  test("four sets one pair", () => {
    const h = new Hand("115588s116699p11z");
    const ss = new ShantenCalculator(h).fourSetsOnePair();
    expect(ss).toBe(3);

    const ret = Efficiency.calcCandidates(h, h.hands, {
      fourSetsOnePair: true,
    });
    expect(ret[0].shanten).toBe(2);
  });
});

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
