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
  private m: { [id: string]: number };
  constructor(initial: { readonly [id: string]: number }) {
    this.m = structuredClone(initial);
  }
  get summary(): { readonly [id: string]: number } {
    return this.m;
  }
  reach(id: string) {
    this.m[id] -= this.reachValue;
  }
  update(
    result: { readonly [w in Wind]: number },
    windMap: { readonly [id: string]: Wind }
  ) {
    for (let id in windMap) {
      const w = windMap[id];
      const point = result[w];
      this.m[id] += point;
    }
  }
}

export class PlaceManager {
  private playerToWind: { [id: string]: Wind } = {};
  private windToPlayer = createWindMap(() => "");
  private _round: Round;
  private _sticks: { reach: number; dead: number };
  constructor(
    initial: { readonly [key: string]: Wind },
    params?: {
      readonly round: Round;
      readonly sticks: { readonly reach: number; readonly dead: number };
    }
  ) {
    this._round = params?.round ?? ROUND.E1;
    this._sticks = structuredClone(params?.sticks) ?? { reach: 0, dead: 0 };
    this.playerToWind = structuredClone(initial);
    for (let playerID in this.playerToWind)
      this.windToPlayer[this.playerToWind[playerID]] = playerID;
  }

  get sticks(): { readonly reach: number; readonly dead: number } {
    return this._sticks;
  }

  get round() {
    return this._round;
  }

  private update() {
    for (let playerID in this.playerToWind) {
      const next = prevWind(this.playerToWind[playerID]);
      this.playerToWind[playerID] = next;
      this.windToPlayer[next] = playerID;
    }
  }
  incrementDeadStick() {
    this._sticks.dead++;
  }
  incrementReachStick() {
    this._sticks.reach++;
  }
  nextRound() {
    const next = nextRound(this.round);
    this._round = next;
    this.update();
  }
  resetDeadStick() {
    this._sticks.dead = 0;
  }
  resetReachStick() {
    this._sticks.reach = 0;
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
  get playerMap(): { readonly [id: string]: Wind } {
    return this.playerToWind;
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
  private safeTileMap = createWindMap(() => ({} as { [tile: string]: boolean }));
  constructor(public disabled = false) {
    this.c = this.initial();
  }
  get(t: Tile) {
    if (t.t == TYPE.BACK) return 0;
    return this.c[t.t][t.n];
  }
  dec(...tiles: readonly Tile[]) {
    if (this.disabled) return;
    for (let t of tiles) {
      if (t.t == TYPE.BACK) continue;
      if (this.get(t) <= 0)
        throw new Error(`[counter] tile ${t} appears more than 4 times`);
      this.c[t.t][t.n] -= 1;
      if (t.has(OP.RED)) {
        if (this.c[t.t][0] <= 0)
          throw new Error(`[counter] red tile ${t} appears more than once`);
        this.c[t.t][0] -= 1;
      }
    }
  }
  addTileToSafeMap(t: Tile, targetUser: Wind) {
    if (this.disabled) return;
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
