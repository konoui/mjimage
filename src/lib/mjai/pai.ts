import { Tile } from "../core";
import { OP, TYPE, Wind, WIND } from "../core/constants";
import {
  MJAI_HIDDEN_PAI,
  MjaiBakaze,
  MjaiMaybeHiddenPai,
  MjaiPai,
} from "./types";

// Tile ⇄ MjaiPai の相互変換。
//
// mjimage 側:  1m..9m / 1p..9p / 1s..9s / 1z..7z / r5m（赤）/ _（裏）
//              先頭にオペレータ（t ツモ / v ロン / - 横向き など）が付きうる。
// mjai 側:     1m..9m / 1p..9p / 1s..9s / E S W N P F C / 5mr（赤）/ ?（非公開）
//
// オペレータは mjai に対応物が無いので落とす。赤だけは意味を持つので "r" の位置を
// 前から後ろへ移す。mjimage 側に "0m" 形式の赤の別名入力は無い（aliasOffset は w/d のみ）
// ため、赤は "r5m" の 1 通りに正規化できる。

/** 字牌の数字 → mjai の字牌。 */
const HONOR_TO_MJAI = {
  1: "E",
  2: "S",
  3: "W",
  4: "N",
  5: "P",
  6: "F",
  7: "C",
} as const satisfies Record<number, MjaiPai>;

/** mjai の字牌 → 字牌の数字。上の表の逆。 */
const MJAI_TO_HONOR: Readonly<Record<string, number>> = Object.fromEntries(
  Object.entries(HONOR_TO_MJAI).map(([n, p]) => [p, Number(n)])
);

/** 風 → mjai の場風。`bakaze` と `start_kyoku` で使う。 */
const WIND_TO_MJAI = {
  [WIND.E]: "E",
  [WIND.S]: "S",
  [WIND.W]: "W",
  [WIND.N]: "N",
} as const satisfies Record<Wind, MjaiBakaze>;

/**
 * 牌 1 枚を mjai の表記にする。裏牌（`_`）は非公開（`?`）になる。
 *
 * オペレータは落とすので、ツモ牌・ロン牌・横向きの区別は残らない。
 * その情報が要る場面（`tsumogiri` や鳴きの `pai`）は、呼ぶ側が別に持つこと。
 */
export const toMjaiPai = (t: Tile): MjaiMaybeHiddenPai => {
  if (t.t == TYPE.BACK) return MJAI_HIDDEN_PAI;
  if (t.t == TYPE.Z) {
    const pai = HONOR_TO_MJAI[t.n as keyof typeof HONOR_TO_MJAI];
    if (pai == null) throw new Error(`[mjai] 字牌の数字が範囲外: ${t.n}`);
    return pai;
  }
  if (t.n < 1 || t.n > 9)
    throw new Error(`[mjai] 数牌の数字が範囲外: ${t.toString()}`);
  // 赤は mjai では接尾辞。mjimage の "r5m" に対して "5mr"。
  return (t.has(OP.RED) ? `${t.n}${t.t}r` : `${t.n}${t.t}`) as MjaiPai;
};

/**
 * mjai の表記から牌 1 枚を作る。非公開（`?`）は裏牌（`_`）になる。
 * オペレータは付かないので、`toMjaiPai` との往復ではオペレータが落ちる。
 */
export const fromMjaiPai = (p: MjaiMaybeHiddenPai): Tile => {
  if (p == MJAI_HIDDEN_PAI) return new Tile(TYPE.BACK, 0);

  const honor = MJAI_TO_HONOR[p];
  if (honor != null) return new Tile(TYPE.Z, honor);

  const red = p.endsWith("r");
  const body = red ? p.slice(0, -1) : p;
  const n = Number(body[0]);
  const t = body[1];
  if (
    body.length != 2 ||
    !Number.isInteger(n) ||
    n < 1 ||
    n > 9 ||
    (t != TYPE.M && t != TYPE.P && t != TYPE.S)
  )
    throw new Error(`[mjai] 牌として読めない: ${p}`);
  if (red && n != 5) throw new Error(`[mjai] 赤は 5 のみ: ${p}`);

  return new Tile(t, n, red ? [OP.RED] : []);
};

/** 風を mjai の場風にする。 */
export const toMjaiBakaze = (w: Wind): MjaiBakaze => WIND_TO_MJAI[w];

/** 非公開の牌かどうか。 */
export const isHiddenPai = (p: MjaiMaybeHiddenPai): p is typeof MJAI_HIDDEN_PAI =>
  p == MJAI_HIDDEN_PAI;
