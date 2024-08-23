import assert from "assert";
import { TYPE, OPERATOR, Wind, Round, WIND } from "../constants";
import { Tile } from "../parser";
import { Hand, ShantenCalculator } from "../calculator";
import { Counter } from "./managers";

// Controller tell candidates to players
export interface Candidate {
  tile: Tile;
  candidates: Tile[];
  shanten: number;
}

export class Efficiency {
  // ツモった後の17枚の手配から、牌効率に従って捨てるべき牌を返す。
  // choices は、通常なら hand.hand を指定する。ただし、リーチしている場合は捨てる牌が限られているので choices で制限する。
  static calcCandidates(hand: Hand, choices: Tile[]) {
    assert(choices.length > 0, "choices to discard is zero");
    let ret: Candidate[] = [];
    for (let t of choices) {
      const tiles = hand.dec([t]);
      const c = Efficiency.candidateTiles(hand);
      hand.inc(tiles);
      if (ret.length == 0 || c.shanten < ret[0].shanten) {
        ret = [
          {
            shanten: c.shanten,
            candidates: c.candidates,
            tile: t,
          },
        ];
      } else if (c.shanten == ret[0].shanten) {
        ret.push({
          candidates: c.candidates,
          shanten: c.shanten,
          tile: t,
        });
      }
    }
    return ret;
  }

  // 積もる前の16枚の手配から、有効牌の一覧を返す
  static candidateTiles(hand: Hand) {
    let r = Number.POSITIVE_INFINITY;
    let candidates: Tile[] = [];

    for (let k of Object.values(TYPE)) {
      if (k == TYPE.BACK) continue;
      for (let n = 1; n < hand.getArrayLen(k); n++) {
        if (hand.get(k, n) >= 4) continue;
        const t = new Tile(k, n);
        const tiles = hand.inc([t]);
        const s = new ShantenCalculator(hand).calc();
        hand.dec(tiles);

        if (s < r) {
          r = s;
          candidates = [t];
        } else if (s == r) candidates.push(t);
      }
    }
    return {
      shanten: r,
      candidates: candidates,
    };
  }

  // allow a partial input such as 23456s11z => 1,4,7s
  static partialCandidateTiles(input: string) {
    const h = new Hand(input, true);
    Array(13 - h.hands.length)
      .fill(undefined)
      .map(() => h.inc([new Tile(TYPE.BACK, 0)]));
    return Efficiency.candidateTiles(h);
  }
}

// Player will calculate num of remaining tiles from river and called
export interface PlayerCandidate {
  // When the tile is discarded
  tile: Tile;
  // Then sum of available candidates
  sum: number;
  // pair of candidate tile and number of remaining
  candidates: {
    tile: Tile;
    n: number;
  }[];
  shanten: number;
}

const weight = (t: Tile, doras: Tile[]) => {
  const base = 1;
  let v = base;
  for (let d of doras) if (d.equals(t, true)) v *= 2;
  return v;
};

export class PlayerEfficiency {
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
    if (t.t != TYPE.Z) throw new Error(`expected KIND.Z but ${t.toString()}`);
    if (c.isSafeTile(t.t, t.n, targetUser)) return 0;
    const remaining = c.get(t);
    return Math.min(remaining, 3);
  }

  static rankN(c: Counter, targetUser: Wind, t: Tile) {
    if (!t.isNum()) throw new Error(`expected KIND.NUMBER but ${t.toString()}`);
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
