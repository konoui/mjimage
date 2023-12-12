import assert from "assert";
import { ImageHelper } from "./image";
import { FONT_FAMILY } from "./constants";

export interface FontContext {
  font: { family: string; size: number };
  textWidth: number;
  textHeight: number;
  numWidth: number;
  numHeight: number;
}

const getContext = (
  ctx: CanvasRenderingContext2D | null,
  str: string,
  font: string | null = null
) => {
  assert(ctx != null);
  if (font != null) ctx.font = font;
  const metrics = ctx.measureText(str);
  let width = metrics.width;
  let height =
    metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
  return [width, height];
};

export const getFontContext = (
  ctx: CanvasRenderingContext2D | null,
  font: string
) => {
  const [textWidth, textHeight] = getContext(ctx, "東", font);
  const [numWidth, numHeight] = getContext(ctx, "2", font);
  const ret = {
    font: font,
    textWidth: textWidth,
    textHeight: textHeight,
    numWidth: numWidth,
    numHeight: numHeight,
  };
  return ret;
};

export const getTableFontContext = (
  ctx: CanvasRenderingContext2D | null,
  scale: number
): FontContext => {
  const font = { family: FONT_FAMILY, size: 40 * scale };
  const fontString = `${font.size}px ${font.family}`;
  const [textWidth, textHeight] = getContext(ctx, "東", fontString);
  const [numWidth, numHeight] = getContext(ctx, "2", fontString);
  const ret = {
    font: font,
    textWidth: textWidth,
    textHeight: textWidth, // expected
    numWidth: numWidth,
    numHeight: numWidth, // expected
  };
  console.debug("table font context", ret);
  return ret;
};
