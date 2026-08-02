import { Parser } from "../core";
import { createHand, render, RenderOptions } from "../image";
import { TILE_CONTEXT } from "../image/constants";

import { SVG, snapshotPath } from "./utils/helper";
import { placedTiles } from "./utils/geometry";

const helperConfig = {
  imageHostUrl: "https://static.konoui.dev/mjimage/svg/",
};

// 代表として 1 件だけ全文を比較する。個々の性質は下の不変条件テストが見る。
describe("generate svg", () => {
  test("common hands", async () => {
    const input = "-123s,1234m, d2s, _22_s,-2222s, -2-222m, 3-3-33s";
    const got = render(input, helperConfig).svg.svg();
    await expect(got).toMatchFileSnapshot(snapshotPath("image.common.svg"));
  });

  test("unknown block", () => {
    expect(() => render("1s-1st1s", helperConfig)).toThrow(
      /found an unknown block with operator tiles/
    );
  });
});

// 牌 1 枚の実寸（scale = 1）とブロック間の余白。
const W = TILE_CONTEXT.WIDTH;
const H = TILE_CONTEXT.HEIGHT;
const MARGIN = W * TILE_CONTEXT.BLOCK_MARGIN_SCALE;

const draw = (input: string, options: RenderOptions = {}) =>
  render(input, { scale: 1, ...options });

const tilesOf = (input: string, options: RenderOptions = {}) =>
  placedTiles(draw(input, options).svg.svg());

// 全文スナップショットが暗黙に守っていた配置の性質を、性質のまま確かめる。
describe("hand layout invariants", () => {
  // ブロックの中は隙間なく詰める。
  test("tiles in a block are laid out left to right with no gap", () => {
    const tiles = tilesOf("1234m");
    expect(tiles.map((t) => t.href)).toEqual([
      "m1.svg",
      "m2.svg",
      "m3.svg",
      "m4.svg",
    ]);
    expect(tiles.map((t) => t.x)).toEqual([0, W, W * 2, W * 3]);
    for (const t of tiles) {
      expect({ y: t.y, width: t.width, height: t.height }).toEqual({
        y: 0,
        width: W,
        height: H,
      });
    }
  });

  // ブロックの境目にだけ余白が入る。手牌の幅は「牌の合計 + 隙間の数 × 余白」。
  test("blocks are separated by exactly one block margin", () => {
    for (const [input, sizes] of [
      ["123s,456m", [3, 3]],
      ["1m,2m,3m", [1, 1, 1]],
      ["123456789m1234s", [13]],
    ] as const) {
      const { svg, width } = draw(input);
      const tiles = placedTiles(svg.svg());
      let pos = 0;
      let i = 0;
      for (const n of sizes) {
        expect(tiles[i].x).toBeCloseTo(pos, 4);
        pos += n * W + MARGIN;
        i += n;
      }
      expect(width).toBeCloseTo(pos - MARGIN, 4);
    }
  });

  // 横向きの牌は縦横が入れ替わり、その分だけ場所を取る。
  // 縦向きの牌と下端が揃うよう Y にオフセットを入れている（上端は H - W）。
  test("a horizontal tile is rotated in place and keeps the row bottom aligned", () => {
    for (const input of ["-406s", "2s2w-1s2s", "5m3w-7m"]) {
      const tiles = tilesOf(input);
      const rotated = tiles.filter((t) => t.rotated);
      expect(rotated).toHaveLength(1);
      expect({ width: rotated[0].width, height: rotated[0].height }).toEqual({
        width: H,
        height: W,
      });

      let pos = 0;
      for (const t of tiles) {
        // 下端が揃う
        expect(t.y + t.height).toBe(H);
        // 隣とも重ならず、離れもしない
        expect(t.x).toBeCloseTo(pos, 4);
        pos += t.width;
      }
    }
  });

  // 赤牌は 0 の画像を使う。5 と 0 は同じ牌として扱うので、鳴きでも区別しない。
  test("red fives use the 0 image", () => {
    expect(tilesOf("-406s").map((t) => t.href)).toEqual([
      "s4.svg",
      "s0.svg",
      "s6.svg",
    ]);
    expect(tilesOf("0m5m").map((t) => t.href)).toEqual(["m0.svg", "m5.svg"]);
  });

  // 暗槓は両端が裏牌。裏返す位置がずれると手牌の見た目が変わる。
  test("an-kan hides both ends with back tiles", () => {
    const tiles = tilesOf("_05s_");
    expect(tiles.map((t) => t.href)).toEqual([
      "_0.svg",
      "s0.svg",
      "s5.svg",
      "_0.svg",
    ]);
    expect(tiles.some((t) => t.rotated)).toBe(false);
    expect(tiles.map((t) => t.x)).toEqual([0, W, W * 2, W * 3]);
  });

  // 小明槓は横向きの 2 枚を積む。積んだ高さがブロックの高さになり、
  // 縦向きの牌はその下端に揃う。
  test("sho-kan stacks the two horizontal tiles", () => {
    const { svg, width, height } = draw("5-0-55m");
    const tiles = placedTiles(svg.svg());
    const rotated = tiles.filter((t) => t.rotated).sort((a, b) => a.y - b.y);
    const upright = tiles.filter((t) => !t.rotated);
    expect(rotated).toHaveLength(2);
    expect(upright).toHaveLength(2);

    // 上下に隙間なく積まれ、同じ幅を占める
    expect(rotated[1].x).toBe(rotated[0].x);
    expect(rotated[1].width).toBe(rotated[0].width);
    expect(rotated[0].y + rotated[0].height).toBe(rotated[1].y);

    const bottom = rotated[1].y + rotated[1].height;
    expect(bottom).toBe(W * 2);
    for (const t of upright) expect(t.y + t.height).toBe(bottom);

    expect(width).toBeCloseTo(W * 2 + H, 4);
    expect(height).toBeCloseTo(W * 2, 4);
  });

  // ツモ切りの牌は暗くする。
  test("tsumogiri tiles are dimmed", () => {
    const tiles = tilesOf("2^2s2w");
    expect(tiles.map((t) => t.style.includes("contrast"))).toEqual([
      false,
      true,
      false,
    ]);
  });

  // 1 枚の牌に複数のオペレータが乗る（横向き かつ ツモ切り）。
  test("operators combine on a single tile", () => {
    const [first, second] = tilesOf("-^23m");
    expect(first.rotated).toBe(true);
    expect(first.style).toContain("contrast");
    expect(second.rotated).toBe(false);
    expect(second.style).toBe("");
  });

  // 裏牌はほかの牌と同じ大きさで同じ列に並ぶ。
  test("back tiles line up with the rest of the block", () => {
    const tiles = tilesOf("123s___________");
    expect(tiles).toHaveLength(14);
    expect(tiles.slice(3).every((t) => t.href == "_0.svg")).toBe(true);
    expect(tiles.map((t) => t.x)).toEqual(tiles.map((_, i) => i * W));
  });

  // 注記（(ドラ)/(ツモ)）の分の幅は、注記を描くときだけ確保する。
  test("notes reserve width only when they are drawn", () => {
    for (const input of ["d1s", "t1s"]) {
      const withNote = draw(input);
      const without = draw(input, {
        enableDoraText: false,
        enableTsumoText: false,
      });

      expect(withNote.svg.svg()).toContain("<text");
      expect(without.svg.svg()).not.toContain("<text");

      expect(without.width).toBeCloseTo(W, 4);
      expect(withNote.width).toBeCloseTo(W * (1 + TILE_CONTEXT.TEXT_SCALE), 4);

      // 牌そのものの大きさと位置は注記の有無で変わらない
      const [a] = placedTiles(withNote.svg.svg());
      const [b] = placedTiles(without.svg.svg());
      expect({ x: b.x, y: b.y, width: b.width, height: b.height }).toEqual({
        x: a.x,
        y: a.y,
        width: a.width,
        height: a.height,
      });
    }
  });

  // 注記を消すと後続のブロックもその分だけ左に詰まる。
  test("dropping a note shifts the following blocks", () => {
    const options = { enableDoraText: false, enableTsumoText: false };
    const tiles = tilesOf("d1s,123m", options);
    expect(tiles.map((t) => t.x)).toEqual([
      0,
      W + MARGIN,
      W * 2 + MARGIN,
      W * 3 + MARGIN,
    ]);
  });
});

describe("block edge cases", () => {
  const hand = (input: string) =>
    createHand(new Parser(input).parse(), { scale: 1 });

  // 牌ゼロ枚のブロックは描画時に tiles[0] を参照して落ちる。
  // ツモ記号が先頭にある入力ではパーサが内部で先頭に区切り文字を挿入していた。
  test("inputs that used to produce empty blocks", () => {
    for (const input of ["t3s", "t3s,123m", ",123m", "123m,,456m"]) {
      const blocks = new Parser(input).parse();
      expect(blocks.every((b) => b.tiles.length > 0)).toBe(true);
      expect(() => hand(input)).not.toThrow();
    }
  });

  // ツモ牌の切り出しは手牌が残る場合だけ行う。
  test("tsumo is split out only when a hand remains", () => {
    const shape = (s: string) => new Parser(s).parse().map((b) => b.tiles.length);
    expect(shape("t3s")).toEqual([1]);
    expect(shape("123m,t3s")).toEqual([3, 1]);
    expect(shape("1m t3s")).toEqual([1, 1]);
    expect(shape("123456789m1234s,t1p")).toEqual([13, 1]);
  });

  test("empty input produces a non-negative size", () => {
    expect(hand("").width).toBe(0);
    expect(hand("").height).toBe(0);
  });

  // (ドラ)/(ツモ) の注記は、牌の右に確保した幅に収まる。
  test("dora/tsumo note fits the declared block width", () => {
    for (const input of ["d3s", "t3s"]) {
      const fragment = hand(input);
      const draw = SVG();
      draw.add(fragment.element);
      const svg = draw.svg();
      const m = svg.match(
        /<text[^>]*font-size="([\d.]+)"[^>]*x="([\d.]+)"[^>]*>([^<]*)</,
      )!;
      const [, fontSize, x, text] = m;
      // 半角 0.5em / 全角 1em
      const em = [...text].reduce(
        (w, c) => w + (c.charCodeAt(0) < 0x100 ? 0.5 : 1),
        0,
      );
      // 返す寸法は 6 桁で丸めるので、その分の許容を持たせる。
      expect(Number(x) + Number(fontSize) * em).toBeLessThanOrEqual(
        fragment.width + 1e-6,
      );
      // ディセンダが牌の下辺より下へ出ない
      expect(svg).toContain('dominant-baseline="text-after-edge"');
    }
  });
});

describe("render", () => {
  // 呼び出し側は返ってきた寸法で大きさを決める。SVG に出る値と食い違ってはいけない。
  // 118.80000000000001 のような浮動小数の誤差が viewBox とずれる原因になっていた。
  test("returns sizes that match the viewBox", () => {
    for (const input of ["123s", "d3s", "123s,t4p", "table:\n  board:\n"]) {
      const { svg, width, height } = render(input, { scale: 1 });
      expect(svg.svg()).toContain(`viewBox="0 0 ${width} ${height}"`);
      expect(String(width)).not.toMatch(/\.\d{7,}/);
      expect(String(height)).not.toMatch(/\.\d{7,}/);
    }
  });

  // 大きさは呼び出し側が決める。render は viewBox だけを設定する。
  test("leaves the size to the caller", () => {
    const { svg, width, height } = render("123s", { scale: 1 });
    expect(svg.svg()).not.toMatch(/<svg[^>]*\swidth="/);

    svg.size(width, height);
    expect(svg.svg()).toContain('width="198"');

    svg.css({ width: "calc(var(--mj-tile) * 2.2)" });
    expect(svg.svg()).toContain("style=\"width: calc(var(--mj-tile) * 2.2);\"");
  });

  // 牌 1 枚の寸法は「牌何枚分か」を出すための基準として返す。
  test("reports the tile size", () => {
    const { width, height, tileWidth, tileHeight } = render("123s", {
      scale: 0.5,
    });
    expect({ tileWidth, tileHeight }).toStrictEqual({
      tileWidth: 33,
      tileHeight: 45,
    });
    expect(width / tileWidth).toBe(3);
    expect(height / tileHeight).toBe(1);
  });
});
