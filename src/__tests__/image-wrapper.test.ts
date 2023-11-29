import { describe, test, expect } from "@jest/globals";
import { SVG, Use } from "@svgdotjs/svg.js";
import { tileImage } from "./../image-wrapper";
import fs from "fs";

import { loadTestData, initSvgDOM } from "./utils/helper";

const { window, document } = initSvgDOM();

describe("use", () => {
  test("import existing", () => {
    const img = fs.readFileSync("src/tiles.svg").toString();
    const draw = SVG().svg(img);
    const use = new Use().use("m1");
    draw.add(use);
    const got = draw.svg();
    const want = loadTestData("use.1m.svg", got, false);
    expect(want.toString()).toBe(got);
  });
});
