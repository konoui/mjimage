import { Parser } from "../lib/core";
import { createHand, ImageHelper, optimizeSVG } from "../lib/image";
import { SVG } from "../lib/svgjs";

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
const hand = createHand(imgHelper, blocks, {
  doraText: true,
  tsumoText: true,
});
draw.add(hand.e);
draw.viewbox(0, 0, hand.width, hand.height);
optimizeSVG(draw);
console.log(draw.svg());
