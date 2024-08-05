import { Parser } from "./parser";
import { drawBlocks, ImageHelperConfig } from "./image";
import { MeasureText } from "./measure-text";
import { drawTable } from "./table";
import { TILE_CONTEXT } from "./constants";
import { SVG } from "@svgdotjs/svg.js";
// https://parceljs.org/languages/svg/#inlining-as-a-string
// import tilesSvg from "./tiles.svg";

interface InitializeConfig extends Omit<ImageHelperConfig, "scale"> {
  querySelector?: string | string[];
  scale?: number;
  tableScale?: number;
}

const defaultQuerySelector = ".mjimage";
const defaultScale = 1.6;
const defaultSvgSprite = false;
const tableRegex = /^\s*table/;
const minPaiHeight = Math.min(TILE_CONTEXT.WIDTH, TILE_CONTEXT.HEIGHT);

const calculateScale = (scale: number, textHeight: number) => {
  return (textHeight / minPaiHeight) * scale;
};

export class mjimage {
  // static svgURL = () => {
  //   return tilesSvg;
  // };

  static initialize = (props: InitializeConfig = {}) => {
    console.debug("initializing....");
    let querySelector = props.querySelector ?? defaultQuerySelector;
    let handScale = props.scale ?? defaultScale;
    let tableScale = props.tableScale ?? handScale;
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
              fontCtx
            );
          } else {
            const scale = calculateScale(handScale, textHeight);
            const blocks = new Parser(input).parse();
            drawBlocks(svg, blocks, {
              ...props,
              svgSprite,
              scale: scale,
            });
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
