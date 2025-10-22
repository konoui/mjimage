import { OP, Tile, Type } from "../core";
import { assert } from "../myassert";
import { Hand, ShantenCalculator, forHand } from "./calc";

export interface SerializedCandidate {
  tile: string;
  candidates: readonly string[];
  shanten: number;
}

/**
 * 打牌した場合の有効牌の情報を表す。
 */
export interface Candidate {
  /**
   * 想定する打牌を表す。
   */
  tile: Tile;
  /**
   * 打牌した場合の有効牌を表す。
   */
  candidates: readonly Tile[];
  /**
   * 打牌し有効牌を引いた場合のシャンテン数を表す。
   * 多くの場合、現在のシャンテン数 -1 となる。
   */
  shanten: number;
}

export class Efficiency {
  /**
   * ツモ後の14枚の手配から、シャンテン数が最小になる打牌候補の配列を返す。
   * choices は、通常なら hand.hands を指定する。ただし、リーチしている場合は打牌が限られているので choices で制限する。
   */
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
    let minShanten = Infinity;
    for (const t of choices) {
      const tiles = hand.dec([t]);
      const c = Efficiency.candidateTiles(hand, options);
      hand.inc(tiles);
      // convert 0 and remove operators
      const da =
        options?.arrangeRed && t.has(OP.RED)
          ? t.clone({ removeAll: true })
          : t.has(OP.RED)
          ? t.clone({ removeAll: true, add: OP.RED })
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

  /**
   * ツモ前の13枚の手配から、有効牌の一覧とシャンテン数を返す
   * シャンテン数は有効牌を引いた場合の値となる。多くの場合、現在のシャンテン数 -1 となる。
   */
  static candidateTiles(
    hand: Hand,
    options?: {
      fourSetsOnePair?: boolean;
      typeFilter?: Type[];
    }
  ) {
    let r = Infinity;
    let candidates: Tile[] = [];

    const sc = new ShantenCalculator(hand);
    for (const [t, n] of forHand({
      skipBack: true,
      filterBy: options?.typeFilter,
    })) {
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
    return {
      shanten: r,
      candidates: candidates,
    };
  }
}
