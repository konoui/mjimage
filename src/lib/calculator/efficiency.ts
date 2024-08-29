import assert from "assert";
import { TYPE, Tile } from "../core";
import { Hand, ShantenCalculator } from "../calculator";

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

    const sc = new ShantenCalculator(hand);
    for (let t of Object.values(TYPE)) {
      if (t == TYPE.BACK) continue;
      for (let n = 1; n < hand.getArrayLen(t); n++) {
        if (hand.get(t, n) >= 4) continue;
        const tile = new Tile(t, n);
        const tiles = hand.inc([tile]);
        const s = sc.calc();
        hand.dec(tiles);

        if (s < r) {
          r = s;
          candidates = [tile];
        } else if (s == r) candidates.push(tile);
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

  static partialShanten(input: string) {
    const h = new Hand(input, true);
    Array(13 - h.hands.length)
      .fill(undefined)
      .map(() => h.inc([new Tile(TYPE.BACK, 0)]));
    const sc = new ShantenCalculator(h);
    return sc.calc();
  }
}
