import { isNum5, OPERATOR, Tile, TYPE } from "../core";
import { assert } from "../myassert";
import { Hand, ShantenCalculator } from "./calc";

export interface SerializedCandidate {
  tile: string;
  candidates: readonly string[];
  shanten: number;
}

// Controller tell candidates to players
export interface Candidate {
  tile: Tile;
  candidates: readonly Tile[];
  shanten: number;
}

export class Efficiency {
  // ツモった後の14枚の手配から、牌効率に従って捨てるべき牌を返す。
  // choices は、通常なら hand.hand を指定する。ただし、リーチしている場合は捨てる牌が限られているので choices で制限する。
  static calcCandidates(
    hand: Hand,
    choices: Tile[],
    options?: {
      arrangeRed?: boolean;
      fourSetsOnePair?: boolean;
    }
  ): Candidate[] {
    assert(choices.length > 0, `choices to discard is zero`);
    const map = new Map<string, Candidate>();
    let minShanten = Number.POSITIVE_INFINITY;
    for (let t of choices) {
      const tiles = hand.dec([t]);
      const c = Efficiency.candidateTiles(hand, options);
      hand.inc(tiles);
      // convert 0 and remove operators
      const da =
        options?.arrangeRed && t.has(OPERATOR.RED)
          ? t.clone({ removeAll: true })
          : t.has(OPERATOR.RED)
          ? t.clone({ removeAll: true, add: OPERATOR.RED })
          : t.clone({ removeAll: true });
      if (c.shanten < minShanten) {
        map.clear();
        map.set(da.toString(), {
          shanten: c.shanten,
          candidates: c.candidates,
          tile: da,
        });
        // update
        minShanten = c.shanten;
      } else if (c.shanten == minShanten) {
        map.set(da.toString(), {
          shanten: c.shanten,
          candidates: c.candidates,
          tile: da,
        });
      }
    }
    return Array.from(map.values());
  }

  // 積もる前の13枚の手配から、有効牌の一覧を返す
  static candidateTiles(
    hand: Hand,
    options?: {
      fourSetsOnePair?: boolean;
    }
  ) {
    let r = Number.POSITIVE_INFINITY;
    let candidates: Tile[] = [];

    const sc = new ShantenCalculator(hand);
    for (let t of Object.values(TYPE)) {
      if (t == TYPE.BACK) continue;
      for (let n = 1; n < hand.getArrayLen(t); n++) {
        if (hand.get(t, n) >= 4) continue;
        const tile = new Tile(t, n);
        const tiles = hand.inc([tile]);
        const s = !options?.fourSetsOnePair ? sc.calc() : sc.fourSetsOnePair();
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
  static partialCandidateTiles(
    input: string,
    options?: {
      fourSetsOnePair?: boolean;
    }
  ) {
    const h = new Hand(input, true);
    Array(13 - h.hands.length)
      .fill(undefined)
      .map(() => h.inc([new Tile(TYPE.BACK, 0)]));
    return Efficiency.candidateTiles(h, options);
  }
}
