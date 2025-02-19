import { Parser } from "../core/parser";
import { createHand, drawBlocks, ImageHelper } from "../image/image";

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
      doraText: false,
      tsumoText: false,
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
