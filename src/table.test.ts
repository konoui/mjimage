import { describe, test, expect } from "@jest/globals";
import { SVG, registerWindow } from "@svgdotjs/svg.js";
import { createHTMLWindow } from "svgdom";
// @ts-ignore, https://github.com/DefinitelyTyped/DefinitelyTyped/pull/66501/files
import { config } from "svgdom";
import fs from "fs";
import { Tile, Parser, Kind } from "./parser";
import { ImageHelper } from "./image";
import { createTable, FontContext } from "./table";
import { Discards, ScoreBoard, Hands } from "./table-parser";
import { FONT_FAMILY } from "./constants";

const window = createHTMLWindow();
const document = window.document;
registerWindow(window, document);

config.setFontDir("./node_modules/svgdom/fonts/");

const update = false;

test("table-svg1", () => {
  const sampleDiscard = "123456789s12-3456789m1234p";
  const p = new Parser(sampleDiscard).parseInput();

  const sampleHand = "2s, -1111p, -1111s, -1111m, -2222m, t3s";
  const blocks = new Parser(sampleHand).parse();

  const helper = new ImageHelper({
    imageHostPath: "http://localhost:1234/svg/",
    scale: 0.4,
  });
  // FIXME using node canvas
  const fontCtx: FontContext = {
    font: { family: FONT_FAMILY, size: 16 },
    textWidth: 16.040000915527344,
    textHeight: 16.040000915527344,
    numWidth: 11.84,
    numHeight: 11.84,
  };

  const hands: Hands = {
    front: blocks,
    right: blocks,
    opposite: blocks,
    left: blocks,
  };
  const discards: Discards = {
    front: p,
    right: p,
    opposite: p,
    left: p,
  };
  const scoreBoard: ScoreBoard = {
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
    doras: [new Tile(Kind.M, 3)],
  };

  const draw = SVG();

  const g = createTable(helper, fontCtx, hands, discards, scoreBoard);

  draw.add(g.e);
  const got = draw.svg();
  const gotPath = "testdata/table-svg1.svg";
  if (update) fs.writeFileSync("testdata/table-svg1.svg", got);
  const want = fs.readFileSync(gotPath);
  expect(want.toString()).toBe(got);
});
