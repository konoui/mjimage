import fs from "fs";
import path from "path";
import { Block } from "../../core/parser";

export { SVG } from "../../../index";
export { Use } from "../../svgjs/svg";

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

export const handsToString = (hands: readonly (readonly Block[])[]) => {
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
