import { Controller, Wall, River } from "./../lib/controller";
import { loadWallData, storeWallData } from "./../lib/__tests__/utils/helper";

const type = process.argv[2];
if (!["test", "single", "game"].includes(type))
  throw new Error("unexpected type");
const count = Number(process.argv[3]) ?? 1;

if (type == "test") {
  const walls = loadWallData().map((l) => new Wall(l));
  for (let w of walls) {
    console.log("========");
    const c = new Controller(w, new River(), { initWind: "2w" });
    c.start();
  }
}

if (type == "game" || type == "single") {
  for (let i = 0; i < count; i++) {
    console.debug(`${type}(${i})===`);
    const c = new Controller(new Wall(), new River(), { initWind: "2w" });
    const starter = factory(c, type);
    subscribeError(c);
    try {
      starter();
    } catch (e) {
      console.error("Error", e);
      storeWallData(c.wall.export());
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
      storeWallData(c.wall.export());
      process.exit(1);
    },
  });
}
