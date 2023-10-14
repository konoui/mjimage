import { Tile, Operator } from "./parser";
import { ImageHelper, createHand } from "./image";
import { SVG, Element, Text, G, Rect, Image } from "@svgdotjs/svg.js";
import { FONT_FAMILY } from "./constants";
import {
  Discards,
  ScoreBoard,
  Hands,
  parserTableInput,
  convertInput,
} from "./table-parser";
import assert from "assert";

export interface FontContext {
  font: { family: string; size: number };
  textWidth: number;
  textHeight: number;
  numWidth: number;
  numHeight: number;
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
    return [width, width];
  };
};

export const getTableFontContext = (helper: ImageHelper): FontContext => {
  const font = { family: FONT_FAMILY, size: 40 * helper.scale };
  const fontString = `${font.size}px ${font.family}`;
  const [textWidth, textHeight] = contextFunc("東", fontString)();
  const [numWidth, numHeight] = contextFunc("2", fontString)();
  const ctx = {
    font: font,
    textWidth: textWidth,
    textHeight: textHeight,
    numWidth: numWidth,
    numHeight: numHeight,
  };
  console.debug("table font context", ctx);
  return ctx;
};

const splitTiles = (input: Tile[]) => {
  const chunkSize = 6;
  const result: Tile[][] = [];
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
  degree: 0 | 90 | 180 | 270,
  x: number = 0,
  y: number = 0
) => {
  const g = new G().add(e);
  if (degree == 90) {
    const translatedX = x;
    const translatedY = y - height;
    g.rotate(degree, 0, height).translate(translatedX, translatedY);
    return g;
  }
  if (degree == 180) {
    const translatedX = x + width;
    const translatedY = y - height;
    g.rotate(degree, 0, height).translate(translatedX, translatedY);
    return g;
  }
  if (degree == 270) {
    const translatedX = x + height;
    const translatedY = y + (width - height);
    g.rotate(degree, 0, height).translate(translatedX, translatedY);
    return g;
  }

  return g;
};

const handleDiscard = (pp: Tile[], helper: ImageHelper) => {
  const g = new G();
  const chunks = splitTiles(pp);

  for (let i = 0; i < chunks.length; i++) {
    let chunk = chunks[i];
    let posY = i * helper.tileHeight;
    let posX = 0;
    for (let p of chunk) {
      if (p.op == Operator.Horizontal) {
        const img = helper.createRotate90Image(p, posX, posY);
        g.add(img);
        posX += helper.tileHeight;
        continue;
      }
      const img = helper.createImage(p, posX, posY);
      g.add(img);
      posX += helper.tileWidth;
    }
  }
  // width is 11111-1
  return {
    e: g,
    width: helper.tileWidth * 5 + helper.tileHeight * 1,
    height: helper.tileHeight * chunks.length,
  };
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
  const roundX = (stickWidth + helper.tileWidth + textWidth - roundWidth) / 2;

  const roundText = new Text()
    .plain(scoreBoard.round)
    .font(font)
    .move(roundX, 0);
  g.add(roundText);

  roundHeight += 25 * helper.scale; // margin

  const stickGroupHeight = helper.tileHeight;
  const stickGroup = new G()
    .size(stickWidth, stickGroupHeight)
    .translate(0, roundHeight);

  const stickFont = { family: font.family, size: font.size * 0.7 };
  const stick1000 = new Image()
    .load(helper.makeImageHref("stick1000.svg"))
    .size(stickWidth, stickHeight)
    .move(0, 0);
  const text1000 = new Text()
    .plain(num1000.toString())
    .font(stickFont)
    .attr({ x: stickWidth, y: stickHeight });
  stickGroup.add(stick1000);
  stickGroup.add(text1000);

  const stick100 = new Image()
    .load(helper.makeImageHref("stick100.svg"))
    .size(stickWidth, stickHeight)
    .move(0, stickHeight + stickHeight);
  const text100 = new Text()
    .plain(num100.toString())
    .font(stickFont)
    .attr({ x: stickWidth, y: stickHeight * 3 });
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
    width: stickWidth + helper.tileWidth + textWidth,
    height: roundHeight + helper.tileHeight,
  };
};

const createHands = (
  helper: ImageHelper,
  hands: Hands,
  minWidth: number = 0
) => {
  const fe = createHand(hands.front, helper);
  const re = createHand(hands.right, helper);
  const oe = createHand(hands.opposite, helper);
  const le = createHand(hands.left, helper);
  const maxWidth = [fe.width, re.width, oe.width, le.width].reduce((a, b) =>
    Math.max(a, b)
  );
  const sizeWidth = Math.max(
    minWidth + helper.tileHeight * 2 + helper.blockMargin * 2,
    maxWidth + helper.tileWidth * 2 + helper.blockMargin
  ); // additional margin
  const sizeHeight = sizeWidth;

  const g = new G().size(sizeWidth, sizeHeight);

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
  const sizeWidth = helper.tileWidth * 5 + helper.tileHeight * 1; // 11111-1

  const g = new G();
  const rect = new Rect()
    .size(sizeWidth, sizeWidth)
    .move(0, 0)
    .fill("none")
    .stroke("#000000");
  g.add(rect);

  const font = fontCtx.font;
  const textWidth = fontCtx.textWidth;
  const textHeight = fontCtx.textHeight;
  const numWidth = fontCtx.numWidth;
  const boardRect = createStickAndDora(helper, fontCtx, scoreBoard);
  boardRect.e.translate(
    sizeWidth / 2 - boardRect.width / 2,
    sizeWidth / 2 - boardRect.height / 2
  );

  const createScore = (place: string, score: number, attr: any) => {
    // http://defghi1977.html.xdomain.jp/tech/svgMemo/svgMemo_08.htm
    const s = `${place} ${score}`;
    const t = new Text().plain(s).font(font).attr(attr);
    const g = new G().add(t);
    return {
      e: g,
      width: textWidth + numWidth * score.toString().length,
      height: textHeight,
    };
  };

  const [frontPlace, rightPlace, oppositePlace, leftPlace] = getPlaces(
    scoreBoard.frontPlace
  );

  const scores = scoreBoard.scores;
  let ft = createScore(frontPlace, scores.front, {
    x: sizeWidth / 2,
    y: sizeWidth,
    "dominant-baseline": "text-after-edge",
    "text-anchor": "middle",
  });
  const frontText = ft.e;

  // Note TODO why it works
  let rt = createScore(rightPlace, scores.right, {
    "dominant-baseline": "text-after-edge",
    "text-anchor": "middle",
  });
  const rightText = simpleRotate(rt.e, rt.width, rt.height, 270).translate(
    sizeWidth,
    sizeWidth / 2 - rt.width
  );

  let ot = createScore(oppositePlace, scores.opposite, {
    "text-anchor": "middle",
    "dominant-baseline": "text-after-edge",
  });
  const oppositeText = simpleRotate(ot.e, ot.width, ot.height, 180).translate(
    sizeWidth / 2 - ot.width,
    -ot.height
  );

  let lt = createScore(leftPlace, scores.left, {
    "dominant-baseline": "ideographic",
    "text-anchor": "middle",
  });
  const leftText = simpleRotate(lt.e, lt.width, lt.height, 90).translate(
    -lt.height,
    sizeWidth / 2
  );

  g.add(boardRect.e);
  g.add(frontText);
  g.add(rightText);
  g.add(oppositeText);
  g.add(leftText);

  return { e: g, width: sizeWidth, height: sizeWidth };
};

const createDiscards = (helper: ImageHelper, discards: Discards) => {
  const fe = handleDiscard(discards.front, helper);
  const re = handleDiscard(discards.right, helper);
  const oe = handleDiscard(discards.opposite, helper);
  const le = handleDiscard(discards.left, helper);

  const maxDiscardHeight = [fe.height, re.height, oe.height, le.height].reduce(
    (a, b) => Math.max(a, b)
  );

  const discardWidth = helper.tileWidth * 5 + helper.tileHeight * 1; // 11111-1
  const discardHeight = maxDiscardHeight; // using dynamic value. max value is pai height * 4

  const sizeWidth = discardWidth + maxDiscardHeight * 2 + helper.blockMargin; // add margin
  const sizeHeight = sizeWidth;

  const g = new G().size(sizeWidth, sizeHeight);

  const centerX = sizeWidth / 2 - discardWidth / 2;
  const centerY = sizeHeight / 2 - discardWidth / 2;

  const front = simpleRotate(fe.e, discardWidth, discardHeight, 0).translate(
    centerX,
    sizeHeight - discardHeight
  );

  const right = simpleRotate(re.e, discardWidth, discardHeight, 270).translate(
    sizeWidth - discardHeight,
    centerY
  );

  const opposite = simpleRotate(
    oe.e,
    discardWidth,
    discardHeight,
    180
  ).translate(centerX, 0);

  const left = simpleRotate(le.e, discardWidth, discardHeight, 90).translate(
    0,
    centerY
  );

  g.add(front);
  g.add(right);
  g.add(opposite);
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
  const discards = createDiscards(helper, discardsProps);
  const hands = createHands(helper, handsProps, discards.height);
  const scoreBoard = createScoreBoard(helper, fontCtx, scoreBoardProps);
  discards.e.translate(
    (hands.width - discards.width) / 2,
    (hands.height - discards.height) / 2
  );

  scoreBoard.e.translate(
    (hands.width - scoreBoard.width) / 2,
    (hands.height - scoreBoard.height) / 2
  );

  g.add(hands.e);
  g.add(discards.e);
  g.add(scoreBoard.e);
  return { e: g, weight: hands.width, height: hands.height };
};

export const handle = () => {
  const helper = new ImageHelper({ imageHostPath: "svg/", scale: 0.4 });
  const fontCtx = getTableFontContext(helper);

  const input = `
table:
  discards:
    1w: 11244444444444444m
    2w: 2m
    3w: 3m
    4w: 4m
  hands:
    1w: 123456789m1234s,t3s
    2w: 123456789m12345s
    3w: 123456789m12345s
    4w: 123456789m12345s
  scores:
    1w: 0
    2w: 3000
    3w: 25000
    4w: 12000
  board:
    doras:
      - 1m
    sticks:
      reach: 1
      dead: 3
    round: 1w1
  `;

  const i = parserTableInput(input);
  const [discards, hands, scoreBoard] = convertInput(i);

  const g = createTable(helper, fontCtx, hands, discards, scoreBoard);

  const draw = SVG().size(g.weight, g.height).move(0, 0);
  draw.add(g.e);
  console.debug("handling");
  draw.addTo("#container");
};
