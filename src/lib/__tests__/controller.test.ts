import { describe, test, expect } from "@jest/globals";
import { Controller, Wall, River } from "../controller";
import { Tile } from "../parser";
import { Hand } from "../calculator";
import { KIND } from "../constants";
describe("controller", () => {
  test("controller-start", () => {
    const c = new Controller(new Wall(), new River());
    c.start();
  });
});

describe("callable", () => {
  test("can-chi", () => {
    const c = new Controller(new Wall(), new River());
    c.player("1w").hand = new Hand("406m1345p333z111z");
    const got = c.doChi("1w", "4w", new Tile(KIND.M, 7));
    expect(got.toString()).toBe("-706m");
  });
});
