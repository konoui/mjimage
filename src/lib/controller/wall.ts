import { KIND } from "../constants";
import { Parser, Tile } from "../parser";

export class Wall {
  private raw = "";
  private drawableWall: Tile[] = [];
  private deadWall: Tile[] = [];
  private replacementWall: Tile[] = [];
  private doraWall: Tile[] = [];
  private blindDoraWall: Tile[] = [];
  private openedDoraCount = 1;
  constructor(raw?: string) {
    this.init(raw);
  }
  kan() {
    if (this.replacementWall.length == 0)
      throw new Error(`exceeded maximum kan`);
    const t = this.replacementWall.pop()!;
    this.drawableWall.pop();
    return t;
  }
  draw() {
    if (!this.drawableWall) throw new Error("cannot draw any more");
    return this.drawableWall.pop()!;
  }

  openDora() {
    if (this.openedDoraCount >= 4)
      throw new Error("exceeded maximum open dora");
    this.openedDoraCount++;
    return this.doraWall[this.openedDoraCount - 1].clone();
  }
  get doras() {
    return this.doraWall.slice(0, this.openedDoraCount);
  }
  get blindDoras() {
    return this.blindDoraWall.slice(0, this.openedDoraCount);
  }
  get canKan() {
    return this.replacementWall.length > 0;
  }
  get canDraw() {
    return this.drawableWall.length > 0;
  }

  private init(raw?: string) {
    if (raw != null) {
      const blocks = new Parser(raw).parse();
      for (let b of blocks) {
        this.drawableWall.push(...b.tiles);
      }
    } else {
      for (let k of Object.values(KIND)) {
        if (k == KIND.BACK) continue;
        const values =
          k == KIND.Z ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5, 6, 7, 8, 9];
        for (let i = 0; i < 4; i++) {
          for (let n of values) {
            if (i == 3 && n == 5) n = 0;
            this.drawableWall.push(new Tile(k, n));
          }
        }
      }
      this.shuffle(this.drawableWall);
    }

    this.raw = this.drawableWall.map((t) => t.toString()).join();

    for (let i = 0; i < 14; i++) {
      this.deadWall.push(this.drawableWall.pop()!);
    }
    for (let i = 0; i < 4; i++) {
      this.blindDoras.push(this.deadWall.pop()!);
    }
    for (let i = 0; i < 4; i++) {
      this.doraWall.push(this.deadWall.pop()!);
    }
    for (let i = 0; i < 4; i++) {
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
  export() {
    return this.raw;
  }
}
