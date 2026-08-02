import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Block } from "../../core";

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
