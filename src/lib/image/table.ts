import { Tile, BLOCK, BlockOther, WIND_MAP, STICK_CONTEXT } from "../core/";
import {
  ImageHelper,
  createBlockHand,
  ImageHelperConfig,
  MySVGElement,
} from "../image/image";
import { Svg, Text, G, Rect, Mark } from "../svgjs/svg";
import { FontContext } from "../measure-text/";
import { parse, ScoreBoardInput, DiscardsInput, HandsInput } from "./";

const chunkTilesForDisplay = (input: readonly Tile[], chunkSize = 6) => {
  return Array.from({ length: Math.ceil(input.length / chunkSize) }, (_, i) =>
    input.slice(i * chunkSize, (i + 1) * chunkSize)
  );
};

const simpleRotate = (
  e: Mark,
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
    return new G().add(g);
  }
  if (degree == 180) {
    const translatedX = x + width;
    const translatedY = y - height;
    g.rotate(degree, 0, height).translate(translatedX, translatedY);
    return new G().add(g);
  }
  if (degree == 270) {
    const translatedX = x + height;
    const translatedY = y + (width - height);
    g.rotate(degree, 0, height).translate(translatedX, translatedY);
    return new G().add(g);
  }

  // 0
  return new G().add(g);
};

const createDiscardArea = (
  tiles: readonly Tile[],
  helper: ImageHelper
): MySVGElement => {
  const g = new G();
  const chunks = chunkTilesForDisplay(tiles);

  for (let i = 0; i < chunks.length; i++) {
    const tiles = chunks[i];
    const posY = i * helper.tileHeight;
    const e = helper
      .createBlockDiscard(new BlockOther(tiles, BLOCK.IMAGE_DISCARD))
      .translate(0, posY);
    g.add(e);
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
  scoreBoard: ScoreBoardInput
): MySVGElement => {
  const font = fontCtx.font;
  const textWidth = fontCtx.textWidth;
  const textHeight = fontCtx.textHeight;

  const num100 = scoreBoard.sticks.dead;
  const num1000 = scoreBoard.sticks.reach;
  const stickWidth = STICK_CONTEXT.WIDTH * helper.scale;
  const stickHeight = STICK_CONTEXT.HEIGHT * helper.scale;

  const roundWidth = textWidth * 3;
  const roundHeight = textHeight + 25 * helper.scale; // margin;
  const roundX = (stickWidth + helper.tileWidth + textWidth - roundWidth) / 2;

  const roundText = new Text()
    .plain(scoreBoard.round)
    .font(font)
    .x(roundX)
    .y(0);

  const stickGroupHeight = helper.tileHeight;
  const stickGroup = new G()
    .size(stickWidth, stickGroupHeight)
    .translate(0, roundHeight);

  const stickFont = { family: font.family, size: font.size * 0.7 }; // FIXME STICK_CONTEXT.HEIGHT
  const stick1000 = helper
    .createStick(1000)
    .size(stickWidth, stickHeight)
    .x(0)
    .y(0);
  const text1000 = new Text()
    .plain(num1000.toString())
    .font(stickFont)
    .dx(stickWidth)
    .dy(stickHeight);

  const stick100 = helper
    .createStick(100)
    .size(stickWidth, stickHeight)
    .x(0)
    .y(stickHeight + stickHeight);
  const text100 = new Text()
    .plain(num100.toString())
    .font(stickFont)
    .dx(stickWidth)
    .dy(stickHeight * 3);

  stickGroup.add(stick1000);
  stickGroup.add(text1000);
  stickGroup.add(stick100);
  stickGroup.add(text100);

  const doraImg = helper
    .createImage(scoreBoard.doras[0], 0, 0)
    .x(stickWidth + textWidth)
    .y(0);
  stickGroup.add(doraImg);

  const g = new G();
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
  hands: HandsInput,
  minWidth: number = 0
): MySVGElement => {
  const fe = createBlockHand(helper, hands.front);
  const re = createBlockHand(helper, hands.right);
  const oe = createBlockHand(helper, hands.opposite);
  const le = createBlockHand(helper, hands.left);
  const maxWidth = [fe.width, re.width, oe.width, le.width].reduce((a, b) =>
    Math.max(a, b)
  );
  const sizeWidth = Math.max(
    minWidth + helper.tileHeight * 2 + helper.blockMargin * 2,
    maxWidth + helper.tileWidth * 2 + helper.blockMargin
  ); // additional margin
  const sizeHeight = sizeWidth;

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

  const g = new G().size(sizeWidth, sizeHeight);
  g.add(front);
  g.add(right);
  g.add(opposite);
  g.add(left);

  return { e: new G().add(g), width: sizeWidth, height: sizeHeight };
};

const getPlaces = (front: "東" | "南" | "西" | "北") => {
  const places = Object.values(WIND_MAP);
  const index = places.indexOf(front);
  return [...places.slice(index), ...places.slice(0, index)];
};

const createScoreBoard = (
  helper: ImageHelper,
  fontCtx: FontContext,
  scoreBoard: ScoreBoardInput
): MySVGElement => {
  const sizeWidth = helper.tileWidth * 5 + helper.tileHeight * 1; // 11111-1

  const font = fontCtx.font;
  const textWidth = fontCtx.textWidth;
  const textHeight = fontCtx.textHeight;
  const numWidth = fontCtx.numWidth;
  const boardRect = createStickAndDora(helper, fontCtx, scoreBoard);
  boardRect.e.translate(
    sizeWidth / 2 - boardRect.width / 2,
    sizeWidth / 2 - boardRect.height / 2
  );

  const createScore = (
    place: string,
    score: number,
    attr: any
  ): MySVGElement => {
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
  const rt = createScore(rightPlace, scores.right, {
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

  const lt = createScore(leftPlace, scores.left, {
    "dominant-baseline": "ideographic",
    "text-anchor": "middle",
  });
  const leftText = simpleRotate(lt.e, lt.width, lt.height, 90).translate(
    -lt.height,
    sizeWidth / 2
  );

  const g = new G();
  const rect = new Rect()
    .size(sizeWidth, sizeWidth)
    .x(0)
    .y(0)
    .fill("none")
    .stroke("#000000");
  g.add(rect);
  g.add(boardRect.e);
  g.add(frontText);
  g.add(rightText);
  g.add(oppositeText);
  g.add(leftText);

  return { e: g, width: sizeWidth, height: sizeWidth };
};

const createDiscards = (
  helper: ImageHelper,
  discards: DiscardsInput
): MySVGElement => {
  const fe = createDiscardArea(discards.front, helper);
  const re = createDiscardArea(discards.right, helper);
  const oe = createDiscardArea(discards.opposite, helper);
  const le = createDiscardArea(discards.left, helper);

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
  return { e: new G().add(g), width: sizeWidth, height: sizeHeight };
};

/**
 * 麻雀卓の SVG 要素を作成する。
 */
export const createTable = (
  helper: ImageHelper,
  fontCtx: FontContext,
  handsProps: HandsInput,
  discardsProps: DiscardsInput,
  scoreBoardProps: ScoreBoardInput
): MySVGElement => {
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
  return { e: g, width: hands.width, height: hands.height };
};

/**
 * 麻雀卓から SVG 要素を作成し、SVG に描画する。
 * レスポンシブが false の場合、SVG の width/height として絶対値で指定される。
 * viewBox はレスポンシブに関わらず設定される。
 */
export const drawTable = (
  svg: Svg,
  tableInput: string,
  config: ImageHelperConfig = {},
  fontCtx: FontContext,
  params: { responsive: boolean } = { responsive: false }
) => {
  const helper = new ImageHelper(config);
  const ctx = fontCtx;

  const { discards, hands, scoreBoard } = parse(tableInput);
  const table = createTable(helper, ctx, hands, discards, scoreBoard);
  if (!params.responsive) svg.size(table.width, table.height);
  svg.viewbox(0, 0, table.width, table.height);
  svg.add(table.e);
};
