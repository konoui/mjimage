import { Controller } from "./../lib/controller";
import { River } from "../lib/controller/river";
import { Replayer } from "../lib/controller/replay";
import { Wall, WallProps } from "../lib/controller/wall";
import { loadArrayData, storeArrayData } from "./../lib/__tests__/utils/helper";

const type = process.argv[2];
if (!["test", "single", "game"].includes(type))
  throw new Error("unexpected type");
const count = Number(process.argv[3]) ?? 1;
const filename = "games.json";

if (type == "test") {
  const games = loadArrayData(filename);
  for (let game of games) {
    const r = new Replayer(game);
    r.auto();
  }
}

if (type == "game" || type == "single") {
  for (let i = 0; i < count; i++) {
    console.debug(`${type}(${i})===`);
    const c = new Controller(new Wall(), new River(), { fixedOrder: true });
    const starter = factory(c, type);
    subscribeError(c);
    try {
      starter();
    } catch (e) {
      console.error("Error", e);
      storeArrayData(filename, c.export());
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
      storeArrayData(filename, c.export());
      process.exit(1);
    },
  });
}
