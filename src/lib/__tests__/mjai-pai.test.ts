import { describe, expect, test } from "vitest";
import { Tile } from "../core";
import { OP, TILE_NUMBERS, TYPE, WIND } from "../core/constants";
import { YAKU, YAKUMAN, Yaku } from "../calculator";
import {
  fromMjaiPai,
  isHiddenPai,
  toMjaiBakaze,
  toMjaiPai,
} from "../mjai/pai";
import { mjaiYakuNames, toMjaiYakuName, toMjaiYakus } from "../mjai/yaku";
import { MJAI_HIDDEN_PAI, MjaiMaybeHiddenPai } from "../mjai/types";

// mjai の牌表記と役名の変換（Phase 1）。ここは純関数だけなので、
// 対局を回さずに全網羅で確かめる。牌も役も定義から生成するので、
// 種類が増えたときに取りこぼさない。

/**
 * 表向きの全 37 種（数牌 27 + 字牌 7 + 赤 3）を定義から作る。
 * TILE_NUMBERS の 0 は赤を数えるためのカウンタ用の枠で、牌としては存在しない。
 */
const allTiles = (): Tile[] => {
  const tiles: Tile[] = [];
  for (const [t, numbers] of Object.entries(TILE_NUMBERS)) {
    if (t == TYPE.BACK) continue;
    for (const n of numbers) {
      if (n == 0) continue;
      tiles.push(new Tile(t as typeof TYPE.M, n));
      if (t != TYPE.Z && n == 5)
        tiles.push(new Tile(t as typeof TYPE.M, n, [OP.RED]));
    }
  }
  return tiles;
};

describe("牌の表記変換", () => {
  test("表向きの牌は 37 種ある", () => {
    // 以降のテストが「全部」を回せていることの見張り。
    expect(allTiles()).toHaveLength(37);
  });

  test("全種が Tile → MjaiPai → Tile で往復する", () => {
    for (const t of allTiles()) {
      const back = fromMjaiPai(toMjaiPai(t));
      expect(back.toString(), `${t.toString()} が往復しない`).toBe(
        t.toString()
      );
    }
  });

  test("全種の mjai 表記が重複しない", () => {
    // 赤の "5mr" と "5m" が衝突していないこと。
    const pais = allTiles().map(toMjaiPai);
    expect(new Set(pais).size).toBe(pais.length);
  });

  test("裏牌は非公開になり、往復する", () => {
    const back = new Tile(TYPE.BACK, 0);
    expect(toMjaiPai(back)).toBe(MJAI_HIDDEN_PAI);
    expect(fromMjaiPai(MJAI_HIDDEN_PAI).toString()).toBe(back.toString());
    expect(isHiddenPai(MJAI_HIDDEN_PAI)).toBe(true);
    expect(isHiddenPai("1m")).toBe(false);
  });

  test("オペレータは落ちる", () => {
    // mjai に対応物が無い。ツモ切りや鳴きの向きは別のフィールドで伝える。
    for (const op of [OP.TSUMO, OP.RON, OP.HORIZONTAL, OP.COLOR_GRAYSCALE]) {
      expect(toMjaiPai(new Tile(TYPE.M, 3, [op]))).toBe("3m");
    }
  });

  test("赤は接尾辞になり、赤でない 5 と区別される", () => {
    expect(toMjaiPai(new Tile(TYPE.M, 5, [OP.RED]))).toBe("5mr");
    expect(toMjaiPai(new Tile(TYPE.M, 5))).toBe("5m");
    expect(fromMjaiPai("5mr").has(OP.RED)).toBe(true);
    expect(fromMjaiPai("5m").has(OP.RED)).toBe(false);
  });

  test("字牌は東南西北白發中に対応する", () => {
    const got = TILE_NUMBERS[TYPE.Z].map((n) =>
      toMjaiPai(new Tile(TYPE.Z, n))
    );
    expect(got).toStrictEqual(["E", "S", "W", "N", "P", "F", "C"]);
  });

  test("場風は風から作れる", () => {
    expect(Object.values(WIND).map(toMjaiBakaze)).toStrictEqual([
      "E",
      "S",
      "W",
      "N",
    ]);
  });

  test("読めない表記は投げる", () => {
    // 変換の失敗を黙って別の牌にしない。mjai には "0m" 形式の赤も無い。
    for (const bad of ["0m", "10m", "5zr", "1x", "", "?m", "5m5m"]) {
      expect(
        () => fromMjaiPai(bad as MjaiMaybeHiddenPai),
        `${bad} が読めてしまう`
      ).toThrow();
    }
  });
});

describe("役名の変換", () => {
  /** calculator が返しうる役名すべて。ドラは detectDora が別に作る。 */
  const allYakuNames = (): string[] => [
    ...YAKU.map((y) => y.name),
    ...YAKUMAN.map((y) => y.name),
    "ドラ",
    "赤ドラ",
    "裏ドラ",
  ];

  test("calculator の全役名に mjai の識別子がある", () => {
    // 役を足したらここで落ちる。落ちたら mjai/yaku.ts に 1 行足すこと。
    const missing = allYakuNames().filter((n) => toMjaiYakuName(n) == null);
    expect(missing).toStrictEqual([]);
  });

  test("対応表に余分な役名が無い", () => {
    // 役名を改名したときに、古い名前が表に残り続けるのを防ぐ。
    const known = new Set(allYakuNames());
    expect(mjaiYakuNames().filter((n) => !known.has(n))).toStrictEqual([]);
  });

  test("三元牌は 1 エントリに合算される", () => {
    // mjai は白・發・中を sangenpai にまとめ、飜を足す。
    const yakus: Yaku[] = [
      { name: "白", han: 1 },
      { name: "發", han: 1 },
      { name: "中", han: 1 },
    ];
    expect(toMjaiYakus(yakus).yakus).toStrictEqual([["sangenpai", 3]]);
  });

  test("並びは calculator が返した順を保つ", () => {
    const yakus: Yaku[] = [
      { name: "ダブル立直", han: 2 },
      { name: "門前清自摸和", han: 1 },
      { name: "一気通貫", han: 2 },
    ];
    expect(toMjaiYakus(yakus).yakus).toStrictEqual([
      ["double_reach", 2],
      ["menzenchin_tsumoho", 1],
      ["ikkitsukan", 2],
    ]);
  });

  test("未対応の役は落として名前を返す", () => {
    // 進行は止めない。呼ぶ側がログに出す。
    const got = toMjaiYakus([
      { name: "立直", han: 1 },
      { name: "天和", han: 13 },
    ]);
    expect(got.yakus).toStrictEqual([["reach", 1]]);
    expect(got.unknown).toStrictEqual(["天和"]);
  });
});
