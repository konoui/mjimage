import { describe, test, expect } from "@jest/globals";
import { SVG } from "@svgdotjs/svg.js";
import { Parser } from "../core/parser";
import { drawBlocks } from "../core/image";

import { loadTestData, initSvgDOM } from "./utils/helper";

const { window, document } = initSvgDOM();

const update = false;

const helperConfig = {
  imageHostUrl: "http://localhost:1234/svg/",
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
    expect(want.toString()).toBe(got);
  });

  test("handle 0s and 5s as same for AN_KAN", () => {
    const blocks = new Parser("_05s_").parse();

    const draw = SVG();
    drawBlocks(draw, blocks, helperConfig, params);
    const got = draw.svg();
    const want = loadTestData("image.05an-kan.svg", got, update);
    expect(want.toString()).toBe(got);
  });

  test("handle 0s and 5s as same for DAI_KAN", () => {
    const blocks = new Parser("5-0-55m").parse();

    const draw = SVG();
    drawBlocks(draw, blocks, helperConfig, params);
    const got = draw.svg();
    const want = loadTestData("image.05sho-kan.svg", got, update);
    expect(want.toString()).toBe(got);
  });

  test("chi", () => {
    const blocks = new Parser("-406s").parse();

    const draw = SVG();
    drawBlocks(draw, blocks, helperConfig, params);
    const got = draw.svg();
    const want = loadTestData("image.chi.svg", got, update);
    expect(want.toString()).toBe(got);
  });

  test("simple-discard", () => {
    const blocks = new Parser("2s2w-1s2s").parse();

    const draw = SVG();
    drawBlocks(draw, blocks, helperConfig, params);
    const got = draw.svg();
    const want = loadTestData("image.simple-discard.svg", got, update);
    expect(want.toString()).toBe(got);
  });

  test("simple-discard like chi", () => {
    const blocks = new Parser("5m3w-7m").parse();

    const draw = SVG();
    drawBlocks(draw, blocks, helperConfig, params);
    const got = draw.svg();
    const want = loadTestData("image.simple-discard-like-chi.svg", got, update);
    expect(want.toString()).toBe(got);
  });

  test("out-tile", () => {
    const blocks = new Parser("2^2s2w").parse();

    const draw = SVG();
    drawBlocks(draw, blocks, helperConfig, params);
    const got = draw.svg();
    const want = loadTestData("image.out-discard.svg", got, update);
    expect(want.toString()).toBe(got);
  });

  test("multiple operators", () => {
    const blocks = new Parser("-^23m").parse();
    const draw = SVG();
    drawBlocks(draw, blocks, helperConfig, params);
    const got = draw.svg();
    const want = loadTestData("image.multiple-operators.svg", got, update);
    expect(want.toString()).toBe(got);
  });

  test("unknown block", () => {
    const blocks = new Parser("1s-1st1s").parse();

    const draw = SVG();
    expect(() => {
      drawBlocks(draw, blocks, helperConfig, params);
    }).toThrow(/found unknown block/);
  });
});
