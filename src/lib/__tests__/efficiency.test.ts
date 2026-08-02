import { Hand, calcEffectiveTiles, getEffectiveTiles } from "../calculator";
import { TYPE } from "../core/constants";
import { Tile } from "../core";

const names = (tiles: readonly Tile[]) => tiles.map((t) => t.toString());

describe("getEffectiveTiles", () => {
  // テンパイの手は、あがり牌を引けばシャンテン数が -1（あがり）になる。
  test("テンパイの手は待ち牌を返す", () => {
    const got = getEffectiveTiles(new Hand("123m456m789m11z5s"));
    expect(got.shanten).toBe(0);
    expect(names(got.effectiveTiles)).toStrictEqual([
      "3s",
      "4s",
      "5s",
      "6s",
      "7s",
      "1z",
    ]);
  });

  // 牌種を絞ると、その種類の中だけで有効牌を探す。
  test("typeFilter で牌種を絞れる", () => {
    const got = getEffectiveTiles(new Hand("123m456m789m11z5s"), {
      typeFilter: [TYPE.Z],
    });
    expect(names(got.effectiveTiles)).toStrictEqual(["1z"]);
  });

  // standardTypeOnly は七対子・国士無双の形を数えないので、
  // 対子ばかりの手では標準形だけを見た分だけ遠くなる。
  test("standardTypeOnly は七対子の形を数えない", () => {
    const hand = new Hand("1133557799m113p");
    // 3p を引けば七対子であがり
    expect(getEffectiveTiles(hand).shanten).toBe(-1);
    expect(
      getEffectiveTiles(hand, { standardTypeOnly: true }).shanten,
    ).toBeGreaterThan(0);
  });
});

describe("calcEffectiveTiles", () => {
  // シャンテン数が最小になる打牌だけを返す。
  test("打牌候補はシャンテン数が最小のものだけになる", () => {
    const hand = new Hand("123m456m789m11z55s9p");
    const got = calcEffectiveTiles(hand, hand.hands);
    // 9p を切ればテンパイ。ほかの打牌はシャンテン数が増える。
    expect(got.map((a) => a.tile.toString())).toStrictEqual(["9p"]);
    // shanten は「有効牌を引いた場合」の値なので、テンパイからはあがり（-1）になる。
    expect(got[0].shanten).toBe(-1);
    expect(names(got[0].effectiveTiles)).toContain("1z");
  });

  // 赤 5 と 5 は別の牌として扱われるので、打牌候補も分かれる。
  test("赤 5 と 5 は別の打牌候補になる", () => {
    const hand = new Hand("123456789m0s5s11z");
    const got = calcEffectiveTiles(hand, hand.hands).map((a) =>
      a.tile.toString(),
    );
    expect(got).toContain("r5s");
    expect(got).toContain("5s");
  });

  // arrangeRed では赤を普通の牌として扱うため、同じ打牌にまとまる。
  test("arrangeRed は赤の印を落として同じ打牌にまとめる", () => {
    const hand = new Hand("123456789m0s5s11z");
    const got = calcEffectiveTiles(hand, hand.hands, {
      arrangeRed: true,
    }).map((a) => a.tile.toString());
    expect(got).not.toContain("r5s");
    expect(got.filter((v) => v == "5s")).toHaveLength(1);
  });

  // 打牌できる牌がない場合は、シャンテン数を返さず弾く。
  test("打牌候補が空なら例外", () => {
    const hand = new Hand("123m456m789m11z5s");
    expect(() => calcEffectiveTiles(hand, [])).toThrow(
      /no tiles available to discard/,
    );
  });
});
