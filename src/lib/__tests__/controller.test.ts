import { describe, test, expect } from "@jest/globals";
import { createLocalGame } from "../controller";
import { Tile } from "../parser";
import { Hand } from "../calculator";
import { KIND, OPERATOR } from "../constants";
describe("controller", () => {
  test("push-back-reach-stick", () => {
    // const c = createLocalGame({ debug: true });
    // c.actor.start();
    // console.log(c.actor.getSnapshot().status);
    // c.next(true);
    // c.observer.hands["1w"] = new Hand("123m456m789m123s1p");
    // c.observer.hands["2w"] = new Hand("123m456m789m123s2p");
    // c.next(true);
  });
  test("同順フリテン", () => {});
  test("立直後フリテン", () => {});
  test("食い替え", () => {});
});

describe("callable", () => {
  test("can-chi", () => {
    const c = createLocalGame();
    c.observer.hands["1w"] = new Hand("406m1345p333z111z");
    const got = c.doChi("1w", "4w", new Tile(KIND.M, 7));
    expect(got.toString()).toBe("-706m");
  });
  test("can-ron", () => {
    const c = createLocalGame();
    c.observer.hands["1w"] = new Hand("406m123456p1123s");
    const got = c.doWin("1w", new Tile(KIND.S, 4), { whoDiscarded: "2w" });
    expect(!!got).toBe(true);
  });
  test("can-pon", () => {
    const c = createLocalGame();
    c.observer.hands["1w"] = new Hand("50m333444z");
    const got = c.doPon("1w", "2w", new Tile(KIND.M, 5));
    expect(got.toString()).toBe("50-5m");
  });
  test("can-pon", () => {
    const c = createLocalGame();
    c.observer.hands["1w"] = new Hand("505m333444z");
    const got = c.doPon("1w", "2w", new Tile(KIND.M, 5));
    expect(got.toString()).toBe("50-5m,55-5m");
  });
  test("can-dai-kan", () => {
    const c = createLocalGame();
    c.observer.hands["1w"] = new Hand("505m");
    const got = c.doDaiKan("1w", "4w", new Tile(KIND.M, 5));
    expect(got.toString()).toBe("-5055m");
  });
  test("can-dai-kan", () => {
    const c = createLocalGame();
    c.observer.hands["1w"] = new Hand("555m");
    const got = c.doDaiKan("1w", "2w", new Tile(KIND.M, 0));
    expect(got.toString()).toBe("555-0m");
  });
});
