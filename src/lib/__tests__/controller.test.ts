import { ActorHand, createLocalGame, silentLogger } from "../controller";
import { Tile } from "../core";
import { TYPE, OP } from "../core/constants";
import { createScenario } from "./utils/controller";

// MockWall は台本にない部分（明示していない 3 人の配牌と、台本を使い切った後のツモ）を
// 本物の Wall に任せている。実行ごとに山が変わると失敗を再現できないので、
// createScenario が種つきの乱数を渡して山と席順を固定している。
//
// なお、稀にテストが落ちていた原因は乱数ではなく MockWall.addExclude の取りこぼし
// （台本で使う牌が他家の配牌に混ざり 5 枚目になる）だった。

describe("controller", () => {
  test("立直直後のロンは立直棒を消費しない/ダブルリーチ/一発のテスト", () => {
    // 1w は 1p 待ち。1z をツモ切りダブルリーチし、2w の立直宣言牌 1p をロンする。
    const { c, players } = createScenario({
      autoAdvance: true,
      wall: {
        hands: {
          "1z": "123m456m789m123s1p",
          "2z": "123m456m789m123s1z",
        },
        draws: ["1z", "1p"],
      },
    });
    const [mp1, mp2] = players;

    mp1.mDrawHandlers.unshift((e, p) => {
      if (e.choices.REACH) {
        e.choices.REACH = e.choices.REACH.filter((t) => t.tile == "1z");
        p.eventHandler.emit(e);
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

    c.actor.start();

    const sum = c.scoreManager.summary;
    expect([
      sum[c.placeManager.playerID("1z")],
      sum[c.placeManager.playerID("2z")],
    ]).toStrictEqual([25000 + 12000, 25000 - 12000]);
  });
  test("同順フリテン", () => {
    // p1　は 1z 待ちを想定する
    // p2 が 1z を捨てるのをロン可能であるかチェックし、スルーする
    // p3 が 1z を捨てるのをロンできないことをチェックする
    // p2 が 1z を捨てるのをロンできることをチェックし、ロンする
    // 点数と 2本場になることをチェック
    const { c, players } = createScenario({
      wall: {
        hands: { "1z": "123m456m789m123s1z" },
        draws: [
          "1p", // 1: 1z のツモ
          "1z", // 2: 2z のツモ → ツモ切り（1 回目は見逃す）
          "1z", // 3: 3z のツモ → ツモ切り（フリテンでロンできない）
          "5z", // 4: 4z のツモ
          "6z", // 5: 1z のツモ（上がらないように無関係な牌）
          "1z", // 6: 2z のツモ → ツモ切り → フリテンが解けてロンできる
        ],
      },
    });
    const [mp1] = players;

    c.actor.start();

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
    c.next(true); // p1 draw
    c.next(true); // p1 discard
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
    // p1 は 1-4s 待ちを想定する
    // p2 が 1s を 3w からポンする
    // p2 が 1s をカカンしたのをロンする
    const { c, wall, players } = createScenario({
      wall: {
        hands: {
          "1z": "123m456m789m23s11p",
          "2z": "123m456m11s",
          "3z": "567s",
          "4z": "7z",
        },
        draws: [
          "2z", // 1z のツモ
          "4z", // 2z のツモ
          "1s", // 3z のツモ → ツモ切り → 2z がポン
        ],
        // 1z の当たり牌が他家から出ると台本がずれるので、残りを場に出さない
        exclude: ["4s", "4s", "4s", "r5s"],
      },
    });
    const [mp1, mp2] = players;

    mp1.doChankan = true;

    mp2.mDiscardHandlers.push((e, p) => {
      if (e.choices.PON) p.eventHandler.emit(e);
      return !!e.choices.PON;
    });

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

    wall.injectNextDraw("1s");
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
    const { c } = createLocalGame({ logger: silentLogger });
    c.observer.hands["1z"] = new ActorHand("406m1345p333z111z");
    const got = c.doChi("1z", "4z", new Tile(TYPE.M, 7));
    expect(got.toString()).toBe("-7r56m");
  });
  test("can-chi/食い替え", () => {
    const { c } = createLocalGame({ logger: silentLogger });
    c.observer.hands["1z"] = new ActorHand("456m");
    const got = c.doChi("1z", "4z", new Tile(TYPE.M, 7));
    expect(got).toBe(false);
  });
  test("can-chi/食い替え", () => {
    const { c } = createLocalGame({ logger: silentLogger });
    c.observer.hands["1z"] = new ActorHand("333345666m");
    const got = c.doChi("1z", "4z", new Tile(TYPE.M, 6));
    expect(got).toBe(false);
  });
  test("can-chi/ペンチャン", () => {
    const { c } = createLocalGame({ logger: silentLogger });
    c.observer.hands["1z"] = new ActorHand("12m9p");
    const got = c.doChi("1z", "4z", new Tile(TYPE.M, 3));
    expect(got.toString()).toBe("-312m");
  });
  test("can-chi/赤牌を含む2パターン", () => {
    const { c } = createLocalGame({ logger: silentLogger });
    c.observer.hands["1z"] = new ActorHand("4r55m9p");
    const got = c.doChi("1z", "4z", new Tile(TYPE.M, 3));
    expect(got.toString()).toBe("-345m,-34r5m");
  });
  test("can-chi/赤牌を含む3パターン", () => {
    const { c } = createLocalGame({ logger: silentLogger });
    c.observer.hands["1z"] = new ActorHand("124r5m9p");
    const got = c.doChi("1z", "4z", new Tile(TYPE.M, 3));
    expect(got.toString()).toBe("-312m,-324m,-34r5m");
  });
  test("can-chi/赤牌を含む4パターン", () => {
    const { c } = createLocalGame({ logger: silentLogger });
    c.observer.hands["1z"] = new ActorHand("124r55m9p");
    const got = c.doChi("1z", "4z", new Tile(TYPE.M, 3));
    expect(got.toString()).toBe("-312m,-345m,-324m,-34r5m");
  });
  test("can-ron", () => {
    const { c } = createLocalGame({ logger: silentLogger });
    c.observer.hands["1z"] = new ActorHand("406m123456p1123s");
    const got = c.doWin("1z", new Tile(TYPE.S, 4), { discardedBy: "2z" });
    expect(!!got).toBe(true);
  });
  test("can-pon/下家から5mを鳴く。赤5含みの1パターンを返す", () => {
    const { c } = createLocalGame({ logger: silentLogger });
    c.observer.hands["1z"] = new ActorHand("50m333444z");
    const got = c.doPon("1z", "2z", new Tile(TYPE.M, 5));
    expect(got.toString()).toBe("r55-5m");
  });
  test("can-pon/下家から赤5を鳴く。1パターンを返す", () => {
    const { c } = createLocalGame({ logger: silentLogger });
    c.observer.hands["1z"] = new ActorHand("555m333444z");
    const got = c.doPon("1z", "2z", new Tile(TYPE.M, 5, [OP.RED]));
    expect(got.toString()).toBe("55-r5m");
  });
  test("can-pon/下家から赤5を鳴く。赤5を含む2パターンを返す", () => {
    const { c } = createLocalGame({ logger: silentLogger });
    c.observer.hands["1z"] = new ActorHand("505m333444z");
    const got = c.doPon("1z", "2z", new Tile(TYPE.M, 5));
    expect(got.toString()).toBe("r55-5m,55-5m");
  });
  test("can-pon/上家から鳴く", () => {
    const { c } = createLocalGame({ logger: silentLogger });
    c.observer.hands["1z"] = new ActorHand("433m");
    const got = c.doPon("1z", "4z", new Tile(TYPE.M, 3));
    expect(got.toString()).toBe("-333m");
  });
  test("can-pon/対面から鳴く", () => {
    const { c } = createLocalGame({ logger: silentLogger });
    c.observer.hands["1z"] = new ActorHand("433m");
    const got = c.doPon("1z", "3z", new Tile(TYPE.M, 3));
    expect(got.toString()).toBe("3-33m");
  });
  test("can-dai-kan/5m", () => {
    const { c } = createLocalGame({ logger: silentLogger });
    c.observer.hands["1z"] = new ActorHand("505m");
    const got = c.doDaiKan("1z", "4z", new Tile(TYPE.M, 5));
    expect(got.toString()).toBe("-5r555m");
  });
  test("can-dai-kan/r5m", () => {
    const { c } = createLocalGame({ logger: silentLogger });
    c.observer.hands["1z"] = new ActorHand("555m");
    const got = c.doDaiKan("1z", "2z", new Tile(TYPE.M, 5, [OP.RED]));
    expect(got.toString()).toBe("555-r5m");
  });
  test("ankan/r5m", () => {
    const { c } = createLocalGame({ logger: silentLogger });
    c.observer.hands["1z"] = new ActorHand("r5555m");
    const got = c.doAnKan("1z");
    expect(got.toString()).toBe("_r55m_");
  });
  test("shokan/r5m/牌は先頭に追加される", () => {
    const { c } = createLocalGame({ logger: silentLogger });
    c.observer.hands["1z"] = new ActorHand("r5m, 5-55m");
    const got = c.doShoKan("1z");
    expect(got.toString()).toBe("5-r5-55m");
  });
  test("shokan/5m/牌は先頭に追加される", () => {
    const { c } = createLocalGame({ logger: silentLogger });
    c.observer.hands["1z"] = new ActorHand("5m, 5-r55m");
    const got = c.doShoKan("1z");
    expect(got.toString()).toBe("5-5-r55m");
  });
});
