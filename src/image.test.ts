import { describe, test, expect } from "@jest/globals";
import { SVG, registerWindow } from "@svgdotjs/svg.js";
import { createHTMLWindow } from "svgdom";
import fs from "fs";
import { Parser } from "./parser";
import { drawBlocks } from "./image";

const window = createHTMLWindow();
const document = window.document;
registerWindow(window, document);

const update = false;

test("svg1", () => {
  const draw = SVG();
  const blocks = new Parser(
    "-123s,1234m, d2s, _22_s,-2222s, -2-222m, 3-3-33s"
  ).parse();
  drawBlocks(draw, blocks, {
    image_host_url: new URL("http://localhost:1234/svg/").toString(),
  });
  const got = draw.svg();
  const gotPath = "testdata/svg1.svg";
  if (update) fs.writeFileSync("testdata/svg1.svg", got);
  const want = fs.readFileSync(gotPath);
  expect(want.toString()).toBe(got);
});
