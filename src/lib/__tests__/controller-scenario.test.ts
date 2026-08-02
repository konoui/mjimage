import {
  ActorHand,
  Controller,
  createControllerMachine,
  createLocalGame,
  createSeededRand,
  silentLogger,
} from "../controller";
import { SerializedWinResult } from "../calculator";
import { PlayerEvent } from "../controller";
import { assert } from "../assert";
import { Tile } from "../core";
import { OP, ROUND, WIND } from "../core/constants";
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
//   1. シナリオが目的の局面に到達したことを確かめる通常の test
//   2. その局面で controller がどう振る舞うべきかを書いた test.fails
// test.fails は「どこで失敗しても通る」ので、台本が壊れて別の場所で
// 落ちても気づけない。1 の側が台本の見張りになる。

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

describe("C5/カンドラ", () => {
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

  test("加槓の新ドラはカンした人の打牌後にめくられる（C5）", () => {
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

  test("大明槓の新ドラはカンした人の打牌後にめくられる（C5）", () => {
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

describe("C9/チャンカンのフリテン", () => {
  test("台本どおり見逃してからチャンカンの選択が回る", () => {
    const sc = chanKanFuritenScenario();
    expect(sc.missed()).toBe(true); // 5s のロンを見逃した
    expect(sc.c.hand(WIND.W).called.map((b) => b.toString())).toStrictEqual([
      "22-2-2s",
    ]);
  });

  test("見逃した人はチャンカンでもロンできない（C9）", () => {
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

describe("C16/立直の宣言牌の見逃し", () => {
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

describe("C3/一発", () => {
  test("鳴きが入らなければ一発がつく", () => {
    expect(ippatsuScenario({ pon: false }).yaku).toStrictEqual([
      "ダブル立直",
      "一発",
      "一気通貫",
    ]);
  });

  test("ポンが割り込むと一発は消える（C3）", () => {
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
 * 1 巡目にツモ切りを 1 回挟むのは、河が残ることを見る C1 のシナリオが
 * 「東家の捨て牌が 1 枚以上ある」状態を必要とするため。
 * tamper を渡すと、プレイヤーが申告する和了結果を書き換えられる。
 */
const tsumoScenario = (params?: {
  tamper?: (ret: SerializedWinResult) => void;
}) => {
  const s = createScenario({
    autoAdvance: true,
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

  mp1.mDrawHandlers.push((e, p) => {
    if (!e.choices.TSUMO) return false;
    params?.tamper?.(e.choices.TSUMO);
    p.eventHandler.emit(e);
    return true;
  });

  c.actor.start();
  return { ...s, events: events };
};

/** 状態機械のガードを実装ごと取り出す。 */
const guardsOf = (c: Controller) =>
  (
    createControllerMachine(c) as unknown as {
      implementations: {
        guards: Record<string, (args: unknown, params: unknown) => boolean>;
      };
    }
  ).implementations.guards;

// 和了の申告は controller 側で検算していない。これは今のところ意図的で、
// xstate の guard は false を返すと遷移が黙って無視されるため、
// そこで弾くと「何も起きない」形の障害になり追いにくい（controller-report.md C6）。
// ここでは「今はプレイヤーの申告を信頼している」ことを仕様として固定する。
// 検証を入れるなら guard ではなく pollReplies 側（理由を投げられる場所）で行う。
describe("C6/和了の申告", () => {
  test("台本どおりツモ和了する", () => {
    const { c } = tsumoScenario();
    expect(c.actor.getSnapshot().status).toBe("done");
    const sum = c.scoreManager.summary;
    expect(sum[c.placeManager.playerID(WIND.E)]).toBeGreaterThan(25000);
  });

  test("canWin は和了形を見ずに常に true を返す", () => {
    const { c } = createLocalGame({ logger: silentLogger });
    c.observer.hands[WIND.E] = new ActorHand("123m456m789m135s1z"); // ノーテン
    expect(
      guardsOf(c).canWin(
        { context: {}, event: { type: "TSUMO", iam: WIND.E } },
        undefined
      )
    ).toBe(true);
  });

  test("点数はプレイヤーが申告した盤面から計算される", () => {
    // finalResult が `...ret.boardContext` をそのまま使うので、
    // 申告のドラ表示牌を盛れば点数はその分だけ増える。
    // ローカル対戦では実害が無いが、Player を差し替えられる構成にすると効いてくる。
    const honest = tsumoScenario().c.scoreManager.summary;
    const tampered = tsumoScenario({
      tamper: (ret) => {
        // 1z の手牌には 1m が 1 枚ある。9m を表示牌にすると 1m がドラになる。
        (
          ret.boardContext as unknown as { doraIndicators: string[] }
        ).doraIndicators = ["9m", "9m", "9m", "9m"];
      },
    }).c.scoreManager.summary;
    const winner = "player-1";
    expect(tampered[winner]).toBeGreaterThan(honest[winner]);
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

describe("C1/局をまたいだ河", () => {
  test("台本どおり 2 局目の東家に九種九牌の配牌が渡る", () => {
    const sc = twoRoundsScenario();
    expect(sc.nineTerminals()).not.toBeUndefined();
    expect(sc.c.placeManager.playerID(WIND.E)).toBe("player-1"); // 連荘で親は変わらない
  });

  test("2 局目の九種九牌は 1 局目の捨て牌に影響されない（C1）", () => {
    // canDeclareNineTerminalsAbort は「自分の捨て牌が無いこと」を条件にしている。
    // 以前は River.reset() が呼ばれず、1 局目の捨て牌が残って常に宣言できなかった。
    expect(twoRoundsScenario().nineTerminals()).toBe(true);
  });
});

describe("イベント列", () => {
  test("1 局分のイベントの順序を固定する", () => {
    // 状態機械を組み替えても、プレイヤーに届くイベントの並びは変わらないこと。
    // C15（ブロードキャストの共通化）や C18（assign への移行）の見張りになる。
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

describe("再現性", () => {
  // 種を渡すと席順と山が決まる。同じ種なら常に同じ対局になる。
  // 実際のプレイヤー（Player）を通すので、打牌選択・鳴き・和了判定まで含めて固定される。
  //
  // 期待値はリファクタリングで壊れてはいけない。ただし C10（selectMinPriority）を
  // 直すと Player の打牌選択が変わるため、そのときは意図的に取り直すこと。
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
      "player-1": 25000,
      "player-2": 25000,
      "player-3": 26000,
      "player-4": 24000,
    });
    expect(got.round).toBe(ROUND.E2); // 子の和了なので親が流れる
  });
});
