import { OP, TYPE, WIND } from "../core/constants";
import { Tile, createWindMap } from "../core";
import { Rand, shuffle } from "./managers";

export interface IWall {
  kan(): Tile;
  draw(): Tile;
  openDoraIndicator(): Tile;
  doraIndicators: readonly Tile[];
  hiddenDoraIndicators: readonly Tile[];
  canKan: boolean;
  canDraw: boolean;
  export(): WallProps;
  initialHands(): {
    readonly [WIND.E]: string;
    readonly [WIND.S]: string;
    readonly [WIND.W]: string;
    readonly [WIND.N]: string;
  };
}

export interface WallProps {
  drawable: string[];
  dead: string[];
  replacement: string[];
  doraIndicators: string[];
  hiddenDoraIndicators: string[];
}

export class Wall {
  // テストの台本つき山（`__tests__/utils`）が並べ替えられるように protected。
  protected walls: WallProps = {
    replacement: [],
    dead: [],
    doraIndicators: [],
    hiddenDoraIndicators: [],
    drawable: [],
  };
  private backup: WallProps;
  private openedDoraCount = 1;
  /** 山のシャッフルに使う乱数。テストで山を固定するために差し替えられる。 */
  private rand: Rand;
  constructor(backup?: WallProps, params?: { rand?: Rand }) {
    this.rand = params?.rand ?? Math.random;
    this.init(backup);
    this.backup = Wall.clone(this.walls);
  }
  kan() {
    if (this.walls.replacement.length == 0)
      throw new Error(`exceeded maximum kan`);
    const t = this.walls.replacement.pop()!;
    this.walls.drawable.pop();
    return Tile.from(t);
  }
  draw() {
    if (this.walls.drawable.length == 0)
      throw new Error("cannot draw any more");
    return Tile.from(this.walls.drawable.pop()!);
  }

  openDoraIndicator() {
    // 上限は王牌が抱えている枚数そのもの（カン 1 回につき 1 枚めくる）。
    if (this.openedDoraCount >= this.walls.doraIndicators.length)
      throw new Error("exceeded maximum open dora");
    this.openedDoraCount++;
    return Tile.from(this.walls.doraIndicators[this.openedDoraCount - 1]);
  }
  get doraIndicators() {
    return this.walls.doraIndicators
      .slice(0, this.openedDoraCount)
      .map(Tile.from);
  }
  get hiddenDoraIndicators() {
    return this.walls.hiddenDoraIndicators
      .slice(0, this.openedDoraCount)
      .map(Tile.from);
  }
  get canKan() {
    return this.walls.replacement.length > 0;
  }
  get canDraw() {
    return this.walls.drawable.length > 0;
  }

  initialHands() {
    const m = createWindMap(() => "");
    for (let i = 0; i < 3; i++) {
      for (const w of Object.values(WIND)) {
        for (let j = 0; j < 4; j++) {
          m[w] += this.draw().toString();
        }
      }
    }
    for (const w of Object.values(WIND)) m[w] += this.draw().toString();
    return m;
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
            let tile = new Tile(t, n);
            if (t != TYPE.Z && i == 3 && n == 5)
              tile = tile.clone({ add: OP.RED });
            this.walls.drawable.push(tile.toString());
          }
        }
      }
      shuffle(this.walls.drawable, this.rand);
    }

    // 王牌 14 枚の内訳。カンは 4 回まで＝表ドラは最初の 1 枚と合わせて 5 枚要る。
    for (let i = 0; i < 14; i++) {
      this.walls.dead.push(this.walls.drawable.pop()!);
    }
    for (let i = 0; i < 5; i++) {
      this.walls.hiddenDoraIndicators.push(this.walls.dead.pop()!);
    }
    for (let i = 0; i < 5; i++) {
      this.walls.doraIndicators.push(this.walls.dead.pop()!);
    }
    for (let i = 0; i < 4; i++) {
      this.walls.replacement.push(this.walls.dead.pop()!);
    }
  }
  export() {
    return this.backup;
  }
  static clone(walls: WallProps): WallProps {
    return {
      drawable: walls.drawable.concat(),
      dead: walls.dead.concat(),
      doraIndicators: walls.doraIndicators.concat(),
      hiddenDoraIndicators: walls.hiddenDoraIndicators.concat(),
      replacement: walls.replacement.concat(),
    };
  }
}
