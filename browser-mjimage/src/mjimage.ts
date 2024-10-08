import {
  Parser,
  TILE_CONTEXT,
  MeasureText,
  drawTable,
  drawBlocks,
  ImageHelperConfig,
} from "@konoui/mjimage/src";
import { SVG } from "@svgdotjs/svg.js";

interface InitializeConfig extends Omit<ImageHelperConfig, "scale"> {
  querySelector?: string | string[];
  scale?: number;
  tableScale?: number;
  responsive?: boolean;
}

const defaultQuerySelector = ".mjimage";
const defaultScale = 1.6;
const defaultResponsive = false;
const defaultSvgSprite = false;
const tableRegex = /^\s*table/;
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

    const mtext = new MeasureText();
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

        const svg = SVG();

        try {
          if (tableRegex.test(input)) {
            const scale = calculateScale(tableScale, textHeight);
            const fontCtx = mtext.measureTableFontContext(scale);
            drawTable(
              svg,
              input,
              {
                ...props,
                svgSprite,
                scale: scale,
              },
              fontCtx,
              { responsive: responsive }
            );
          } else {
            const scale = calculateScale(handScale, textHeight);
            const blocks = new Parser(input).parse();
            drawBlocks(
              svg,
              blocks,
              {
                ...props,
                svgSprite,
                scale: scale,
              },
              { responsive: responsive }
            );
          }
          svg.addTo(target);
        } catch (e) {
          target.textContent = input;
          console.error("encounter unexpected error:", e);
        }
      }
    });
  };
}
