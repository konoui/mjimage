import {
  BlockCalculator,
  Hand,
  ShantenCalculator,
  getEffectiveTiles,
} from "../calculator";
import { TYPE } from "../core/constants";
import { Tile } from "../core";
import { handsToString } from "./utils/helper";

// 裏牌（_）が混ざった手牌のブロック分解。
// 他家の手牌は伏せられているので、シャンテン数や分解の計算は裏牌を跨いで動く必要がある。
describe("裏牌を含む手牌", () => {
  test("裏牌を面子の代わりに数えてシャンテン数を出す", () => {
    const h = new Hand("23456m11z123s___", true);
    const sc = new ShantenCalculator(h);
    expect(sc.calc()).toBe(0);

    const candidates = getEffectiveTiles(h);
    expect(candidates.effectiveTiles.toString()).toBe("1m,4m,7m");

    h.discard(new Tile(TYPE.M, 2));
    expect(sc.calc()).toBe(1);
  });
  test("裏牌を残したままブロックに分解する", () => {
    const h = new Hand("23456m11z______", true);
    const t = new Tile(TYPE.M, 1);
    h.draw(t);

    const bc = new BlockCalculator(h);
    const res = handsToString(bc.calc(t));
    expect(res).toStrictEqual([["11z", "t123m", "456m", "___", "___"]]);
  });
  test("雀頭が裏牌でも分解できる", () => {
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
