import {
  ChoiceAfterDrawnEvent,
  Logger,
  createLocalGame,
  createSeededRand,
  silentLogger,
} from "../controller";
import { SerializedWinResult, toDora } from "../calculator";
import { PlayerEvent } from "../controller";
import { assert } from "../assert";
import { Tile } from "../core";
import { OP, ROUND, TYPE, WIND } from "../core/constants";
import {
  createScenario,
  MockPlayer,
  recordEvents,
  startNextRound,
  stepUntil,
} from "./utils/controller";
import { HARMLESS_DORA, ScriptedWall } from "./utils/wall";

// 状態機械を通した多手数のシナリオで固定する回帰テスト。
// controller-unit.test.ts が各モジュールを単体で見るのに対し、
// こちらは「カンドラ」「フリテン」「和了の検証」のように
// 対局を進めないと現れない性質を扱う。
//
// 各シナリオは 2 つのテストに分けてある。
//   1. シナリオが目的の局面に到達したことを確かめるテスト（台本の見張り）
//   2. その局面で controller がどう振る舞うべきかを確かめるテスト
// 台本が壊れると 2 は別の場所で落ちて理由が分からなくなるので、1 を対で置く。
//
// 台本にない部分（明示していない配牌と、台本を使い切った後のツモ）は本物の Wall に任せる。
// 実行ごとに山が変わると失敗を再現できないので、createScenario が種つきの乱数を渡して
// 山と席順を固定している。台本で使う牌が他家の配牌に混ざると 5 枚目になって落ちるため、
// 場に出したくない牌は wall.exclude で王牌に沈めること。

/**
 * 暗槓のシナリオ。
 * 1z（東家）が 111m を持って 1m を引き、暗槓する。
 */
const anKanScenario = () => {
  const s = createScenario({
    wall: {
      hands: { "1z": "111m456m789m12p33s" },
      draws: ["1m"], // 1z の第一ツモ
    },
  });
  const { c } = s;
  const [mp1] = s.players;
  const events = recordEvents(c);

  mp1.mDrawHandlers.push((e, p) => {
    if (!e.choices.AN_KAN) return false;
    e.choices.TSUMO = false;
    e.choices.REACH = false;
    e.choices.SHO_KAN = false;
    e.choices.DRAWN_GAME_BY_NINE_TERMINALS = false;
    p.eventHandler.emit(e);
    return true;
  });

  c.actor.start();
  stepUntil(c, () => c.hand(WIND.E).called.length > 0);
  return { ...s, events: events };
};

/**
 * 加槓のシナリオ。
 * 1z（東家）が 2z の捨てた 1m をポンし、4 枚目の 1m を引いて加槓する。
 */
const shoKanScenario = () => {
  const s = createScenario({
    wall: {
      hands: { "1z": "11m456m789m123p33s" },
      draws: [
        "1z", // 1: 1z のツモ（誰も使えない牌）
        "1m", // 2: 2z のツモ → ツモ切り → 1z がポン
        "2z", // 3: 2z のツモ
        "3z", // 4: 3z のツモ
        "4z", // 5: 4z のツモ
        "1m", // 6: 1z のツモ → 加槓
      ],
    },
  });
  const { c } = s;
  const [mp1] = s.players;
  const events = recordEvents(c);

  mp1.mDiscardHandlers.push((e, p) => {
    if (!e.choices.PON) return false;
    p.eventHandler.emit(e);
    return true;
  });
  mp1.mDrawHandlers.push((e, p) => {
    if (!e.choices.SHO_KAN) return false;
    e.choices.TSUMO = false;
    e.choices.REACH = false;
    e.choices.AN_KAN = false;
    e.choices.DRAWN_GAME_BY_NINE_TERMINALS = false;
    p.eventHandler.emit(e);
    return true;
  });

  c.actor.start();
  // ポン → 打牌 → 加槓 → 嶺上牌のツモ → 打牌 まで進める
  stepUntil(c, () => c.river.discards(WIND.E).length >= 3);
  return { ...s, events: events };
};

/**
 * 大明槓のシナリオ。
 * 1z（東家）が 111m を持ち、2z の捨てた 1m を大明槓する。
 */
const daiKanScenario = () => {
  const s = createScenario({
    wall: {
      hands: { "1z": "111m456m789m12p33s" },
      draws: [
        "1z", // 1: 1z のツモ（誰も使えない牌）
        "1m", // 2: 2z のツモ → ツモ切り → 1z が大明槓
      ],
      replacement: ["2z"], // 大明槓の嶺上牌
    },
  });
  const { c } = s;
  const [mp1] = s.players;
  const events = recordEvents(c);

  mp1.mDiscardHandlers.push((e, p) => {
    if (!e.choices.DAI_KAN) return false;
    e.choices.PON = false;
    e.choices.CHI = false;
    e.choices.RON = false;
    p.eventHandler.emit(e);
    return true;
  });

  c.actor.start();
  // 大明槓 → 嶺上牌のツモ → 打牌 まで進める
  stepUntil(c, () => c.river.discards(WIND.E).length >= 2);
  return { ...s, events: events };
};

/**
 * その牌の捨て牌に対して回ってきた選択。
 * 立直の宣言牌は横向き（"-1p"）で河に入るので、向きを外して比べる。
 */
const discardChoiceOf = (p: MockPlayer, tile: string) =>
  p
    .all("CHOICE_AFTER_DISCARDED")
    .find(
      (e) =>
        Tile.from(e.discarterInfo.tile)
          .clone({ remove: OP.HORIZONTAL })
          .toString() == tile
    );

/** あるイベント以降の型の並び。カンドラをめくる契機を見るのに使う。 */
const typesAfter = (
  events: readonly PlayerEvent[],
  type: PlayerEvent["type"]
) => {
  const types = events.map((e) => e.type);
  return types.slice(types.indexOf(type));
};

describe("カンドラ", () => {
  test("台本どおり暗槓する", () => {
    const { c } = anKanScenario();
    expect(c.hand(WIND.E).called.map((b) => b.toString())).toStrictEqual([
      "_11m_",
    ]);
  });

  test("暗槓の新ドラはカンの直後にめくられる", () => {
    const { c, wall, events } = anKanScenario();
    expect(wall.revealedDoraCount).toBe(2);
    expect(c.observer.doraIndicators.map((t) => t.toString())).toStrictEqual([
      "7z",
      "6z",
    ]);
    // 打牌を待たずに、カンの直後
    expect(typesAfter(events, "AN_KAN").slice(0, 2)).toStrictEqual([
      "AN_KAN",
      "NEW_DORA",
    ]);
  });

  test("台本どおり加槓する", () => {
    const { c } = shoKanScenario();
    expect(c.hand(WIND.E).called.map((b) => b.toString())).toStrictEqual([
      "11-1-1m",
    ]);
  });

  test("加槓の新ドラはカンした人の打牌後にめくられる", () => {
    const { c, wall, events } = shoKanScenario();
    expect(wall.revealedDoraCount).toBe(2);
    expect(c.observer.doraIndicators).toHaveLength(2);
    // カンの直後ではなく、嶺上牌をツモって打牌したあと
    expect(typesAfter(events, "SHO_KAN")).toStrictEqual([
      "SHO_KAN",
      "CHOICE_FOR_CHAN_KAN",
      "DRAW",
      "CHOICE_AFTER_DRAWN",
      "DISCARD",
      "NEW_DORA",
    ]);
  });

  test("台本どおり大明槓する", () => {
    const { c } = daiKanScenario();
    expect(c.hand(WIND.E).called.map((b) => b.toString())).toStrictEqual([
      "111-1m",
    ]);
  });

  test("大明槓の新ドラはカンした人の打牌後にめくられる", () => {
    const { c, wall, events } = daiKanScenario();
    expect(wall.revealedDoraCount).toBe(2);
    expect(c.observer.doraIndicators).toHaveLength(2);
    expect(typesAfter(events, "DAI_KAN")).toStrictEqual([
      "DAI_KAN",
      "DRAW",
      "CHOICE_AFTER_DRAWN",
      "DISCARD",
      "NEW_DORA",
    ]);
  });
});

/**
 * チャンカンのフリテンのシナリオ。
 *
 * 1z（東家）は 2-5s 待ち。2s は 3z が 4 枚とも抱えるので、実際に和了れるのは 5s だけ。
 *
 *   4z が 2s をツモ切り → 3z がポン（3z の手に 2s が 3 枚）
 *   2z が 5s をツモ切り → 1z はロンできるが見逃す（同順フリテンになる）
 *   3z が 4 枚目の 2s を引いて加槓 → 1z にチャンカンの選択が回る
 *
 * 1z は直前に見逃しているので、本来チャンカンでもロンできない。
 */
const chanKanFuritenScenario = () => {
  const s = createScenario({
    wall: {
      hands: {
        "1z": "123m456m789m11p34s",
        "3z": "22s123m456m789m1p2p",
      },
      draws: [
        "1z", // 1: 1z のツモ
        "2z", // 2: 2z のツモ
        "3z", // 3: 3z のツモ
        "2s", // 4: 4z のツモ → ツモ切り → 3z がポン
        "4z", // 5: 4z のツモ
        "5z", // 6: 1z のツモ（ここで 1z のフリテンが解除される）
        "5s", // 7: 2z のツモ → ツモ切り → 1z は見逃してフリテンになる
        "2s", // 8: 3z のツモ → 加槓
      ],
      // 1z の当たり牌（5s）が他家から出ると台本がずれるので、残りを場に出さない。
      // 5s は素が 3 枚 + 赤 1 枚で、素の 1 枚は上のツモで使っている。
      exclude: ["5s", "5s", "r5s"],
    },
  });
  const { c } = s;
  const [mp1, , mp3] = s.players;

  mp3.mDiscardHandlers.push((e, p) => {
    if (!e.choices.PON) return false;
    if (e.discarterInfo.tile != "2s") return false;
    p.eventHandler.emit(e);
    return true;
  });
  mp3.mDrawHandlers.push((e, p) => {
    if (!e.choices.SHO_KAN) return false;
    e.choices.TSUMO = false;
    e.choices.REACH = false;
    e.choices.AN_KAN = false;
    e.choices.DRAWN_GAME_BY_NINE_TERMINALS = false;
    p.eventHandler.emit(e);
    return true;
  });

  // 1z は既定でロンを見逃す（doChankan / doReachRon を立てていない）ので、
  // ハンドラは足さずに MockPlayer の控えから「何を聞かれたか」を読む。
  c.actor.start();
  stepUntil(c, () => mp1.got("CHOICE_FOR_CHAN_KAN"));
  return {
    ...s,
    /** 5s の捨て牌でロンの選択肢が回ってきたか（見逃してフリテンになる） */
    missed: () => !!discardChoiceOf(mp1, "5s")?.choices.RON,
    chanKanRon: () => mp1.last("CHOICE_FOR_CHAN_KAN")?.choices.RON,
  };
};

describe("チャンカンのフリテン", () => {
  test("台本どおり見逃してからチャンカンの選択が回る", () => {
    const sc = chanKanFuritenScenario();
    expect(sc.missed()).toBe(true); // 5s のロンを見逃した
    expect(sc.c.hand(WIND.W).called.map((b) => b.toString())).toStrictEqual([
      "22-2-2s",
    ]);
  });

  test("見逃した人はチャンカンでもロンできない", () => {
    // 以前は notify_choice_for_chankan が missingMap[event.iam]（カンした人）を
    // 全員に適用しており、フリテンの 1z にロンの選択肢が回っていた。
    expect(chanKanFuritenScenario().chanKanRon()).toBe(false);
  });
});

/**
 * 立直の宣言牌を見逃すシナリオ。
 *
 * 1z（東家）は 1p 待ち（一気通貫）。2z が 1p を切って立直する。
 * 1z には 2 度ロンの機会が回る（立直の受け入れと、その宣言牌に対する通常の選択）。
 * 1 度目を見逃した時点でフリテンになるので、2 度目は選択肢が無くなる。
 */
const reachDeclarationMissScenario = () => {
  const s = createScenario({
    wall: {
      hands: {
        "1z": "123m456m789m123s1p",
        "2z": "123m456m789m123s1z",
      },
      draws: [
        "5z", // 1: 1z のツモ → ツモ切り
        "1p", // 2: 2z のツモ → 1p を切って立直
      ],
    },
  });
  const { c } = s;
  const [mp1, mp2] = s.players;

  mp2.mDrawHandlers.push((e, p) => {
    if (!e.choices.REACH) return false;
    e.choices.REACH = e.choices.REACH.filter((t) => t.tile == "1p");
    p.eventHandler.emit(e);
    return true;
  });

  // 1z は既定でロンを見逃す。何を聞かれたかは控えから読む。
  c.actor.start();
  stepUntil(c, () => discardChoiceOf(mp1, "1p") != null);
  return {
    ...s,
    /** 立直の受け入れで回ってきたロン */
    onAcceptance: () => mp1.last("CHOICE_FOR_REACH_ACCEPTANCE")?.choices.RON,
    /** 同じ宣言牌に対して続けて回ってくる通常の選択 */
    afterDiscarded: () => discardChoiceOf(mp1, "1p")?.choices.RON,
  };
};

describe("立直の宣言牌の見逃し", () => {
  test("台本どおり立直の宣言牌でロンの機会が回る", () => {
    expect(reachDeclarationMissScenario().onAcceptance()).not.toBe(false);
  });

  test("見逃した宣言牌は続けて聞かれてもロンできない", () => {
    // 立直の受け入れと通常の捨て牌で、ロンの求め方が別々に書かれていたため、
    // 前者にはフリテンの印をつける処理が無く、同じ牌をもう一度ロンできていた。
    expect(reachDeclarationMissScenario().afterDiscarded()).toBe(false);
  });
});

/**
 * 立直の宣言牌を即ロンするシナリオ（ダブルリーチ + 一発）。
 *
 * 1z（東家）は 1p 待ちで、1 巡目に 1z を切ってダブルリーチ。
 * 2z も立直を宣言し、その宣言牌 1p を 1z がロンする。
 * 立直棒を出した直後なので、2z の 1000 点は場に残らず 1z が総取りする。
 */
const reachDeclarationRonScenario = () => {
  const s = createScenario({
    autoAdvance: true,
    wall: {
      hands: {
        "1z": "123m456m789m123s1p",
        "2z": "123m456m789m123s1z",
      },
      draws: ["1z", "1p"],
    },
  });
  const { c } = s;
  const [mp1, mp2] = s.players;

  const reachWith = (tile: string) => (e: ChoiceAfterDrawnEvent, p: MockPlayer) => {
    if (!e.choices.REACH) return false;
    e.choices.REACH = e.choices.REACH.filter((t) => t.tile == tile);
    p.eventHandler.emit(e);
    return true;
  };
  mp1.mDrawHandlers.unshift(reachWith("1z"));
  mp1.doReachRon = true; // 宣言牌を見逃さずロンする
  mp2.mDrawHandlers.unshift(reachWith("1p"));

  c.actor.start();
  return s;
};

describe("立直の宣言牌のロン", () => {
  test("宣言牌のロンでは立直棒が場に残らない", () => {
    const { c } = reachDeclarationRonScenario();
    const sum = c.scoreManager.summary;
    // ダブルリーチ + 一発 + 一気通貫ほかで 12000。2z が出した立直棒も 1z が取るので、
    // 2z の減りは 12000 ちょうど（立直棒の 1000 点が二重に引かれない）。
    expect([
      sum[c.placeManager.playerID(WIND.E)],
      sum[c.placeManager.playerID(WIND.S)],
    ]).toStrictEqual([25000 + 12000, 25000 - 12000]);
    // 供託は場に残らず、親の和了なので 1 本場
    expect(c.placeManager.sticks).toStrictEqual({ reach: 0, dead: 1 });
  });
});

/**
 * 立直後のフリテンのシナリオ。
 *
 * 1z（東家）は 1-4s 待ち。立直の宣言牌に自分の当たり牌（4s）を選ぶので、
 * 以降は当たり牌が出てもロンできない。
 */
const reachFuritenScenario = () => {
  const s = createScenario({
    wall: {
      hands: { "1z": "123m456m789m23s11p" },
      draws: [
        "4s", // 1: 1z のツモ → 4s を切って立直（自分の当たり牌を捨てる）
        "1s", // 2: 2z のツモ → ツモ切り → 1z はロンできない
      ],
    },
  });
  const { c } = s;
  const [mp1] = s.players;

  mp1.mDrawHandlers.unshift((e, p) => {
    if (!e.choices.REACH) return false;
    // 引いた 4s はそのままツモ和了になる牌。フリテンを作るのが目的なので、
    // ツモを断って 4s を宣言牌にする（ツモの優先順位のほうが高いので明示的に消す）。
    e.choices.TSUMO = false;
    e.choices.REACH = e.choices.REACH.filter((t) =>
      Tile.from(t.tile).equals(new Tile(TYPE.S, 4))
    );
    p.eventHandler.emit(e);
    return true;
  });

  c.actor.start();
  stepUntil(c, () => discardChoiceOf(mp1, "1s") != null);
  return { ...s, ronOnOwnDiscard: () => discardChoiceOf(mp1, "1s")?.choices.RON };
};

describe("立直後のフリテン", () => {
  test("台本どおり自分の当たり牌を切って立直する", () => {
    const { c } = reachFuritenScenario();
    expect(c.hand(WIND.E).reached).toBe(true);
    expect(
      c.river.discards(WIND.E).map((v) => v.t.clone({ removeAll: true }).toString())
    ).toContain("4s");
  });

  test("立直後は自分が捨てた牌でロンできない", () => {
    expect(reachFuritenScenario().ronOnOwnDiscard()).toBe(false);
  });
});

/**
 * 同順フリテンのシナリオ。
 *
 * 1z（東家）は 1z 待ち。同じ巡の中で 1z が 3 回出る。
 *
 *   2z が 1z をツモ切り → 1z はロンできるが見逃す（同順フリテンになる）
 *   3z が 1z をツモ切り → フリテンなのでロンの選択肢が回らない
 *   巡が一周して 2z がまた 1z をツモ切り → フリテンが解けてロンできる
 */
const sameTurnFuritenScenario = () => {
  const s = createScenario({
    autoAdvance: true,
    wall: {
      hands: { "1z": "123m456m789m123s1z" },
      draws: [
        "1p", // 1: 1z のツモ
        "1z", // 2: 2z のツモ → ツモ切り（見逃す）
        "1z", // 3: 3z のツモ → ツモ切り（フリテンでロンできない）
        "5z", // 4: 4z のツモ
        "6z", // 5: 1z のツモ（ここでフリテンが解除される）
        "1z", // 6: 2z のツモ → ツモ切り → ロンする
      ],
    },
  });
  const { c } = s;
  const [mp1] = s.players;

  // 1 度目は見逃し、2 度目に回ってきたロンを取る。
  let offered = 0;
  mp1.mDiscardHandlers.push((e, p) => {
    if (!e.choices.RON) return false; // 選択肢が無ければ既定（スルー）に任せる
    if (++offered < 2) return false;
    p.eventHandler.emit(e);
    return true;
  });

  c.actor.start();
  return {
    ...s,
    /** 1z の捨て牌ごとに、ロンの選択肢が回ってきたか */
    ronOffers: () =>
      mp1
        .all("CHOICE_AFTER_DISCARDED")
        .filter((e) => Tile.from(e.discarterInfo.tile).equals(new Tile(TYPE.Z, 1)))
        .map((e) => !!e.choices.RON),
  };
};

describe("同順フリテン", () => {
  test("見逃した同順はロンの選択肢が回らず、巡が変われば戻る", () => {
    expect(sameTurnFuritenScenario().ronOffers()).toStrictEqual([
      true, // 2z の捨て牌（見逃す）
      false, // 3z の捨て牌（同順フリテン）
      true, // 一周したあとの 2z の捨て牌
    ]);
  });

  test("フリテンが解けたあとのロンで点数と本場が動く", () => {
    const { c } = sameTurnFuritenScenario();
    const sum = c.scoreManager.summary;
    expect([
      sum[c.placeManager.playerID(WIND.E)],
      sum[c.placeManager.playerID(WIND.S)],
    ]).toStrictEqual([25000 + 3900, 25000 - 3900]);
    // 親の和了なので連荘して 1 本場
    expect(c.placeManager.sticks).toStrictEqual({ reach: 0, dead: 1 });
  });
});

/**
 * チャンカンで和了るシナリオ。
 *
 * 1z（東家）は 1-4s 待ち。2z が 3z の捨てた 1s をポンし、
 * 4 枚目の 1s を引いて加槓したところを 1z がロンする。
 */
const chanKanRonScenario = () => {
  // 自動進行にしない。加槓の選択肢を配るのは an_sho_kaned の entry action で、
  // その中で送ったロンより自動進行の NEXT が先に処理されると、
  // waiting_chankan_event のワイルドカードで素通りしてしまう。
  const s = createScenario({
    wall: {
      hands: {
        "1z": "123m456m789m23s11p",
        "2z": "123m456m11s",
        "3z": "567s",
        "4z": "7z",
      },
      draws: [
        "2z", // 1: 1z のツモ
        "4z", // 2: 2z のツモ
        "1s", // 3: 3z のツモ → ツモ切り → 2z がポン
        // ポンした 2z の打牌のあとは 3z → 4z → 1z → 2z の順に回る
        "5z", // 4: 3z のツモ
        "6z", // 5: 4z のツモ
        "7z", // 6: 1z のツモ
        "1s", // 7: 2z のツモ → 加槓 → 1z がチャンカン
      ],
      // 1z の当たり牌が他家から出ると台本がずれるので、残りを場に出さない
      exclude: ["4s", "4s", "4s", "r5s"],
    },
  });
  const { c } = s;
  const [mp1, mp2] = s.players;

  mp1.doChankan = true;
  // 配牌の余りで別の牌まで鳴くと巡がずれるので、1s だけ鳴く。
  mp2.mDiscardHandlers.push((e, p) => {
    if (!e.choices.PON) return false;
    if (!Tile.from(e.discarterInfo.tile).equals(new Tile(TYPE.S, 1)))
      return false;
    p.eventHandler.emit(e);
    return true;
  });
  mp2.mDrawHandlers.push((e, p) => {
    if (!e.choices.SHO_KAN) return false;
    p.eventHandler.emit(e);
    return true;
  });

  c.actor.start();
  stepUntil(c, () => c.actor.getSnapshot().status == "done");
  return s;
};

describe("チャンカン", () => {
  test("加槓した牌でロンできる", () => {
    const { c } = chanKanRonScenario();
    const sum = c.scoreManager.summary;
    expect([
      sum[c.placeManager.playerID(WIND.E)],
      sum[c.placeManager.playerID(WIND.S)],
    ]).toStrictEqual([25000 + 11600, 25000 - 11600]);
  });
});

/**
 * 一発のシナリオ。
 * 1z（東家）が 1z 単騎で立直し、次の巡目に 1z でロンする。
 * pon: true のときは、ロンの前に 3z が 2z の捨て牌をポンして割り込む。
 * 鳴きが入れば一発は消えるので、その分だけ点数が下がる。
 */
const ippatsuScenario = (params: { pon: boolean }) => {
  const s = createScenario({
    autoAdvance: true,
    wall: {
      hands: {
        "1z": "123m456m789m123s1z",
        ...(params.pon ? { "3z": "1z33p123456789s1m" } : {}),
      },
      draws: params.pon
        ? ["5z", "3p"] // 1: 1z が立直 / 2: 2z のツモ → 3z がポンして 1z を切る
        : ["5z", "1z"], // 1: 1z が立直 / 2: 2z が 1z をツモ切り → ロン
    },
  });
  const { c } = s;
  const [mp1, , mp3] = s.players;
  const events = recordEvents(c);

  // 立直は必ずツモ切り（切る牌で待ちが変わらないようにする）
  mp1.mDrawHandlers.push((e, p) => {
    if (!e.choices.REACH) return false;
    e.choices.REACH = e.choices.REACH.filter((t) => t.tile == "5z");
    p.eventHandler.emit(e);
    return true;
  });
  mp1.mDiscardHandlers.push((e, p) => {
    if (!e.choices.RON) return false;
    p.eventHandler.emit(e);
    return true;
  });
  mp3.mDiscardHandlers.push((e, p) => {
    if (!e.choices.PON) return false;
    p.eventHandler.emit(e);
    return true;
  });
  mp3.mCalledHandlers.push((e, p) => {
    e.choices.DISCARD = ["1z"];
    p.eventHandler.emit(e);
    return true;
  });

  c.actor.start();
  const ron = events.find((e) => e.type == "RON");
  assert(ron?.type == "RON", "no one wins in the ippatsu scenario");
  return { ...s, yaku: ron.ret.yakus.map((y) => y.name) };
};

describe("一発", () => {
  test("鳴きが入らなければ一発がつく", () => {
    expect(ippatsuScenario({ pon: false }).yaku).toStrictEqual([
      "ダブル立直",
      "一発",
      "一気通貫",
    ]);
  });

  test("ポンが割り込むと一発は消える", () => {
    // poned の entry が "disable_none_shot"（one の綴り誤り）を参照しており、
    // xstate がそれを黙って無視するため、以前はポンでも一発がついていた。
    // 点数では見えない（4翻40符が切り上げ満貫になり、一発ありと同額になる）ので役で見る。
    expect(ippatsuScenario({ pon: true }).yaku).toStrictEqual([
      "ダブル立直",
      "一気通貫",
    ]);
  });
});

/**
 * ツモ和了のシナリオ。
 * 1z（東家）が 1z 単騎で待ち、2 巡目に 1z を引いてツモ和了する（門前清自摸和）。
 * 1 巡目にツモ切りを 1 回挟むのは、局をまたいだ河を見るシナリオ（下記）が
 * 「東家の捨て牌が 1 枚以上ある」状態を必要とするため。
 * tamper を渡すと、プレイヤーが申告する和了結果を書き換えられる。
 */
const tsumoScenario = (params?: {
  tamper?: (ret: SerializedWinResult) => void;
  /** 提示されていない最初のツモで、ツモ和了を騙る。 */
  claimFirstDraw?: boolean;
  logger?: Logger;
}) => {
  const s = createScenario({
    autoAdvance: true,
    logger: params?.logger,
    wall: {
      hands: { "1z": "123m456m789m123s1z" },
      draws: [
        "2z", // 1: 1z のツモ → ツモ切り
        "3z", // 2: 2z のツモ
        "4z", // 3: 3z のツモ
        "5z", // 4: 4z のツモ
        "1z", // 5: 1z のツモ → ツモ和了
      ],
    },
  });
  const { c } = s;
  const [mp1] = s.players;
  const events = recordEvents(c);

  if (params?.claimFirstDraw) {
    let claimed = false;
    mp1.mDrawHandlers.push((e, p) => {
      if (claimed || e.choices.TSUMO) return false; // 本物のツモは下のハンドラに任せる
      claimed = true;
      // controller が提示していない和了をでっち上げる。中身は見られずに落ちる。
      e.choices.TSUMO = { points: 32000 } as unknown as SerializedWinResult;
      // 騙り以外は既定（ツモ切り）と同じにする。落ちたあとの進行を揃えるため。
      e.choices.AN_KAN = false;
      e.choices.SHO_KAN = false;
      e.choices.REACH = false;
      e.choices.DRAWN_GAME_BY_NINE_TERMINALS = false;
      assert(e.choices.DISCARD);
      e.choices.DISCARD = e.choices.DISCARD.filter((t) =>
        Tile.from(t).has(OP.TSUMO)
      );
      p.eventHandler.emit(e);
      return true;
    });
  }

  mp1.mDrawHandlers.push((e, p) => {
    if (!e.choices.TSUMO) return false;
    params?.tamper?.(e.choices.TSUMO);
    p.eventHandler.emit(e);
    return true;
  });

  c.actor.start();
  return { ...s, events: events };
};

// 和了はプレイヤーの申告ではなく controller の計算を使う。
// controller は選択肢を提示するときに自分で doWin を計算しているので、
// 返信からは「申告したか」だけを読み、中身は提示した控えで置き換える（mailbox.ts）。
// 提示していない和了を申告された場合は、理由をログに出してその申告だけ落とす。
describe("和了の申告", () => {
  test("台本どおりツモ和了する", () => {
    const { c } = tsumoScenario();
    expect(c.actor.getSnapshot().status).toBe("done");
    const sum = c.scoreManager.summary;
    expect(sum[c.placeManager.playerID(WIND.E)]).toBeGreaterThan(25000);
  });

  test("申告の盤面を盛っても点数は変わらない", () => {
    // finalResult は controller の控えを使うので、申告側の boardContext は読まれない。
    const honest = tsumoScenario().c.scoreManager.summary;
    const tampered = tsumoScenario({
      tamper: (ret) => {
        // 1z の手牌には 1m が 1 枚ある。9m を表示牌にすると 1m がドラになる。
        (
          ret.boardContext as unknown as { doraIndicators: string[] }
        ).doraIndicators = ["9m", "9m", "9m", "9m"];
        ret.points = 100000;
      },
    }).c.scoreManager.summary;
    expect(tampered).toStrictEqual(honest);
  });

  test("提示していない和了の申告はログに出して無視される", () => {
    const errors: string[] = [];
    const spyLogger = {
      debug: () => {},
      warn: () => {},
      error: (...msg: unknown[]) => errors.push(msg.join(" ")),
    };
    // 提示されていない最初のツモで、1z がツモ和了を騙る。
    const { c } = tsumoScenario({
      logger: spyLogger,
      claimFirstDraw: true,
    });

    expect(errors.some((v) => v.includes("claimed TSUMO"))).toBe(true);
    // 騙りは落ちるだけで進行は止まらず、台本どおり最後のツモで和了する
    expect(c.actor.getSnapshot().status).toBe("done");
    expect(c.scoreManager.summary).toStrictEqual(
      tsumoScenario().c.scoreManager.summary
    );
  });
});

/**
 * 2 局続けて回すシナリオ。
 * 1 局目は東家のツモ和了（連荘）で終わり、2 局目の東家には九種九牌の配牌を渡す。
 */
const twoRoundsScenario = () => {
  const s = tsumoScenario();
  const { c } = s;
  const [mp1] = s.players;

  const wall2 = new ScriptedWall({
    hands: { "1z": "19m19p19s1234567z" },
    draws: ["5z"],
    doraIndicators: HARMLESS_DORA,
    rand: createSeededRand(20260802),
  });

  // 2 局目は最初のツモまで見れば足りる
  mp1.clearReceived(); // 1 局目の控えと混ざらないように
  c.autoAdvance = false;
  startNextRound(c, wall2);
  c.actor.start();
  stepUntil(c, () => mp1.got("CHOICE_AFTER_DRAWN"));
  return {
    ...s,
    nineTerminals: () =>
      mp1.last("CHOICE_AFTER_DRAWN")?.choices.DRAWN_GAME_BY_NINE_TERMINALS,
  };
};

describe("局をまたいだ河", () => {
  test("台本どおり 2 局目の東家に九種九牌の配牌が渡る", () => {
    const sc = twoRoundsScenario();
    expect(sc.nineTerminals()).not.toBeUndefined();
    expect(sc.c.placeManager.playerID(WIND.E)).toBe("player-1"); // 連荘で親は変わらない
  });

  test("2 局目の九種九牌は 1 局目の捨て牌に影響されない", () => {
    // canDeclareNineTerminalsAbort は「自分の捨て牌が無いこと」を条件にしている。
    // 以前は River.reset() が呼ばれず、1 局目の捨て牌が残って常に宣言できなかった。
    expect(twoRoundsScenario().nineTerminals()).toBe(true);
  });
});

describe("イベント列", () => {
  test("1 局分のイベントの順序を固定する", () => {
    // 状態機械を組み替えても、プレイヤーに届くイベントの並びは変わらないこと。
    // アクションの共通化や context の持ち方を変えたときの見張りになる。
    // DISTRIBUTE だけ 4 件並ぶのは、配牌が家ごとに別のイベントだから
    // （observer は 1 イベント ID につき 1 回しか適用しないが、DISTRIBUTE は例外）。
    const { events } = tsumoScenario();
    const turn = [
      "DRAW",
      "CHOICE_AFTER_DRAWN",
      "DISCARD",
      "CHOICE_AFTER_DISCARDED",
    ];
    expect(events.map((e) => e.type)).toStrictEqual([
      ...Array(4).fill("DISTRIBUTE"),
      ...turn, // 1z
      ...turn, // 2z
      ...turn, // 3z
      ...turn, // 4z
      "DRAW", // 1z の 2 巡目
      "CHOICE_AFTER_DRAWN",
      "TSUMO",
      "END_GAME",
    ]);
  });
});

describe("Player の盤面", () => {
  // Player.doras は打牌の重み付けに使う。以前はフィールドで、どこからも
  // 代入されず常に空だったことがある。
  test("doras は表示牌から導かれる", () => {
    const { c, p1 } = createLocalGame({ seed: 20260802, logger: silentLogger });
    c.start();
    expect(p1.doraIndicators.length).toBeGreaterThan(0);
    expect(p1.doras.map((v) => v.toString())).toStrictEqual(
      p1.doraIndicators.map((v) => toDora(v).toString())
    );
  });
});

describe("再現性", () => {
  // 種を渡すと席順と山が決まる。同じ種なら常に同じ対局になる。
  // 実際のプレイヤー（Player）を通すので、打牌選択・鳴き・和了判定まで含めて固定される。
  //
  // 期待値はリファクタリングで壊れてはいけない。ただし Player の打牌選択
  // （PlayerEfficiency / RiskRank）を変えると当然変わるので、そのときは意図的に取り直す。
  const playRound = (seed: number) => {
    const { c } = createLocalGame({ seed: seed, shuffle: false, logger: silentLogger });
    c.start();
    return {
      scores: { ...c.scoreManager.summary },
      round: c.placeManager.round,
      sticks: { ...c.placeManager.sticks },
      discards: c.river.discards().length,
    };
  };

  test("同じ種からは同じ 1 局になる", () => {
    const got = playRound(20260801);
    expect(got).toStrictEqual(playRound(20260801));
    expect(got.scores).toStrictEqual({
      "player-1": 21100,
      "player-2": 28900,
      "player-3": 25000,
      "player-4": 25000,
    });
    expect(got.round).toBe(ROUND.E2); // 子の和了なので親が流れる
  });
});
