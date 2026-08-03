import { assert } from "../assert";
import { OP, TYPE, Type, Wind } from "../core/constants";
import { Tile } from "../core";
import { TileAnalysis } from "../calculator";
import { Counter } from "./managers";

// Player が打牌を決めるための評価。対局の進行には関わらないので、
// ここが間違っていても不正な局面にはならない（打ち方の質だけが変わる）。

/**
 * 河、手牌、鳴きの枚数を考慮した有効牌の情報を表す。
 */
export interface PlayerTileAnalysis {
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
  effectiveTiles: readonly {
    tile: Tile;
    count: number;
  }[];
  /**
   * 打牌し有効牌を引いた場合のシャンテン数を表す。
   * 多くの場合、現在のシャンテン数 -1 となる。
   */
  shanten: number;
}

/**
 * 牌の価値を決める盤面の情報を表す。
 */
export interface PriorityContext {
  /** ドラ。表示牌ではないことに注意（`toDora` を通したもの）。 */
  doras: readonly Tile[];
  /** 自風。役牌の判定に使う。 */
  myWind: Wind;
  /** 場風。役牌の判定に使う。 */
  roundWind: Wind;
}

/** 役牌（自風・場風・三元牌）の重み。 */
const YAKUHAI_WEIGHT = 2;

/** 風（`1z` など）が表す字牌の数字を返す。 */
const windNumber = (w: Wind) => Number(w[0]);

/** 自風・場風・三元牌のいずれかなら true を返す。 */
const isYakuhai = (t: Tile, ctx: PriorityContext) => {
  if (t.t != TYPE.Z) return false;
  if (t.n >= 5) return true; // 白發中
  return t.n == windNumber(ctx.myWind) || t.n == windNumber(ctx.roundWind);
};

/**
 * ドラとしての重みを返す。ドラ 1 枚につき 2 倍にする。
 *
 * `equals` は赤の印を見ないので、表ドラの判定と赤ドラの判定は別に行う。
 */
const weight = (t: Tile, doras: readonly Tile[]) => {
  let v = 1;
  for (const d of doras) if (d.equals(t)) v *= 2;
  if (t.has(OP.RED)) v *= 2;
  return v;
};

/** 場に見えていない枚数。1〜9 の外は 0 を返す。 */
const remaining = (c: Counter, t: Type, n: number) => {
  if (n < 1 || n > 9) return 0;
  return c.get(new Tile(t, n));
};

/**
 * 有効牌情報から河、手牌、鳴きの枚数を考慮した有効牌情報の配列を返す。
 */
export function analyzePlayerEfficiency(
  counter: Counter,
  analyses: readonly TileAnalysis[]
) {
  const playerAnalyses: PlayerTileAnalysis[] = [];
  for (const s of analyses) {
    let sum = 0;
    const pairs: { tile: Tile; count: number }[] = [];
    for (const c of s.effectiveTiles) {
      pairs.push({
        tile: c.clone(),
        count: counter.get(c),
      });
      sum += counter.get(c);
    }
    playerAnalyses.push({
      sum: sum,
      tile: s.tile,
      effectiveTiles: pairs,
      shanten: s.shanten,
    });
  }
  return playerAnalyses;
}

/**
 * 優先度が最も低い（＝手に残す価値が最も低い）候補を返す。
 */
export function selectMinPriority(
  c: Counter,
  playerAnalyses: readonly PlayerTileAnalysis[],
  ctx: PriorityContext
) {
  assert(playerAnalyses.length > 0);
  let min = Number.POSITIVE_INFINITY;
  let idx = 0;
  for (let i = 0; i < playerAnalyses.length; i++) {
    const p = calcPriority(c, playerAnalyses[i], ctx);
    if (p < min) {
      min = p;
      idx = i;
    }
  }
  return playerAnalyses[idx];
}

/**
 * 牌を手に残す価値を返す。大きいほど残したい＝切りたくない。
 *
 * 字牌は重ねられる見込み、数牌は「その牌が絡んでできる面子の作りやすさ」を
 * 残り枚数から見積もる。いずれもドラは 2 倍に重み付けする。
 */
function calcPriority(
  c: Counter,
  playerAnalysis: PlayerTileAnalysis,
  ctx: PriorityContext
) {
  const tile = playerAnalysis.tile;
  const doras = ctx.doras;
  if (tile.t == TYPE.Z) {
    // 字牌は他の牌と繋がらないので、同じ牌の残り枚数がそのまま価値になる。
    const v = c.get(tile) * (isYakuhai(tile, ctx) ? YAKUHAI_WEIGHT : 1);
    return v * weight(tile, doras);
  }

  const t = tile.t;
  const n = tile.n;
  const same = c.get(tile);
  const np1 = remaining(c, t, n + 1),
    np2 = remaining(c, t, n + 2);
  const nm1 = remaining(c, t, n - 1),
    nm2 = remaining(c, t, n - 2);
  // 5m から 3m を引き 345m を作るには 4m の残り数と 3m の残り枚数の小さい方が有効数となる
  const left = Math.min(nm1, nm2); // n-2
  const right = Math.min(np1, np2); // n+2
  // 5m から 4m を引き 456m を作るには 4m 残り枚数と 6m の残り枚数の小さい方が有効数となる
  const cc = Math.min(np1, nm1);
  const centerLeft = Math.max(left, cc); // n-1;
  const centerRight = Math.max(cc, right); // n-2;

  let v = 0;
  v += same * weight(tile, doras);
  v += left * weight(new Tile(t, n - 2), doras);
  v += right * weight(new Tile(t, n + 2), doras);
  v += centerLeft * weight(new Tile(t, n - 1), doras);
  v += centerRight * weight(new Tile(t, n + 1), doras);
  return v;
}
