import { Parser } from "../core/parser";
import { createBlockHand, drawBlocks, ImageHelper } from "../image/image";

import { loadTestData, SVG } from "./utils/helper";

const update = false;

const helperConfig = {
  imageHostUrl: "https://static.konoui.dev/mjimage/svg/",
};

const params = {
  responsive: true,
};

describe("generate svg", () => {
  test("common hands", () => {
    const blocks = new Parser(
      "-123s,1234m, d2s, _22_s,-2222s, -2-222m, 3-3-33s"
    ).parse();

    const draw = SVG();
    drawBlocks(draw, blocks, helperConfig, params);
    const got = draw.svg();
    const want = loadTestData("image.common.svg", got, update);
    expect(got).toBe(want.toString());
  });

  test("handle 0s and 5s as same for AN_KAN", () => {
    const blocks = new Parser("_05s_").parse();

    const draw = SVG();
    drawBlocks(draw, blocks, helperConfig, params);
    const got = draw.svg();
    const want = loadTestData("image.05an-kan.svg", got, update);
    expect(got).toBe(want.toString());
  });

  test("handle 0s and 5s as same for DAI_KAN", () => {
    const blocks = new Parser("5-0-55m").parse();

    const draw = SVG();
    drawBlocks(draw, blocks, helperConfig, params);
    const got = draw.svg();
    const want = loadTestData("image.05sho-kan.svg", got, update);
    expect(got).toBe(want.toString());
  });

  test("chi", () => {
    const blocks = new Parser("-406s").parse();

    const draw = SVG();
    drawBlocks(draw, blocks, helperConfig, params);
    const got = draw.svg();
    const want = loadTestData("image.chi.svg", got, update);
    expect(got).toBe(want.toString());
  });

  test("simple-discard", () => {
    const blocks = new Parser("2s2w-1s2s").parse();

    const draw = SVG();
    drawBlocks(draw, blocks, helperConfig, params);
    const got = draw.svg();
    const want = loadTestData("image.simple-discard.svg", got, update);
    expect(got).toBe(want.toString());
  });

  test("simple-discard like chi", () => {
    const blocks = new Parser("5m3w-7m").parse();

    const draw = SVG();
    drawBlocks(draw, blocks, helperConfig, params);
    const got = draw.svg();
    const want = loadTestData("image.simple-discard-like-chi.svg", got, update);
    expect(got).toBe(want.toString());
  });

  test("out-tile", () => {
    const blocks = new Parser("2^2s2w").parse();

    const draw = SVG();
    drawBlocks(draw, blocks, helperConfig, params);
    const got = draw.svg();
    const want = loadTestData("image.out-discard.svg", got, update);
    expect(got).toBe(want.toString());
  });

  test("multiple operators", () => {
    const blocks = new Parser("-^23m").parse();
    const draw = SVG();
    drawBlocks(draw, blocks, helperConfig, params);
    const got = draw.svg();
    const want = loadTestData("image.multiple-operators.svg", got, update);
    expect(got).toBe(want.toString());
  });

  test("back tile block", () => {
    const blocks = new Parser("123s___________").parse();
    const draw = SVG();
    drawBlocks(draw, blocks, helperConfig, params);
    const got = draw.svg();
    const want = loadTestData(
      "back-tile-hand-discard-block-1.svg",
      got,
      update
    );
    expect(got).toBe(want.toString());
  });

  test("dora/tsumo without text", () => {
    const blocks = new Parser("123s,-123s, t1s").parse();
    const draw = SVG();
    drawBlocks(draw, blocks, helperConfig, {
      enableDoraText: false,
      enableTsumoText: false,
      responsive: true,
    });
    const got = draw.svg();
    const want = loadTestData("dora-tsumo-without-text.svg", got, update);
    expect(got).toBe(want.toString());
  });

  test("unknown block", () => {
    const blocks = new Parser("1s-1st1s").parse();

    const draw = SVG();
    expect(() => {
      drawBlocks(draw, blocks, helperConfig, params);
    }).toThrow(/found an unknown block with operator tiles/);
  });
});

describe("block edge cases", () => {
  const helper = new ImageHelper({ scale: 1 });

  // 牌ゼロ枚のブロックは描画時に tiles[0] を参照して落ちる。
  // ツモ記号が先頭にある入力ではパーサが内部で先頭に区切り文字を挿入していた。
  test("inputs that used to produce empty blocks", () => {
    for (const input of ["t3s", "t3s,123m", ",123m", "123m,,456m"]) {
      const blocks = new Parser(input).parse();
      expect(blocks.every((b) => b.tiles.length > 0)).toBe(true);
      expect(() => createBlockHand(helper, blocks)).not.toThrow();
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
    const hand = createBlockHand(helper, new Parser("").parse());
    expect(hand.width).toBe(0);
    expect(hand.height).toBe(0);
  });

  // (ドラ)/(ツモ) の注記は、牌の右に確保した幅に収まる。
  test("dora/tsumo note fits the declared block width", () => {
    for (const input of ["d3s", "t3s"]) {
      const hand = createBlockHand(helper, new Parser(input).parse());
      const draw = SVG();
      draw.add(hand.e);
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
      expect(Number(x) + Number(fontSize) * em).toBeLessThanOrEqual(hand.width);
      // ディセンダが牌の下辺より下へ出ない
      expect(svg).toContain('dominant-baseline="text-after-edge"');
    }
  });
});
