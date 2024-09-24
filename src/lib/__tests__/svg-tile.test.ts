import { SVG, Use } from "@svgdotjs/svg.js";
import { optimizeSVG } from "../image/image";
import fs from "fs";

import { loadTestData, initSvgDOM } from "./utils/helper";

const { window, document } = initSvgDOM();

const update = false;
const spritePath = "browser-mjimage/static/svg/tiles.svg";

describe("use", () => {
  test("import existing", () => {
    const img = fs.readFileSync(spritePath).toString();
    const draw = SVG().svg(img);
    const use = new Use().use("m1");
    draw.add(use);
    const got = draw.svg();
    const want = loadTestData("use.1m.svg", got, update);
    expect(want.toString()).toBe(got);
  });

  test("remove unused tile", () => {
    const img = fs.readFileSync(spritePath).toString();
    let draw = SVG().svg(img);
    const use = new Use().use("m1");
    draw.add(use);

    optimizeSVG(draw);
    const got = draw.svg();
    const want = loadTestData("use.filtered-m1.svg", got, update);
    expect(want.toString()).toBe(got);
  });
});
