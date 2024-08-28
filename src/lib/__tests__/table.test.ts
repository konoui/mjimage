import { describe, test, expect } from "@jest/globals";
import { SVG } from "@svgdotjs/svg.js";
import { Tile, Parser } from "../parser";
import { ImageHelper } from "../image";
import { drawTable, createTable } from "../table";
import { FontContext } from "../measure-text";
import { DiscardsInput, ScoreBoardInput, HandsInput } from "../table-parser";
import { FONT_FAMILY, TYPE } from "../constants";

import { initSvgDOM, loadTestData, loadInputData } from "./utils/helper";

const { window, document } = initSvgDOM();

// FIXME using node canvas
const fontCtx: FontContext = {
  font: { family: FONT_FAMILY, size: 16 },
  textWidth: 16.0,
  textHeight: 16.0,
  numWidth: 11.84,
  numHeight: 11.84,
};

const helperConfig = {
  imageHostPath: "http://localhost:1234/svg/",
  scale: 0.4,
};

const update = false;

describe("table yaml to svg", () => {
  const tests = [
    {
      name: "specify all params",
      gotFilename: "yaml-to-svg.common.svg",
      inputFilename: "table.common.yaml",
    },
    {
      name: "omit params",
      gotFilename: "yaml-to-svg.omit.svg",
      inputFilename: "table.omit.yaml",
    },
  ];

  for (const t of tests) {
    test(t.name, () => {
      const input = loadInputData(t.inputFilename);

      const draw = SVG();
      drawTable(draw, input, helperConfig, fontCtx, { responsive: true });

      const got = draw.svg();
      const want = loadTestData(t.gotFilename, got, update);
      expect(want.toString()).toBe(got);
    });
  }
});

describe("createTable", () => {
  test("max-table-size", () => {
    const sampleDiscard = "123456789s12-3456789m1234p";
    const p = new Parser(sampleDiscard).tiles();

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
      doras: [new Tile(TYPE.M, 3)],
    };

    const helper = new ImageHelper(helperConfig);
    const g = createTable(helper, fontCtx, hands, discards, scoreBoard);

    const draw = SVG();
    draw.add(g.e);
    const got = draw.svg();
    const want = loadTestData("table.max-size.svg", got, update);
    expect(want.toString()).toBe(got);
  });

  test("dynamic-hands-size", () => {
    const sampleDiscard = "1p";
    const p = new Parser(sampleDiscard).tiles();

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
      doras: [new Tile(TYPE.M, 3)],
    };

    const helper = new ImageHelper(helperConfig);
    const g = createTable(helper, fontCtx, hands, discards, scoreBoard);

    const draw = SVG();
    draw.add(g.e);
    const got = draw.svg();
    const want = loadTestData("table.dynamic-size.svg", got, update);
    expect(want.toString()).toBe(got);
  });
});
