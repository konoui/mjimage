import assert from "assert";
import { Parser } from "./parser";
import { drawBlocks, paiContext, ImageHelperConfig } from "./image";
import { SVG } from "@svgdotjs/svg.js";

interface InitializeConfig extends Omit<ImageHelperConfig, "scale"> {
  className?: string;
}

const defaultClassName = "mjimage";

function getTextHeight(font: string) {
  const ctx = document.createElement("canvas").getContext("2d");
  assert(ctx != null);
  ctx.font = font;
  const metrics = ctx.measureText("あ");
  let fontHeight =
    metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent;
  let actualHeight =
    metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
  return fontHeight;
}

export class mjimage {
  static initialize = (props: InitializeConfig = {}) => {
    console.debug("initializing....");
    const className = props.className ? props.className : defaultClassName;
    const targets = document.getElementsByClassName(
      className
    ) as HTMLCollectionOf<HTMLElement>;
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      const input = target.textContent || "";

      console.debug("found target class", className);
      target.textContent = ""; // remove first

      const font = target.style.font;
      const height = getTextHeight(font);
      const scale = (height + paiContext.height * 0.25) / paiContext.height;
      const blocks = new Parser(input).parse();
      const svg = SVG();
      drawBlocks(svg, blocks, {
        ...props,
        scale: scale,
      });
      svg.addTo(target);
    }
  };
}
