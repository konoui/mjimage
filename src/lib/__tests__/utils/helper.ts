import fs from "fs";
import path from "path";
import { Block } from "../../parser";
import { WallProps } from "../../controller";
import { registerWindow } from "@svgdotjs/svg.js";
import { createHTMLWindow } from "svgdom";
// @ts-ignore, https://github.com/DefinitelyTyped/DefinitelyTyped/pull/66501/files
import { config } from "svgdom";

export const loadInputData = (filename: string) => {
  return loadTestData(filename, "", false, "__fixtures__").toString();
};

export const loadTestData = (
  filename: string,
  data: string = "",
  update: boolean = false,
  dir: "__snapshots__" | "__fixtures__" = "__snapshots__"
) => {
  const current_dir = path.resolve("");
  const gotPath = `${current_dir}/src/lib/__tests__/${dir}/${filename}`;
  if (update) fs.writeFileSync(gotPath, data);
  const want = fs.readFileSync(gotPath);
  return want;
};

export const initSvgDOM = () => {
  const window = createHTMLWindow();
  const document = window.document;
  registerWindow(window, document);

  config.setFontDir("./node_modules/svgdom/fonts/");
  return { window, document };
};

export const handsToString = (hands: Block[][]) => {
  return hands.map((hand) => hand.map((block) => block.toString()));
};

export const loadWallData = (): WallProps[] => {
  const data = loadTestData("wall.json", "", false, "__fixtures__");
  if (data.toString() == "") return [];
  return JSON.parse(data.toString());
};

export const storeWallData = (d: WallProps) => {
  const data = loadWallData();
  data.push(d);
  const str = JSON.stringify(data);
  loadTestData("wall.json", str, true, "__fixtures__");
};
