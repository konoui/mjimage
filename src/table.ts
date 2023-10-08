import { Pai, Operator, Parser, Kind, Block } from "./parser";
import { ImageHelper, createHand } from "./image";
import { SVG, Element, Text, G, Rect, Image } from "@svgdotjs/svg.js";
import { FONT_FAMILY } from "./constants";
import assert from "assert";

export interface Discards {
  front: Pai[];
  right: Pai[];
  opposite: Pai[];
  left: Pai[];
}

export interface Hands {
  front: Block[];
  right: Block[];
  opposite: Block[];
  left: Block[];
}

export interface ScoreBoard {
  doras: Pai[];
  round:
    | "東１局"
    | "東２局"
    | "東３局"
    | "東４局"
    | "南１局"
    | "南２局"
    | "南３局"
    | "南４局";
  sticks: { reach: number; dead: number };
  score: {
    front: number;
    right: number;
    opposite: number;
    left: number;
  };
  frontPlace: "東" | "南" | "西" | "北";
}

export interface FontContext {
  font: { family: string; size: number };
  textWidth: number;
  textHeight: number;
}

let contextFunc = (str: string, font: string | null = null) => {
  return () => {
    const ctx = document.createElement("canvas").getContext("2d");
    assert(ctx != null);
    if (font != null) ctx.font = font;
    const metrics = ctx.measureText(str);
    let width = metrics.width;
    let height =
      metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
    return [width, height];
  };
};

export const getTableFontContext = (helper: ImageHelper): FontContext => {
  const font = { family: FONT_FAMILY, size: 45 * helper.scale };
  const fontString = `${font.size}px ${font.family}`;
  const [textWidth, textHeight] = contextFunc("東", fontString)();
  const ctx = {
    font: font,
    textWidth: textWidth,
    textHeight: textHeight,
  };
  console.debug("table font context", ctx);
  return ctx;
};

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
  e: Element,
  width: number,
  height: number,
  degree: 0 | 90 | 180 | 270 = 90
) => {
  const g = new G().add(e);
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

const handleDiscard = (pp: Pai[], helper: ImageHelper) => {
  const g = new G();
  const chunks = splitTiles(pp);

  for (let i = 0; i < chunks.length; i++) {
    let chunk = chunks[i];
    let posY = i * helper.paiHeight;
    let posX = 0;
    for (let p of chunk) {
      if (p.op == Operator.Horizontal) {
        const img = helper.createRotate90Image(p, posX, posY);
        g.add(img);
        posX += helper.paiHeight;
        continue;
      }
      const img = helper.createImage(p, posX, posY);
      g.add(img);
      posX += helper.paiWidth;
    }
  }
  return g;
};

const createStickAndDora = (
  helper: ImageHelper,
  fontCtx: FontContext,
  scoreBoard: ScoreBoard
) => {
  const font = fontCtx.font;
  const textWidth = fontCtx.textWidth;
  const textHeight = fontCtx.textHeight;

  const g = new G();

  const num100 = scoreBoard.sticks.dead;
  const num1000 = scoreBoard.sticks.reach;
  const stickWidth = 125 * helper.scale;
  const stickHeight = 27.5 * helper.scale;

  let roundWidth = textWidth * 3;
  let roundHeight = textHeight;
  const roundX = (stickWidth + helper.paiWidth + textWidth - roundWidth) / 2;

  const roundText = new Text()
    .plain(scoreBoard.round)
    .font(font)
    .move(roundX, 0);
  g.add(roundText);

  roundHeight += 25 * helper.scale; // margin

  const stickGroupHeight = helper.paiHeight;
  const stickGroup = new G()
    .size(stickWidth, stickGroupHeight)
    .translate(0, roundHeight);

  const stickFont = { family: font.family, size: font.size * 0.86 };
  const stick1000 = new Image()
    .load(helper.makeImageHref("stick1000.svg"))
    .size(stickWidth, stickHeight)
    .move(0, 0);
  const text1000 = new Text()
    .plain(num1000.toString())
    .font(stickFont)
    .move(stickWidth, 0);
  stickGroup.add(stick1000);
  stickGroup.add(text1000);

  const stick100 = new Image()
    .load(helper.makeImageHref("stick100.svg"))
    .size(stickWidth, stickHeight)
    .move(0, stickHeight + stickHeight);
  const text100 = new Text()
    .plain(num100.toString())
    .font(stickFont)
    .move(stickWidth, stickHeight + stickHeight);
  stickGroup.add(stick100);
  stickGroup.add(text100);

  const doraImg = helper
    .createImage(scoreBoard.doras[0], 0, 0)
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

const createHands = (helper: ImageHelper, hands: Hands) => {
  // max case: "2s, -1111p, 1111s, -1111m, -2222m t3s"
  const sizeWidth =
    helper.paiWidth +
    (helper.paiHeight + helper.paiWidth * 3) * 4 +
    helper.paiWidth +
    helper.textWidth +
    helper.blockMargin * 5 +
    helper.paiWidth * 2; // additional margin
  const sizeHeight = sizeWidth;

  const g = new G().size(sizeWidth, sizeHeight);

  const fe = createHand(hands.front, helper);
  const re = createHand(hands.right, helper);
  const oe = createHand(hands.opposite, helper);
  const le = createHand(hands.left, helper);
  const front = simpleRotate(fe.e, fe.width, fe.height, 0).translate(
    (sizeWidth - fe.width) / 2,
    sizeHeight - fe.height
  );
  const right = simpleRotate(re.e, re.width, re.height, 270).translate(
    sizeWidth - re.height,
    (sizeWidth - re.width) / 2
  );
  const opposite = simpleRotate(oe.e, oe.width, oe.height, 180).translate(
    (sizeWidth - oe.width) / 2,
    0
  );
  const left = simpleRotate(le.e, le.width, le.height, 90).translate(
    0,
    (sizeWidth - le.width) / 2
  );

  g.add(front);
  g.add(right);
  g.add(opposite);
  g.add(left);

  return { e: g, width: sizeWidth, height: sizeHeight };
};

const getPlaces = (front: "東" | "南" | "西" | "北") => {
  if (front == "東") return ["東", "南", "西", "北"];
  if (front == "南") return ["南", "西", "北", "東"];
  if (front == "西") return ["西", "北", "東", "南"];
  return ["北", "東", "南", "西"];
};

const createScoreBoard = (
  helper: ImageHelper,
  fontCtx: FontContext,
  scoreBoard: ScoreBoard
) => {
  const sizeWidth = helper.paiWidth * 5 + helper.paiHeight * 1; // 11111-1

  const g = new G();
  const rect = new Rect()
    .size(sizeWidth, sizeWidth)
    .attr({ fill: "none", stroke: "#000000" });
  g.add(rect);

  const font = fontCtx.font;
  const textWidth = fontCtx.textWidth;
  const textHeight = fontCtx.textHeight;
  const boardRect = createStickAndDora(helper, fontCtx, scoreBoard);
  boardRect.e.translate(
    sizeWidth / 2 - boardRect.width / 2,
    sizeWidth / 2 - boardRect.height / 2
  );
  g.add(boardRect.e);

  const [frontPlace, rightPlace, oppositePlace, leftPlace] = getPlaces(
    scoreBoard.frontPlace
  );
  const frontText = new Text()
    .plain(frontPlace)
    .font(font)
    .move(sizeWidth / 2 - textWidth / 2, sizeWidth - textHeight);
  g.add(frontText);

  const rightText = new Text()
    .plain(rightPlace)
    .font(font)
    .move(sizeWidth - textWidth, sizeWidth / 2 - textHeight / 2);
  g.add(rightText);

  const oppositeText = new Text()
    .plain(oppositePlace)
    .font(font)
    .move(sizeWidth / 2 - textWidth / 2, 0);
  g.add(oppositeText);

  const leftText = new Text()
    .plain(leftPlace)
    .font(font)
    .move(0, sizeWidth / 2 - textHeight / 2);
  g.add(leftText);

  return { e: g, width: sizeWidth, height: sizeWidth };
};

const createDiscards = (helper: ImageHelper, discards: Discards) => {
  const discardWidth = helper.paiWidth * 5 + helper.paiHeight * 1; // 11111-1
  const discardHeight = helper.paiHeight * 4;

  const sizeWidth = helper.paiWidth * 18;
  const sizeHeight = sizeWidth;

  const g = new G().size(sizeWidth, sizeHeight);

  const centerX = sizeWidth / 2 - discardWidth / 2;
  const centerY = sizeHeight / 2 - discardWidth / 2;

  let front = handleDiscard(discards.front, helper);
  front = simpleRotate(front, discardWidth, discardHeight, 0).translate(
    centerX,
    sizeHeight - discardHeight
  );
  g.add(front);

  let right = handleDiscard(discards.right, helper);
  right = simpleRotate(right, discardWidth, discardHeight, 270).translate(
    sizeWidth - discardHeight,
    centerY
  );
  g.add(right);

  let opposite = handleDiscard(discards.opposite, helper);
  opposite = simpleRotate(opposite, discardWidth, discardHeight, 180).translate(
    centerX,
    0
  );
  g.add(opposite);

  let left = handleDiscard(discards.left, helper);
  left = simpleRotate(left, discardWidth, discardHeight, 90).translate(
    0,
    centerY
  );
  g.add(left);
  return { e: g, width: sizeWidth, height: sizeHeight };
};

export const createTable = (
  helper: ImageHelper,
  fontCtx: FontContext,
  handsProps: Hands,
  discardsProps: Discards,
  scoreBoardProps: ScoreBoard
) => {
  const g = new G();
  const hands = createHands(helper, handsProps);
  const discards = createDiscards(helper, discardsProps);
  discards.e.translate(
    (hands.width - discards.width) / 2,
    (hands.height - discards.height) / 2
  );

  const scoreBoard = createScoreBoard(helper, fontCtx, scoreBoardProps);
  scoreBoard.e.translate(
    (hands.width - scoreBoard.width) / 2,
    (hands.height - scoreBoard.height) / 2
  );

  g.add(hands.e);
  g.add(discards.e);
  g.add(scoreBoard.e);
  return g;
};

export const handle = () => {
  const sampleDiscard = "123456789s12-3456789m1234p";
  const p = new Parser(sampleDiscard).parseInput();

  const sampleHand = "2s, -1111p, -1111s, -1111m, -2222m, t3s";
  const blocks = new Parser(sampleHand).parse();

  const draw = SVG().size(1000, 1000);

  const helper = new ImageHelper({ imageHostPath: "svg/", scale: 0.4 });
  const fontCtx = getTableFontContext(helper);

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
    score: {
      front: 0,
      right: 0,
      opposite: 0,
      left: 0,
    },
    frontPlace: "西",
    sticks: {
      reach: 1,
      dead: 3,
    },
    doras: [new Pai(Kind.M, 3)],
  };

  const g = createTable(helper, fontCtx, hands, discards, scoreBoard);

  draw.add(g);
  console.debug("handling");
  draw.addTo("#container");
};
