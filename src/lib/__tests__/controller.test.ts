import {
  ActorHand,
  createLocalGame,
  Wall,
  Player,
  PlayerEvent,
  EventHandler,
  ChoiceAfterDiscardedEvent,
  ChoiceAfterDrawnEvent,
  ChoiceAfterCalled,
} from "../controller";
import { Tile } from "../core/parser";
import { TYPE, OPERATOR, WIND } from "../core/constants";
import { createWindMap, Wind } from "../core";
describe("controller", () => {
  test("立直直後のロンは立直棒を消費しない", () => {
    const { c } = createLocalGame({ debug: false, shuffle: false });
    const wall = new MockWall();
    c.wall = wall;
    wall.setInitialHand("1w", "123m456m789m123s1p");
    wall.pushTile("1z");
    wall.setInitialHand("2w", "1z");
    wall.pushTile("2p");
    c.actor.start();
    const sum = c.scoreManager.summary;
    expect([
      sum[c.placeManager.playerID("1w")],
      sum[c.placeManager.playerID("2w")],
    ]).toStrictEqual([25000 + 12000, 25000 - 12000]);
  });
  test("同順フリテン", () => {});
  test("立直後フリテン", () => {});
});

describe("callable", () => {
  test("can-chi", () => {
    const { c } = createLocalGame();
    c.observer.hands["1w"] = new ActorHand("406m1345p333z111z");
    const got = c.doChi("1w", "4w", new Tile(TYPE.M, 7));
    expect(got.toString()).toBe("-7r56m");
  });
  test("can-chi/食い替え", () => {
    const { c } = createLocalGame();
    c.observer.hands["1w"] = new ActorHand("56m");
    const got = c.doChi("1w", "4w", new Tile(TYPE.M, 7));
    expect(got).toBe(false);
  });
  test("can-chi/食い替え", () => {
    const { c } = createLocalGame();
    c.observer.hands["1w"] = new ActorHand("333345666m");
    const got = c.doChi("1w", "4w", new Tile(TYPE.M, 6));
    expect(got).toBe(false);
  });
  test("can-ron", () => {
    const { c } = createLocalGame();
    c.observer.hands["1w"] = new ActorHand("406m123456p1123s");
    const got = c.doWin("1w", new Tile(TYPE.S, 4), { whoDiscarded: "2w" });
    expect(!!got).toBe(true);
  });
  test("can-pon", () => {
    const { c } = createLocalGame();
    c.observer.hands["1w"] = new ActorHand("50m333444z");
    const got = c.doPon("1w", "2w", new Tile(TYPE.M, 5));
    expect(got.toString()).toBe("r55-5m");
  });
  test("can-pon", () => {
    const { c } = createLocalGame();
    c.observer.hands["1w"] = new ActorHand("505m333444z");
    const got = c.doPon("1w", "2w", new Tile(TYPE.M, 5));
    expect(got.toString()).toBe("r55-5m,55-5m");
  });
  test("can-pon", () => {
    const { c } = createLocalGame();
    c.observer.hands["1w"] = new ActorHand("433m");
    const got = c.doPon("1w", "4w", new Tile(TYPE.M, 3));
    expect(got.toString()).toBe("-333m");
  });
  test("can-pon", () => {
    const { c } = createLocalGame();
    c.observer.hands["1w"] = new ActorHand("433m");
    const got = c.doPon("1w", "3w", new Tile(TYPE.M, 3));
    expect(got.toString()).toBe("3-33m");
  });
  test("can-dai-kan", () => {
    const { c } = createLocalGame();
    c.observer.hands["1w"] = new ActorHand("505m");
    const got = c.doDaiKan("1w", "4w", new Tile(TYPE.M, 5));
    expect(got.toString()).toBe("-5r555m");
  });
  test("can-dai-kan", () => {
    const { c } = createLocalGame();
    c.observer.hands["1w"] = new ActorHand("555m");
    const got = c.doDaiKan("1w", "2w", new Tile(TYPE.M, 5, [OPERATOR.RED]));
    expect(got.toString()).toBe("555-r5m");
  });
});

class MockPlayer extends Player {
  mHandleDiscard = (e: ChoiceAfterDiscardedEvent) => {};
  mHandleDraw = (e: ChoiceAfterDrawnEvent) => {};
  mHandleCalled = (e: ChoiceAfterCalled) => {};
  constructor(playerID: string, eventHandler: EventHandler) {
    super(playerID, eventHandler);
    this.mHandleDiscard = (e: ChoiceAfterDiscardedEvent) => {
      this.eventHandler.emit(e);
    };
    this.mHandleDraw = (e: ChoiceAfterDrawnEvent) => {
      assert(e.choices.DISCARD);
      const tsumo = e.choices.DISCARD.filter((t) =>
        Tile.from(t).has(OPERATOR.TSUMO)
      );
      e.choices.DISCARD = tsumo;
      this.eventHandler.emit(e);
    };
    this.mHandleCalled = (e: ChoiceAfterCalled) => {
      this.eventHandler.emit(e);
    };
  }
  override handleEvent(e: PlayerEvent): void {
    switch (e.type) {
      case "CHOICE_AFTER_DISCARDED":
        this.mHandleDiscard(e);
        break;
      case "CHOICE_AFTER_CALLED":
        this.mHandleCalled(e);
        break;
      case "CHOICE_AFTER_DRAWN":
        this.mHandleDraw(e);
        break;
      case "CHOICE_FOR_REACH_ACCEPTANCE":
        this.eventHandler.emit(e);
        break;
      case "CHOICE_FOR_CHAN_KAN":
        this.eventHandler.emit(e);
        break;
      default:
        super.handleEvent(e);
    }
  }
}

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
  pushTile(t: string) {
    this.wall.push(t);
  }
  get doraMarkers() {
    return [new Tile(TYPE.Z, 8)];
  }
  get blindDoraMarkers() {
    return this.doraMarkers;
  }
  override draw() {
    const t = this.wall.shift();
    if (t == null) return this.oWall.draw();
    return Tile.from(t);
  }
  override initialHands(): { [key in Wind]: string } {
    const i = this.oWall.initialHands();
    for (let w of Object.values(WIND)) {
      if (this.initial[w] != "") i[w] = this.initial[w];
    }
    return i;
  }
}
