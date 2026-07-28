import fs from "fs";
import { optimizeSVG } from "../image/image";

import { Svg, Use } from "../svgjs/svg";
import { assetPath } from "./utils/helper";

const sprite = () => fs.readFileSync(assetPath("svg", "tiles.svg"), "utf8");

const symbolIDs = (svg: string) =>
  [...svg.matchAll(/<symbol[^>]*\sid="([^"]+)"/g)].map((m) => m[1]);

describe("sprite", () => {
  // スプライトは牌の数だけ symbol を持つ。読み込みで取りこぼすと牌が消える。
  test("importSymbol brings every symbol into the svg", () => {
    const draw = new Svg().importSymbol(sprite());
    const ids = symbolIDs(draw.svg());
    expect(ids).toEqual(symbolIDs(sprite()));
    expect(ids).toContain("m1");
  });

  test("use refers to the symbol by id", () => {
    const draw = new Svg().importSymbol(sprite());
    draw.add(new Use().use("m1"));
    expect(draw.svg()).toContain('<use href="#m1"/>');
  });

  // スプライト全体は 800KB を超える。埋め込みが現実的な大きさに収まるのは
  // 参照していない牌の symbol を落とすからで、これが optimizeSVG の目的。
  test("optimizeSVG keeps only the symbols that are used", () => {
    const draw = new Svg().importSymbol(sprite());
    draw.add(new Use().use("m1"));
    const before = draw.svg();

    optimizeSVG(draw);
    const after = draw.svg();

    expect(symbolIDs(after)).toEqual(["m1"]);
    expect(after).toContain('<use href="#m1"/>');
    expect(after.length).toBeLessThan(before.length / 10);
    // 残した symbol の中身はそのまま（viewBox が消えると use の拡縮が効かなくなる）
    const symbolOf = (svg: string) => svg.match(/<symbol[^>]*\sid="m1".*?<\/symbol>/s)![0];
    expect(symbolOf(after)).toBe(symbolOf(before));
  });
});
