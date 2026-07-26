import { render, isTableInput, RenderOptions } from "../index";
import { TILE_CONTEXT } from "../lib/image/constants";

interface InitializeConfig extends Omit<RenderOptions, "scale"> {
  querySelector?: string | string[];
  scale?: number;
  tableScale?: number;
  responsive?: boolean;
}

const defaultQuerySelector = ".mjimage";
const defaultScale = 1.6;
const defaultResponsive = false;
const defaultSvgSprite = false;
const minPaiHeight = /*#__PURE__*/ Math.min(
  TILE_CONTEXT.WIDTH,
  TILE_CONTEXT.HEIGHT
);

const calculateScale = (scale: number, textHeight: number) => {
  return (textHeight / minPaiHeight) * scale;
};

export class mjimage {
  static initialize = (props: InitializeConfig = {}) => {
    console.debug("initializing....");
    let querySelector = props.querySelector ?? defaultQuerySelector;
    let handScale = props.scale ?? defaultScale;
    let tableScale = props.tableScale ?? handScale;
    let responsive = props.responsive ?? defaultResponsive;
    let svgSprite = props.svgSprite ?? defaultSvgSprite;
    if (typeof querySelector === "string") querySelector = [querySelector];

    querySelector.forEach((qs) => {
      console.debug("try to find", qs);
      const targets = document.querySelectorAll(qs) as NodeListOf<HTMLElement>;
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        const input = target.textContent || "";

        if (input == "") {
          console.debug("skip due to not input");
          continue;
        }

        console.debug("found", input);
        target.textContent = ""; // remove first

        const style = window.getComputedStyle(target, null);
        const fontSize = parseFloat(style.getPropertyValue("font-size"));
        const textHeight = fontSize;

        const dparser = new DOMParser();
        try {
          // 牌の大きさは要素の文字の大きさに合わせる。卓と手牌で倍率が違う。
          const scale = calculateScale(
            isTableInput(input) ? tableScale : handScale,
            textHeight
          );
          const { svg, width, height } = render(input, {
            ...props,
            svgSprite,
            scale: scale,
          });
          // レスポンシブでない場合だけ絶対値の大きさを与える。
          if (!responsive) svg.size(width, height);

          const doc = dparser.parseFromString(svg.svg(), "image/svg+xml");
          const svgImg = doc.querySelector("svg");
          if (svgImg == null) console.warn(`querySelector("svg") is null`);
          else target.appendChild(svgImg);
        } catch (e) {
          target.textContent = input;
          console.error("encounter unexpected error:", e);
        }
      }
    });
  };
}
