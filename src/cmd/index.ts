import { render, optimizeSVG } from "../index";
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

// カレントディレクトリではなくこのスクリプトの位置を基準に解決する。
const spritePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../public/svg/tiles.svg"
);

// 牌はスプライトを埋め込んで参照し、使わなかった symbol は落とす。
const { svg, width, height } = render(input, { svgSprite: true });
svg.importSymbol(fs.readFileSync(spritePath).toString());
optimizeSVG(svg);
svg.size(width, height);

if (output != "") {
  fs.writeFileSync(output, svg.svg());
} else console.log(svg.svg());
