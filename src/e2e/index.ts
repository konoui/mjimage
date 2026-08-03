import { Controller, createLocalGame } from "./../lib/controller";
import { Replayer } from "../lib/controller/replay";
import { loadGames, storeGame } from "./fixtures";

const type = process.argv[2];
if (!["test", "single", "game"].includes(type))
  throw new Error("unexpected type");
// Number(undefined) は NaN で ?? は発火しないため、省略時と不正値を明示的に扱う
const countArg = process.argv[3];
const count = countArg == null ? 1 : Number(countArg);
if (!Number.isInteger(count) || count < 1)
  throw new Error(`unexpected count: ${countArg}`);

if (type == "test") {
  const games = loadGames();
  for (let game of games) {
    const r = new Replayer(game);
    r.auto();
  }
}

// 落ちた対局だけを games.json に残す。`npm run e2e test` で再生し直せるので、
// 直す → 再生する、を繰り返せる。直り切ったら games.json を空に戻す。
if (type == "game" || type == "single") {
  for (let i = 0; i < count; i++) {
    console.debug(`${type}(${i})===`);
    const { c } = createLocalGame();
    const starter = factory(c, type);
    // 状態機械が拾った例外はここにしか出てこない（start() が投げるのは状態の不一致）。
    logError(c);
    try {
      starter();
    } catch (e) {
      console.error("Error", e);
      // 保存は start() から戻ったあとに行う。状態機械のエラー購読の中では、
      // 落ちた局がまだ履歴に積まれていない（Controller.start を参照）。
      storeGame(c.export());
      process.exit(1);
    }
  }
}

function factory(c: Controller, type: "single" | "game") {
  if (type == "single") return () => c.start();
  else return () => c.startGame();
}

function logError(c: Controller) {
  c.actor.subscribe({ error: (err) => console.error("Error", err) });
}
