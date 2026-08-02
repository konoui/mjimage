import { assert } from "../assert";
import { BLOCK, Wind, nextWind, prevWind } from "../core/";

/**
 * 鳴いた人と捨てた人からブロック作成時の鳴いた牌を示すインデックスを返す。
 * 上家からは左端、対面からは中央、下家からは右端に置く。
 */
export const getCallBlockIndex = (
  caller: Wind,
  discardedBy: Wind,
  type: typeof BLOCK.PON | typeof BLOCK.DAI_KAN
) => {
  assert(caller != discardedBy, `caller and discardedBy are the same: ${caller}`);
  // 風は "1z"〜"4z" で席順を表すが、差の絶対値では上家（−1）と下家（+1）を
  // 区別できない。方角そのもので比べる。
  if (discardedBy == prevWind(caller)) return 0; // 上家
  if (discardedBy == nextWind(caller)) return type == BLOCK.PON ? 2 : 3; // 下家
  return type == BLOCK.PON ? 1 : 2; // 対面
};
