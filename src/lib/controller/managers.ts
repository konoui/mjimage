import {
  Wind,
  Round,
  TYPE,
  createWindMap,
  OP,
  ROUND,
  prevWind,
} from "../core/";
import { TileCounts } from "../calculator";
import { Tile, nextRound, Type } from "../core";
export class ScoreManager {
  private reachValue = 1000;
  private m: { [id: string]: number };
  constructor(initial: { readonly [id: string]: number }) {
    this.m = structuredClone(initial);
  }
  /** 呼び出し側と内部の可変オブジェクトを共有しないよう、写しを返す。 */
  get summary(): { readonly [id: string]: number } {
    return { ...this.m };
  }
  reach(id: string) {
    this.m[id] -= this.reachValue;
  }
  update(
    result: { readonly [w in Wind]: number },
    windMap: { readonly [id: string]: Wind },
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
    },
  ) {
    this._round = params?.round ?? ROUND.E1;
    this._sticks = structuredClone(params?.sticks) ?? { reach: 0, dead: 0 };
    this.playerToWind = structuredClone(initial);
    for (let playerID in this.playerToWind)
      this.windToPlayer[this.playerToWind[playerID]] = playerID;
  }

  /** 呼び出し側と内部の可変オブジェクトを共有しないよう、写しを返す。 */
  get sticks(): { readonly reach: number; readonly dead: number } {
    return { ...this._sticks };
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
  /** 呼び出し側と内部の可変オブジェクトを共有しないよう、写しを返す。 */
  get playerMap(): { readonly [id: string]: Wind } {
    return { ...this.playerToWind };
  }
}

/**
 * 0 以上 1 未満の値を返す乱数。既定は Math.random。
 * 差し替えられるようにしてあるのは、テストで山と席順を固定するため。
 */
export type Rand = () => number;

export function shuffle<T>(array: T[], rand: Rand = Math.random) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * 種から決まった列を返す乱数（mulberry32）。同じ種なら常に同じ順になるので、
 * 失敗したテストをそのまま再現できる。
 */
export function createSeededRand(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 牌の枚数をカウントするカウンターを表す。
 * 5枚目の牌や、2枚目の赤牌の場合、例外を投げる。
 * 山を含む残りの枚数を確認することができる。
 */
export class Counter {
  private c: TileCounts;
  private safeTileMap = createWindMap(
    () => ({}) as { [tile: string]: boolean },
  );
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
  /**
   * @deprecated 非推奨にします。
   */
  addTileToSafeMap(t: Tile, targetUser: Wind) {
    if (this.disabled) return;
    this.safeTileMap[targetUser][this.key(t.t, t.n)] = true;
  }
  /**
   * @deprecated 非推奨にします。
   */
  isSafeTile(k: Type, n: number, targetUser: Wind) {
    return this.safeTileMap[targetUser][this.key(k, n)];
  }
  private key(k: Type, n: number) {
    return `${k}${n}`;
  }

  reset() {
    this.c = this.initial();
  }
  private initial(): TileCounts {
    return {
      [TYPE.M]: [1, 4, 4, 4, 4, 4, 4, 4, 4, 4],
      [TYPE.S]: [1, 4, 4, 4, 4, 4, 4, 4, 4, 4],
      [TYPE.P]: [1, 4, 4, 4, 4, 4, 4, 4, 4, 4],
      [TYPE.Z]: [0, 4, 4, 4, 4, 4, 4, 4],
    };
  }
}
