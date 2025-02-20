import {
  Parser,
  createHand,
  ImageHelper,
  optimizeSVG,
  SVG,
  drawTable,
  FONT_FAMILY,
} from "@konoui/mjimage";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import fs from "fs";

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

if (args.filePath == "" && args.input == "") {
  console.error("specify either --filePath or --input");
  process.exit(1);
}

const output = args.outputFile;
const input =
  args.input != "" ? args.input : fs.readFileSync(args.inputFile).toString();

const tableRegex = /^\s*table/;
const spritePath = "../browser-mjimage/static/svg/tiles.svg";
const imgConfig = { svgSprite: true };
const imgHelper = new ImageHelper(imgConfig);

function loadImgTiles() {
  const img = fs.readFileSync(spritePath).toString();
  return img;
}

const tiles = loadImgTiles();
const draw = SVG().importSymbol(tiles);
if (tableRegex.test(input)) {
  drawTable(draw, input, imgConfig, {
    font: { family: FONT_FAMILY, size: 40 },
    textWidth: 16.0,
    textHeight: 16.0,
    numWidth: 11.84,
    numHeight: 11.84,
  });
} else {
  const blocks = new Parser(input).parse();
  const hand = createHand(imgHelper, blocks, {
    doraText: true,
    tsumoText: true,
  });
  draw.add(hand.e);
  draw.viewbox(0, 0, hand.width, hand.height);
  optimizeSVG(draw);
}

if (output != "") {
  fs.writeFileSync(output, draw.svg());
} else console.log(draw.svg());
