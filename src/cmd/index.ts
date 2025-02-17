import { Parser } from "../lib/core";
import { createHand, ImageHelper, optimizeSVG, SVG } from "../lib/image";

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

const input = process.argv[2];

const tiles = loadImgTiles();
const draw = SVG().importSymbol(tiles);
const blocks = new Parser(input).parse();
// bpth text and Use do not work
// Getting bbox of element "g" is not possible: TypeError: Cannot read properties of null
const hand = createHand(imgHelper, blocks, {
  doraText: false,
  tsumoText: false,
});
draw.add(hand.e);
draw.viewbox(0, 0, hand.width, hand.height);
// FIXME does not work
// optimizeSVG(draw);
console.log(draw.svg());
