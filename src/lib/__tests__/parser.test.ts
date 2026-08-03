import {
  Tile,
  compareTiles,
  Parser,
  BlockAnKan,
  BlockChi,
  BlockOther,
  BlockHand,
  compareCalledTiles,
  BlockPon,
  BlockShoKan,
} from "../core";
import { TYPE, OP, BLOCK, INPUT_SEPARATOR } from "../core/constants";

describe("parse", () => {
  test("手牌・ツモ・暗槓・チーが混ざった入力をブロックに分ける", () => {
    const got = new Parser("12s34m1z2d,t1s,_05s_,-123s").parse();
    const want = [
      new BlockHand([
        new Tile(TYPE.S, 1),
        new Tile(TYPE.S, 2),
        new Tile(TYPE.M, 3),
        new Tile(TYPE.M, 4),
        new Tile(TYPE.Z, 1),
        new Tile(TYPE.Z, 6),
      ]),
      new BlockOther([new Tile(TYPE.S, 1, [OP.TSUMO])], BLOCK.TSUMO),
      new BlockAnKan([
        new Tile(TYPE.BACK, 0),
        new Tile(TYPE.S, 5, [OP.RED]),
        new Tile(TYPE.S, 5),
        new Tile(TYPE.BACK, 0),
      ]),
      new BlockChi([
        new Tile(TYPE.S, 1, [OP.HORIZONTAL]),
        new Tile(TYPE.S, 2),
        new Tile(TYPE.S, 3),
      ]),
    ];

    expect(got).toStrictEqual(want);
  });

  test("牌の種類で終わらない入力は弾く", () => {
    const p = new Parser("1");
    expect(() => {
      p.parse();
    }).toThrow(/last character must be a tile type:/);
  });
});

describe("TileSeparators", () => {
  test("1 枚だけの入力", () => {
    const got = new Parser("1s").tiles();
    const want = [new Tile(TYPE.S, 1)];
    expect(got).toStrictEqual(want);
  });

  test("区切り文字ごとに牌の並びを返す", () => {
    const got = new Parser("12s34m1z2d,t1s,_-1s").tileSeparators();
    const want = [
      new Tile(TYPE.S, 1),
      new Tile(TYPE.S, 2),
      new Tile(TYPE.M, 3),
      new Tile(TYPE.M, 4),
      new Tile(TYPE.Z, 1),
      new Tile(TYPE.Z, 6),
      INPUT_SEPARATOR,
      new Tile(TYPE.S, 1, [OP.TSUMO]),
      INPUT_SEPARATOR,
      new Tile(TYPE.BACK, 0),
      new Tile(TYPE.S, 1, [OP.HORIZONTAL]),
    ];
    expect(got).toStrictEqual(want);
  });

  test("暗黙のツモブロックを補う", () => {
    const p = new Parser("123s12t3p66m, 2-22m");
    const got = p.tileSeparators();
    const want = [
      new Tile(TYPE.S, 1),
      new Tile(TYPE.S, 2),
      new Tile(TYPE.S, 3),
      new Tile(TYPE.P, 1),
      new Tile(TYPE.P, 2),
      new Tile(TYPE.M, 6),
      new Tile(TYPE.M, 6),
      INPUT_SEPARATOR,
      new Tile(TYPE.P, 3, [OP.TSUMO]),
      INPUT_SEPARATOR,
      new Tile(TYPE.M, 2),
      new Tile(TYPE.M, 2, [OP.HORIZONTAL]),
      new Tile(TYPE.M, 2),
    ];
    expect(got).toStrictEqual(want);
  });
});

describe("tiles parse/red operator", () => {
  test("赤 5 は r5s として読む", () => {
    const got = new Parser("r5s").tiles();
    expect(got).toStrictEqual([new Tile(TYPE.S, 5, [OP.RED])]);
  });

  test("0 は赤 5 の別名（t0s は tr5s と同じ）", () => {
    const got = new Parser("12s, t0s").tiles();
    expect(got).toStrictEqual([
      new Tile(TYPE.S, 1),
      new Tile(TYPE.S, 2),
      new Tile(TYPE.S, 5, [OP.TSUMO, OP.RED]),
    ]);
  });
});

// Tile.from は Parser を経由せず走査（scanTileSeparators）だけを使う。
// Parser 側の暗黙のツモブロック（reconstruct）を通らなくなるので、
// 1 枚の入力では結果が変わらないことを固定する。
describe("Tile.from", () => {
  const inputs = ["1m", "t1m", "r5m", "-t^5m", "_", ",1m", ",t1m", "1z", "0p"];
  test.each(inputs)("%s は Parser 経由と同じ牌になる", (input) => {
    const viaParser = new Parser(input).tiles();
    expect(viaParser).toHaveLength(1);
    expect(Tile.from(input)).toStrictEqual(viaParser[0]);
  });

  test("2 枚以上は弾く", () => {
    expect(() => Tile.from("12m")).toThrow(/input must be a single tile/);
  });
});

describe("sortTiles", () => {
  test("並び替えは種類ごと、種類の中は数字順", () => {
    const parsed = new Parser("13p5s786m1z").tiles();
    const got = [...parsed].sort(compareTiles);
    const want: Tile[] = [
      new Tile(TYPE.M, 6),
      new Tile(TYPE.M, 7),
      new Tile(TYPE.M, 8),
      new Tile(TYPE.P, 1),
      new Tile(TYPE.P, 3),
      new Tile(TYPE.S, 5),
      new Tile(TYPE.Z, 1),
    ];
    expect(got).toStrictEqual(want);
  });
  test("赤 5 は同じ 5 の中で先頭に来る", () => {
    const parsed = new Parser("505p").tiles();
    const got = [...parsed].sort(compareTiles);
    const want: Tile[] = [
      new Tile(TYPE.P, 5, [OP.RED]),
      new Tile(TYPE.P, 5),
      new Tile(TYPE.P, 5),
    ];
    expect(got).toStrictEqual(want);
  });
});

describe("sort called tiles", () => {
  test("鳴き牌の横向きの位置は並び替えても動かない", () => {
    const t = new Tile(TYPE.M, 3);
    const want = [t, t.clone({ add: OP.HORIZONTAL }), t];
    const got = compareCalledTiles([...want]);
    expect(got).toStrictEqual(want);
    expect(got[1].has(OP.HORIZONTAL)).toBe(true);
  });
});

describe("shokan/fromPon", () => {
  test("加槓はポンしたブロックから作る", () => {
    const t = new Tile(TYPE.M, 3);
    const pon = new BlockPon([t, t.clone({ add: OP.HORIZONTAL }), t]);
    const want = [
      t,
      t.clone({ add: OP.HORIZONTAL }),
      t.clone({ add: OP.HORIZONTAL }),
      t,
    ];
    const got = BlockShoKan.fromPon(pon, t).tiles;
    expect(got).toStrictEqual(want);
  });
});

describe("toString", () => {
  test("暗槓は両端が裏牌の文字列になる", () => {
    const t = new Tile(TYPE.M, 1);
    const b = new BlockAnKan([t, t, t, t]);
    expect(b.toString()).toEqual("_11m_");
  });
  test("手牌はブロックごとに区切って書き出す", () => {
    const t1 = new Tile(TYPE.M, 1);
    const t2 = new Tile(TYPE.S, 1);
    const t3 = new Tile(TYPE.BACK, 0);
    const b = new BlockHand([t1, t2, t2, t3, t1, t2, t3]);
    expect(b.toString()).toEqual("11m111s__");
  });
});

describe("tile value range", () => {
  // 字牌は 1z-7z（東南西北白發中）しかない。値域を検証しないと
  // 存在しない牌画像（z0/z8/z9）を参照する SVG が出来上がる。
  test("rejects honor tiles outside 1z-7z", () => {
    for (const s of ["0z", "8z", "9z"]) {
      expect(() => new Parser(s).parse()).toThrow(/invalid tile/);
    }
    for (const s of ["1z", "2z", "3z", "4z", "5z", "6z", "7z"]) {
      expect(() => new Parser(s).parse()).not.toThrow();
    }
  });

  // 赤ドラは数牌の 5 のみ。赤5白のような牌は存在しない。
  test("rejects red dora on non-number tiles", () => {
    expect(() => new Parser("r5z").parse()).toThrow(/red dora/);
    expect(() => new Parser("r3m").parse()).toThrow(/red dora/);
    for (const s of ["r5m", "r5p", "r5s", "0m", "0p", "0s"]) {
      expect(() => new Parser(s).parse()).not.toThrow();
    }
  });

  test("accepts every number tile", () => {
    for (const t of ["m", "p", "s"]) {
      for (let n = 0; n <= 9; n++) {
        expect(() => new Parser(`${n}${t}`).parse()).not.toThrow();
      }
    }
    expect(() => new Parser("_").parse()).not.toThrow();
  });
});

// 1 枚の牌に付けられる印（ツモ・ロン・横向き・ツモ切り・赤）の組み合わせ。
// 以前は先読みの幅が足りず、3 個を超えると「expected a number」で落ちていた。
describe("牌に付ける印", () => {
  test("4 個まで重ねて付けられる", () => {
    const got = Tile.from("-t^r5m");
    expect(got.has(OP.HORIZONTAL)).toBe(true);
    expect(got.has(OP.TSUMO)).toBe(true);
    expect(got.has(OP.COLOR_GRAYSCALE)).toBe(true); // ^ はツモ切り
    expect(got.has(OP.RED)).toBe(true);
    expect(got.n).toBe(5);
    expect(got.toString()).toBe("-t^r5m");
  });

  test("ロンの印も読める", () => {
    const got = Tile.from("v1m");
    expect(got.has(OP.RON)).toBe(true);
    expect(got.toString()).toBe("v1m");
  });

  test("同じ印を重ねて書くと 1 つに畳まれる", () => {
    expect(Tile.from("rr5m").toString()).toBe("r5m");
    expect(Tile.from("rrr5m").ops).toHaveLength(1);
  });
});
