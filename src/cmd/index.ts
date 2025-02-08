import { Parser } from "../lib/core";
import { createHand, ImageHelper, optimizeSVG } from "../lib/image";
import { SVG, Use, registerWindow } from "@svgdotjs/svg.js";
import { createHTMLWindow } from "svgdom";
// @ts-ignore, https://github.com/DefinitelyTyped/DefinitelyTyped/pull/66501/files
import { config } from "svgdom";
import fs from "fs";

const tableRegex = /^\s*table/;
const spritePath = "browser-mjimage/static/svg/tiles.svg";
const imgHelper = new ImageHelper({
  svgSprite: true,
});

function loadImgTiles() {
  const img = fs.readFileSync(spritePath).toString();
  return img;
}

function initSvgDOM() {
  const window = createHTMLWindow();
  const document = window.document;
  registerWindow(window, document);
  config.setFontDir("./node_modules/svgdom/fonts/");
}

initSvgDOM();

const input = process.argv[2];

const tiles = loadImgTiles();
const draw = SVG().svg(tiles);
const blocks = new Parser(input).parse();
// bpth text and Use do not work
// Getting bbox of element "g" is not possible: TypeError: Cannot read properties of null
const hand = createHand(imgHelper, blocks, {
  doraText: false,
  tsumoText: false,
});
draw.add(hand.e);
draw.viewbox(0, 0, hand.width, hand.height);
optimizeSVG(draw);
console.log(draw.svg());
