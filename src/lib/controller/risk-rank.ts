import { assert } from "../assert";
import { TYPE, Wind } from "../core/constants";
import { Tile } from "../core";
import { Counter } from "./managers";

// ベタオリのための危険度。現物（`Counter.isSafeTile`）を起点に、
// 筋（n±3）とスジ牌の残り枚数から放銃の危険を見積もる。
// 対局の進行には関わらないので、ここが間違っても不正な局面にはならない。

/**
 * 立直している家に対する危険度から、最も安全な牌を返す。
 */
export function selectTile(
  c: Counter,
  targetUsers: readonly Wind[],
  tiles: readonly Tile[]
) {
  assert(targetUsers.length > 0 && tiles.length > 0);
  let ret = tiles[0];
  let min = Number.POSITIVE_INFINITY;
  for (const t of tiles) {
    const v = rank(c, targetUsers, t);
    if (v < min) {
      ret = t;
      min = v;
    }
  }
  return ret;
}

/**
 * 対象の家すべてから見た危険度のうち、最も高いものを返す。
 */
export function rank(c: Counter, targetUsers: readonly Wind[], t: Tile) {
  let max = 0;
  const f = t.isNum() ? rankN : rankZ;
  for (const targetUser of targetUsers) {
    const v = f(c, targetUser, t);
    if (max < v) max = v;
  }
  return max;
}

export function rankZ(c: Counter, targetUser: Wind, t: Tile) {
  if (t.t != TYPE.Z) throw new Error(`expected TYPE.Z but ${t.toString()}`);
  if (c.isSafeTile(t.t, t.n, targetUser)) return 0;
  const rest = c.get(t);
  return Math.min(rest, 3);
}

export function rankN(c: Counter, targetUser: Wind, t: Tile) {
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
