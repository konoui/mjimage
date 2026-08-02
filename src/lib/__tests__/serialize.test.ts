import {
  BlockCalculator,
  BoardContext,
  Hand,
  PointCalculator,
  WinResult,
  deserializeWinResult,
  serializeWinResult,
} from "../calculator";
import { BLOCK, ROUND, WIND } from "../core/constants";
import { Tile } from "../core";

/**
 * 鳴きと赤ドラを含むあがりを作る。
 * チー（記法から決まる種別）と順子・雀頭（計算の過程でだけ現れる種別）が
 * 一つの結果に混ざるので、デシリアライズの型照合の分岐を両方通る。
 */
const winResult = (): WinResult => {
  const hand = new Hand("234mr567m234p88p,-345s");
  const board: BoardContext = {
    doraIndicators: [Tile.from("1p")],
    round: ROUND.E1,
    myWind: WIND.S,
    winBy: { type: "ron", from: WIND.E },
  };
  const got = new PointCalculator(hand, board).calc(
    ...new BlockCalculator(hand).calc(Tile.from("2m")),
  );
  if (got === false) throw new Error("expected a win result");
  return got;
};

describe("WinResult のシリアライズ", () => {
  test("往復しても内容が変わらない", () => {
    const want = serializeWinResult(winResult());
    const got = serializeWinResult(deserializeWinResult(want));
    expect(got).toStrictEqual(want);
  });

  test("ブロックの種別と牌の印が保たれる", () => {
    const got = deserializeWinResult(serializeWinResult(winResult()));

    expect(got.hand.map((b) => b.type)).toStrictEqual([
      BLOCK.PAIR,
      BLOCK.RUN,
      BLOCK.RUN,
      BLOCK.RUN,
      BLOCK.CHI,
    ]);
    // ロン牌の印（v）と赤ドラ（r）が残る
    expect(got.hand.map((b) => b.toString())).toStrictEqual([
      "88p",
      "v234m",
      "r567m",
      "234p",
      "-345s",
    ]);
  });

  test("盤面の牌は Tile に戻る", () => {
    const got = deserializeWinResult(serializeWinResult(winResult()));
    expect(got.boardContext.doraIndicators[0]).toBeInstanceOf(Tile);
    expect(got.boardContext.doraIndicators.map((t) => t.toString())).toStrictEqual(
      ["1p"],
    );
  });

  test("点数と役はそのまま運ばれる", () => {
    const want = winResult();
    const got = deserializeWinResult(serializeWinResult(want));
    expect(got.points).toBe(want.points);
    expect(got.deltas).toStrictEqual(want.deltas);
    expect(got.yakus).toStrictEqual(want.yakus);
    expect(got.description).toBe(want.description);
  });
});
