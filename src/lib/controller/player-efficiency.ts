import { assert } from "../myassert";
import { TYPE, Wind } from "../core/constants";
import { Tile } from "../core/parser";
import { Candidate } from "../calculator";
import { Counter } from "./managers";

/**
 * 河、手牌、鳴きの枚数を考慮した有効牌の情報を表す。
 */
export interface PlayerCandidate {
  /**
   * 想定する打牌を表す。
   */
  tile: Tile;
  /**
   * 打牌した場合の有効牌の枚数の合計を表す。
   */
  sum: number;
  /**
   * 打牌した場合の有効牌とその枚数をそれぞれ表す。
   */
  candidates: {
    tile: Tile;
    n: number;
  }[];
  /**
   * 打牌し有効牌を引いた場合のシャンテン数を表す。
   * 多くの場合、現在のシャンテン数 -1 となる。
   */
  shanten: number;
}

const weight = (t: Tile, doras: Tile[]) => {
  const base = 1;
  let v = base;
  for (let d of doras) if (d.equals(t)) v *= 2;
  return v;
};

export class PlayerEfficiency {
  /**
   * 有効牌情報から河、手牌、鳴きの枚数を考慮した有効牌情報の配列を返す。
   */
  static calcPlayerCandidates(counter: Counter, candidates: Candidate[]) {
    let playerCandidates: PlayerCandidate[] = [];
    for (let s of candidates) {
      let sum = 0;
      let pairs: { tile: Tile; n: number }[] = [];
      for (let c of s.candidates) {
        pairs.push({
          tile: c.clone(),
          n: counter.get(c),
        });
        sum += counter.get(c);
      }
      playerCandidates.push({
        sum: sum,
        tile: s.tile,
        candidates: pairs,
        shanten: s.shanten,
      });
    }
    return playerCandidates;
  }
  static selectMinPriority(
    c: Counter,
    playerCandidates: PlayerCandidate[],
    doras: Tile[]
  ) {
    assert(playerCandidates.length > 0);
    let min = 0;
    let idx = 0;
    for (let i = 0; i < playerCandidates.length; i++) {
      const p = PlayerEfficiency.calcPriority(c, playerCandidates[i], doras);
      if (p < min) {
        min = p;
        idx = i;
      }
    }
    return playerCandidates[idx];
  }
  private static calcPriority(
    c: Counter,
    playerCandidate: PlayerCandidate,
    doras: Tile[]
  ) {
    const tile = playerCandidate.tile;
    let v = 0;
    if (tile.t == TYPE.Z) {
      v = c.get(tile);
      // FIXME 場風
      // 自風
      if (tile.n == 5 || tile.n == 6 || tile.n == 7) v *= 2;
      return v * weight(tile, doras);
    } else {
      const same = c.get(tile);
      v += same * weight(tile, doras);
      const np1 = c.get(new Tile(tile.t, tile.n + 1)),
        np2 = c.get(new Tile(tile.t, tile.n + 2));
      const nm1 = c.get(new Tile(tile.t, tile.n - 1)),
        nm2 = c.get(new Tile(tile.t, tile.n - 2));
      // 5m から 3m を引き 345m を作るには 4m の残り数と 3m の残り枚数の小さい方が有効数となる
      const left = tile.n - 2 > 0 ? Math.min(nm1, nm2) : 0; // n-2
      const right = tile.n + 2 <= 9 ? Math.min(np1, np2) : 0; // n+2
      // 5m から 4m を引き 456m を作るには 4m 残り枚数と 6m の残り枚数の小さい方が有効数となる
      const cc = tile.n - 1 >= 1 && tile.n + 1 <= 9 ? Math.min(np1, nm1) : 0;
      const centerLeft = Math.max(left, cc); // n-1;
      const centerRight = Math.max(cc, right); // n-2;

      v += same * weight(tile, doras);
      v += left * weight(new Tile(tile.t, tile.n - 2), doras);
      v += right * weight(new Tile(tile.t, tile.n + 2), doras);
      v += centerLeft * weight(new Tile(tile.t, tile.n - 1), doras);
      v += centerRight * weight(new Tile(tile.t, tile.n + 1), doras);

      if (tile.n == 0) v * 2;
      return v;
    }
  }
}

export class RiskRank {
  static selectTile(c: Counter, targetUsers: Wind[], tiles: Tile[]) {
    assert(targetUsers.length > 0 && tiles.length > 0);
    let ret = tiles[0];
    let min = Number.POSITIVE_INFINITY;
    for (let t of tiles) {
      const v = RiskRank.rank(c, targetUsers, t);
      if (v < min) {
        ret = t;
        min = v;
      }
    }
    return ret;
  }
  static rank(c: Counter, targetUsers: Wind[], t: Tile) {
    let max = 0;
    const f = t.isNum() ? RiskRank.rankN : RiskRank.rankZ;
    for (let targetUser of targetUsers) {
      const v = f(c, targetUser, t);
      if (max < v) max = v;
    }
    return max;
  }

  static rankZ(c: Counter, targetUser: Wind, t: Tile) {
    if (t.t != TYPE.Z) throw new Error(`expected TYPE.Z but ${t.toString()}`);
    if (c.isSafeTile(t.t, t.n, targetUser)) return 0;
    const remaining = c.get(t);
    return Math.min(remaining, 3);
  }

  static rankN(c: Counter, targetUser: Wind, t: Tile) {
    if (!t.isNum()) throw new Error(`expected TYPE.NUMBER but ${t.toString()}`);
    const n = t.n;
    const type = t.t;
    if (c.isSafeTile(type, n, targetUser)) return 0;
    if (n == 1) return c.isSafeTile(type, 4, targetUser) ? 3 : 6;
    if (n == 9) return c.isSafeTile(type, 6, targetUser) ? 3 : 6;
    if (n == 2) return c.isSafeTile(type, 5, targetUser) ? 4 : 8;
    if (n == 8) return c.isSafeTile(type, 5, targetUser) ? 4 : 8;
    if (n == 3) return c.isSafeTile(type, 6, targetUser) ? 5 : 8;
    if (n == 7) return c.isSafeTile(type, 4, targetUser) ? 5 : 8;

    const left = c.isSafeTile(type, n - 3, targetUser);
    const right = c.isSafeTile(type, n + 3, targetUser);
    if (left && right) return 4;
    if (left || right) return 8;
    return 12;
  }
}
