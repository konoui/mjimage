import { Controller, Wall, River } from "./../lib/controller";
import { loadWallData, storeWallData } from "./../lib/__tests__/utils/helper";

const walls = loadWallData().map((l) => new Wall(l));
for (let w of walls) {
  console.log("========");
  const c = new Controller(w, new River(), { initWind: "2w" });
  c.start();
}

const count = 1000;
for (let i = 0; i < count; i++) {
  console.log("========");
  const c = new Controller(new Wall(), new River(), { initWind: "2w" });
  c.actor.subscribe({
    error: (err) => {
      console.error("Error", err);
      storeWallData(c.wall.export());
      process.exit(1);
    },
  });
  c.start();
}
