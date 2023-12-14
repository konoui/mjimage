import { describe, test, expect } from "@jest/globals";
import { SVG } from "@svgdotjs/svg.js";
import { Parser } from "../parser";
import { drawBlocks } from "../image";

import { loadTestData, initSvgDOM } from "./utils/helper";

const { window, document } = initSvgDOM();

const update = false;

describe("generate svg", () => {
  test("common hands", () => {
    const blocks = new Parser(
      "-123s,1234m, d2s, _22_s,-2222s, -2-222m, 3-3-33s"
    ).parse();

    const draw = SVG();
    drawBlocks(draw, blocks, {
      imageHostUrl: "http://localhost:1234/svg/",
    });
    const got = draw.svg();
    const want = loadTestData("image.common.svg", got, update);
    expect(want.toString()).toBe(got);
  });

  test("handle 0s and 5s as same for AN_KAN", () => {
    const blocks = new Parser("_05s_").parse();

    const draw = SVG();
    drawBlocks(draw, blocks, {
      imageHostUrl: "http://localhost:1234/svg/",
    });
    const got = draw.svg();
    const want = loadTestData("image.05an-kan.svg", got, update);
    expect(want.toString()).toBe(got);
  });

  test("simple-discard", () => {
    const blocks = new Parser("2s2w-1s2s").parse();

    const draw = SVG();
    drawBlocks(draw, blocks, {
      imageHostUrl: "http://localhost:1234/svg/",
    });
    const got = draw.svg();
    const want = loadTestData("image.simple-discard.svg", got, update);
    expect(want.toString()).toBe(got);
  });

  test("out-tile", () => {
    const blocks = new Parser("2g2s2w").parse();

    const draw = SVG();
    drawBlocks(draw, blocks, {
      imageHostUrl: "http://localhost:1234/svg/",
    });
    const got = draw.svg();
    const want = loadTestData("image.out-discard.svg", got, update);
    expect(want.toString()).toBe(got);
  });

  test("unknown block", () => {
    const blocks = new Parser("1s-1st1s").parse();

    const draw = SVG();
    expect(() => {
      drawBlocks(draw, blocks, {
        imageHostUrl: "http://localhost:1234/svg/",
      });
    }).toThrow(/found unknown block/);
  });
});
