// barrel（./index.ts）は外向きの公開面。兄弟モジュールは実体を直接参照する。
import { Wind } from "../core/constants";
import { nextWind, prevWind } from "../core/wind-util";

/**
 * 4 家分をまとめて扱うための入れ物。
 * front を手前として時計回りに right / opposite / left が並ぶ。
 *
 * 入力（各家の手牌・河・点数）と描画（各辺への配置）の両方がこの並びを使うので、
 * 席の語彙はここに 1 つだけ置く。
 */
export type Seats<T> = { front: T; right: T; opposite: T; left: T };

export const mapSeats = <A, B>(seats: Seats<A>, f: (v: A) => B): Seats<B> => ({
  front: f(seats.front),
  right: f(seats.right),
  opposite: f(seats.opposite),
  left: f(seats.left),
});

export const maxOfSeats = <T>(seats: Seats<T>, f: (v: T) => number) =>
  Math.max(f(seats.front), f(seats.right), f(seats.opposite), f(seats.left));

/**
 * front を手前としたときの各席の風。
 * 席順を決める唯一の実装で、入力の読み取りと点数表示の並びが同じものを使う。
 */
export const seatWinds = (front: Wind): Seats<Wind> => ({
  front: front,
  right: nextWind(front),
  opposite: nextWind(nextWind(front)),
  left: prevWind(front),
});
