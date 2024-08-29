import { TYPE } from "../core/constants";
import { Tile } from "../core/parser";
import { shuffle } from "./managers";

export interface WallProps {
  drawable: Tile[];
  dead: Tile[];
  replacement: Tile[];
  dora: Tile[];
  blindDora: Tile[];
}

export class Wall {
  private walls: WallProps = {
    replacement: [],
    dead: [],
    dora: [],
    blindDora: [],
    drawable: [],
  };
  private backup: WallProps;
  private openedDoraCount = 1;
  constructor(backup?: WallProps) {
    this.init(backup);
    this.backup = Wall.clone(this.walls);
  }
  kan() {
    if (this.walls.replacement.length == 0)
      throw new Error(`exceeded maximum kan`);
    const t = this.walls.replacement.pop()!;
    this.walls.drawable.pop();
    return t;
  }
  draw() {
    if (!this.walls.drawable) throw new Error("cannot draw any more");
    return this.walls.drawable.pop()!;
  }

  openDoraMarker() {
    if (this.openedDoraCount >= 4)
      throw new Error("exceeded maximum open dora");
    this.openedDoraCount++;
    return this.walls.dora[this.openedDoraCount - 1].clone();
  }
  get doraMarkers() {
    return this.walls.dora.slice(0, this.openedDoraCount);
  }
  get blindDoraMarkers() {
    return this.walls.blindDora.slice(0, this.openedDoraCount);
  }
  get canKan() {
    return this.walls.replacement.length > 0;
  }
  get canDraw() {
    return this.walls.drawable.length > 0;
  }

  private init(backup?: WallProps) {
    if (backup != null) {
      this.walls = Wall.clone(backup);
      return;
    } else {
      for (let t of Object.values(TYPE)) {
        if (t == TYPE.BACK) continue;
        const values =
          t == TYPE.Z ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5, 6, 7, 8, 9];
        for (let i = 0; i < 4; i++) {
          for (let n of values) {
            if (t != TYPE.Z && i == 3 && n == 5) n = 0;
            this.walls.drawable.push(new Tile(t, n));
          }
        }
      }
      shuffle(this.walls.drawable);
    }

    for (let i = 0; i < 14; i++) {
      this.walls.dead.push(this.walls.drawable.pop()!);
    }
    for (let i = 0; i < 4; i++) {
      this.walls.blindDora.push(this.walls.dead.pop()!);
    }
    for (let i = 0; i < 4; i++) {
      this.walls.dora.push(this.walls.dead.pop()!);
    }
    for (let i = 0; i < 4; i++) {
      this.walls.replacement.push(this.walls.dead.pop()!);
    }
  }
  export() {
    return this.backup;
  }
  static clone(walls: WallProps) {
    return {
      drawable: walls.drawable.map((t) => new Tile(t.t, t.n)),
      dead: walls.dead.map((t) => new Tile(t.t, t.n)),
      dora: walls.dora.map((t) => new Tile(t.t, t.n)),
      blindDora: walls.blindDora.map((t) => new Tile(t.t, t.n)),
      replacement: walls.replacement.map((t) => new Tile(t.t, t.n)),
    };
  }
}
