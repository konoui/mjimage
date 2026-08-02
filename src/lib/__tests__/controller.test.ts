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
import { Parser, Tile, createWindMap, Wind } from "../core";
import { TYPE, OP, WIND } from "../core/constants";

// MockWall は台本にない部分（明示していない 3 人の配牌と、台本を使い切った後のツモ）を
// 本物の Wall に任せており、そこは Math.random でシャッフルされる。
// 実行ごとに山が変わると、失敗したときに再現できない。ここで乱数を固定しておく。
//
// なお、稀にテストが落ちていた原因は乱数そのものではなく MockWall.addExclude の取りこぼし
// （台本で使う牌が他家の配牌に混ざり 5 枚目になる）で、そちらは下で直してある。
beforeEach(() => {
  let seed = 20260801;
  vi.spyOn(Math, "random").mockImplementation(() => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

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
    wall.setInitialHand("1z", "123m456m789m123s1p");
    wall.pushTile("1z");
    wall.setInitialHand("2z", "123m456m789m123s1z");
    wall.pushTile("1p");

    c.wall = wall;
    c.actor.start();

    const sum = c.scoreManager.summary;
    expect([
      sum[c.placeManager.playerID("1z")],
      sum[c.placeManager.playerID("2z")],
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
    wall.setInitialHand("1z", "123m456m789m123s1z");
    wall.pushTile("1p");
    wall.setInitialHand("2z", "2p");
    wall.pushTile("1z");
    wall.setInitialHand("3z", "7z");
    wall.pushTile("1z");

    c.wall = wall;
    c.actor.start();

    const mp1 = p1 as MockPlayer;

    c.next(true);
    c.next(true);
    c.next(true);
    // p2 の捨て牌はロンできる
    mp1.mDiscardHandlers.unshift((e) => {
      console.debug("check can ron");
      expect(!!e.choices.RON).toBe(true);
      return false;
    });
    c.next(true);
    c.next(true);
    // p3 の捨て牌はロンできない
    mp1.mDiscardHandlers.shift(); // remove pre check
    mp1.mDiscardHandlers.unshift((e) => {
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
      sum[c.placeManager.playerID("1z")],
      sum[c.placeManager.playerID("2z")],
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
    wall.setInitialHand("1z", "123m456m789m23s11p");
    wall.pushTile("2z");
    wall.setInitialHand("2z", "123m456m11s");
    wall.pushTile("4z");
    wall.setInitialHand("3z", "567s");
    wall.pushTile("1s");
    wall.setInitialHand("4z", "7z");

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
      sum[c.placeManager.playerID("1z")],
      sum[c.placeManager.playerID("2z")],
    ]).toStrictEqual([25000 + 11600, 25000 - 11600]);
  });
  test("リーチ後、自分が捨てた牌でロンできない", () => {});
});

describe("callable", () => {
  test("can-chi", () => {
    const { c } = createLocalGame();
    c.observer.hands["1z"] = new ActorHand("406m1345p333z111z");
    const got = c.doChi("1z", "4z", new Tile(TYPE.M, 7));
    expect(got.toString()).toBe("-7r56m");
  });
  test("can-chi/食い替え", () => {
    const { c } = createLocalGame();
    c.observer.hands["1z"] = new ActorHand("456m");
    const got = c.doChi("1z", "4z", new Tile(TYPE.M, 7));
    expect(got).toBe(false);
  });
  test("can-chi/食い替え", () => {
    const { c } = createLocalGame();
    c.observer.hands["1z"] = new ActorHand("333345666m");
    const got = c.doChi("1z", "4z", new Tile(TYPE.M, 6));
    expect(got).toBe(false);
  });
  test("can-chi/ペンチャン", () => {
    const { c } = createLocalGame();
    c.observer.hands["1z"] = new ActorHand("12m9p");
    const got = c.doChi("1z", "4z", new Tile(TYPE.M, 3));
    expect(got.toString()).toBe("-312m");
  });
  test("can-chi/赤牌を含む2パターン", () => {
    const { c } = createLocalGame();
    c.observer.hands["1z"] = new ActorHand("4r55m9p");
    const got = c.doChi("1z", "4z", new Tile(TYPE.M, 3));
    expect(got.toString()).toBe("-345m,-34r5m");
  });
  test("can-chi/赤牌を含む3パターン", () => {
    const { c } = createLocalGame();
    c.observer.hands["1z"] = new ActorHand("124r5m9p");
    const got = c.doChi("1z", "4z", new Tile(TYPE.M, 3));
    expect(got.toString()).toBe("-312m,-324m,-34r5m");
  });
  test("can-chi/赤牌を含む4パターン", () => {
    const { c } = createLocalGame();
    c.observer.hands["1z"] = new ActorHand("124r55m9p");
    const got = c.doChi("1z", "4z", new Tile(TYPE.M, 3));
    expect(got.toString()).toBe("-312m,-345m,-324m,-34r5m");
  });
  test("can-ron", () => {
    const { c } = createLocalGame();
    c.observer.hands["1z"] = new ActorHand("406m123456p1123s");
    const got = c.doWin("1z", new Tile(TYPE.S, 4), { discardedBy: "2z" });
    expect(!!got).toBe(true);
  });
  test("can-pon/下家から5mを鳴く。赤5含みの1パターンを返す", () => {
    const { c } = createLocalGame();
    c.observer.hands["1z"] = new ActorHand("50m333444z");
    const got = c.doPon("1z", "2z", new Tile(TYPE.M, 5));
    expect(got.toString()).toBe("r55-5m");
  });
  test("can-pon/下家から赤5を鳴く。1パターンを返す", () => {
    const { c } = createLocalGame();
    c.observer.hands["1z"] = new ActorHand("555m333444z");
    const got = c.doPon("1z", "2z", new Tile(TYPE.M, 5, [OP.RED]));
    expect(got.toString()).toBe("55-r5m");
  });
  test("can-pon/下家から赤5を鳴く。赤5を含む2パターンを返す", () => {
    const { c } = createLocalGame();
    c.observer.hands["1z"] = new ActorHand("505m333444z");
    const got = c.doPon("1z", "2z", new Tile(TYPE.M, 5));
    expect(got.toString()).toBe("r55-5m,55-5m");
  });
  test("can-pon/上家から鳴く", () => {
    const { c } = createLocalGame();
    c.observer.hands["1z"] = new ActorHand("433m");
    const got = c.doPon("1z", "4z", new Tile(TYPE.M, 3));
    expect(got.toString()).toBe("-333m");
  });
  test("can-pon/対面から鳴く", () => {
    const { c } = createLocalGame();
    c.observer.hands["1z"] = new ActorHand("433m");
    const got = c.doPon("1z", "3z", new Tile(TYPE.M, 3));
    expect(got.toString()).toBe("3-33m");
  });
  test("can-dai-kan/5m", () => {
    const { c } = createLocalGame();
    c.observer.hands["1z"] = new ActorHand("505m");
    const got = c.doDaiKan("1z", "4z", new Tile(TYPE.M, 5));
    expect(got.toString()).toBe("-5r555m");
  });
  test("can-dai-kan/r5m", () => {
    const { c } = createLocalGame();
    c.observer.hands["1z"] = new ActorHand("555m");
    const got = c.doDaiKan("1z", "2z", new Tile(TYPE.M, 5, [OP.RED]));
    expect(got.toString()).toBe("555-r5m");
  });
  test("ankan/r5m", () => {
    const { c } = createLocalGame();
    c.observer.hands["1z"] = new ActorHand("r5555m");
    const got = c.doAnKan("1z");
    expect(got.toString()).toBe("_r55m_");
  });
  test("shokan/r5m/牌は先頭に追加される", () => {
    const { c } = createLocalGame();
    c.observer.hands["1z"] = new ActorHand("r5m, 5-55m");
    const got = c.doShoKan("1z");
    expect(got.toString()).toBe("5-r5-55m");
  });
  test("shokan/5m/牌は先頭に追加される", () => {
    const { c } = createLocalGame();
    c.observer.hands["1z"] = new ActorHand("5m, 5-r55m");
    const got = c.doShoKan("1z");
    expect(got.toString()).toBe("5-5-r55m");
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
        e.choices.DRAWN_GAME_BY_NINE_TERMINALS = false;
        e.choices.SHO_KAN = false;
        e.choices.TSUMO = false;
        e.choices.REACH = false;
        assert(e.choices.DISCARD);
        const tsumo = e.choices.DISCARD.filter((t) =>
          Tile.from(t).has(OP.TSUMO)
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
  private initial = createWindMap(() => "");
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
  // 点数を固定したいのでドラが誰にも乗らない表示牌を使う。
  // 中(7z) の次は白(5z) で、どのテストの和了手牌にも含まれない。
  // 以前は存在しない 8z をダミーにしていたが、牌の値域検証で弾かれるようになった。
  get doraIndicators(): Tile[] {
    return [new Tile(TYPE.Z, 7)];
  }
  get hiddenDoraIndicators() {
    return this.doraIndicators;
  }

  /**
   * 台本で使う牌を、山からも他家の配牌からも取り除く。
   * 除外しないと、台本で足した分と合わせて 5 枚目になり
   * `[counter] tile ... appears more than 4 times` で落ちる。
   */
  addExclude(...tiles: readonly string[]) {
    this.exclude.push(...tiles);
  }

  /** 除外した牌を避けて本物の山から 1 枚引く。 */
  private drawUnexcluded(): Tile {
    // 同じ牌は高々 4 枚なので、除外牌の 4 倍も引けば必ず別の牌に当たる。
    for (let i = 0; i < this.exclude.length * 4 + 1; i++) {
      const d = this.oWall.draw();
      if (!this.exclude.includes(d.toString())) return d;
    }
    throw new Error(`could not draw a tile outside: ${this.exclude}`);
  }

  /** 配牌から除外牌を取り除き、別の牌で埋め直す。 */
  private withoutExcluded(hand: string): string {
    if (this.exclude.length == 0) return hand;
    return new Parser(hand)
      .tiles()
      .map((t) => (this.exclude.includes(t.toString()) ? this.drawUnexcluded() : t))
      .join("");
  }

  override draw() {
    const t = this.wall.shift();
    // 台本を使い切ったら本物の山から引く
    if (t == null) return this.drawUnexcluded();
    return Tile.from(t);
  }
  override initialHands(): { readonly [key in Wind]: string } {
    const i = this.oWall.initialHands();
    for (let w of Object.values(WIND)) {
      // 明示していない家の配牌は本物の山任せなので、除外牌だけ入れ替える
      i[w] = this.initial[w] != "" ? this.initial[w] : this.withoutExcluded(i[w]);
    }
    return i;
  }
}
