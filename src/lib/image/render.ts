import { Parser } from "../core";
import { SVG, RenderedSvg, asRenderedSvg } from "../svgjs/svg";
import {
  ImageHelper,
  RenderOptions,
  buildHand,
  roundSize,
} from "./image";
import { buildTable } from "./table";
import { parseTableInput } from "../input";

const tableRegex = /^\s*table/;

/**
 * 入力が卓の記述かどうか。手牌との区別はこの一点だけで決まる。
 * 描画の前に種類で分岐したい呼び出し側（牌の大きさを変えるなど）のために公開する。
 */
export const isTableInput = (input: string) => tableRegex.test(input);

/**
 * 描画した SVG と、その寸法。
 *
 * SVG には viewBox だけを設定して返す。大きさは呼び出し側が
 * svg.size()（絶対値）または svg.css()（CSS の単位）で決める。
 */
export interface Rendered {
  svg: RenderedSvg;
  width: number;
  height: number;
  /**
   * 牌 1 枚の寸法。
   * width/height をこの値で割れば「牌何枚分か」が出るので、
   * 牌の大きさを CSS 変数で揃えたい場合の比の基準に使える。
   */
  tileWidth: number;
  tileHeight: number;
}

/**
 * 手牌または卓の入力から SVG を作る。
 * 入力の種類は自動で判定する。
 */
export const render = (
  input: string,
  options: RenderOptions = {}
): Rendered => {
  const helper = new ImageHelper(options);
  const fragment = isTableInput(input)
    ? buildTable(helper, parseTableInput(input))
    : buildHand(helper, new Parser(input).parse());
  const { width, height } = roundSize(fragment);

  const svg = SVG();
  svg.viewbox(0, 0, width, height);
  svg.add(fragment.element);

  return {
    svg: asRenderedSvg(svg),
    width,
    height,
    tileWidth: helper.tileWidth,
    tileHeight: helper.tileHeight,
  };
};
