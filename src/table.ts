import { Pai, Operator, Parser, Kind } from "./parser";
import { ImageHelper, createHand } from "./image";
import { Svg, SVG, Element, Text } from "@svgdotjs/svg.js";
import assert from "assert";

const splitTiles = (input: Pai[]) => {
  const chunkSize = 6;
  const result: Pai[][] = [];
  for (let i = 0; i < input.length; i += chunkSize) {
    const chunk = input.slice(i, i + chunkSize);
    result.push(chunk);
  }
  return result;
};

const simpleRotate = (
  draw: Svg,
  e: Element,
  width: number,
  height: number,
  degree: 0 | 90 | 180 | 270 = 90
) => {
  const g = draw.group().add(e);
  if (degree == 90) {
    const translatedX = 0;
    const translatedY = 0 - height;
    g.rotate(degree, 0, height).translate(translatedX, translatedY);
    return g;
  }
  if (degree == 180) {
    const translatedX = 0 + width;
    const translatedY = 0 - height;
    g.rotate(degree, 0, height).translate(translatedX, translatedY);
    return g;
  }
  if (degree == 270) {
    const translatedX = 0 + height;
    const translatedY = 0 + (width - height);
    g.rotate(degree, 0, height).translate(translatedX, translatedY);
    return g;
  }

  return g;
};

let contextFunc = (s: string, font: string | null = null) => {
  return () => {
    const ctx = document.createElement("canvas").getContext("2d");
    assert(ctx != null);
    if (font != null) ctx.font = font;
    const metrics = ctx.measureText(s);
    let width = metrics.width;
    let height =
      metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
    return [width, height];
  };
};

const createBoard = (draw: Svg, helper: ImageHelper, width: number) => {
  // FIXME merge drawRect and consider helper.scale
  const font = { family: "メイリオ,ＭＳ Ｐゴシック", size: 15 };
  const fontString = `${font.size}px ${font.family}`;
  const [textWidth, textHeight] = contextFunc("東", fontString)();

  const g = draw.group();

  const num100 = 1;
  const num1000 = 1;
  const stickWidth = 50;
  const stickHeight = 11;

  let roundWidth = textWidth * 3;
  let roundHeight = textHeight;
  const roundX = (stickWidth + helper.paiWidth - roundWidth) / 2;

  const roundText = draw
    .text("東１局")
    .font({ font: 15, family: font.family })
    .move(roundX, 0);
  g.add(roundText);

  roundHeight += 10; // margin

  const stickGroupHeight = helper.paiHeight;
  const stickGroup = draw
    .group()
    .size(stickWidth, stickGroupHeight)
    .translate(0, roundHeight);

  const stick1000 = draw
    .image(helper.makeImageHref("stick1000.svg"))
    .size(stickWidth, stickHeight)
    .move(0, 0);
  const text1000 = draw
    .text(num1000.toString())
    // margin -3
    .move(stickWidth, -3)
    .font({ size: 13, family: font.family });
  stickGroup.add(stick1000);
  stickGroup.add(text1000);

  const stick100 = draw
    .image(helper.makeImageHref("stick100.svg"))
    .size(stickWidth, stickHeight)
    .move(0, stickHeight + stickHeight);
  const text100 = draw
    .text(num100.toString())
    .move(stickWidth, stickHeight - 3 + stickHeight)
    .font({ size: 13, family: font.family });
  stickGroup.add(stick100);
  stickGroup.add(text100);

  const doraImg = helper
    .createImage(draw, new Pai(Kind.M, 2), 0, 0)
    .move(stickWidth + textWidth, 0);
  stickGroup.add(doraImg);

  g.add(roundText);
  g.add(stickGroup);

  return {
    e: g,
    width: stickWidth + helper.paiWidth + textWidth,
    height: roundHeight + helper.paiHeight,
  };
};

const createHands = (draw: Svg, helper: ImageHelper) => {
  const input = "2s, -1111p, -1111s, -1111m, -2222m, t3s";
  // max case: "2s, -1111p, 1111s, -1111m, -2222m t3s"
  const sizeWidth =
    helper.paiWidth +
    (helper.paiHeight + helper.paiWidth * 3) * 4 +
    helper.paiWidth +
    helper.textWidth +
    helper.blockMargin * 5 +
    helper.paiWidth * 2; // additional margin
  const sizeHeight = sizeWidth;

  const g = draw.group().size(sizeWidth, sizeHeight);

  const blocks = new Parser(input).parse();
  const z1e = createHand(draw, blocks, helper);

  const z2e = createHand(draw, blocks, helper);
  const z3e = createHand(draw, blocks, helper);
  const z4e = createHand(draw, blocks, helper);
  const z1g = simpleRotate(draw, z1e.e, z1e.width, z1e.height, 0).translate(
    (sizeWidth - z1e.width) / 2,
    sizeHeight - z1e.height
  );
  const z2g = simpleRotate(draw, z2e.e, z2e.width, z2e.height, 270).translate(
    sizeWidth - z2e.height,
    (sizeWidth - z2e.width) / 2
  );
  const z3g = simpleRotate(draw, z3e.e, z3e.width, z3e.height, 180).translate(
    (sizeWidth - z3e.width) / 2,
    0
  );
  const z4g = simpleRotate(draw, z4e.e, z4e.width, z4e.height, 90).translate(
    0,
    (sizeWidth - z4e.width) / 2
  );

  g.add(z1g);
  g.add(z2g);
  g.add(z3g);
  g.add(z4g);

  return { e: g, width: sizeWidth, height: sizeHeight };
};

const drawRect = (draw: Svg, helper: ImageHelper, width: number) => {
  const g = draw.group();
  const rect = draw
    .rect(width, width)
    .attr({ fill: "none", stroke: "#000000" });
  g.add(rect);

  const font = { family: "メイリオ,ＭＳ Ｐゴシック", size: 15 };
  const fontString = `${font.size}px ${font.family}`;
  let [textWidth, textHeight] = contextFunc("東", fontString)();
  const boardRect = createBoard(draw, helper, width / 1.1);
  boardRect.e.translate(
    width / 2 - boardRect.width / 2,
    width / 2 - boardRect.height / 2
  );
  g.add(boardRect.e);

  const w1Text = draw
    .text("東")
    .font(font)
    .move(width / 2 - textWidth / 2, width - textHeight);
  g.add(w1Text);

  const w3Text = draw
    .text("西")
    .font(font)
    .move(width / 2 - textWidth / 2, 0);
  g.add(w3Text);

  const w2Text = draw
    .text("南")
    .font(font)
    .move(width - textWidth, width / 2 - textHeight / 2);
  g.add(w2Text);

  const w4Text = draw
    .text("北")
    .font(font)
    .move(0, width / 2 - textHeight / 2);
  g.add(w4Text);

  return g;
};

const drawDiscards = (draw: Svg, helper: ImageHelper, p: any) => {
  const discardWidth = helper.paiWidth * 5 + helper.paiHeight * 1; // 11111-1
  const discardHeight = helper.paiHeight * 4;

  const sizeWidth = helper.paiWidth * 18;
  const sizeHeight = helper.paiWidth * 18;

  const g = draw.group().size(sizeWidth, sizeHeight);

  const centerX = sizeWidth / 2 - discardWidth / 2;
  const centerY = sizeHeight / 2 - discardWidth / 2;
  const rect = drawRect(draw, helper, discardWidth).translate(centerX, centerY);
  g.add(rect);

  let z1 = handleDiscard(draw, p, helper);
  z1 = simpleRotate(draw, z1, discardWidth, discardHeight, 0).translate(
    centerX,
    sizeHeight - discardHeight
  );
  g.add(z1);

  let z2 = handleDiscard(draw, p, helper);
  z2 = simpleRotate(draw, z2, discardWidth, discardHeight, 270).translate(
    sizeWidth - discardHeight,
    centerY
  );
  g.add(z2);

  let z3 = handleDiscard(draw, p, helper);
  z3 = simpleRotate(draw, z3, discardWidth, discardHeight, 180).translate(
    centerX,
    0
  );
  g.add(z3);

  let z4 = handleDiscard(draw, p, helper);
  z4 = simpleRotate(draw, z4, discardWidth, discardHeight, 90).translate(
    0,
    centerY
  );
  g.add(z4);
  return { e: g, width: sizeWidth, height: sizeHeight };
};

export const handle = () => {
  const input = "123456789s12-3456789m1234p";
  const p = (new Parser(input) as any).parseInput();
  const helper = new ImageHelper({ imageHostPath: "svg/", scale: 0.4 });

  const draw = SVG().size(1000, 1000);

  const hg = createHands(draw, helper);
  draw.add(hg.e);

  const dg = drawDiscards(draw, helper, p);
  dg.e.translate((hg.width - dg.width) / 2, (hg.height - dg.height) / 2);
  draw.add(dg.e);

  console.debug("handling");
  draw.addTo("#container");
};

const handleDiscard = (draw: Svg, pp: Pai[], helper: ImageHelper) => {
  const g = draw.group();
  const chunks = splitTiles(pp);

  for (let i = 0; i < chunks.length; i++) {
    let chunk = chunks[i];
    let posY = i * helper.paiHeight;
    let posX = 0;
    for (let p of chunk) {
      if (p.op == Operator.Horizontal) {
        const img = helper.createRotate90Image(draw, p, posX, posY);
        g.add(img);
        posX += helper.paiHeight;
        continue;
      }
      const img = helper.createImage(draw, p, posX, posY);
      g.add(img);
      posX += helper.paiWidth;
    }
  }
  return g;
};
