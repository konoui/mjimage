import {
  Parser,
  createBlockHand,
  ImageHelper,
  optimizeSVG,
  SVG,
  drawTable,
} from "../index";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const args = yargs(hideBin(process.argv))
  .command("mjimage", "generate")
  .options({
    inputFile: {
      type: "string",
      describe: "input file path",
      demandOption: true,
      default: "",
    },
    input: {
      type: "string",
      describe: "raw input",
      demandOption: true,
      default: "",
    },
    outputFile: {
      type: "string",
      describe: "output svg to the specified file",
      demandOption: true,
      default: "",
    },
  })
  .parseSync();

if (args.inputFile == "" && args.input == "") {
  console.error("specify either --input-file or --input");
  process.exit(1);
}

const output = args.outputFile;
const input =
  args.input != "" ? args.input : fs.readFileSync(args.inputFile).toString();

const tableRegex = /^\s*table/;
// カレントディレクトリではなくこのスクリプトの位置を基準に解決する。
const spritePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../public/svg/tiles.svg"
);
const imgConfig = { svgSprite: true };
const imgHelper = new ImageHelper(imgConfig);

function loadImgTiles() {
  const img = fs.readFileSync(spritePath).toString();
  return img;
}

const tiles = loadImgTiles();
const draw = SVG().importSymbol(tiles);
if (tableRegex.test(input)) {
  drawTable(draw, input, imgConfig);
} else {
  const blocks = new Parser(input).parse();
  const hand = createBlockHand(imgHelper, blocks, {
    enableDoraText: true,
    enableTsumoText: true,
  });
  draw.add(hand.e);
  draw.viewbox(0, 0, hand.width, hand.height);
  optimizeSVG(draw);
}

if (output != "") {
  fs.writeFileSync(output, draw.svg());
} else console.log(draw.svg());
