import {
  ShantenCalculator,
  BlockCalculator,
  Hand,
  HandData,
  MutableCounts,
  TileCounts,
  cloneTileCounts,
  PointCalculator,
  BoardContext,
  WinResult,
  Yaku,
  allBlockCombinations,
  calcEffectiveTiles,
  getEffectiveTiles,
  combinationsOfNumType,
} from "../calculator";
import { TYPE, OP, Wind, WIND, ROUND } from "../core/constants";
import { Block, Parser, Tile } from "../core";
import { handsToString } from "./utils/helper";
describe("Hand/基本操作", () => {
  /**
   * 手牌の内部状態を素の値へ落としたもの。
   * 枚数の持ち方（TileStore）に依存せず、値だけを比較するために使う。
   */
  interface HandSnapshot {
    counts: TileCounts;
    back: number;
    called: readonly Block[];
    tsumo: Tile | null;
    reached: boolean;
  }
  const getData = (h: Hand): HandSnapshot => {
    const d = (h as any).data as HandData;
    return {
      counts: cloneTileCounts(d.counts.tiles),
      back: d.counts.back,
      called: d.called,
      tsumo: d.tsumo,
      reached: d.reached,
    };
  };
  test("init", () => {
    const c = new Hand("12234m123w1d, -123s, t2p");
    const want: HandSnapshot = {
      counts: {
        [TYPE.M]: [0, 1, 2, 1, 1, 0, 0, 0, 0, 0],
        [TYPE.S]: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [TYPE.P]: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
        [TYPE.Z]: [0, 1, 1, 1, 0, 1, 0, 0],
      },
      back: 0,
      called: new Parser("-123s").parse(),
      reached: false,
      tsumo: new Tile(TYPE.P, 2, [OP.TSUMO]),
    };
    expect(getData(c)).toStrictEqual(want);
  });
  // clone は直列化を挟まず data を複製する。晒したブロック・ツモ牌・リーチも
  // そのまま引き継ぎ、複製を打っても元の手牌は動かない。
  test("clone", () => {
    const h = new Hand("12234m123w1d, -123s, t2p");
    const c = h.clone();
    expect(getData(c)).toStrictEqual(getData(h));
    expect(c.toString()).toBe(h.toString());
    expect(c.drawn?.toString()).toBe("t2p");
    expect(c.called.map((b) => b.toString())).toStrictEqual(["-123s"]);

    c.discard(new Tile(TYPE.M, 1));
    expect(c.get(TYPE.M, 1)).toBe(0);
    expect(h.get(TYPE.M, 1)).toBe(1);
    expect(h.drawn?.toString()).toBe("t2p");
  });
  test("operations", () => {
    const h = new Hand("122234m123w1d");
    const want: HandSnapshot = {
      counts: {
        [TYPE.M]: [0, 1, 3, 1, 1, 0, 0, 0, 0, 0],
        [TYPE.S]: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [TYPE.P]: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [TYPE.Z]: [0, 1, 1, 1, 0, 1, 0, 0],
      },
      back: 0,
      called: [],
      reached: false,
      tsumo: null,
    };
    // initial check
    expect(getData(h)).toStrictEqual(want);

    const tsumo = new Tile(TYPE.M, 2, [OP.TSUMO]);
    h.draw(tsumo);
    want.tsumo = tsumo;
    want.counts[TYPE.M][tsumo.n] += 1;
    expect(getData(h)).toStrictEqual(want);

    const chi = new Parser("-534m").parse()[0];
    h.call(chi);
    want.called = [...want.called, chi];
    want.counts.m[3] -= 1;
    want.counts.m[4] -= 1;
    want.tsumo = null;
    expect(getData(h)).toStrictEqual(want);

    const ankan = new Parser("_22_m").parse()[0];
    h.kan(ankan);
    want.called = [...want.called, ankan];
    want.counts.m[2] -= 4;
    expect(getData(h)).toStrictEqual(want);

    expect(() => {
      h.discard(tsumo);
    }).toThrow(/invalid hand:/);
  });

  test("inc/dec/5mでr5mを削除するがincは削除したr5mを元に戻す", () => {
    const h = new Hand("406m");
    const dtiles = h.dec([new Tile(TYPE.M, 5)]);
    h.inc(dtiles);
    expect(h.toString()).toStrictEqual("4r56m");
  });
  test("inc/dec/r5mを削除しincして元に戻す", () => {
    const h = new Hand("405556m");
    const dtiles = h.dec([new Tile(TYPE.M, 5, [OP.RED])]);
    h.inc(dtiles);
    expect(h.toString()).toStrictEqual("4r55556m");
  });
  test("inc/dec/r5mを追加し削除すると元の手牌になる", () => {
    const h = new Hand("4556m");
    const itiles = h.inc([new Tile(TYPE.M, 5, [OP.RED])]);
    h.dec(itiles);
    expect(h.toString()).toStrictEqual("4556m");
  });
  // 赤 5 の巻き戻しは TileStore に集約されている。対局中の手牌（Hand）からも
  // 探索用の写し（MutableCounts）からも、同じ規則で赤が復元されること。
  test("inc/dec/赤 5 の扱いが Hand と MutableCounts で揃う", () => {
    const h = new Hand("406m"); // 4m r5m 6m
    const w = MutableCounts.of(h);

    // 探索用の写し: 5m を抜くと、赤が解決された r5m が渡る
    const viaCounts = w.without([new Tile(TYPE.M, 5)], (removed) =>
      removed.map((t) => t.toString()).join(""),
    );
    expect(viaCounts).toBe("r5m");
    // without は抜き差しを対にするので、前後で内容は変わらない
    expect(w.toString()).toBe("4r56m");

    // 対局中の手牌: 同じ牌を渡すと同じ牌が返り、そのまま戻せる
    const removed = h.dec([new Tile(TYPE.M, 5)]);
    expect(removed.map((t) => t.toString()).join("")).toBe("r5m");
    h.inc(removed);
    expect(h.toString()).toBe("4r56m");
  });
  test("idempotency hand", () => {
    const input = "123m123s123p1z,t1z";
    const h = new Hand(input);
    expect(h.drawn?.toString()).toEqual("t1z");
    const ch = new Hand(h.toString());
    expect(ch.drawn?.toString()).toEqual("t1z");
    expect(h.toString()).toEqual("123m123p123s1z,t1z");
  });
  test("idempotency hand with red", () => {
    const input = "789m123r5789p123s";
    const h = new Hand(input);
    h.draw(new Tile(TYPE.P, 5));
    expect(h.toString()).toEqual("789m123r5789p123s,t5p");
  });
  test("pass massive input", () => {
    const input = "2345s123123123s12s";
    expect(() => {
      new Hand(input);
    }).toThrow(/invalid hand: tile 2s exists more than 4 times in /);
  });

  // 計算器は探索の過程で手牌を破壊的に変更する。その影響が呼び出し側へ漏れないこと。
  test("calculators leave the hand untouched", () => {
    const h = new Hand("123456789m1p123s");
    const want = h.toString();

    new ShantenCalculator(h).calc();
    new BlockCalculator(h).calc(new Tile(TYPE.P, 1, [OP.TSUMO]));
    calcEffectiveTiles(h, h.hands);
    getEffectiveTiles(h);

    expect(h.toString()).toBe(want);
  });

  // 計算の途中で例外が飛んでも、手牌には影響しないこと。
  // 打牌候補に手牌にない牌を混ぜると、いくつか計算した後で失敗する。
  test("a failure during the search does not break the hand", () => {
    const h = new Hand("123456789m1p123s");
    const want = h.toString();

    const choices = [...h.hands.slice(0, 3), new Tile(TYPE.P, 9)];
    expect(() => calcEffectiveTiles(h, choices)).toThrow(
      /invalid hand: tile 9p does not exist/,
    );

    expect(h.toString()).toBe(want);
  });
});

describe("Shanten Calculator", () => {
  const tests: {
    name: string;
    input: string;
    want: number;
    calc: (c: ShantenCalculator) => number;
  }[] = [
    {
      name: "seven pairs tenpai",
      input: "1122334455667m",
      want: 0,
      calc: (c) => c.sevenPairs(),
    },
    {
      name: "seven pairs 1 shanten",
      input: "1122334455678m",
      want: 1,
      calc: (c) => c.sevenPairs(),
    },
    {
      name: "seven pairs 1 shanten",
      input: "1111s2233p445579m",
      want: 1,
      calc: (c) => c.sevenPairs(),
    },
    {
      name: "seven pairs 2 shanten",
      input: "1122334456789m",
      want: 2,
      calc: (c) => c.sevenPairs(),
    },
    {
      name: "seven pairs 3 shanten",
      input: "112233456789m1s",
      want: 3,
      calc: (c) => c.sevenPairs(),
    },
    {
      name: "seven pairs 3 shanten",
      input: "1123456789m123s",
      want: 5,
      calc: (c) => c.sevenPairs(),
    },
    {
      name: "thirteen orphans waiting 13 tiles",
      input: "19m19s19p1234567z",
      want: 0,
      calc: (c) => c.thirteenOrphans(),
    },
    {
      name: "thirteen orphans waiting 7z",
      input: "19m19s19p123456z1p",
      want: 0,
      calc: (c) => c.thirteenOrphans(),
    },
    {
      name: "thirteen orphans 13 tiles",
      input: "19m19s19p123456w2p",
      want: 1,
      calc: (c) => c.thirteenOrphans(),
    },
    {
      name: "standardType",
      input: "123m456m789m123s1p",
      want: 0,
      calc: (c) => c.standardType(),
    },
    {
      name: "standardType",
      input: "123m456m789m12s11p",
      want: 0,
      calc: (c) => c.standardType(),
    },
    {
      name: "standardType",
      input: "123m456m789m12s1p1z",
      want: 1,
      calc: (c) => c.standardType(),
    },
    {
      name: "standardType",
      input: "111m456m789m12s1p1z",
      want: 1,
      calc: (c) => c.standardType(),
    },
  ];

  for (const tt of tests) {
    test(`${tt.name}/${tt.input}`, () => {
      const c = new ShantenCalculator(new Hand(tt.input));
      expect(tt.calc(c)).toBe(tt.want);
    });
  }
});

describe("Block Calculator", () => {
  const tests: {
    name: string;
    input: string;
    want: string[][];
    calc: (c: BlockCalculator) => readonly (readonly Block[])[];
  }[] = [
    {
      name: "seven pairs tenpai",
      input: "11223344556677m",
      want: [["11m", "22m", "33m", "44m", "55m", "66m", "77m"]],
      calc: (c) => c.sevenPairs(),
    },
    {
      name: "thirteen orphans waiting 13 tiles",
      input: "19m19s19p1234567z1m",
      want: [
        [
          "11m",
          "9m",
          "1p",
          "9p",
          "1s",
          "9s",
          "1z",
          "2z",
          "3z",
          "4z",
          "5z",
          "6z",
          "7z",
        ],
      ],
      calc: (c) => c.thirteenOrphans(),
    },
    {
      name: "nine gates",
      input: "11123456789990m",
      want: [["111234r55678999m"]],
      calc: (c) => c.nineGates(),
    },
    {
      name: "simple",
      input: "111m456m789m123s11p",
      want: [["11p", "111m", "456m", "789m", "123s"]],
      calc: (c) => c.standardType(),
    },
    {
      name: "with called",
      input: "111m456m789m11p,-213s",
      want: [["11p", "111m", "456m", "789m", "-213s"]],
      calc: (c) => c.standardType(),
    },
    {
      name: "multiple/three and run",
      input: "111222333m123s11p",
      want: [
        ["11p", "123m", "123m", "123m", "123s"],
        ["11p", "111m", "222m", "333m", "123s"],
      ],
      calc: (c) => c.standardType(),
    },
    {
      name: "complex 清一色",
      input: "11223344556677m",
      want: [
        ["11m", "234m", "234m", "567m", "567m"],
        ["44m", "123m", "123m", "567m", "567m"],
        ["77m", "123m", "123m", "456m", "456m"],
      ],
      calc: (c) => c.standardType(),
    },
    {
      name: "standardType",
      input: "111123m123s123p11z",
      want: [["11z", "123m", "111m", "123p", "123s"]],
      calc: (c) => c.standardType(),
    },
    {
      name: "standardType",
      input: "123m123s123p111z22m",
      want: [["22m", "123m", "123p", "123s", "111z"]],
      calc: (c) => c.standardType(),
    },
    {
      name: "standardType with red",
      input: "123m123pr555s111z22m",
      want: [["22m", "123m", "123p", "r555s", "111z"]],
      calc: (c) => c.standardType(),
    },
    {
      name: "seven with red",
      input: "11s33sr55s66s88s11z22z",
      want: [["11s", "33s", "r55s", "66s", "88s", "11z", "22z"]],
      calc: (c) => c.sevenPairs(),
    },
  ];

  for (const tt of tests) {
    test(`${tt.name}/${tt.input}`, () => {
      const c = new BlockCalculator(new Hand(tt.input));
      expect(handsToString(tt.calc(c))).toStrictEqual(tt.want);
    });
  }
});

describe("Block Calculator2", () => {
  test("ツモの印が付いた牌でもブロックパターンは変わらない", () => {
    const h = new Hand("1223m123s111z, -123m");
    h.draw(new Tile(TYPE.M, 2));
    const c = new BlockCalculator(h);
    const want = [
      ["t22m", "123m", "123s", "111z", "-123m"],
      ["22m", "1t23m", "123s", "111z", "-123m"],
    ];
    const got = handsToString(c.calc(h.drawn!));
    expect(got).toStrictEqual(want);
  });
  test("red op と tsumo op だがパターンは増えない", () => {
    const h = new Hand("44r5566m, 123s, 123p, 11z");
    const want = [["11z", "4t56m", "4r56m", "123p", "123s"]];
    const c = new BlockCalculator(h);
    const got = handsToString(c.calc(new Tile(TYPE.M, 5, [OP.TSUMO])));
    expect(got).toStrictEqual(want);
  });
  test("暗黙的なロンの対応", () => {
    const h = new Hand("44r5566m, 123s, 123p, 11z");
    const want = [["11z", "456m", "4vr56m", "123p", "123s"]];
    const c = new BlockCalculator(h);
    const got = handsToString(c.calc(new Tile(TYPE.M, 5, [OP.RED])));
    expect(got).toStrictEqual(want);
  });
});

describe("combinationsOfNumType/allBlockCombinations", () => {
  test("combinationsOfNumType()", () => {
    const h = new Hand("111222333456m");
    const got = combinationsOfNumType(MutableCounts.of(h), TYPE.M);
    const want = [
      ["123m", "123m", "123m", "456m"],
      ["111m", "234m"],
      ["111m", "222m", "345m"],
      ["111m", "222m", "333m", "456m"],
    ];
    expect(handsToString(got)).toStrictEqual(want);
  });

  test("allBlockCombinations()", () => {
    const h = new Hand("111222333456m111s");
    const got = allBlockCombinations(MutableCounts.of(h), h.called);
    const want = [
      ["123m", "123m", "123m", "456m", "111s"],
      ["111m", "234m", "111s"],
      ["111m", "222m", "345m", "111s"],
      ["111m", "222m", "333m", "456m", "111s"],
    ];
    expect(handsToString(got)).toStrictEqual(want);
  });

  test("allBlockCombinations() with red/Block[] 内で 5s を使用したパターンが 2 つあるため r5s と入れ替えパターンが発生する", () => {
    const h = new Hand("4r5667s,t5s");
    const got = allBlockCombinations(MutableCounts.of(h), h.called);
    const want = [
      ["456s", "r567s"],
      ["4r56s", "567s"],
    ];
    expect(handsToString(got)).toStrictEqual(want);
  });

  test("allBlockCombinations() with multiple red: 2*2", () => {
    const h = new Hand("34r55677m34r5567p, t4m");
    const got = allBlockCombinations(MutableCounts.of(h), h.called);
    const want = [
      ["345m", "4r56m", "345p", "r567p"],
      ["345m", "4r56m", "34r5p", "567p"],
      ["34r5m", "456m", "345p", "r567p"],
      ["34r5m", "456m", "34r5p", "567p"],
    ];
    expect(handsToString(got)).toStrictEqual(want);
  });

  test("Block[] 内で 5m を使用した2つのブロックパータンがないためが、r5 の入れ替えパターン（[444m, r567m])が発生しない", () => {
    const h = new Hand("44r55567m, t4m");
    const got = allBlockCombinations(MutableCounts.of(h), h.called);
    const want = [["456m"], ["444m", "567m"], ["444m", "r555m"]];
    expect(handsToString(got)).toStrictEqual(want);
  });
});

describe("PointCalculator/yaku and fu", () => {
  const tests: {
    input: string;
    lastTile: Tile;
    myWind?: Wind;
    want: { yakus: Yaku[]; fu: number }[];
  }[] = [
    {
      input: "123123s111222m22z",
      lastTile: new Tile(TYPE.S, 1, [OP.TSUMO]),
      want: [
        {
          yakus: [
            { name: "門前清自摸和", han: 1 },
            { name: "一盃口", han: 1 },
          ],
          fu: 34,
        },
      ],
    },
    {
      input: "123123s123m123p22z",
      lastTile: new Tile(TYPE.S, 1),
      want: [
        {
          yakus: [
            { name: "平和", han: 1 },
            { name: "一盃口", han: 1 },
            { name: "三色同順", han: 2 },
            { name: "混全帯么九", han: 2 },
          ],
          fu: 30,
        },
      ],
    },
    {
      input: "111222333s123m99s",
      lastTile: new Tile(TYPE.S, 1, [OP.TSUMO]),
      want: [
        {
          yakus: [
            { name: "門前清自摸和", han: 1 },
            { name: "平和", han: 1 },
            { name: "一盃口", han: 1 },
            { name: "純全帯么九", han: 3 },
          ],
          fu: 20,
        },
        {
          yakus: [
            { name: "門前清自摸和", han: 1 },
            { name: "三暗刻", han: 2 },
          ],
          fu: 38,
        },
      ],
    },
    {
      input: "111333555s123m99s",
      lastTile: new Tile(TYPE.S, 9),
      want: [
        {
          yakus: [{ name: "三暗刻", han: 2 }],
          fu: 48,
        },
      ],
    },
    {
      input: "222333s234m88567s",
      lastTile: new Tile(TYPE.S, 2),
      want: [{ yakus: [{ name: "断么九", han: 1 }], fu: 36 }],
    },
    {
      input: "12344456789m123s",
      lastTile: new Tile(TYPE.S, 3),
      want: [
        {
          yakus: [
            { name: "一気通貫", han: 2 },
            { name: "ドラ", han: 1 },
          ],
          fu: 32,
        },
      ],
    },
    {
      input: "112233m223344s22z",
      lastTile: new Tile(TYPE.M, 1),
      want: [
        { yakus: [{ name: "七対子", han: 2 }], fu: 25 },
        {
          yakus: [
            { name: "平和", han: 1 },
            { name: "二盃口", han: 3 },
          ],
          fu: 30,
        },
      ],
    },
    {
      input: "23456788m, -234s, 2-34p",
      lastTile: new Tile(TYPE.M, 3, [OP.TSUMO]),
      want: [
        {
          yakus: [
            { name: "断么九", han: 1 },
            { name: "三色同順", han: 1 },
          ],
          fu: 24,
        },
      ],
    },
    {
      input: "111333m11p,5-5-55s, -3333s",
      lastTile: new Tile(TYPE.M, 3, [OP.TSUMO]),
      want: [{ yakus: [{ name: "対々和", han: 2 }], fu: 50 }],
    },
    {
      input: "111w123s456m33m, -678m",
      lastTile: new Tile(TYPE.M, 3, [OP.TSUMO]),
      want: [
        {
          yakus: [
            { name: "自風", han: 1 },
            { name: "場風", han: 1 },
          ],
          fu: 32,
        },
      ],
    },
    {
      input: "124r56p66s3p, -789p, -213p",
      lastTile: new Tile(TYPE.P, 3, [OP.RON]),
      want: [
        {
          yakus: [
            { name: "一気通貫", han: 1 },
            { name: "赤ドラ", han: 1 },
          ],
          fu: 22,
        },
      ],
    },
    {
      input: "99m66s777z,t9m,_33z_,7-77p",
      lastTile: new Tile(TYPE.M, 9, [OP.TSUMO]),
      want: [
        {
          yakus: [
            { name: "中", han: 1 },
            { name: "対々和", han: 2 },
            { name: "三暗刻", han: 2 },
            { name: "ドラ", han: 3 },
          ],
          fu: 72,
        },
      ],
    },
    {
      input: "6789m789s444z6m,3-33z",
      lastTile: new Tile(TYPE.M, 6, [OP.RON]),
      myWind: WIND.W,
      want: [
        {
          yakus: [
            { name: "自風", han: 1 },
            { name: "ドラ", han: 1 },
          ],
          fu: 34,
        },
      ],
    },
    {
      input: "22m234789p4r5667s,t5s",
      lastTile: new Tile(TYPE.S, 5),
      want: [
        {
          fu: 24,
          yakus: [
            { han: 1, name: "門前清自摸和" },
            { han: 1, name: "赤ドラ" },
          ],
        },
        {
          fu: 20,
          yakus: [
            { han: 1, name: "門前清自摸和" },
            { han: 1, name: "平和" },
            { han: 1, name: "赤ドラ" },
          ],
        },
      ],
    },
    {
      input: "r567mr55678p456s44z, t4z",
      lastTile: new Tile(TYPE.Z, 4),
      want: [
        {
          fu: 30,
          yakus: [
            { han: 1, name: "門前清自摸和" },
            { han: 2, name: "赤ドラ" },
          ],
        },
      ],
    },
    {
      input: "1234r56m34r55678s,t5s",
      lastTile: new Tile(TYPE.S, 5),
      want: [
        {
          fu: 24,
          yakus: [
            { han: 1, name: "門前清自摸和" },
            { han: 2, name: "赤ドラ" },
          ],
        },
        {
          fu: 20,
          yakus: [
            { han: 1, name: "門前清自摸和" },
            { han: 1, name: "平和" },
            { han: 2, name: "赤ドラ" },
          ],
        },
      ],
    },
  ];
  for (let tt of tests) {
    test(tt.input, () => {
      const h = new Hand(tt.input);
      const c = new BlockCalculator(h);
      const cfg: BoardContext = {
        doraIndicators: [new Tile(TYPE.M, 8)],
        myWind: tt.myWind ?? WIND.E,
        round: ROUND.E1,
        // 点数移動は見ないので、あがり方は結果に影響しない
        winBy: { type: "ron", from: WIND.S },
      };
      const dc = new PointCalculator(h, cfg);
      const hands = c.calc(tt.lastTile);

      const got = dc.getWinningHands(hands).map((v) => {
        return { yakus: v.yakus, fu: v.fu };
      });
      expect(got).toStrictEqual(tt.want);
    });
  }
});

describe("PointCalculator/calc", () => {
  test("1", () => {
    const input = "-123s,-234s,-456m, -567m, 11m";
    const lastTile = new Tile(TYPE.M, 1, [OP.TSUMO]);
    const h = new Hand(input);
    const c = new BlockCalculator(h);
    const cfg: BoardContext = {
      doraIndicators: [new Tile(TYPE.M, 8)],
      myWind: WIND.E,
      round: ROUND.E1,
      winBy: { type: "tsumo" },
    };
    const dc = new PointCalculator(h, cfg);
    const hands = c.calc(lastTile);
    const got = dc.calc(...hands);

    // TODO
    expect(hands.length).toBe(1);
    expect(!!got).toEqual(false);
  });
  test("親の7役のハネマン", () => {
    const input = "123m123s123p789p9m,t9m";
    const h = new Hand(input);
    const c = new BlockCalculator(h);
    const cfg: BoardContext = {
      doraIndicators: [new Tile(TYPE.M, 9)],
      myWind: WIND.E,
      round: ROUND.E1,
      winBy: { type: "tsumo" },
    };
    const dc = new PointCalculator(h, cfg);
    const hands = c.calc(new Tile(TYPE.M, 3));
    const got = dc.calc(...hands);

    expect(!!got).toEqual(true);
    expect((got as WinResult).han).toBe(7);
    expect((got as WinResult).points).toBe(18000);
  });
  test("round up 8000", () => {
    const input = "123m123s123p789p5ss,t5s";
    const h = new Hand(input);
    const c = new BlockCalculator(h);
    const cfg: BoardContext = {
      doraIndicators: [new Tile(TYPE.M, 9)],
      myWind: WIND.S,
      round: ROUND.E1,
      enableRoundUpMangan: true,
      winBy: { type: "tsumo" },
    };
    const dc = new PointCalculator(h, cfg);
    const hands = c.calc(new Tile(TYPE.M, 3));
    const got = dc.calc(...hands);

    expect(!!got).toEqual(true);
    expect((got as WinResult).han).toBe(4);
    expect((got as WinResult).points).toBe(8000);
    expect((got as WinResult).pointsWithoutSticks).toBe(8000);
  });
  test("親の四暗刻単騎待ちのダブル役満", () => {
    const input = "111m222m333m444m22s";
    const h = new Hand(input);
    const c = new BlockCalculator(h);
    const cfg: BoardContext = {
      doraIndicators: [new Tile(TYPE.M, 9)],
      myWind: WIND.E,
      round: ROUND.E1,
      winBy: { type: "tsumo" },
    };
    let dc = new PointCalculator(h, cfg);
    const hands = c.calc(new Tile(TYPE.S, 2, [OP.TSUMO]));
    const got = dc.calc(...hands);

    expect(!!got).toEqual(true);
    expect((got as WinResult).han).toBe(26);
    expect((got as WinResult).points).toBe(96000);
    expect((got as WinResult).yakus[0].name).toBe("四暗刻単騎待ち");

    const got2 = new PointCalculator(h, {
      ...cfg,
      disableDoubleYakuman: true,
    }).calc(...hands);
    expect(!!got2).toEqual(true);
    expect((got2 as WinResult).han).toBe(13);
    expect((got2 as WinResult).points).toBe(48000);
    expect((got2 as WinResult).yakus[0].name).toBe("四暗刻");
  });
  // あがり方は BoardContext で宣言し、手牌のあがり牌に付く印と一致している必要がある。
  // 食い違ったまま点数移動を計算すると、誰が払うのかが静かにずれる。
  test("あがり方の指定が手牌と食い違っていたら弾く", () => {
    const input = "22m234p234s345s678s";
    const h = new Hand(input);
    const base = {
      doraIndicators: [],
      myWind: WIND.S,
      round: ROUND.E1,
    } as const;

    // あがり牌に印がなく手牌にもツモ牌がない = ロン
    const ronHands = new BlockCalculator(h).calc(new Tile(TYPE.S, 8));
    expect(() =>
      new PointCalculator(h, { ...base, winBy: { type: "tsumo" } }).calc(
        ...ronHands,
      ),
    ).toThrow(/win type mismatch/);

    // あがり牌に t が付いている = ツモ
    const tsumoHands = new BlockCalculator(h).calc(
      new Tile(TYPE.S, 8, [OP.TSUMO]),
    );
    expect(() =>
      new PointCalculator(h, {
        ...base,
        winBy: { type: "ron", from: WIND.E },
      }).calc(...tsumoHands),
    ).toThrow(/win type mismatch/);

    // 一致していれば通る
    const got = new PointCalculator(h, {
      ...base,
      winBy: { type: "ron", from: WIND.E },
    }).calc(...ronHands);
    expect(got).not.toBe(false);
  });

  test("1300-2600/リーチ棒と供託", () => {
    const input = "123s456s4r56m78m22m,t9m";
    const h = new Hand(input);
    h.reach();
    const c = new BlockCalculator(h);
    const cfg: BoardContext = {
      doraIndicators: [new Tile(TYPE.P, 9)],
      myWind: WIND.S,
      round: ROUND.E1,
      winBy: { type: "tsumo" },
      sticks: {
        reach: 2,
        dead: 3,
      },
    };
    const dc = new PointCalculator(h, cfg);
    const hands = c.calc(new Tile(TYPE.M, 9, [OP.TSUMO]));
    const got = dc.calc(...hands);

    expect(!!got).toEqual(true);
    const r = got as WinResult;
    expect(r.han).toBe(4);
    expect(r.points).toBe(5200 + 1000 * 2 + 300 * 3);
    expect(r.pointsWithoutSticks).toBe(5200);
  });
});
