import assert from "assert";
import { Wind, Round, TYPE, WIND } from "../constants";
import { TupleOfSize } from "../calculator";
import { Type, Tile } from "../parser";

export class ScoreManager {
  private reachValue = 1000;
  private m: { [key: string]: number };
  constructor(initial: { [key: string]: number }) {
    this.m = initial;
  }
  get summary() {
    return structuredClone(this.m);
  }
  reach(id: string) {
    this.m[id] -= this.reachValue;
  }
  /**
   * 立直後のロンに対する立直棒の戻し
   */
  restoreReachStick(id: string) {
    this.m[id] += this.reachValue;
  }
  update(
    result: {
      "1w": number;
      "2w": number;
      "3w": number;
      "4w": number;
    },
    windMap: { [key: string]: Wind }
  ) {
    for (let id in windMap) {
      const w = windMap[id];
      const point = result[w];
      this.m[id] += point;
    }
  }
}

export class PlaceManager {
  private pToW: { [key: string]: Wind } = {};
  private wToP = createWindMap("");
  round: Round;
  sticks: { reach: number; dead: number };
  constructor(
    initial: { [key: string]: Wind },
    params?: { round: Round; sticks: { reach: number; dead: number } }
  ) {
    this.round = params?.round ?? "1w1";
    this.sticks = params?.sticks ?? { reach: 0, dead: 0 };
    this.pToW = initial;
    for (let playerID in this.pToW) this.wToP[this.pToW[playerID]] = playerID;
  }

  private update() {
    for (let playerID in this.pToW) {
      const next = nextWind(this.pToW[playerID]);
      this.pToW[playerID] = next;
      this.wToP[next] = playerID;
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
  decrementReachStick() {
    this.sticks.reach--;
    assert(this.sticks.reach >= 0);
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
    return this.pToW[id];
  }
  playerID(w: Wind) {
    return this.wToP[w];
  }
  get playerMap() {
    return structuredClone(this.pToW);
  }
}

export const nextRound = (r: Round) => {
  let w = r.substring(0, 2) as Wind;
  let n = Number(r.substring(2, 3));
  if (n == 4) {
    n = 1;
    w = nextWind(w);
  } else n++;
  return `${w}${n}` as Round;
};

export const prevRound = (r: Round) => {
  return nextRound(nextRound(nextRound(r)));
};

export const nextWind = (w: Wind): Wind => {
  let n = Number(w.toString()[0]);
  if (n == 4) n = 1;
  else n++;
  return `${n}w` as Wind;
};

export const prevWind = (w: Wind): Wind => {
  return nextWind(nextWind(nextWind(w)));
};

export function createWindMap<T>(initial: T, clone = false) {
  const m: { [key in Wind]: T } = {
    "1w": initial,
    "2w": initial,
    "3w": initial,
    "4w": initial,
  };
  if (clone) {
    for (let w of Object.values(WIND)) m[w] = structuredClone(initial);
  }

  return m;
}

export function shuffle<T>(array: T[]) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export class Counter {
  private c: {
    [TYPE.M]: TupleOfSize<number, 10>;
    [TYPE.S]: TupleOfSize<number, 10>;
    [TYPE.P]: TupleOfSize<number, 10>;
    [TYPE.Z]: TupleOfSize<number, 8>;
  } = {
    [TYPE.M]: [1, 4, 4, 4, 4, 4, 4, 4, 4, 4],
    [TYPE.S]: [1, 4, 4, 4, 4, 4, 4, 4, 4, 4],
    [TYPE.P]: [1, 4, 4, 4, 4, 4, 4, 4, 4, 4],
    [TYPE.Z]: [0, 4, 4, 4, 4, 4, 4, 4],
  };
  safeMap = createWindMap({} as { [name: string]: boolean }, true);
  constructor(public disable = false) {}
  // FIXME get red
  get(t: Tile) {
    if (t.t == TYPE.BACK) return 0;
    if (t.isNum() && t.n == 0) return this.c[t.t][5];
    return this.c[t.t][t.n];
  }
  dec(...tiles: Tile[]) {
    if (this.disable) return;
    for (let t of tiles) {
      if (t.t == TYPE.BACK) continue;
      if (this.get(t) <= 0)
        throw new Error(`cannot decrease ${t.toString()} due to zero`);
      this.c[t.t][t.n] -= 1;
      if (t.isNum() && t.n == 0) this.c[t.t][5] -= 1;
    }
  }
  addTileToSafeMap(t: Tile, targetUser: Wind) {
    if (this.disable) return;
    this.safeMap[targetUser][this.key(t.t, t.n)] = true;
  }
  isSafeTile(k: Type, n: number, targetUser: Wind) {
    return this.safeMap[targetUser][this.key(k, n)];
  }
  private key(k: Type, n: number) {
    if (n == 0) n = 5;
    return `${k}${n}`;
  }

  reset() {
    this.c = {
      [TYPE.M]: [1, 4, 4, 4, 4, 4, 4, 4, 4, 4],
      [TYPE.S]: [1, 4, 4, 4, 4, 4, 4, 4, 4, 4],
      [TYPE.P]: [1, 4, 4, 4, 4, 4, 4, 4, 4, 4],
      [TYPE.Z]: [0, 4, 4, 4, 4, 4, 4, 4],
    };
  }
}
