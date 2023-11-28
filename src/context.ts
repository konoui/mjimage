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

const contextFunc = (str: string, font: string | null = null) => {
  const ctx = document.createElement("canvas").getContext("2d");
  return () => {
    assert(ctx != null);
    if (font != null) ctx.font = font;
    const metrics = ctx.measureText(str);
    let width = metrics.width;
    let height =
      metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
    return [width, height];
  };
};

export const getFontContext = (font: string) => {
  const [textWidth, textHeight] = contextFunc("東", font)();
  const [numWidth, numHeight] = contextFunc("2", font)();
  const ctx = {
    font: font,
    textWidth: textWidth,
    textHeight: textHeight,
    numWidth: numWidth,
    numHeight: numHeight,
  };
  return ctx;
};

export const getTableFontContext = (helper: ImageHelper): FontContext => {
  const font = { family: FONT_FAMILY, size: 40 * helper.scale };
  const fontString = `${font.size}px ${font.family}`;
  const [textWidth, textHeight] = contextFunc("東", fontString)();
  const [numWidth, numHeight] = contextFunc("2", fontString)();
  const ctx = {
    font: font,
    textWidth: textWidth,
    textHeight: textWidth, // expected
    numWidth: numWidth,
    numHeight: numWidth, // expected
  };
  console.debug("table font context", ctx);
  return ctx;
};
