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
} from "../controller";
import { Tile } from "../core";
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
      ["REACH", drawnChoice(WIND.E, { REACH: [] as never, DISCARD: ["1m"] })],
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

  test("空配列の選択肢も「選べる」と見なされる（C13）", () => {
    // hasChoices / calculatePriority は truthy 判定で、JS では [] は truthy。
    // このため候補 0 件の REACH が DISCARD より優先され、
    // pollReplies の `candidates[0].tile` が undefined 参照で落ちる。
    // 直したら DISCARD が選ばれるはずなので、期待値を書き換えること。
    const got = prioritizeDrawnEvents([
      drawnChoice(WIND.E, { REACH: [], DISCARD: ["1m"] }),
    ]);
    expect(got.type).toBe("REACH");
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
    const { c } = createLocalGame();
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
    const { c } = createLocalGame();
    c.observer.hands[WIND.E] = new ActorHand("123m456m789m123s1z");
    const hand = c.hand(WIND.E);
    hand.reach();
    hand.draw(new Tile(TYPE.P, 5));
    expect(c.doDiscard(WIND.E).map((t) => t.toString())).toStrictEqual(["t5p"]);
  });

  test("ポンした牌と同じ牌は切れない（喰い替え）", () => {
    const { c } = createLocalGame();
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
    const { c } = createLocalGame();
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
    const { c } = createLocalGame();
    // 1m 9m 1p 9p 1s 9s 1z 2z 3z = 9 種
    c.observer.hands[WIND.E] = new ActorHand("19m123459p19s123z");
    expect(c.canDeclareNineTerminalsAbort(WIND.E)).toBe(true);
  });

  test("8 種では宣言できない", () => {
    const { c } = createLocalGame();
    // 1m 9m 1p 9p 1s 1z 2z 3z = 8 種
    c.observer.hands[WIND.E] = new ActorHand("19m19p145566s123z");
    expect(c.canDeclareNineTerminalsAbort(WIND.E)).toBe(false);
  });

  test("同じ牌を複数持っていても 1 種として数える", () => {
    const { c } = createLocalGame();
    c.observer.hands[WIND.E] = new ActorHand("1111m1111p19s123z");
    expect(c.canDeclareNineTerminalsAbort(WIND.E)).toBe(false);
  });

  test("自分の捨て牌があると宣言できない", () => {
    const { c } = createLocalGame();
    c.observer.hands[WIND.E] = new ActorHand("19m19p19s1234z5z");
    c.river.discard(new Tile(TYPE.M, 1), WIND.E);
    expect(c.canDeclareNineTerminalsAbort(WIND.E)).toBe(false);
  });
});

describe("controller/リーチ", () => {
  test("テンパイかつ門前ならリーチできる", () => {
    const { c } = createLocalGame();
    c.observer.hands[WIND.E] = new ActorHand("123m456m789m123s1z");
    const got = c.doReach(WIND.E);
    expect(got).not.toBe(false);
    expect(
      (got as readonly { tile: Tile }[]).map((v) => v.tile.toString())
    ).toContain("1z");
  });

  test("鳴いているとリーチできない", () => {
    const { c } = createLocalGame();
    c.observer.hands[WIND.E] = new ActorHand("123m456m123s1z,-789m");
    expect(c.doReach(WIND.E)).toBe(false);
  });

  test("テンパイしていないとリーチできない", () => {
    const { c } = createLocalGame();
    c.observer.hands[WIND.E] = new ActorHand("123m456m789m135s1z");
    expect(c.doReach(WIND.E)).toBe(false);
  });
});

describe("controller/1 局を通す", () => {
  test("局は必ず終局し、点数の合計は保存される", () => {
    const { c } = createLocalGame({ shuffle: false });
    c.start();
    expect(c.actor.getSnapshot().status).toBe("done");
    const sum = Object.values(c.scoreManager.summary).reduce((a, b) => a + b, 0);
    // リーチ棒が場に残っている場合はその分だけ減る
    expect(sum + c.placeManager.sticks.reach * 1000).toBe(100000);
  });

  test("局の履歴が 1 件残り、山を含む再開情報を持つ", () => {
    const { c } = createLocalGame({ shuffle: false });
    c.start();
    const h = c.export();
    expect(h).toHaveLength(1);
    expect(h[0].round).toBe(ROUND.E1);
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
    const { c } = createLocalGame({ shuffle: false });
    c.start();
    const before = { ...c.scoreManager.summary };

    const replayed = Controller.load(c.export()[0]);
    replayed.start();
    expect(replayed.scoreManager.summary).toStrictEqual(before);
  });
});

// ここから下は controller-report.md に挙げた確認済みのバグ。
// 現状は「期待どおりに動かない」ことを test.fails で固定してある。
// 修正するとこのテストが失敗に転じるので、通常の test に書き換えること。
describe("既知のバグ", () => {
  test("C2: 鳴いた牌の位置は東家からは正しい", () => {
    const { c } = createLocalGame();
    const pon = (by: Wind) => {
      c.observer.hands[WIND.E] = new ActorHand("333m");
      return c.doPon(WIND.E, by, new Tile(TYPE.M, 3)).toString();
    };
    expect(pon(WIND.N)).toBe("-333m"); // 上家 → 左端
    expect(pon(WIND.W)).toBe("3-33m"); // 対面 → 中央
    expect(pon(WIND.S)).toBe("33-3m"); // 下家 → 右端
  });

  test.fails("C2: 南家が上家（東家）からポンすると鳴き牌は左端になるべき", () => {
    const { c } = createLocalGame();
    c.observer.hands[WIND.S] = new ActorHand("333m");
    // getCallBlockIndex が方角の差を Math.abs で見ているため、
    // 上家（距離 -1）と下家（距離 +1）が区別できず右端になる
    expect(c.doPon(WIND.S, WIND.E, new Tile(TYPE.M, 3)).toString()).toBe(
      "-333m"
    );
  });

  test.fails("C2: 北家が下家（東家）から大明槓すると鳴き牌は右端になるべき", () => {
    const { c } = createLocalGame();
    c.observer.hands[WIND.N] = new ActorHand("333m");
    expect(c.doDaiKan(WIND.N, WIND.E, new Tile(TYPE.M, 3)).toString()).toBe(
      "333-3m"
    );
  });

  test.fails("C1: 次局の開始時に河はリセットされるべき", () => {
    const { c } = createLocalGame({ shuffle: false });
    c.start();
    expect(c.river.discards().length).toBeGreaterThan(0);
    // startGame が次局のために行っているリセット（controller.ts:420-424 相当）
    c.wall = new Wall();
    c.observer.applied = {};
    c.mailBox = {};
    // 河が残るため 2 局目以降はフリテン・ダブルリーチ・四風連打・
    // 九種九牌の判定がすべて 1 局目の捨て牌に引きずられる
    expect(c.river.discards()).toStrictEqual([]);
  });

  test.fails("C3: 状態機械が参照するアクションはすべて実装されているべき", () => {
    const { c } = createLocalGame();
    const machine = createControllerMachine(c) as unknown as {
      config: { states: Record<string, Record<string, unknown>> };
      implementations: { actions: Record<string, unknown> };
    };
    const implemented = new Set(Object.keys(machine.implementations.actions));
    const referenced = new Set<string>();
    const walk = (v: unknown) => {
      if (Array.isArray(v)) return v.forEach(walk);
      if (v == null || typeof v != "object") return;
      const o = v as Record<string, unknown>;
      if (typeof o.type == "string" && "type" in o && Object.keys(o).length <= 2)
        referenced.add(o.type);
      Object.values(o).forEach(walk);
    };
    for (const s of Object.values(machine.config.states))
      for (const key of ["entry", "exit", "on", "always"]) walk(s[key]);

    // poned が "disable_none_shot"（one の綴り誤り）を参照している。
    // xstate は未実装のアクション名を黙って無視するため、
    // ポンで一発が消えない。
    expect([...referenced].filter((r) => !implemented.has(r))).toStrictEqual([]);
  });

  test.fails("C12: 山が尽きたら draw は専用のエラーを投げるべき", () => {
    const w = new Wall();
    while (w.canDraw) w.draw();
    // ガードが `!this.walls.drawable` で配列オブジェクトを見ているため
    // 常に truthy。pop() の undefined が Tile.from に渡って別の例外になる。
    expect(() => w.draw()).toThrow(/cannot draw any more/);
  });

  test.fails("C11: Replayer.prev は index が負になったら落ちるべき", () => {
    const r = new Replayer("[]");
    // assert(this.index < 0) は条件が反転している
    expect(() => r.prev()).toThrow();
  });

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
