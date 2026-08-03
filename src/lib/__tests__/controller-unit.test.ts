import {
  ActorHand,
  Controller,
  Counter,
  PlaceManager,
  PlayerEfficiency,
  Replayer,
  RiskRank,
  River,
  ScoreManager,
  Wall,
  createControllerMachine,
  createLocalGame,
  prioritizeDiscardedEvents,
  prioritizeDrawnEvents,
  type ChoiceAfterDrawnEvent,
  silentLogger,
} from "../controller";
import { Tile, createWindMap } from "../core";
import { OP, ROUND, TYPE, WIND, Wind } from "../core/constants";
import {
  anyBlock,
  anyWinResult,
  discardChoice,
  drawnChoice,
  withHand,
} from "./utils/controller";

// controller 配下の各モジュールを単体で固定する回帰テスト。
// controller-scenario.test.ts が状態機械を通さないと現れない性質を見るのに対して、
// こちらは部品ごとの性質（可否判定・manager・wall・river・優先順位）を扱う。

describe("events/優先順位", () => {
  test("捨て牌に対する優先順位は RON > DAI_KAN > PON > CHI", () => {
    const got = prioritizeDiscardedEvents([
      discardChoice(WIND.E, { CHI: anyBlock }),
      discardChoice(WIND.S, { PON: anyBlock }),
      discardChoice(WIND.W, { DAI_KAN: anyBlock[0] }),
      discardChoice(WIND.N, { RON: anyWinResult }),
    ]);
    expect(got.type).toBe("RON");
    expect(got.events.map((e) => e.wind)).toStrictEqual([WIND.N]);
  });

  test("同じ優先順位なら該当する全員が返る（ダブロン）", () => {
    const got = prioritizeDiscardedEvents([
      discardChoice(WIND.E, { RON: anyWinResult }),
      discardChoice(WIND.S, { CHI: anyBlock }),
      discardChoice(WIND.W, { RON: anyWinResult }),
    ]);
    expect(got.type).toBe("RON");
    // 東家が捨てているので、頭ハネの順は西家（下家寄り）→ 東家。
    expect(got.events.map((e) => e.wind)).toStrictEqual([WIND.W, WIND.E]);
  });

  test("同じ優先順位は放銃者の下家から順に返る（頭ハネ）", () => {
    // 南家の捨て牌に、北家（下家）と東家（上家）がロン。頭ハネは北家。
    const got = prioritizeDiscardedEvents([
      discardChoice(WIND.E, { RON: anyWinResult }, WIND.S),
      discardChoice(WIND.N, { RON: anyWinResult }, WIND.S),
    ]);
    expect(got.events.map((e) => e.wind)).toStrictEqual([WIND.N, WIND.E]);

    // 起点が変われば順も変わる（イベントの並び順には依存しない）。
    const got2 = prioritizeDiscardedEvents([
      discardChoice(WIND.N, { RON: anyWinResult }, WIND.W),
      discardChoice(WIND.E, { RON: anyWinResult }, WIND.W),
    ]);
    expect(got2.events.map((e) => e.wind)).toStrictEqual([WIND.N, WIND.E]);
  });

  test("誰も選択肢を持たない場合は空 + type=false", () => {
    const got = prioritizeDiscardedEvents([
      discardChoice(WIND.E, {}),
      discardChoice(WIND.S, {}),
    ]);
    expect(got.events).toStrictEqual([]);
    expect(got.type).toBe(false);
  });

  test("mailBox には返信の選択イベントしか入らない", () => {
    const { c } = createLocalGame({ logger: silentLogger });
    const draw = {
      id: "0",
      type: "DRAW",
      iam: WIND.E,
      wind: WIND.E,
      tile: "1m",
    } as const;
    expect(() => c.enqueue(draw)).toThrow(/unexpected reply/);
    expect(c.mailBox["0"]).toBeUndefined();

    // 返信なら溜まる
    c.enqueue(discardChoice(WIND.E, {}));
    expect(c.mailBox["0"]).toHaveLength(1);
  });

  test("同じイベント ID に種別が混ざったら落ちる", () => {
    const { c } = createLocalGame({ logger: silentLogger });
    c.mailBox["0"] = [discardChoice(WIND.E, {}), drawnChoice(WIND.S, {})];
    expect(() => c.pollReplies("0", [WIND.E, WIND.S])).toThrow(
      /mixed replies/
    );
  });

  test("ツモ番の優先順位は TSUMO > REACH > AN_KAN > SHO_KAN > 九種九牌 > DISCARD", () => {
    const order = [
      ["TSUMO", drawnChoice(WIND.E, { TSUMO: anyWinResult, DISCARD: ["1m"] })],
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

  test("候補 0 件の選択肢は選ばれない", () => {
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

  test("summary は写しを返す", () => {
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

  test("sticks と playerMap は写しを返す", () => {
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
    expect(() => w.openDoraIndicator()).not.toThrow();
    expect(w.doraIndicators).toHaveLength(5);
    expect(() => w.openDoraIndicator()).toThrow(/exceeded maximum open dora/);
  });

  test("カン 4 回ぶんのドラ表示牌がある", () => {
    // 嶺上牌が尽きるまでカンできるので、表示牌は最初の 1 枚 + カンの回数だけ要る。
    const w = new Wall();
    let kans = 0;
    while (w.canKan) {
      w.kan();
      w.openDoraIndicator(); // ここで落ちないこと
      kans++;
    }
    expect(kans).toBe(4);
    expect(w.doraIndicators).toHaveLength(kans + 1);
    expect(w.hiddenDoraIndicators).toHaveLength(kans + 1);
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

  test("嶺上牌が尽きたら 5 回目のカンは選択肢に出ない", () => {
    const c = withHand(WIND.E, "3333m,4-44m");
    expect(c.doAnKan(WIND.E)).not.toBe(false);
    while (c.wall.canKan) c.wall.kan(); // 4 回カンした状態にする
    expect(c.doAnKan(WIND.E)).toBe(false);
    expect(c.doShoKan(WIND.E)).toBe(false);
    expect(c.doDaiKan(WIND.E, WIND.S, new Tile(TYPE.M, 4))).toBe(false);
  });

  test("加槓はポン済みの牌を引いたときだけ", () => {
    expect(withHand(WIND.E, "3m,4-44m").doShoKan(WIND.E)).toBe(false);
    expect(withHand(WIND.E, "3m,3-33m").doShoKan(WIND.E).toString()).toBe(
      "3-3-33m"
    );
  });
});

// 可否だけでなく「どの形で鳴けるか」を固定する。赤 5 は同じ 5 でも別の牌として
// 並びに現れるので、組み合わせの数と並び順まで見ている。
describe("controller/鳴きブロックの形", () => {
  test("チーは鳴いた牌を先頭に置く", () => {
    const c = withHand(WIND.E, "406m1345p333z111z");
    expect(c.doChi(WIND.E, WIND.N, new Tile(TYPE.M, 7)).toString()).toBe(
      "-7r56m"
    );
  });

  test("チーは喰い替えになる形を返さない", () => {
    expect(
      withHand(WIND.E, "456m").doChi(WIND.E, WIND.N, new Tile(TYPE.M, 7))
    ).toBe(false);
    expect(
      withHand(WIND.E, "333345666m").doChi(WIND.E, WIND.N, new Tile(TYPE.M, 6))
    ).toBe(false);
  });

  test("チーはペンチャンでも成立する", () => {
    const c = withHand(WIND.E, "12m9p");
    expect(c.doChi(WIND.E, WIND.N, new Tile(TYPE.M, 3)).toString()).toBe(
      "-312m"
    );
  });

  test("チーは赤 5 を含む組み合わせも別の形として返す", () => {
    const t = new Tile(TYPE.M, 3);
    expect(
      withHand(WIND.E, "4r55m9p").doChi(WIND.E, WIND.N, t).toString()
    ).toBe("-345m,-34r5m");
    expect(
      withHand(WIND.E, "124r5m9p").doChi(WIND.E, WIND.N, t).toString()
    ).toBe("-312m,-324m,-34r5m");
    expect(
      withHand(WIND.E, "124r55m9p").doChi(WIND.E, WIND.N, t).toString()
    ).toBe("-312m,-345m,-324m,-34r5m");
  });

  test("ポンは鳴いた家に応じた位置に牌を置く", () => {
    const t = new Tile(TYPE.M, 3);
    // 上家（北家）から鳴けば左端、対面（西家）なら中央
    expect(withHand(WIND.E, "433m").doPon(WIND.E, WIND.N, t).toString()).toBe(
      "-333m"
    );
    expect(withHand(WIND.E, "433m").doPon(WIND.E, WIND.W, t).toString()).toBe(
      "3-33m"
    );
  });

  test("ポンは赤 5 の有無で形が分かれる", () => {
    const t5 = new Tile(TYPE.M, 5);
    const red5 = new Tile(TYPE.M, 5, [OP.RED]);
    // 手牌に赤 5 と 5 が 1 枚ずつなら、使える組み合わせは 1 つ
    expect(withHand(WIND.E, "50m333444z").doPon(WIND.E, WIND.S, t5).toString()).toBe(
      "r55-5m"
    );
    // 赤 5 を鳴くなら手牌から出るのは素の 5
    expect(
      withHand(WIND.E, "555m333444z").doPon(WIND.E, WIND.S, red5).toString()
    ).toBe("55-r5m");
    // 赤 5 と 5 が 2 枚ずつあれば、赤を使う形と使わない形の 2 つ
    expect(
      withHand(WIND.E, "505m333444z").doPon(WIND.E, WIND.S, t5).toString()
    ).toBe("r55-5m,55-5m");
  });

  test("大明槓は鳴いた牌を鳴いた家の位置に置く", () => {
    expect(
      withHand(WIND.E, "505m").doDaiKan(WIND.E, WIND.N, new Tile(TYPE.M, 5)).toString()
    ).toBe("-5r555m");
    expect(
      withHand(WIND.E, "555m")
        .doDaiKan(WIND.E, WIND.S, new Tile(TYPE.M, 5, [OP.RED]))
        .toString()
    ).toBe("555-r5m");
  });

  test("暗槓は裏牌で挟んだ形になる", () => {
    expect(withHand(WIND.E, "r5555m").doAnKan(WIND.E).toString()).toBe(
      "_r55m_"
    );
  });

  test("加槓した牌はポンしたブロックの先頭に足される", () => {
    expect(withHand(WIND.E, "r5m, 5-55m").doShoKan(WIND.E).toString()).toBe(
      "5-r5-55m"
    );
    expect(withHand(WIND.E, "5m, 5-r55m").doShoKan(WIND.E).toString()).toBe(
      "5-5-r55m"
    );
  });

  test("テンパイしていればロンできる", () => {
    const c = withHand(WIND.E, "406m123456p1123s");
    const got = c.doWin(WIND.E, new Tile(TYPE.S, 4), {
      winBy: { type: "ron", from: WIND.S },
    });
    expect(!!got).toBe(true);
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
    // manager 自体が作り直されるおかげで、写しを返す前も結果的に守られていた。
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

  test("ポンは上家から左端・対面から中央・下家から右端", () => {
    // 東家だけは方角の差の絶対値でも偶然一致するので、他の家も見る。
    expect([pon(WIND.E, WIND.N), pon(WIND.E, WIND.W), pon(WIND.E, WIND.S)])
      .toStrictEqual(["-333m", "3-33m", "33-3m"]);
    expect([pon(WIND.S, WIND.E), pon(WIND.S, WIND.N), pon(WIND.S, WIND.W)])
      .toStrictEqual(["-333m", "3-33m", "33-3m"]);
    expect([pon(WIND.N, WIND.W), pon(WIND.N, WIND.S), pon(WIND.N, WIND.E)])
      .toStrictEqual(["-333m", "3-33m", "33-3m"]);
  });

  test("大明槓は上家から左端・対面から 3 枚目・下家から右端", () => {
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
  test("DISTRIBUTE で河がリセットされる", () => {
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
  test("参照しているアクションはすべて実装されている", () => {
    // xstate は未実装のアクション名を例外にせず黙って無視するので、
    // 綴り誤り（poned の "disable_none_shot"）が実行時まで表に出なかった。
    // setup() に移してからは同じ誤りがコンパイルで止まる。
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

  test("context は直列化できる", () => {
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
  test("山が尽きたら draw は専用のエラーを投げる", () => {
    const w = new Wall();
    while (w.canDraw) w.draw();
    expect(() => w.draw()).toThrow(/cannot draw any more/);
  });

  test("Replayer.prev は index が負になったら落ちる", () => {
    const r = new Replayer("[]");
    expect(() => r.prev()).toThrow();
  });
});

// PlayerEfficiency は Player の打ち方を決めるだけで、返す牌も候補の中に限られる
// （＝ここが間違っても不正な局面は作れない）。それでも「価値が低いものを切る」
// という選び方そのものは固定しておく。
describe("PlayerEfficiency", () => {
  const mk = (t: Tile) => ({
    tile: t,
    sum: 0,
    effectiveTiles: [],
    shanten: 0,
  });
  // 東場・東家。1z が自風かつ場風になる。
  const ctx = (doras: Tile[] = []) => ({
    doras: doras,
    myWind: WIND.E,
    roundWind: WIND.E,
  });
  const select = (tiles: Tile[], doras: Tile[] = []) =>
    PlayerEfficiency.selectMinPriority(
      new Counter(),
      tiles.map(mk),
      ctx(doras)
    ).tile.toString();

  test("優先度が最小のものを返す（先頭ではない）", () => {
    // 三元牌（5z）は役牌なので 2z より価値が高い。順序を変えても結果は変わらない。
    expect(select([new Tile(TYPE.Z, 5), new Tile(TYPE.Z, 2)])).toBe("2z");
    expect(select([new Tile(TYPE.Z, 2), new Tile(TYPE.Z, 5)])).toBe("2z");
  });

  test("自風・場風は役牌として扱う", () => {
    // 東家の東場なので 1z は役牌。2z は自風でも場風でもない。
    expect(select([new Tile(TYPE.Z, 1), new Tile(TYPE.Z, 2)])).toBe("2z");
  });

  test("ドラは残す", () => {
    const dora = new Tile(TYPE.Z, 2);
    expect(select([new Tile(TYPE.Z, 2), new Tile(TYPE.Z, 3)], [dora])).toBe(
      "3z"
    );
  });

  test("赤牌は残す", () => {
    // 赤 5 は n=5 + OP.RED に正規化されるので、印を見ないと同じ牌になる。
    const red = new Tile(TYPE.M, 5, [OP.RED]);
    expect(select([red, new Tile(TYPE.M, 5)])).toBe("5m");
  });

  test("同じ枚数なら端の牌のほうが価値が低い", () => {
    expect(select([new Tile(TYPE.M, 1), new Tile(TYPE.M, 5)])).toBe("1m");
  });
});

// RiskRank は立直された後のベタオリで「どれが一番安全か」を決める。
// 現物（その人の捨て牌）は 0、筋が通っていれば下がる、という段階を固定する。
describe("RiskRank", () => {
  const counterWithSafeTiles = (tiles: readonly Tile[], target: Wind) => {
    const c = new Counter();
    for (const t of tiles) c.addTileToSafeMap(t, target);
    return c;
  };

  test("現物は危険度 0", () => {
    const t = new Tile(TYPE.M, 5);
    const c = counterWithSafeTiles([t], WIND.S);
    expect(RiskRank.rank(c, [WIND.S], t)).toBe(0);
    // 同じ牌でも、記録していない家に対しては現物ではない
    expect(RiskRank.rank(c, [WIND.W], t)).toBeGreaterThan(0);
  });

  test("筋が通っているほど危険度が下がる", () => {
    const t = new Tile(TYPE.M, 5);
    const both = counterWithSafeTiles(
      [new Tile(TYPE.M, 2), new Tile(TYPE.M, 8)],
      WIND.S
    );
    const one = counterWithSafeTiles([new Tile(TYPE.M, 2)], WIND.S);
    const none = new Counter();
    expect(RiskRank.rank(both, [WIND.S], t)).toBeLessThan(
      RiskRank.rank(one, [WIND.S], t)
    );
    expect(RiskRank.rank(one, [WIND.S], t)).toBeLessThan(
      RiskRank.rank(none, [WIND.S], t)
    );
  });

  test("端の牌は中張牌より安全", () => {
    const c = new Counter();
    expect(RiskRank.rank(c, [WIND.S], new Tile(TYPE.M, 1))).toBeLessThan(
      RiskRank.rank(c, [WIND.S], new Tile(TYPE.M, 5))
    );
  });

  test("字牌は場に見えている枚数が多いほど安全", () => {
    const c = new Counter();
    const t = new Tile(TYPE.Z, 1);
    const before = RiskRank.rank(c, [WIND.S], t);
    c.dec(t, t); // 2 枚見えた
    expect(RiskRank.rank(c, [WIND.S], t)).toBeLessThan(before);
  });

  test("複数人が立直していれば最も危険な人に合わせる", () => {
    const t = new Tile(TYPE.M, 5);
    // 南家には現物、西家には無筋
    const c = counterWithSafeTiles([t], WIND.S);
    expect(RiskRank.rank(c, [WIND.S], t)).toBe(0);
    expect(RiskRank.rank(c, [WIND.S, WIND.W], t)).toBe(
      RiskRank.rank(c, [WIND.W], t)
    );
  });

  test("selectTile は最も安全な牌を返す", () => {
    const safe = new Tile(TYPE.M, 5);
    const c = counterWithSafeTiles([safe], WIND.S);
    const got = RiskRank.selectTile(c, [WIND.S], [
      new Tile(TYPE.P, 5), // 無筋の中張牌
      safe, // 現物
      new Tile(TYPE.S, 3),
    ]);
    expect(got.toString()).toBe("5m");
  });

  test("種類の違う牌を渡すと弾く", () => {
    const c = new Counter();
    expect(() => RiskRank.rankZ(c, WIND.S, new Tile(TYPE.M, 1))).toThrow(
      /expected TYPE.Z/
    );
    expect(() => RiskRank.rankN(c, WIND.S, new Tile(TYPE.Z, 1))).toThrow(
      /expected TYPE.NUMBER/
    );
  });
});
