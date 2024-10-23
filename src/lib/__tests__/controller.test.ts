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
  test("立直直後のロンは立直棒を消費しない/ダブルリーチ/一発のテスト", () => {
    const { c, p1, p2 } = createLocalGame({
      debug: false,
      shuffle: false,
      playerInjection: {
        p1: MockPlayer,
        p2: MockPlayer,
        p3: MockPlayer,
        p4: MockPlayer,
      },
    });
    const mp1 = p1 as MockPlayer;
    const mp2 = p2 as MockPlayer;

    mp1.mDrawHandlers.unshift((e: ChoiceAfterDrawnEvent) => {
      if (e.choices.REACH) {
        e.choices.REACH = e.choices.REACH.filter((t) => t.tile == "1z");
        mp1.eventHandler.emit(e);
      }
      return !!e.choices.REACH;
    });
    mp1.doReachRon = true;
    mp2.mDrawHandlers.unshift((e, p) => {
      if (e.choices.REACH) {
        e.choices.REACH = e.choices.REACH.filter((t) => t.tile == "1p");
        p.eventHandler.emit(e);
      }
      return !!e.choices.REACH;
    });

    // 1w は 1p 待ちを想定する
    // 1w が 1z をツモ切りダブルリーチをする
    // 2w が 1p をつも切りリーチをする
    // それをロンする
    const wall = new MockWall();
    wall.setInitialHand("1w", "123m456m789m123s1p");
    wall.pushTile("1z");
    wall.setInitialHand("2w", "123m456m789m123s1z");
    wall.pushTile("1p");

    c.wall = wall;
    c.actor.start();

    const sum = c.scoreManager.summary;
    expect([
      sum[c.placeManager.playerID("1w")],
      sum[c.placeManager.playerID("2w")],
    ]).toStrictEqual([25000 + 12000, 25000 - 12000]);
  });
  test("同順フリテン", () => {
    const { c, p1 } = createLocalGame({
      debug: true,
      shuffle: false,
      playerInjection: {
        p1: MockPlayer,
        p2: MockPlayer,
        p3: MockPlayer,
        p4: MockPlayer,
      },
    });

    // p1　は 1z 待ちを想定する
    // p2 が 1z を捨てるのをロン可能であるかチェックし、スルーする
    // p3 が 1z を捨てるのをロンできないことをチェックする
    // p2 が 1z を捨てるのをロンできることをチェックし、ロンする
    // 点数と 2本場になることをチェック
    const wall = new MockWall();
    wall.addExclude("1z");
    wall.setInitialHand("1w", "123m456m789m123s1z");
    wall.pushTile("1p");
    wall.setInitialHand("2w", "2p");
    wall.pushTile("1z");
    wall.setInitialHand("3w", "7z");
    wall.pushTile("1z");

    c.wall = wall;
    c.actor.start();

    const mp1 = p1 as MockPlayer;

    c.next(true);
    c.next(true);
    c.next(true);
    // p2 の捨て牌はロンできる
    mp1.mDiscardHandlers.unshift((e, p) => {
      console.debug("check can ron");
      expect(!!e.choices.RON).toBe(true);
      return false;
    });
    c.next(true);
    c.next(true);
    // p3 の捨て牌はロンできない
    mp1.mDiscardHandlers.shift(); // remove pre check
    mp1.mDiscardHandlers.unshift((e, p) => {
      console.debug("check cannot ron");
      expect(!!e.choices.RON).toBe(false);
      return false;
    });
    c.next(true);
    c.next(true);
    mp1.mDiscardHandlers.shift(); // remove pre check
    c.next(true);
    wall.pushTile("6z"); // p1 が上がらないように dummy をセット
    c.next(true); // p1 draw
    c.next(true); // p1 discard
    wall.pushTile("1z"); // ロン牌をセット
    c.next(true);
    // フリテンが解消されロンできる
    mp1.mDiscardHandlers.unshift((e, p) => {
      console.debug("check can ron");
      expect(!!e.choices.RON).toBe(true);
      p.eventHandler.emit(e); // ロンする
      return true;
    });
    c.next(true);
    c.next(true);

    const sum = c.scoreManager.summary;
    expect([
      sum[c.placeManager.playerID("1w")],
      sum[c.placeManager.playerID("2w")],
    ]).toStrictEqual([25000 + 3900, 25000 - 3900]);

    const sticks = c.placeManager.sticks;
    expect(sticks).toStrictEqual({ reach: 0, dead: 1 });
  });
  test("チャンカン", () => {
    const { c, p1, p2 } = createLocalGame({
      debug: true,
      shuffle: false,
      playerInjection: {
        p1: MockPlayer,
        p2: MockPlayer,
        p3: MockPlayer,
        p4: MockPlayer,
      },
    });

    // p1 は 1-4s 待ちを想定する
    // p2 が 1s を 3w からポンする
    // p2 が 1s をカカンしたのをロンする
    const wall = new MockWall();
    wall.addExclude("1s", "4s");
    wall.setInitialHand("1w", "123m456m789m23s11p");
    wall.pushTile("2z");
    wall.setInitialHand("2w", "123m456m11s");
    wall.pushTile("4z");
    wall.setInitialHand("3w", "567s");
    wall.pushTile("1s");
    wall.setInitialHand("4w", "7z");

    const mp1 = p1 as MockPlayer;
    mp1.doChankan = true;

    const mp2 = p2 as MockPlayer;
    mp2.mDiscardHandlers.push((e, p) => {
      if (e.choices.PON) p.eventHandler.emit(e);
      return !!e.choices.PON;
    });

    c.wall = wall;
    c.actor.start();

    c.next(true);
    c.next(true);
    c.next(true);
    c.next(true);
    c.next(true);
    c.next(true);
    c.next(true); // pon
    c.next(true);
    c.next(true);
    c.next(true);
    c.next(true);
    c.next(true);
    c.next(true);
    c.next(true);

    wall.pushTile("1s");
    mp2.mDrawHandlers.push((e, p) => {
      expect(!!e.choices.SHO_KAN).toBe(true);
      p.eventHandler.emit(e);
      return true;
    });

    c.next(true); // p2 draw
    c.next(true); // kan

    const sum = c.scoreManager.summary;
    expect([
      sum[c.placeManager.playerID("1w")],
      sum[c.placeManager.playerID("2w")],
    ]).toStrictEqual([25000 + 11600, 25000 - 11600]);
  });
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
  mDiscardHandlers: ((
    e: ChoiceAfterDiscardedEvent,
    p: MockPlayer
  ) => boolean)[] = [];
  mDrawHandlers: ((e: ChoiceAfterDrawnEvent, p: MockPlayer) => boolean)[] = [];
  mCalledHandlers: ((e: ChoiceAfterCalled, p: MockPlayer) => boolean)[] = [];
  doReachRon = false;
  doChankan = false;
  constructor(playerID: string, eventHandler: EventHandler) {
    super(playerID, eventHandler);
  }
  override handleEvent(e: PlayerEvent): void {
    switch (e.type) {
      case "CHOICE_AFTER_DISCARDED":
        for (let h of this.mDiscardHandlers) if (h(e, this)) return;

        // デフォルトは何もしない
        e.choices.CHI = false;
        e.choices.DAI_KAN = false;
        e.choices.PON = false;
        e.choices.RON = false;
        this.eventHandler.emit(e);
        break;
      case "CHOICE_AFTER_CALLED":
        for (let h of this.mCalledHandlers) if (h(e, this)) return;

        // デフォルトは適当に捨てる
        this.eventHandler.emit(e);
        break;
      case "CHOICE_AFTER_DRAWN":
        for (let h of this.mDrawHandlers) if (h(e, this)) return;

        // デフォルトはツモ切り
        e.choices.AN_KAN = false;
        e.choices.DRAWN_GAME_BY_NINE_ORPHANS = false;
        e.choices.SHO_KAN = false;
        e.choices.TSUMO = false;
        e.choices.REACH = false;
        assert(e.choices.DISCARD);
        const tsumo = e.choices.DISCARD.filter((t) =>
          Tile.from(t).has(OPERATOR.TSUMO)
        );
        e.choices.DISCARD = tsumo;
        this.eventHandler.emit(e);
        break;
      case "CHOICE_FOR_REACH_ACCEPTANCE":
        if (!this.doReachRon) e.choices.RON = false;
        this.eventHandler.emit(e);
        break;
      case "CHOICE_FOR_CHAN_KAN":
        if (!this.doChankan) e.choices.RON = false;
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
  exclude: string[] = [];
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

  addExclude(...tiles: string[]) {
    this.exclude.push(...tiles);
  }

  override draw() {
    const t = this.wall.shift();
    if (t == null) {
      const d = this.oWall.draw();
      // TODO
      if (this.exclude.includes(d.toString())) return this.oWall.draw();
      return d;
    }
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
