import fs from "fs";
import path from "path";
import { Block } from "../../parser";
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

export const loadArrayData = (filename: string) => {
  const a = loadInputData(filename);
  if (a == "") return [];
  const objs = JSON.parse(a) as any[];
  const ret: string[] = [];
  for (let o of objs) {
    ret.push(JSON.stringify(o, null, 1));
  }
  return ret;
};

export const storeArrayData = (filename: string, v: any) => {
  const a = loadInputData(filename);
  let objs = [];
  if (a != "") objs = JSON.parse(a) as any[];
  objs.push(v);
  const updated = JSON.stringify(objs, null, 2);
  loadTestData(filename, updated, true, "__fixtures__");
};
