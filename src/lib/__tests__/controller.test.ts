import { describe, test, expect } from "@jest/globals";
import { Wall, River, Controller, WallProps } from "../controller";
import { Tile, blockWrapper } from "../parser";
import { Hand } from "../calculator";
import { KIND, OPERATOR } from "../constants";
import { loadInputData, loadArrayData } from "./utils/helper";
import { Replayer } from "../controller/replay";
// describe("controller", () => {
//   test("existing tests", () => {
//     const games = loadArrayData("games.json");
//     for (let game of games) {
//       const r = new Replayer(game);
//       r.auto();
//     }
//   });
// });

describe("callable", () => {
  test("can-chi", () => {
    const c = new Controller(new Wall(), new River());
    c.player("1w").hand = new Hand("406m1345p333z111z");
    const got = c.doChi("1w", "4w", new Tile(KIND.M, 7));
    expect(got.toString()).toBe("-706m");
  });
  test("can-ron", () => {
    const c = new Controller(new Wall(), new River());
    c.player("1w").hand = new Hand("406m123456p1123s");
    const got = c.doWin("1w", new Tile(KIND.S, 4), { whoDiscarded: "2w" });
    expect(got != 0).toBe(true);
  });
  test("can-pon", () => {
    const c = new Controller(new Wall(), new River());
    c.player("1w").hand = new Hand("50m333444z");
    const got = c.doPon("1w", "2w", new Tile(KIND.M, 5));
    expect(got.toString()).toBe("50-5m");
  });
  test("can-pon", () => {
    const c = new Controller(new Wall(), new River());
    c.player("1w").hand = new Hand("505m333444z");
    const got = c.doPon("1w", "2w", new Tile(KIND.M, 5));
    expect(got.toString()).toBe("50-5m,55-5m");
  });
  test("can-dai-kan", () => {
    const c = new Controller(new Wall(), new River());
    c.player("1w").hand = new Hand("505m");
    const got = c.doDaiKan("1w", "4w", new Tile(KIND.M, 5));
    expect(got.toString()).toBe("-5055m");
  });
  test("can-dai-kan", () => {
    const c = new Controller(new Wall(), new River());
    c.player("1w").hand = new Hand("555m");
    const got = c.doDaiKan("1w", "2w", new Tile(KIND.M, 0));
    expect(got.toString()).toBe("555-0m");
  });
});
