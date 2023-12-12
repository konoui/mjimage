import { FONT_FAMILY } from "./constants";

export interface FontContext {
  font: { family: string; size: number };
  textWidth: number;
  textHeight: number;
  numWidth: number;
  numHeight: number;
}

const getContext = (
  ctx: CanvasRenderingContext2D,
  str: string,
  font: string
) => {
  ctx.font = font;
  const metrics = ctx.measureText(str);
  let width = metrics.width;
  let height =
    metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
  return [width, height];
};

export const getFontContext = (
  ctx: CanvasRenderingContext2D,
  fontFamily: string,
  fontSize: number
): FontContext => {
  const font = { family: fontFamily, size: fontSize };
  const fontString = `${font.size}px ${font.family}`;
  const [textWidth, textHeight] = getContext(ctx, "東", fontString);
  const [numWidth, numHeight] = getContext(ctx, "2", fontString);
  const ret = {
    font: { family: fontFamily, size: fontSize },
    textWidth: textWidth,
    textHeight: textHeight,
    numWidth: numWidth,
    numHeight: numHeight,
  };
  return ret;
};

export const getTableFontContext = (
  ctx: CanvasRenderingContext2D,
  scale: number
): FontContext => {
  const fontCtx = getFontContext(ctx, FONT_FAMILY, 40 * scale);
  fontCtx.textHeight = fontCtx.textWidth;
  fontCtx.numHeight = fontCtx.numWidth;
  return fontCtx;
};
