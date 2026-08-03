import { nextWind, prevWind, nextRound, roundWind } from "../core";
import { ROUND, Round, WIND } from "../core/constants";

// 席順と局の語彙。controller も image もこの 4 つの関数の上に載っているので、
// 一周する・逆回りが対になる、といった性質をここで固定する。

describe("風の並び", () => {
  test("nextWind は東→南→西→北→東と回る", () => {
    expect(nextWind(WIND.E)).toBe(WIND.S);
    expect(nextWind(WIND.S)).toBe(WIND.W);
    expect(nextWind(WIND.W)).toBe(WIND.N);
    expect(nextWind(WIND.N)).toBe(WIND.E);
  });

  test("prevWind は nextWind の逆", () => {
    for (const w of Object.values(WIND)) {
      expect(prevWind(nextWind(w))).toBe(w);
      expect(nextWind(prevWind(w))).toBe(w);
    }
  });
});

describe("局の進み方", () => {
  test("nextRound は 4 局で場が変わる", () => {
    expect(nextRound(ROUND.E1)).toBe(ROUND.E2);
    expect(nextRound(ROUND.E4)).toBe(ROUND.S1);
    expect(nextRound(ROUND.S4)).toBe(ROUND.W1);
  });

  test("roundWind は局から場風を取り出す", () => {
    expect(roundWind(ROUND.E3)).toBe(WIND.E);
    expect(roundWind(ROUND.S1)).toBe(WIND.S);
    expect(roundWind(ROUND.W4)).toBe(WIND.W);
  });

  test("東 1 局から 8 回進めると南場を一周して西入りする", () => {
    let r: Round = ROUND.E1;
    for (let i = 0; i < 8; i++) r = nextRound(r);
    expect(r).toBe(ROUND.W1);
  });
});
