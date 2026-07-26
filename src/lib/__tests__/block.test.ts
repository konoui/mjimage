import {
  BlockCalculator,
  Hand,
  ShantenCalculator,
  Efficiency,
} from "../calculator";
import { TYPE } from "../core/constants";
import { Tile } from "../core/parser";
import { handsToString } from "./utils/helper";

describe("efficiency", () => {
  test("duplicated da tile", () => {
    const h = new Hand("5678m05p4567p055s,t6s");
    const ret = Efficiency.calcEffectiveTiles(h, h.hands, { arrangeRed: true });
    expect(ret.length).toBe(6);
  });

  test("standard type only", () => {
    const h = new Hand("115588s116699p11z");
    const ss = new ShantenCalculator(h).standardType();
    expect(ss).toBe(3);

    const ret = Efficiency.calcEffectiveTiles(h, h.hands, {
      standardTypeOnly: true,
    });
    expect(ret[0].shanten).toBe(2);
  });
});

describe("block", () => {
  test("mixed-back-block", () => {
    const h = new Hand("23456m11z123s___", true);
    const sc = new ShantenCalculator(h);
    expect(sc.calc()).toBe(0);

    const candidates = Efficiency.getEffectiveTiles(h);
    expect("1m,4m,7m").toBe(candidates.effectiveTiles.toString());

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
