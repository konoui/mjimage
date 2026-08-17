import {
  Controller,
  createLocalGame,
  silentLogger,
} from "./../lib/controller";
import { Replayer } from "../lib/controller/replay";
import { recordMjaiLog } from "../lib/mjai/log";
import { validateMjaiLog } from "../lib/__tests__/utils/mjai-validator";
import { loadGames, storeGame } from "./fixtures";

const type = process.argv[2];
if (!["test", "single", "game", "mjai"].includes(type))
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

// mjai の送出変換を半荘まるごとで確かめる（テスト戦略の層 5）。
// 台本つきの局は狙った場面しか通らないので、素の Player に打たせて
// 立直・各種カン・和了・流局・連荘・局またぎをまとめて踏ませる。
//
// vitest に置かないのは 1 半荘で十数秒かかるため。種を固定しているので、
// 落ちた種はそのまま mjai-encode.test.ts の回帰テストに落とせる。
if (type == "mjai") {
  let events = 0;
  let bad = 0;
  const kinds = new Map<string, number>();
  for (let i = 0; i < count; i++) {
    const seed = 30000 + i;
    const { c } = createLocalGame({ seed, logger: silentLogger });
    // 牌譜の書き出し（log.ts）まで通す。encode.ts を直に呼ぶのと同じ列になるはずだが、
    // finish() の呼び忘れや二重書き込みはここでしか出ない。
    const log = recordMjaiLog(c);
    c.startGame();
    log.finish(c.scoreManager.summary);

    events += log.log.length;
    for (const e of log.log) kinds.set(e.type, (kinds.get(e.type) ?? 0) + 1);
    for (const w of new Set(log.warnings))
      console.error(`seed ${seed}: warning: ${w}`);

    // 牌譜（replay mode）なので伏せ牌は残らないはず。
    const problems = validateMjaiLog(log.log, {
      dialect: "strict",
      unmasked: true,
    });
    if (problems.length > 0 || log.warnings.length > 0) {
      bad++;
      for (const p of problems.slice(0, 5))
        console.error(`seed ${seed}: ${JSON.stringify(p)}`);
    }
    // 各行が単体で JSON として読めること（外部ツールに食わせる前提）。
    for (const line of log.lines()) JSON.parse(line);
  }
  const coverage = [...kinds]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}:${v}`)
    .join(" ");
  console.debug(`coverage: ${coverage}`);
  console.debug(`${count} hanchan, ${events} mjai events, ${bad} with problems`);
  if (bad > 0) process.exit(1);
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
