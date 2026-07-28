import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Block } from "../../core/parser";

export { SVG } from "../../../index";
export { Use } from "../../svgjs/svg";

// パスはすべてこのファイルの位置から解決する。
// 起動ディレクトリ（cwd）に依存すると、リポジトリルート以外から
// vitest を動かしたとき（IDE のテストランナーなど）に落ちる。
const testsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const repoRoot = path.resolve(testsDir, "../../..");

/** 入力データ（__fixtures__）の絶対パス */
export const fixturePath = (filename: string) =>
  path.join(testsDir, "__fixtures__", filename);

/** 期待値（__snapshots__）の絶対パス。toMatchFileSnapshot に渡す。 */
export const snapshotPath = (filename: string) =>
  path.join(testsDir, "__snapshots__", filename);

/** リポジトリに同梱している素材（牌の SVG など）の絶対パス */
export const assetPath = (...names: string[]) =>
  path.join(repoRoot, "public", ...names);

export const loadInputData = (filename: string) =>
  fs.readFileSync(fixturePath(filename), "utf8");

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
  fs.writeFileSync(fixturePath(filename), JSON.stringify(objs, null, 2));
};
