import {
  Wind,
  Round,
  TYPE,
  WIND,
  createWindMap,
  OP,
  ROUND,
  prevWind,
} from "../core/";
import { TupleOfSize } from "../calculator";
import { Tile } from "../core/parser";
import { nextWind, nextRound, Type } from "../core";
export class ScoreManager {
  private reachValue = 1000;
  private m: { [key: string]: number };
  constructor(initial: { [key: string]: number }) {
    this.m = structuredClone(initial);
  }
  get summary() {
    return structuredClone(this.m);
  }
  reach(id: string) {
    this.m[id] -= this.reachValue;
  }
  update(result: { [w in Wind]: number }, windMap: { [key: string]: Wind }) {
    for (let id in windMap) {
      const w = windMap[id];
      const point = result[w];
      this.m[id] += point;
    }
  }
}

export class PlaceManager {
  private playerToWind: { [id: string]: Wind } = {};
  private windToPlayer = createWindMap("");
  round: Round;
  sticks: { reach: number; dead: number };
  constructor(
    initial: { [key: string]: Wind },
    params?: { round: Round; sticks: { reach: number; dead: number } }
  ) {
    this.round = params?.round ?? ROUND.E1;
    this.sticks = structuredClone(params?.sticks) ?? { reach: 0, dead: 0 };
    this.playerToWind = structuredClone(initial);
    for (let playerID in this.playerToWind)
      this.windToPlayer[this.playerToWind[playerID]] = playerID;
  }

  private update() {
    for (let playerID in this.playerToWind) {
      const next = prevWind(this.playerToWind[playerID]);
      this.playerToWind[playerID] = next;
      this.windToPlayer[next] = playerID;
    }
  }
  incrementDeadStick() {
    this.sticks.dead++;
  }
  incrementReachStick() {
    this.sticks.reach++;
  }
  nextRound() {
    const next = nextRound(this.round);
    this.round = next;
    this.update();
  }
  resetDeadStick() {
    this.sticks.dead = 0;
  }
  resetReachStick() {
    this.sticks.reach = 0;
  }
  is(r: Round) {
    return this.round == r;
  }
  wind(id: string) {
    return this.playerToWind[id];
  }
  playerID(w: Wind) {
    return this.windToPlayer[w];
  }
  get playerMap() {
    return structuredClone(this.playerToWind);
  }
}

export function shuffle<T>(array: T[]) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * 牌の枚数をカウントするカウンターを表す。
 * 5枚目の牌や、2枚目の赤牌の場合、例外を投げる。
 * 山を含む残りの枚数を確認することができる。
 */
export class Counter {
  private c: {
    [TYPE.M]: TupleOfSize<number, 10>;
    [TYPE.S]: TupleOfSize<number, 10>;
    [TYPE.P]: TupleOfSize<number, 10>;
    [TYPE.Z]: TupleOfSize<number, 8>;
  };
  safeTileMap = createWindMap({} as { [name: string]: boolean }, true);
  constructor(public disable = false) {
    this.c = this.initial();
  }
  get(t: Tile) {
    if (t.t == TYPE.BACK) return 0;
    return this.c[t.t][t.n];
  }
  dec(...tiles: Tile[]) {
    if (this.disable) return;
    for (let t of tiles) {
      if (t.t == TYPE.BACK) continue;
      if (this.get(t) <= 0)
        throw new Error(
          `[counter] cannot decrease ${t.toString()} due to zero`
        );
      this.c[t.t][t.n] -= 1;
      // FIXME validate red has more than 0
      if (t.has(OP.RED)) this.c[t.t][0] -= 1;
    }
  }
  addTileToSafeMap(t: Tile, targetUser: Wind) {
    if (this.disable) return;
    this.safeTileMap[targetUser][this.key(t.t, t.n)] = true;
  }
  isSafeTile(k: Type, n: number, targetUser: Wind) {
    return this.safeTileMap[targetUser][this.key(k, n)];
  }
  private key(k: Type, n: number) {
    return `${k}${n}`;
  }

  reset() {
    this.c = this.initial();
  }
  private initial(): {
    [TYPE.M]: TupleOfSize<number, 10>;
    [TYPE.S]: TupleOfSize<number, 10>;
    [TYPE.P]: TupleOfSize<number, 10>;
    [TYPE.Z]: TupleOfSize<number, 8>;
  } {
    return {
      [TYPE.M]: [1, 4, 4, 4, 4, 4, 4, 4, 4, 4],
      [TYPE.S]: [1, 4, 4, 4, 4, 4, 4, 4, 4, 4],
      [TYPE.P]: [1, 4, 4, 4, 4, 4, 4, 4, 4, 4],
      [TYPE.Z]: [0, 4, 4, 4, 4, 4, 4, 4],
    };
  }
}
