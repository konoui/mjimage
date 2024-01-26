import { KIND, Wind } from "../constants";
import { Tile } from "../parser";

class Controller {
  wall: Wall;
  river: River;
  constructor() {
    this.wall = new Wall();
    this.river = new River();
  }
  distributeHands() {
    const m: { [w in Wind]: Tile[] } = {
      "1w": [],
      "2w": [],
      "3w": [],
      "4w": [],
    };
    for (let i = 0; i < 3; i++) {
      for (let w of Object.keys(Window)) {
        for (let j = 0; j < 4; j++) {
          m[w as Wind].push(this.wall.draw());
        }
      }
    }
    m["1w"].push(this.wall.draw());
    m["2w"].push(this.wall.draw());
    m["3w"].push(this.wall.draw());
    m["4w"].push(this.wall.draw());
    // TODO notify them
  }
  distribute() {}
}

class Player {
  constructor() {}
}

class Wall {
  private drawableWall: Tile[] = [];
  private deadWall: Tile[] = [];
  private replacementWall: Tile[] = [];
  private doraWall: Tile[] = [];
  private blindDoraWall: Tile[] = [];
  constructor() {
    this.init();
  }
  kan() {
    if (this.replacementWall.length == 0)
      throw new Error("exceeded maximum open doras");
    const t = this.replacementWall.pop()!;
    this.drawableWall.pop();
    return t;
  }
  draw() {
    if (!this.drawableWall) throw new Error("cannot draw any more");
    return this.drawableWall.pop()!;
  }
  get doras() {
    return this.doraWall.slice(0, 4 - this.replacementWall.length);
  }
  get blindDoras() {
    return this.blindDoraWall.slice(0, 4 - this.replacementWall.length);
  }
  get drawable() {
    return this.drawableWall.length > 0;
  }

  private init() {
    for (let k of Object.values(KIND)) {
      const values =
        k == KIND.Z ? [1, 2, 4, 5, 6, 7, 8] : [1, 2, 3, 4, 5, 6, 7, 8, 9];
      for (let i = 0; i < 4; i++) {
        for (let n of values) {
          if (i == 3 && n == 5) n = 0;
          this.drawableWall.push(new Tile(k, n));
        }
      }
    }
    this.shuffle(this.drawableWall);
    for (let i = 0; i < 13; i++) {
      this.deadWall.push(this.drawableWall.pop()!);
    }
    for (let i = 0; i < 3; i++) {
      this.blindDoras.push(this.deadWall.pop()!);
    }
    for (let i = 0; i < 3; i++) {
      this.doras.push(this.deadWall.pop()!);
    }
    for (let i = 0; i < 3; i++) {
      this.replacementWall.push(this.deadWall.pop()!);
    }
  }
  private shuffle(array: Tile[]) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}

class River {
  m: { w: Wind; t: Tile }[] = [];
  constructor() {}
  discard(t: Tile, w: Wind) {
    this.m.push({ w: w, t: t });
  }
  discards(w: Wind) {
    return this.m.filter((v) => v.w == w);
  }
}
