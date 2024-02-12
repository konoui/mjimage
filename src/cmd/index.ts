import { Controller, Wall, River } from "./../lib/controller";
import { loadWallData } from "./../lib/__tests__/utils/helper";

const walls = loadWallData().map((l) => new Wall(l));
for (let w of walls) {
  console.log("========");
  const c = new Controller(w, new River());
  c.start();
}
