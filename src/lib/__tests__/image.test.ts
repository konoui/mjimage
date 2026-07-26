import { Parser } from "../core/parser";
import { createHand, render } from "../image";

import { loadTestData, SVG } from "./utils/helper";

const update = false;

const helperConfig = {
  imageHostUrl: "https://static.konoui.dev/mjimage/svg/",
};

describe("generate svg", () => {
  const tests = [
    {
      name: "common hands",
      input: "-123s,1234m, d2s, _22_s,-2222s, -2-222m, 3-3-33s",
      filename: "image.common.svg",
    },
    {
      name: "handle 0s and 5s as same for AN_KAN",
      input: "_05s_",
      filename: "image.05an-kan.svg",
    },
    {
      name: "handle 0s and 5s as same for DAI_KAN",
      input: "5-0-55m",
      filename: "image.05sho-kan.svg",
    },
    { name: "chi", input: "-406s", filename: "image.chi.svg" },
    {
      name: "simple-discard",
      input: "2s2w-1s2s",
      filename: "image.simple-discard.svg",
    },
    {
      name: "simple-discard like chi",
      input: "5m3w-7m",
      filename: "image.simple-discard-like-chi.svg",
    },
    { name: "out-tile", input: "2^2s2w", filename: "image.out-discard.svg" },
    {
      name: "multiple operators",
      input: "-^23m",
      filename: "image.multiple-operators.svg",
    },
    {
      name: "back tile block",
      input: "123s___________",
      filename: "back-tile-hand-discard-block-1.svg",
    },
  ];

  for (const t of tests) {
    test(t.name, () => {
      const got = render(t.input, helperConfig).svg.svg();
      const want = loadTestData(t.filename, got, update);
      expect(got).toBe(want.toString());
    });
  }

  test("dora/tsumo without text", () => {
    const got = render("123s,-123s, t1s", {
      ...helperConfig,
      enableDoraText: false,
      enableTsumoText: false,
    }).svg.svg();
    const want = loadTestData("dora-tsumo-without-text.svg", got, update);
    expect(got).toBe(want.toString());
  });

  test("unknown block", () => {
    expect(() => render("1s-1st1s", helperConfig)).toThrow(
      /found an unknown block with operator tiles/
    );
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
