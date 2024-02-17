import { describe, test, expect } from "@jest/globals";
import { Controller, Wall, River } from "../controller";
import { Tile } from "../parser";
import { Hand } from "../calculator";
import { KIND, OPERATOR } from "../constants";
import { loadWallData } from "./utils/helper";
describe("controller", () => {
  test("existing tests", () => {
    const walls = loadWallData().map((l) => new Wall(l));
    for (let w of walls) {
      const c = new Controller(w, new River(), { initWind: "2w" });
      c.start();
    }
  });
});

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
    const got = c.doWin("1w", new Tile(KIND.S, 4), "2w");
    expect(got != 0).toBe(true);
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
