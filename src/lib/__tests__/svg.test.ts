import { XMLValidator, XMLParser } from "fast-xml-parser";
import fs from "fs";
import { Parser } from "../core/parser";
import { ImageHelper, drawBlocks, drawTable } from "../image";
import { SVG } from "./utils/helper";
import { TYPE, TILE_NUMBERS } from "../core/constants";
import { G as MyG, Rect as MyRect } from "../svgjs/svg";

const spritePath = "public/svg/tiles.svg";

describe("svg serialization", () => {
  // symbol の viewBox はキャメルケースが正。属性名を一律に変換すると view-box に
  // 化け、use の width/height に合わせた拡縮が効かなくなる。
  test("keeps camelCase attribute names from imported symbols", () => {
    const sprite = fs.readFileSync(spritePath).toString();
    const draw = SVG().importSymbol(sprite);
    const svg = draw.svg();
    expect(svg).toContain('viewBox="0 0 66 90"');
    expect(svg).not.toContain("view-box");
  });

  // 利用者が渡す値（imageHostUrl / fontFamily）はそのまま属性値になる。
  test("escapes consumer supplied attribute values", () => {
    const hostUrl = 'https://cdn/?v=1&s=2" onload="x()';
    const draw = SVG();
    drawBlocks(draw, new Parser("1m").parse(), { imageHostUrl: hostUrl });
    const svg = draw.svg();

    expect(XMLValidator.validate(svg)).toBe(true);

    // パースし直して、属性が増えていない（脱出していない）ことを確かめる。
    const doc = new XMLParser({ ignoreAttributes: false }).parse(svg);
    const image = doc.svg.g.g.g.image;
    expect(Object.keys(image)).toStrictEqual([
      "@_href",
      "@_x",
      "@_y",
      "@_width",
      "@_height",
    ]);
    // 値としては元の文字列がそのまま復元される
    expect(image["@_href"]).toBe(`${hostUrl}m1.svg`);
  });

  test("escapes text content", () => {
    const helper = new ImageHelper({ scale: 1 });
    const g = helper.createTextImage(
      new Parser("1m").tiles()[0],
      0,
      0,
      "<b>&</b>",
    );
    const svg = SVG().add(g).svg();
    expect(svg).toContain("&lt;b&gt;&amp;&lt;/b&gt;");
  });

  // 出力が XML として妥当であること。エスケープ漏れがあれば壊れる。
  test("produces valid XML for inputs with special characters", () => {
    const yaml = fs
      .readFileSync("src/lib/__tests__/__fixtures__/table.common.yaml")
      .toString();
    const cases = [
      () => {
        const d = SVG();
        drawBlocks(d, new Parser("-123s,1234m, d2s, t3s").parse(), {
          imageHostUrl: "https://cdn/?v=1&s=2/",
        });
        return d.svg();
      },
      () => {
        const d = SVG();
        drawTable(d, yaml, { scale: 1.6, fontFamily: 'My "Font" & Co' });
        return d.svg();
      },
    ];
    for (const build of cases) {
      expect(XMLValidator.validate(build())).toBe(true);
    }
  });

  // 座標計算で出る 403.91999999999996 や回転行列の 6.12e-17 を残さない。
  test("rounds away floating point noise", () => {
    const yaml = fs
      .readFileSync("src/lib/__tests__/__fixtures__/table.common.yaml")
      .toString();
    const draw = SVG();
    drawTable(draw, yaml, { scale: 1.6 });
    const svg = draw.svg();
    expect(svg.match(/-?\d+\.\d{7,}/g)).toBeNull();
    expect(svg.match(/\d[eE][-+]?\d+/g)).toBeNull();
    // 直角回転の行列は 0 と ±1 で表される
    expect(svg).toContain("matrix(0,1,-1,0,");
  });

  // symbol が 1 個だけの sprite でも読み込める（fast-xml-parser は配列で返さない）
  test("imports a sprite that contains a single symbol", () => {
    const one =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<symbol viewBox="0 0 1 1" id="a"><path d="M0 0h1v1H0z"/></symbol></svg>';
    expect(() => SVG().importSymbol(one)).not.toThrow();
    expect(SVG().importSymbol(one).svg()).toContain('id="a"');
  });

  test("imports a sprite that contains no symbol", () => {
    const none = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    expect(() => SVG().importSymbol(none)).not.toThrow();
  });
});

describe("svg tree manipulation", () => {
  test("remove() detaches the node from its parent", () => {
    const g = new MyG();
    const a = new MyRect().size(1, 1);
    const b = new MyRect().size(2, 2);
    g.add(a).add(b);
    expect(g.children).toHaveLength(2);

    a.remove();
    expect(g.children).toStrictEqual([b]);
    expect(a.parent).toBeUndefined();
    expect(g.svg()).not.toContain('width="1"');

    // 親に属していないノードの remove() は何もしない
    expect(() => a.remove()).not.toThrow();
  });

  // optimizeSVG は each の走査中に remove() を呼ぶ。
  // 走査対象を複製していないと添字がずれて取りこぼす。
  test("each() is safe when the callback removes nodes", () => {
    const g = new MyG();
    for (let i = 0; i < 6; i++) g.add(new MyRect().size(i, i));
    const seen: number[] = [];
    g.each((idx, children) => {
      const node = children[idx];
      seen.push(node.attrs.width as number);
      node.remove();
    }, true);
    expect(seen).toStrictEqual([0, 1, 2, 3, 4, 5]);
    expect(g.children).toHaveLength(0);
  });

  test("each() with deep visits nested containers", () => {
    const root = new MyG();
    const child = new MyG();
    root.add(child);
    child.add(new MyRect().size(9, 9));
    const types: string[] = [];
    root.each((idx, children) => types.push(children[idx].type), true);
    expect(types.sort()).toStrictEqual(["g", "rect"]);
  });

  // 中身の無い要素は空要素として畳む。G の transform は保たれる。
  test("collapses empty elements", () => {
    expect(new MyRect().size(1, 2).svg()).toBe('<rect width="1" height="2"/>');
    expect(new MyG().translate(3, 4).svg()).toBe(
      '<g transform="matrix(1,0,0,1,3,4)"/>',
    );
    // 中身があれば従来どおり開始/終了タグになる
    expect(new MyG().add(new MyRect().size(1, 1)).svg()).toBe(
      '<g><rect width="1" height="1"/></g>',
    );
  });
});

// スプライト最適化が使う ID 一覧は、実際に存在する牌画像と一致していなければ
// ならない。入力の値域検証と同じ定義（TILE_NUMBERS）から作る。
test("valid tile ids match the shipped tile images", () => {
  const onDisk = new Set(
    fs
      .readdirSync("public/svg")
      .filter((f) => f.endsWith(".svg"))
      .map((f) => f.replace(".svg", ""))
      .filter((id) => id !== "tiles" && !id.startsWith("stick")),
  );
  const expected = new Set(
    Object.values(TYPE).flatMap((t) =>
      (TILE_NUMBERS[t] as readonly number[]).map((n) =>
        n === 0 || t === TYPE.BACK ? `${t}0` : `${t}${n}`,
      ),
    ),
  );
  expect([...expected].sort()).toStrictEqual([...onDisk].sort());
});
