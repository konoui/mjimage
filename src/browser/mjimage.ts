import { render, isTableInput, RenderOptions } from "../index";
import { TILE_CONTEXT } from "../lib/image/constants";

interface InitializeConfig extends RenderOptions {
  querySelector?: string | string[];
  /** 卓の描画にだけ使う倍率。省略時は scale と同じ。 */
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
    // ブラウザ固有の設定を取り除き、残り（RenderOptions）はそのまま render に渡す。
    const {
      querySelector = defaultQuerySelector,
      tableScale,
      responsive = defaultResponsive,
      ...renderOptions
    } = props;
    const handScale = renderOptions.scale ?? defaultScale;
    const svgSprite = renderOptions.svgSprite ?? defaultSvgSprite;
    const selectors =
      typeof querySelector === "string" ? [querySelector] : querySelector;

    selectors.forEach((qs) => {
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
            isTableInput(input) ? tableScale ?? handScale : handScale,
            textHeight
          );
          const { svg, width, height } = render(input, {
            ...renderOptions,
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
