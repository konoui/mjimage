import { ActorHand, createLocalGame, Wall } from "../controller";
import { Tile } from "../core/parser";
import { TYPE, OPERATOR, WIND } from "../core/constants";
import { createWindMap, Wind } from "../core";
describe("controller", () => {
  test("立直直後のロン", () => {
    const c = createLocalGame({ debug: false });
    const wall = new MockWall();
    c.wall = wall;
    wall.setInitialHand("1w", "123m456m789m123s1p");
    wall.setNextTile("1z");
    wall.setInitialHand("2w", "1z");
    wall.setNextTile("2p");
    c.actor.start();
    const sum = c.scoreManager.summary;
    expect([
      sum[c.placeManager.playerID("1w")],
      sum[c.placeManager.playerID("2w")],
    ]).toStrictEqual([25000 + 12000, 25000 - 12000]);
  });
  test("同順フリテン", () => {});
  test("立直後フリテン", () => {});
  test("食い替え", () => {});
});

describe("callable", () => {
  test("can-chi", () => {
    const c = createLocalGame();
    c.observer.hands["1w"] = new ActorHand("406m1345p333z111z");
    const got = c.doChi("1w", "4w", new Tile(TYPE.M, 7));
    expect(got.toString()).toBe("-7r56m");
  });
  test("can-chi", () => {
    const c = createLocalGame();
    c.observer.hands["1w"] = new ActorHand("56m");
    const got = c.doChi("1w", "4w", new Tile(TYPE.M, 7));
    expect(got).toBe(false);
  });
  test("can-chi", () => {
    const c = createLocalGame();
    c.observer.hands["1w"] = new ActorHand("333345666m");
    const got = c.doChi("1w", "4w", new Tile(TYPE.M, 6));
    expect(got).toBe(false);
  });
  test("can-ron", () => {
    const c = createLocalGame();
    c.observer.hands["1w"] = new ActorHand("406m123456p1123s");
    const got = c.doWin("1w", new Tile(TYPE.S, 4), { whoDiscarded: "2w" });
    expect(!!got).toBe(true);
  });
  test("can-pon", () => {
    const c = createLocalGame();
    c.observer.hands["1w"] = new ActorHand("50m333444z");
    const got = c.doPon("1w", "2w", new Tile(TYPE.M, 5));
    expect(got.toString()).toBe("r55-5m");
  });
  test("can-pon", () => {
    const c = createLocalGame();
    c.observer.hands["1w"] = new ActorHand("505m333444z");
    const got = c.doPon("1w", "2w", new Tile(TYPE.M, 5));
    expect(got.toString()).toBe("r55-5m,55-5m");
  });
  test("can-pon", () => {
    const c = createLocalGame();
    c.observer.hands["1w"] = new ActorHand("433m");
    const got = c.doPon("1w", "4w", new Tile(TYPE.M, 3));
    expect(got.toString()).toBe("-333m");
  });
  test("can-pon", () => {
    const c = createLocalGame();
    c.observer.hands["1w"] = new ActorHand("433m");
    const got = c.doPon("1w", "3w", new Tile(TYPE.M, 3));
    expect(got.toString()).toBe("3-33m");
  });
  test("can-dai-kan", () => {
    const c = createLocalGame();
    c.observer.hands["1w"] = new ActorHand("505m");
    const got = c.doDaiKan("1w", "4w", new Tile(TYPE.M, 5));
    expect(got.toString()).toBe("-5r555m");
  });
  test("can-dai-kan", () => {
    const c = createLocalGame();
    c.observer.hands["1w"] = new ActorHand("555m");
    const got = c.doDaiKan("1w", "2w", new Tile(TYPE.M, 5, [OPERATOR.RED]));
    expect(got.toString()).toBe("555-r5m");
  });
});

class MockWall extends Wall {
  private initial = createWindMap("");
  wall: string[] = [];
  oWall = new Wall();
  constructor() {
    super();
  }
  setInitialHand(w: Wind, v: string) {
    this.initial[w] = v;
  }
  setNextTile(t: string) {
    this.wall.push(t);
  }
  get doraMarkers() {
    return [new Tile(TYPE.Z, 8)];
  }
  override draw() {
    const t = this.wall.shift();
    if (t == null) return this.oWall.draw();
    return Tile.from(t);
  }
  override initialHands(): {
    "1w": string;
    "2w": string;
    "3w": string;
    "4w": string;
  } {
    const i = this.oWall.initialHands();
    for (let w of Object.values(WIND)) {
      if (this.initial[w] != "") i[w] = this.initial[w];
    }
    return i;
  }
}
