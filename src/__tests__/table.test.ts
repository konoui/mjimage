import { describe, test, expect } from "@jest/globals";
import { SVG } from "@svgdotjs/svg.js";
import { Tile, Parser } from "./../parser";
import { ImageHelper } from "./../image";
import { createTable, FontContext } from "./../table";
import { DiscardsInput, ScoreBoardInput, HandsInput } from "./../table-parser";
import { FONT_FAMILY, KIND } from "./../constants";

import { initSvgDOM, loadTestData } from "./utils/helper";

const { window, document } = initSvgDOM();

// FIXME using node canvas
const fontCtx: FontContext = {
  font: { family: FONT_FAMILY, size: 16 },
  textWidth: 16.040000915527344,
  textHeight: 16.040000915527344,
  numWidth: 11.84,
  numHeight: 11.84,
};

const helper = new ImageHelper({
  imageHostPath: "http://localhost:1234/svg/",
  scale: 0.4,
});

const update = false;

describe("createTable", () => {
  test("max-table-size", () => {
    const sampleDiscard = "123456789s12-3456789m1234p";
    const p = new Parser(sampleDiscard).parseInput();

    const sampleHand = "2s, -1111p, -1111s, -1111m, -2222m, t3s";
    const blocks = new Parser(sampleHand).parse();

    const hands: HandsInput = {
      front: blocks,
      right: blocks,
      opposite: blocks,
      left: blocks,
    };
    const discards: DiscardsInput = {
      front: p,
      right: p,
      opposite: p,
      left: p,
    };
    const scoreBoard: ScoreBoardInput = {
      round: "南４局",
      scores: {
        front: 100,
        right: 200,
        opposite: 25000,
        left: 9000,
      },
      frontPlace: "西",
      sticks: {
        reach: 1,
        dead: 3,
      },
      doras: [new Tile(KIND.M, 3)],
    };

    const draw = SVG();

    const g = createTable(helper, fontCtx, hands, discards, scoreBoard);

    draw.add(g.e);
    const got = draw.svg();
    const want = loadTestData("table-svg1.svg", got, update);
    expect(want.toString()).toBe(got);
  });

  test("dynamic-hands-size", () => {
    const sampleDiscard = "1p";
    const p = new Parser(sampleDiscard).parseInput();

    const sampleHand = "123456789s1234m";
    const blocks = new Parser(sampleHand).parse();
    const hands: HandsInput = {
      front: new Parser("123456789s1234m, t3s").parse(),
      right: blocks,
      opposite: blocks,
      left: blocks,
    };
    const discards: DiscardsInput = {
      front: p,
      right: p,
      opposite: p,
      left: p,
    };
    const scoreBoard: ScoreBoardInput = {
      round: "南４局",
      scores: {
        front: 100,
        right: 200,
        opposite: 25000,
        left: 9000,
      },
      frontPlace: "西",
      sticks: {
        reach: 1,
        dead: 3,
      },
      doras: [new Tile(KIND.M, 3)],
    };

    const draw = SVG();

    const g = createTable(helper, fontCtx, hands, discards, scoreBoard);

    draw.add(g.e);
    const got = draw.svg();
    const want = loadTestData("table-svg2.svg", got, update);
    expect(want.toString()).toBe(got);
  });
});
