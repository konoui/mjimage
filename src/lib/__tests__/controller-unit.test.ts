import {
  ActorHand,
  Controller,
  Counter,
  PlaceManager,
  PlayerEfficiency,
  Replayer,
  River,
  ScoreManager,
  Wall,
  createControllerMachine,
  createLocalGame,
  prioritizeDiscardedEvents,
  prioritizeDrawnEvents,
  type ChoiceAfterDiscardedEvent,
  type ChoiceAfterDrawnEvent,
  silentLogger,
} from "../controller";
import { Tile, createWindMap } from "../core";
import { OP, ROUND, TYPE, WIND, Wind } from "../core/constants";

// controller のリファクタリング用の回帰テスト。
// controller.test.ts が通しのシナリオを見ているのに対し、
// こちらは controller 配下の各モジュールを単体で固定する。
// 既知のバグは controller-report.md の ID を添えて test.fails で表現してある
// （直すとこのテストが「失敗」に転じるので、そのとき期待値を通常の test に書き換える）。

const discardChoice = (
  wind: Wind,
  choices: Partial<ChoiceAfterDiscardedEvent["choices"]>
): ChoiceAfterDiscardedEvent => ({
  id: "0",
  type: "CHOICE_AFTER_DISCARDED",
  wind: wind,
  discarterInfo: { wind: WIND.E, tile: "1m" },
  choices: {
    RON: false,
    PON: false,
    CHI: false,
    DAI_KAN: false,
    ...choices,
  },
});

const drawnChoice = (
  wind: Wind,
  choices: Partial<ChoiceAfterDrawnEvent["choices"]>
): ChoiceAfterDrawnEvent => ({
  id: "0",
  type: "CHOICE_AFTER_DRAWN",
  wind: wind,
  drawerInfo: { wind: wind, tile: "1m" },
  choices: {
    TSUMO: false,
    REACH: false,
    AN_KAN: false,
    SHO_KAN: false,
    DISCARD: false,
    DRAWN_GAME_BY_NINE_TERMINALS: false,
    ...choices,
  },
});

// SerializedBlock の中身は優先順位の判定に使われないので、非空であればよい。
const anyBlock = [{ tiles: ["1m", "1m", "1m"], type: "pon" }] as never;

describe("events/優先順位", () => {
  test("捨て牌に対する優先順位は RON > DAI_KAN > PON > CHI", () => {
    const got = prioritizeDiscardedEvents([
      discardChoice(WIND.E, { CHI: anyBlock }),
      discardChoice(WIND.S, { PON: anyBlock }),
      discardChoice(WIND.W, { DAI_KAN: anyBlock[0] }),
      discardChoice(WIND.N, { RON: {} as never }),
    ]);
    expect(got.type).toBe("RON");
    expect(got.events.map((e) => e.wind)).toStrictEqual([WIND.N]);
  });

  test("同じ優先順位なら該当する全員が返る（ダブロン）", () => {
    const got = prioritizeDiscardedEvents([
      discardChoice(WIND.E, { RON: {} as never }),
      discardChoice(WIND.S, { CHI: anyBlock }),
      discardChoice(WIND.W, { RON: {} as never }),
    ]);
    expect(got.type).toBe("RON");
    expect(got.events.map((e) => e.wind)).toStrictEqual([WIND.E, WIND.W]);
  });

  test("誰も選択肢を持たない場合は空 + type=false", () => {
    const got = prioritizeDiscardedEvents([
      discardChoice(WIND.E, {}),
      discardChoice(WIND.S, {}),
    ]);
    expect(got.events).toStrictEqual([]);
    expect(got.type).toBe(false);
  });

  test("ツモ番の優先順位は TSUMO > REACH > AN_KAN > SHO_KAN > 九種九牌 > DISCARD", () => {
    const order = [
      ["TSUMO", drawnChoice(WIND.E, { TSUMO: {} as never, DISCARD: ["1m"] })],
      [
        "REACH",
        drawnChoice(WIND.E, {
          REACH: [{ tile: "1m" }] as never,
          DISCARD: ["1m"],
        }),
      ],
      ["AN_KAN", drawnChoice(WIND.E, { AN_KAN: anyBlock, DISCARD: ["1m"] })],
      ["SHO_KAN", drawnChoice(WIND.E, { SHO_KAN: anyBlock, DISCARD: ["1m"] })],
      [
        "DRAWN_GAME_BY_NINE_TERMINALS",
        drawnChoice(WIND.E, {
          DRAWN_GAME_BY_NINE_TERMINALS: true,
          DISCARD: ["1m"],
        }),
      ],
      ["DISCARD", drawnChoice(WIND.E, { DISCARD: ["1m"] })],
    ] as const;
    for (const [want, e] of order)
      expect(prioritizeDrawnEvents([e as ChoiceAfterDrawnEvent]).type).toBe(
        want
      );
  });

  test("候補 0 件の選択肢は選ばれない（C13）", () => {
    // JS では [] が truthy なので、以前は候補 0 件の REACH が DISCARD より
    // 優先され、pollReplies の `candidates[0].tile` が undefined 参照で落ちていた。
    const got = prioritizeDrawnEvents([
      drawnChoice(WIND.E, { REACH: [], DISCARD: ["1m"] }),
    ]);
    expect(got.type).toBe("DISCARD");

    // 候補が 1 件でも無ければ「選択肢なし」
    expect(
      prioritizeDiscardedEvents([discardChoice(WIND.E, { PON: [] as never })])
    ).toStrictEqual({ events: [], type: false });
  });
});

describe("managers/ScoreManager", () => {
  test("リーチで 1000 点減る", () => {
    const s = new ScoreManager({ a: 25000, b: 25000 });
    s.reach("a");
    expect(s.summary).toStrictEqual({ a: 24000, b: 25000 });
  });

  test("update は wind→player の対応で加算する", () => {
    const s = new ScoreManager({ a: 25000, b: 25000, c: 25000, d: 25000 });
    s.update(
      { [WIND.E]: 8000, [WIND.S]: -8000, [WIND.W]: 0, [WIND.N]: 0 },
      { a: WIND.S, b: WIND.E, c: WIND.W, d: WIND.N }
    );
    expect(s.summary).toStrictEqual({
      a: 17000,
      b: 33000,
      c: 25000,
      d: 25000,
    });
  });

  test("初期値は複製される（呼び出し側の変更に影響されない）", () => {
    const initial = { a: 25000 };
    const s = new ScoreManager(initial);
    initial.a = 0;
    expect(s.summary.a).toBe(25000);
  });

  test("summary は写しを返す（C21）", () => {
    const s = new ScoreManager({ a: 25000 });
    (s.summary as { a: number }).a = 0;
    expect(s.summary.a).toBe(25000);
  });
});

describe("managers/PlaceManager", () => {
  const newPM = () =>
    new PlaceManager({
      a: WIND.E,
      b: WIND.S,
      c: WIND.W,
      d: WIND.N,
    });

  test("id↔wind を双方向に引ける", () => {
    const pm = newPM();
    expect(pm.wind("a")).toBe(WIND.E);
    expect(pm.playerID(WIND.W)).toBe("c");
  });

  test("nextRound で局が進み、席が 1 つずつずれる", () => {
    const pm = newPM();
    expect(pm.round).toBe(ROUND.E1);
    pm.nextRound();
    expect(pm.round).toBe(ROUND.E2);
    // 親だった a が北家に下がり、b が親になる
    expect(pm.playerMap).toStrictEqual({
      a: WIND.N,
      b: WIND.E,
      c: WIND.S,
      d: WIND.W,
    });
    expect(pm.playerID(WIND.E)).toBe("b");
  });

  test("4 回 nextRound すると席が一周する", () => {
    const pm = newPM();
    for (let i = 0; i < 4; i++) pm.nextRound();
    expect(pm.playerMap).toStrictEqual({
      a: WIND.E,
      b: WIND.S,
      c: WIND.W,
      d: WIND.N,
    });
  });

  test("本場/リーチ棒の増減", () => {
    const pm = newPM();
    pm.incrementDeadStick();
    pm.incrementDeadStick();
    pm.incrementReachStick();
    expect(pm.sticks).toStrictEqual({ reach: 1, dead: 2 });
    pm.resetDeadStick();
    expect(pm.sticks).toStrictEqual({ reach: 1, dead: 0 });
    pm.resetReachStick();
    expect(pm.sticks).toStrictEqual({ reach: 0, dead: 0 });
  });

  test("sticks と playerMap は写しを返す（C21）", () => {
    const pm = newPM();
    (pm.sticks as { reach: number }).reach = 99;
    expect(pm.sticks).toStrictEqual({ reach: 0, dead: 0 });
    (pm.playerMap as { a: Wind }).a = WIND.N;
    expect(pm.playerMap.a).toBe(WIND.E);
  });

  test("is は現在の局と比較する", () => {
    const pm = newPM();
    expect(pm.is(ROUND.E1)).toBe(true);
    expect(pm.is(ROUND.W1)).toBe(false);
  });
});

describe("managers/Counter", () => {
  test("初期値は各牌 4 枚、赤は 1 枚", () => {
    const c = new Counter();
    expect(c.get(new Tile(TYPE.M, 1))).toBe(4);
    expect(c.get(new Tile(TYPE.Z, 7))).toBe(4);
    expect(c.get(new Tile(TYPE.M, 0))).toBe(1); // 赤5m
    expect(c.get(new Tile(TYPE.Z, 0))).toBe(0); // 字牌に赤はない
    expect(c.get(new Tile(TYPE.BACK, 0))).toBe(0);
  });

  test("dec で減り、5 枚目で例外", () => {
    const c = new Counter();
    const t = new Tile(TYPE.P, 3);
    c.dec(t, t, t, t);
    expect(c.get(t)).toBe(0);
    expect(() => c.dec(t)).toThrow(/appears more than 4 times/);
  });

  test("赤牌を引くと 5 の枚数と赤の枚数の両方が減る", () => {
    const c = new Counter();
    const red = new Tile(TYPE.M, 5, [OP.RED]);
    c.dec(red);
    expect(c.get(new Tile(TYPE.M, 5))).toBe(3);
    expect(c.get(new Tile(TYPE.M, 0))).toBe(0);
    expect(() => c.dec(red)).toThrow(/red tile .* appears more than once/);
  });

  test("裏牌は数えない", () => {
    const c = new Counter();
    c.dec(new Tile(TYPE.BACK, 0));
    expect(c.get(new Tile(TYPE.BACK, 0))).toBe(0);
  });

  test("disabled なら dec は何もしない", () => {
    const c = new Counter(true);
    const t = new Tile(TYPE.P, 3);
    for (let i = 0; i < 10; i++) c.dec(t);
    expect(c.get(t)).toBe(4);
  });

  test("reset で初期状態に戻る", () => {
    const c = new Counter();
    c.dec(new Tile(TYPE.P, 3));
    c.reset();
    expect(c.get(new Tile(TYPE.P, 3))).toBe(4);
  });

  test("現物は対象ユーザごとに記録される", () => {
    const c = new Counter();
    c.addTileToSafeMap(new Tile(TYPE.S, 4), WIND.S);
    expect(c.isSafeTile(TYPE.S, 4, WIND.S)).toBe(true);
    expect(c.isSafeTile(TYPE.S, 4, WIND.W)).toBeFalsy();
    expect(c.isSafeTile(TYPE.S, 5, WIND.S)).toBeFalsy();
  });
});

describe("wall/Wall", () => {
  test("配牌は 4 家 13 枚ずつ", () => {
    const w = new Wall();
    const hands = w.initialHands();
    for (const wind of Object.values(WIND))
      expect(new ActorHand(hands[wind]).hands).toHaveLength(13);
  });

  test("ドラ表示牌は最初 1 枚、カンごとに増える", () => {
    const w = new Wall();
    expect(w.doraIndicators).toHaveLength(1);
    expect(w.hiddenDoraIndicators).toHaveLength(1);
    w.openDoraIndicator();
    expect(w.doraIndicators).toHaveLength(2);
    expect(w.hiddenDoraIndicators).toHaveLength(2);
    w.openDoraIndicator();
    w.openDoraIndicator();
    expect(w.doraIndicators).toHaveLength(4);
    expect(() => w.openDoraIndicator()).toThrow(/exceeded maximum open dora/);
  });

  test("嶺上牌は 4 枚で、1 回のカンにつき山も 1 枚減る", () => {
    const w = new Wall();
    let drawable = 0;
    while (w.canDraw) {
      w.draw();
      drawable++;
    }
    const w2 = new Wall();
    expect(w2.canKan).toBe(true);
    for (let i = 0; i < 4; i++) w2.kan();
    expect(w2.canKan).toBe(false);
    expect(() => w2.kan()).toThrow(/exceeded maximum kan/);
    let drawableAfterKan = 0;
    while (w2.canDraw) {
      w2.draw();
      drawableAfterKan++;
    }
    // 4 回カンした分、ツモれる牌が 4 枚少ない
    expect(drawable - drawableAfterKan).toBe(4);
  });

  test("山の合計は 136 枚（王牌 14 枚を除いて 122 枚ツモれる）", () => {
    const w = new Wall();
    let n = 0;
    while (w.canDraw) {
      w.draw();
      n++;
    }
    expect(n).toBe(122);
  });

  test("export した状態から復元すると同じ順にツモれる", () => {
    const w = new Wall();
    const props = w.export();
    const first = [w.draw().toString(), w.draw().toString()];
    const restored = new Wall(props);
    expect([restored.draw().toString(), restored.draw().toString()]).toStrictEqual(
      first
    );
  });
});

describe("river/River", () => {
  test("discards() は全体、discards(w) は各家の捨て牌", () => {
    const r = new River();
    r.discard(new Tile(TYPE.M, 1), WIND.E);
    r.discard(new Tile(TYPE.P, 2), WIND.S);
    r.discard(new Tile(TYPE.S, 3), WIND.E);
    expect(r.discards().map((d) => d.t.toString())).toStrictEqual([
      "1m",
      "2p",
      "3s",
    ]);
    expect(r.discards(WIND.E).map((d) => d.t.toString())).toStrictEqual([
      "1m",
      "3s",
    ]);
    expect(r.discards(WIND.W)).toStrictEqual([]);
  });

  test("lastTile は最後の捨て牌と捨てた人", () => {
    const r = new River();
    r.discard(new Tile(TYPE.M, 1), WIND.E);
    r.discard(new Tile(TYPE.P, 2), WIND.S);
    expect(r.lastTile.t.toString()).toBe("2p");
    expect(r.lastTile.w).toBe(WIND.S);
  });

  test("捨て牌がないと lastTile は例外", () => {
    expect(() => new River().lastTile).toThrow();
  });

  test("四風連打は同じ風牌 4 連続のときだけ", () => {
    const four = (tiles: readonly Tile[]) => {
      const r = new River();
      const winds = Object.values(WIND);
      tiles.forEach((t, i) => r.discard(t, winds[i % 4]));
      return r.isFourWindsAbort();
    };
    const east = new Tile(TYPE.Z, 1);
    expect(four([east, east, east, east])).toBe(true);
    expect(four([east, east, east])).toBe(false);
    expect(four([east, east, east, east, east])).toBe(false);
    expect(four([east, east, east, new Tile(TYPE.Z, 2)])).toBe(false);
    // 数牌 4 連続は対象外
    const m1 = new Tile(TYPE.M, 1);
    expect(four([m1, m1, m1, m1])).toBe(false);
  });

  test("reset で全体と各家の両方が空になる", () => {
    const r = new River();
    r.discard(new Tile(TYPE.M, 1), WIND.E);
    r.reset();
    expect(r.discards()).toStrictEqual([]);
    expect(r.discards(WIND.E)).toStrictEqual([]);
  });
});

describe("ActorHand", () => {
  test("isBackHand は裏牌だけの手牌で true", () => {
    expect(new ActorHand("_____________").isBackHand()).toBe(true);
    expect(new ActorHand("123m456m789m12s3s").isBackHand()).toBe(false);
    expect(new ActorHand("").isBackHand()).toBe(false);
  });

  test("裏牌の手牌からの dec は裏牌が減り、渡した牌がそのまま返る", () => {
    const h = new ActorHand("___");
    const got = h.dec([new Tile(TYPE.M, 1)]);
    expect(got.map((t) => t.toString())).toStrictEqual(["1m"]);
    expect(h.get(TYPE.BACK, 0)).toBe(2);
  });

  test("clone は ActorHand を返し reached を引き継ぐ", () => {
    const h = new ActorHand("123m456m789m123s1z");
    h.reach();
    const c = h.clone();
    expect(c).toBeInstanceOf(ActorHand);
    expect(c.reached).toBe(true);
    expect(c.toString()).toBe(h.toString());
    // 複製は独立している
    c.inc([new Tile(TYPE.M, 1)]);
    expect(c.get(TYPE.M, 1)).toBe(h.get(TYPE.M, 1) + 1);
  });
});

describe("controller/鳴きの可否", () => {
  const withHand = (w: Wind, hand: string) => {
    const { c } = createLocalGame({ logger: silentLogger });
    c.observer.hands[w] = new ActorHand(hand);
    return c;
  };

  test("ポンは自分の捨て牌にはできない", () => {
    const c = withHand(WIND.E, "333m");
    expect(c.doPon(WIND.E, WIND.E, new Tile(TYPE.M, 3))).toBe(false);
  });

  test("ポンは 2 枚持っていないとできない", () => {
    const c = withHand(WIND.E, "34m");
    expect(c.doPon(WIND.E, WIND.S, new Tile(TYPE.M, 3))).toBe(false);
  });

  test("リーチ後は鳴けない", () => {
    const c = withHand(WIND.E, "333m456m789m12s3s");
    c.hand(WIND.E).reach();
    expect(c.doPon(WIND.E, WIND.S, new Tile(TYPE.M, 3))).toBe(false);
    expect(c.doChi(WIND.E, WIND.N, new Tile(TYPE.M, 3))).toBe(false);
    expect(c.doAnKan(WIND.E)).toBe(false);
    expect(c.doShoKan(WIND.E)).toBe(false);
    expect(c.doDaiKan(WIND.E, WIND.S, new Tile(TYPE.M, 3))).toBe(false);
    expect(c.doReach(WIND.E)).toBe(false);
  });

  test("チーは上家からのみ", () => {
    const c = withHand(WIND.S, "12m9p");
    expect(c.doChi(WIND.S, WIND.E, new Tile(TYPE.M, 3))).not.toBe(false);
    expect(c.doChi(WIND.S, WIND.W, new Tile(TYPE.M, 3))).toBe(false);
    expect(c.doChi(WIND.S, WIND.N, new Tile(TYPE.M, 3))).toBe(false);
  });

  test("字牌はチーできない", () => {
    const c = withHand(WIND.S, "123z");
    expect(c.doChi(WIND.S, WIND.E, new Tile(TYPE.Z, 3))).toBe(false);
  });

  test("大明槓は 3 枚持っているときだけ", () => {
    expect(
      withHand(WIND.E, "33m").doDaiKan(WIND.E, WIND.S, new Tile(TYPE.M, 3))
    ).toBe(false);
    expect(
      withHand(WIND.E, "333m").doDaiKan(WIND.E, WIND.S, new Tile(TYPE.M, 3))
    ).not.toBe(false);
  });

  test("暗槓は 4 枚揃っているときだけ", () => {
    expect(withHand(WIND.E, "333m").doAnKan(WIND.E)).toBe(false);
    expect(withHand(WIND.E, "3333m").doAnKan(WIND.E).toString()).toBe("_33m_");
  });

  test("加槓はポン済みの牌を引いたときだけ", () => {
    expect(withHand(WIND.E, "3m,4-44m").doShoKan(WIND.E)).toBe(false);
    expect(withHand(WIND.E, "3m,3-33m").doShoKan(WIND.E).toString()).toBe(
      "3-3-33m"
    );
  });
});

describe("controller/打牌候補", () => {
  test("リーチ後はツモ切りのみ", () => {
    const { c } = createLocalGame({ logger: silentLogger });
    c.observer.hands[WIND.E] = new ActorHand("123m456m789m123s1z");
    const hand = c.hand(WIND.E);
    hand.reach();
    hand.draw(new Tile(TYPE.P, 5));
    expect(c.doDiscard(WIND.E).map((t) => t.toString())).toStrictEqual(["t5p"]);
  });

  test("ポンした牌と同じ牌は切れない（喰い替え）", () => {
    const { c } = createLocalGame({ logger: silentLogger });
    c.observer.hands[WIND.E] = new ActorHand("133m5p");
    const pon = c.doPon(WIND.E, WIND.S, new Tile(TYPE.M, 3));
    expect(pon).not.toBe(false);
    // 実際の流れでは call 済みの手牌に対して呼ばれる
    c.hand(WIND.E).call((pon as never[])[0]);
    const got = c
      .doDiscard(WIND.E, (pon as never[])[0])
      .map((t) => t.toString());
    expect(got).toStrictEqual(["1m", "5p"]);
  });

  test("チーの喰い替えは現物と筋牌の両方が切れない", () => {
    const { c } = createLocalGame({ logger: silentLogger });
    c.observer.hands[WIND.E] = new ActorHand("1234m5p");
    const chi = c.doChi(WIND.E, WIND.N, new Tile(TYPE.M, 1));
    expect(chi).not.toBe(false);
    c.hand(WIND.E).call((chi as never[])[0]);
    // -123m を鳴いた場合、1m（現物）と 4m（筋）は切れない
    const got = c
      .doDiscard(WIND.E, (chi as never[])[0])
      .map((t) => t.toString());
    expect(got).toStrictEqual(["5p"]);
  });
});

describe("controller/九種九牌", () => {
  test("ちょうど 9 種で宣言できる", () => {
    const { c } = createLocalGame({ logger: silentLogger });
    // 1m 9m 1p 9p 1s 9s 1z 2z 3z = 9 種
    c.observer.hands[WIND.E] = new ActorHand("19m123459p19s123z");
    expect(c.canDeclareNineTerminalsAbort(WIND.E)).toBe(true);
  });

  test("8 種では宣言できない", () => {
    const { c } = createLocalGame({ logger: silentLogger });
    // 1m 9m 1p 9p 1s 1z 2z 3z = 8 種
    c.observer.hands[WIND.E] = new ActorHand("19m19p145566s123z");
    expect(c.canDeclareNineTerminalsAbort(WIND.E)).toBe(false);
  });

  test("同じ牌を複数持っていても 1 種として数える", () => {
    const { c } = createLocalGame({ logger: silentLogger });
    c.observer.hands[WIND.E] = new ActorHand("1111m1111p19s123z");
    expect(c.canDeclareNineTerminalsAbort(WIND.E)).toBe(false);
  });

  test("自分の捨て牌があると宣言できない", () => {
    const { c } = createLocalGame({ logger: silentLogger });
    c.observer.hands[WIND.E] = new ActorHand("19m19p19s1234z5z");
    c.river.discard(new Tile(TYPE.M, 1), WIND.E);
    expect(c.canDeclareNineTerminalsAbort(WIND.E)).toBe(false);
  });
});

describe("controller/リーチ", () => {
  test("テンパイかつ門前ならリーチできる", () => {
    const { c } = createLocalGame({ logger: silentLogger });
    c.observer.hands[WIND.E] = new ActorHand("123m456m789m123s1z");
    const got = c.doReach(WIND.E);
    expect(got).not.toBe(false);
    expect(
      (got as readonly { tile: Tile }[]).map((v) => v.tile.toString())
    ).toContain("1z");
  });

  test("鳴いているとリーチできない", () => {
    const { c } = createLocalGame({ logger: silentLogger });
    c.observer.hands[WIND.E] = new ActorHand("123m456m123s1z,-789m");
    expect(c.doReach(WIND.E)).toBe(false);
  });

  test("テンパイしていないとリーチできない", () => {
    const { c } = createLocalGame({ logger: silentLogger });
    c.observer.hands[WIND.E] = new ActorHand("123m456m789m135s1z");
    expect(c.doReach(WIND.E)).toBe(false);
  });
});

describe("controller/1 局を通す", () => {
  test("局は必ず終局し、点数の合計は保存される", () => {
    const { c } = createLocalGame({ shuffle: false, logger: silentLogger });
    c.start();
    expect(c.actor.getSnapshot().status).toBe("done");
    const sum = Object.values(c.scoreManager.summary).reduce((a, b) => a + b, 0);
    // リーチ棒が場に残っている場合はその分だけ減る
    expect(sum + c.placeManager.sticks.reach * 1000).toBe(100000);
  });

  test("局の履歴が 1 件残り、山を含む再開情報を持つ", () => {
    const { c } = createLocalGame({ shuffle: false, seed: 20260801, logger: silentLogger });
    c.start();
    const h = c.export();
    expect(h).toHaveLength(1);
    expect(h[0].round).toBe(ROUND.E1);
    // 記録するのは「局を始める直前」の値。
    // getter が内部の可変オブジェクトを返していたころも、DISTRIBUTE のたびに
    // manager 自体が作り直されるおかげで結果的に守られていた（C21 の「偶然」）。
    expect(h[0].scores).toStrictEqual({
      "player-1": 25000,
      "player-2": 25000,
      "player-3": 25000,
      "player-4": 25000,
    });
    expect(h[0].sticks).toStrictEqual({ reach: 0, dead: 0 });
    expect(c.scoreManager.summary).not.toStrictEqual(h[0].scores); // この局で点数は動く
    expect(Object.keys(h[0].players)).toHaveLength(4);
    const w = h[0].wall;
    expect(
      w.drawable.length +
        w.dead.length +
        w.doraIndicators.length +
        w.hiddenDoraIndicators.length +
        w.replacement.length
    ).toBe(136);
  });

  test("履歴からロードすると同じ局が同じ結果で再現される", () => {
    const { c } = createLocalGame({ shuffle: false, logger: silentLogger });
    c.start();
    const before = { ...c.scoreManager.summary };

    const replayed = Controller.load(c.export()[0]);
    replayed.start();
    expect(replayed.scoreManager.summary).toStrictEqual(before);
  });
});

describe("controller/鳴き牌の位置", () => {
  const pon = (caller: Wind, by: Wind) => {
    const { c } = createLocalGame({ logger: silentLogger });
    c.observer.hands[caller] = new ActorHand("333m");
    return c.doPon(caller, by, new Tile(TYPE.M, 3)).toString();
  };
  const daiKan = (caller: Wind, by: Wind) => {
    const { c } = createLocalGame({ logger: silentLogger });
    c.observer.hands[caller] = new ActorHand("333m");
    return c.doDaiKan(caller, by, new Tile(TYPE.M, 3)).toString();
  };

  test("ポンは上家から左端・対面から中央・下家から右端（C2）", () => {
    // 東家だけは方角の差の絶対値でも偶然一致するので、他の家も見る。
    expect([pon(WIND.E, WIND.N), pon(WIND.E, WIND.W), pon(WIND.E, WIND.S)])
      .toStrictEqual(["-333m", "3-33m", "33-3m"]);
    expect([pon(WIND.S, WIND.E), pon(WIND.S, WIND.N), pon(WIND.S, WIND.W)])
      .toStrictEqual(["-333m", "3-33m", "33-3m"]);
    expect([pon(WIND.N, WIND.W), pon(WIND.N, WIND.S), pon(WIND.N, WIND.E)])
      .toStrictEqual(["-333m", "3-33m", "33-3m"]);
  });

  test("大明槓は上家から左端・対面から 3 枚目・下家から右端（C2）", () => {
    expect([
      daiKan(WIND.E, WIND.N),
      daiKan(WIND.E, WIND.W),
      daiKan(WIND.E, WIND.S),
    ]).toStrictEqual(["-3333m", "33-33m", "333-3m"]);
    expect([
      daiKan(WIND.N, WIND.W),
      daiKan(WIND.N, WIND.S),
      daiKan(WIND.N, WIND.E),
    ]).toStrictEqual(["-3333m", "33-33m", "333-3m"]);
  });

  test("自分の捨て牌は鳴けない", () => {
    const { c } = createLocalGame({ logger: silentLogger });
    c.observer.hands[WIND.S] = new ActorHand("333m");
    expect(c.doPon(WIND.S, WIND.S, new Tile(TYPE.M, 3))).toBe(false);
  });
});

describe("controller/局の初期化", () => {
  test("DISTRIBUTE で河がリセットされる（C1）", () => {
    // 河が残ると 2 局目以降はフリテン・ダブルリーチ・四風連打・
    // 九種九牌の判定がすべて前の局の捨て牌に引きずられる。
    const { c } = createLocalGame({ logger: silentLogger });
    c.river.discard(new Tile(TYPE.M, 1), WIND.E);
    c.observer.handleEvent({
      id: "0",
      type: "DISTRIBUTE",
      wind: WIND.E,
      hands: createWindMap(() => "_____________"),
      doraIndicator: "1m",
      players: [],
      places: {},
      sticks: { reach: 0, dead: 0 },
      round: ROUND.E1,
      scores: {},
    });
    expect(c.river.discards()).toStrictEqual([]);
    expect(c.river.discards(WIND.E)).toStrictEqual([]);
  });
});

describe("state-machine", () => {
  test("参照しているアクションはすべて実装されている（C3）", () => {
    // xstate は未実装のアクション名を例外にせず黙って無視するので、
    // 綴り誤り（poned の "disable_none_shot"）が実行時まで表に出なかった。
    // setup() に移してからは同じ誤りがコンパイルで止まる（L7）。
    // このテストは、config を動的に組み立てるようになった場合の保険として残す。
    const { c } = createLocalGame({ logger: silentLogger });
    const machine = createControllerMachine(c) as unknown as {
      config: { states: Record<string, Record<string, unknown>> };
      implementations: { actions: Record<string, unknown> };
    };
    const implemented = new Set(Object.keys(machine.implementations.actions));

    const referenced = new Set<string>();
    // アクションは文字列か { type } か、その配列。guard も同じ形なので
    // entry / exit と、遷移の actions だけを見る。
    const collect = (v: unknown) => {
      if (Array.isArray(v)) return v.forEach(collect);
      if (typeof v == "string") return void referenced.add(v);
      const type = (v as { type?: unknown } | null)?.type;
      if (typeof type == "string") referenced.add(type);
    };
    const collectTransitions = (v: unknown) => {
      if (v == null) return;
      const transitions = Array.isArray(v) ? v : [v];
      for (const t of transitions)
        collect((t as { actions?: unknown } | null)?.actions);
    };
    for (const s of Object.values(machine.config.states)) {
      collect(s.entry);
      collect(s.exit);
      collectTransitions(s.always);
      for (const t of Object.values((s.on ?? {}) as Record<string, unknown>))
        collectTransitions(t);
    }

    expect(referenced.size).toBeGreaterThan(0); // 走査自体が空振りしていないこと
    expect([...referenced].filter((r) => !implemented.has(r))).toStrictEqual([]);
  });

  test("context は直列化できる（C18）", () => {
    // Controller やイベント ID の採番（クロージャ）が context に入っていると
    // 循環参照で JSON にできず、スナップショットを保存・復元できない。
    const { c } = createLocalGame({
      autoAdvance: false,
      shuffle: false,
      seed: 1,
      logger: silentLogger,
    });
    c.actor.start();
    c.next(true);
    c.next(true);

    const context = (c.actor.getPersistedSnapshot() as unknown as { context: unknown })
      .context;
    expect(Object.keys(context as object).sort()).toStrictEqual([
      "currentWind",
      "missingMap",
      "oneShotMap",
      "pendingNewDora",
    ]);
    // 素のデータだけであること（往復して同じなら関数や循環参照は無い）
    expect(JSON.parse(JSON.stringify(context))).toStrictEqual(context);
  });
});

describe("wall/replay", () => {
  test("山が尽きたら draw は専用のエラーを投げる（C12）", () => {
    const w = new Wall();
    while (w.canDraw) w.draw();
    expect(() => w.draw()).toThrow(/cannot draw any more/);
  });

  test("Replayer.prev は index が負になったら落ちる（C11）", () => {
    const r = new Replayer("[]");
    expect(() => r.prev()).toThrow();
  });
});

// PlayerEfficiency / RiskRank は Player の打ち方を決めるだけで、
// 返す牌も候補の中に限られる（＝不正な局面は作れない）。実装もまだ途中なので、
// controller-report.md では C10 を保留にしてある。
// ここでは「今はこう動く」ことだけ test.fails で残す。Player を仕上げるときに
// 通常の test に書き換えること。
describe("既知のバグ（保留）", () => {
  test.fails("C10: selectMinPriority は優先度が最小のものを返すべき", () => {
    const counter = new Counter();
    const mk = (t: Tile) => ({
      tile: t,
      sum: 0,
      effectiveTiles: [],
      shanten: 0,
    });
    // 役牌（5z）は calcPriority が 2 倍するので 1z より優先度が高い
    const got = PlayerEfficiency.selectMinPriority(
      counter,
      [mk(new Tile(TYPE.Z, 5)), mk(new Tile(TYPE.Z, 1))],
      []
    );
    // `let min = 0` かつ優先度は常に非負なので、常に先頭が返る
    expect(got.tile.toString()).toBe("1z");
  });
});
