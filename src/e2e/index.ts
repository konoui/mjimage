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

if (type == "game" || type == "single") {
  for (let i = 0; i < count; i++) {
    console.debug(`${type}(${i})===`);
    const { c } = createLocalGame();
    const starter = factory(c, type);
    subscribeError(c);
    try {
      starter();
    } catch (e) {
      console.error("Error", e);
      storeGame(c.export());
    }
  }
}

function factory(c: Controller, type: "single" | "game") {
  if (type == "single") return () => c.start();
  else return () => c.startGame();
}

function subscribeError(c: Controller) {
  c.actor.subscribe({
    error: (err) => {
      console.error("Error", err);
      storeGame(c.export());
      process.exit(1);
    },
  });
}
