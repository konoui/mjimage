import { FONT_FAMILY, TABLE_CONTEXT } from "../core/constants";
import { assert } from "../myassert";

export interface FontContext {
  font: { family: string; size: number };
  textWidth: number;
  textHeight: number;
  numWidth: number;
  numHeight: number;
}

export class MeasureText {
  ctx: CanvasRenderingContext2D | null = null;
  strText: string;
  numText: string;
  constructor(strText: string = "東", numText: string = "2") {
    this.strText = strText;
    this.numText = numText;
  }
  private measure = (str: string, fontStr: string): [number, number] => {
    if (this.ctx == null) {
      this.ctx = document.createElement("canvas").getContext("2d");
      assert(this.ctx, "context is null");
    }
    const ctx = this.ctx;
    ctx.font = fontStr;
    const metrics = ctx.measureText(str);
    let width = metrics.width;
    let height =
      metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
    return [width, height];
  };

  measureFontContext = (fontFamily: string, fontSize: number): FontContext => {
    const font = { family: fontFamily, size: fontSize };
    const fontString = `${font.size}px ${font.family}`;
    const [textWidth, textHeight] = this.measure(this.strText, fontString);
    const [numWidth, numHeight] = this.measure(this.numText, fontString);
    const ret = {
      font: { family: fontFamily, size: fontSize },
      textWidth: textWidth,
      textHeight: textHeight,
      numWidth: numWidth,
      numHeight: numHeight,
    };
    return ret;
  };

  measureTableFontContext = (tableScale: number): FontContext => {
    const fontCtx = this.measureFontContext(
      FONT_FAMILY,
      TABLE_CONTEXT.BASE * tableScale
    );
    fontCtx.textHeight = fontCtx.textWidth;
    fontCtx.numHeight = fontCtx.numWidth;
    return fontCtx;
  };
}
