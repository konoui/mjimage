import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * 対局データの保存先。
 * 起動ディレクトリ（cwd）に依存しないよう、このファイルの位置から解決する。
 */
const gamesPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "games.json",
);

const readAll = (): unknown[] => {
  if (!fs.existsSync(gamesPath)) return [];
  const s = fs.readFileSync(gamesPath, "utf8");
  return s == "" ? [] : (JSON.parse(s) as unknown[]);
};

/**
 * 保存した対局データを、Replayer に渡せる文字列の配列で返す。
 */
export const loadGames = (): string[] =>
  readAll().map((game) => JSON.stringify(game, null, 1));

/**
 * 対局データを追記する。エラーの再現に使う。
 */
export const storeGame = (game: unknown) => {
  fs.writeFileSync(gamesPath, JSON.stringify([...readAll(), game], null, 2));
};
