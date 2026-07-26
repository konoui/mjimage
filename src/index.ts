import {
  SVG as newSvg,
  asRenderedSvg,
  asSvg,
  RenderedSvg,
} from "./lib/svgjs/svg";
import { optimizeSVG as optimize } from "./lib/image/image";

export * from "./lib/core/";
export * from "./lib/calculator/";
export * from "./lib/controller/";

// 描画。高抽象（render）と中抽象（createHand / createTable）だけを公開し、
// 牌 1 枚を組み立てるヘルパや SVG の要素クラスは内部に留める。
export { render, isTableInput } from "./lib/image/render";
export type { Rendered } from "./lib/image/render";
export { createHand } from "./lib/image/image";
export type { RenderOptions, SVGFragment } from "./lib/image/image";
export { createTable } from "./lib/image/table";
export { parseTableInput } from "./lib/image/table-parser";
export type {
  TableInput,
  Discards,
  Hands,
  ScoreBoard,
} from "./lib/image/table-parser";

// 中抽象で組み立てた要素を置くための最小限の入れ物。
// 具象クラスは公開せず、操作を絞ったインターフェースだけを見せる。
export type { RenderedSvg, Placeable } from "./lib/svgjs/svg";

/** 断片を合成するための SVG を作る。 */
export const SVG = (): RenderedSvg => asRenderedSvg(newSvg());

/** スプライトの未使用 symbol を落とす。svgSprite で組み立てた場合に使う。 */
export const optimizeSVG = (svg: RenderedSvg): void => optimize(asSvg(svg));
