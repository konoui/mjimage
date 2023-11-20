import { describe, test, expect } from "@jest/globals";
import { SVG, registerWindow } from "@svgdotjs/svg.js";
import { createHTMLWindow } from "svgdom";
// @ts-ignore, https://github.com/DefinitelyTyped/DefinitelyTyped/pull/66501/files
import { config } from "svgdom";
import fs from "fs";
import { Parser } from "./parser";
import { drawBlocks } from "./image";

const window = createHTMLWindow();
const document = window.document;
registerWindow(window, document);

config.setFontDir("./node_modules/svgdom/fonts/");

const update = false;

test("svg1", () => {
  const draw = SVG();
  const blocks = new Parser(
    "-123s,1234m, d2s, _22_s,-2222s, -2-222m, 3-3-33s"
  ).parse();
  drawBlocks(draw, blocks, {
    imageHostUrl: "http://localhost:1234/svg/",
  });
  const got = draw.svg();
  const gotPath = "testdata/svg1.svg";
  if (update) fs.writeFileSync(gotPath, got);
  const want = fs.readFileSync(gotPath);
  expect(want.toString()).toBe(got);
});

test("svg2", () => {
  const draw = SVG();
  const blocks = new Parser("2s2w-1s2s").parse();
  drawBlocks(draw, blocks, {
    imageHostUrl: "http://localhost:1234/svg/",
  });
  const got = draw.svg();
  const gotPath = "testdata/svg2.svg";
  if (update) fs.writeFileSync(gotPath, got);
  const want = fs.readFileSync(gotPath);
  expect(want.toString()).toBe(got);
});
