import { describe, test, expect } from "@jest/globals";
import { SVG, Use } from "@svgdotjs/svg.js";
import { optimizeSVG } from "../image";
import fs from "fs";

import { loadTestData, initSvgDOM } from "./utils/helper";

const { window, document } = initSvgDOM();

const update = false;

describe("use", () => {
  test("import existing", () => {
    const img = fs.readFileSync("src/lib/tiles.svg").toString();
    const draw = SVG().svg(img);
    const use = new Use().use("m1");
    draw.add(use);
    const got = draw.svg();
    const want = loadTestData("use.1m.svg", got, update);
    expect(want.toString()).toBe(got);
  });

  test("remove unused tile", () => {
    const img = fs.readFileSync("src/lib/tiles.svg").toString();
    let draw = SVG().svg(img);
    const use = new Use().use("m1");
    draw.add(use);

    optimizeSVG(draw);
    const got = draw.svg();
    const want = loadTestData("use.filtered-m1.svg", got, update);
    expect(want.toString()).toBe(got);
  });
});
