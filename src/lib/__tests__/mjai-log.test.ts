import { describe, expect, test } from "vitest";
import { createLocalGame, silentLogger } from "../controller";
import { ROUND, Round } from "../core/constants";
import { MjaiLogWriter, recordMjaiLog } from "../mjai/log";
import { MJAI_TYPE } from "../mjai/types";
import { validateMjaiLog } from "./utils/mjai-validator";

// mjson 牌譜の書き出し（Phase 4）。
//
// 変換そのものは encode.ts のテストで見ているので、ここで確かめるのは
// 「observer に繋ぐと伏せ牌の無い牌譜になること」と、出力の形。

/**
 * 牌譜を 1 つ取る。
 *
 * `endRound` を渡すとその局に達した時点で終局するので、局またぎを見たいときに使う。
 * 半荘まるごとは 1 回 8 秒かかるので vitest には置かない（`npm run e2e mjai` の側）。
 */
const record = (seed: number, endRound?: Round) => {
  const { c } = createLocalGame({ seed, logger: silentLogger, endRound });
  const log = recordMjaiLog(c);
  if (endRound == null) c.start();
  else c.startGame();
  log.finish(c.scoreManager.summary);
  return { c, log };
};

describe("牌譜の書き出し", () => {
  test("observer に繋ぐと伏せ牌の無い牌譜になる", () => {
    // これが replay mode。1 プレイヤーに繋いだ場合は他家が "?" のままになる。
    const { log } = record(50001);
    expect(log.warnings).toStrictEqual([]);
    expect(log.toString()).not.toContain('"?"');
    expect(
      validateMjaiLog(log.log, { dialect: "strict", unmasked: true })
    ).toStrictEqual([]);
  });

  test("1 行 1 JSON で、末尾に改行が付く", () => {
    const { log } = record(50001);
    const text = log.toString();
    expect(text.endsWith("\n")).toBe(true);
    const lines = text.trimEnd().split("\n");
    expect(lines).toHaveLength(log.log.length);
    // 各行がそれ単体で JSON として読めること（外部ツールに食わせる前提）
    for (const l of lines) expect(() => JSON.parse(l)).not.toThrow();
  });

  test("start_game で始まり end_game で終わる", () => {
    const { log } = record(50001);
    const types = log.log.map((e) => e.type);
    expect(types[0]).toBe(MJAI_TYPE.START_GAME);
    expect(types.at(-1)).toBe(MJAI_TYPE.END_GAME);
  });

  test("end_game に終局時の点数が載る", () => {
    const { c, log } = record(50001);
    const end = log.log.at(-1) as { scores?: number[] };
    // playerIDs の順（＝席番号順）に並ぶ。
    expect(end.scores).toStrictEqual(
      c.playerIDs.map((id) => c.scoreManager.summary[id])
    );
    // 4 人の持ち点の合計は動かない（供託が場に残っていなければ）。
    expect(end.scores!.reduce((a, b) => a + b, 0)).toBe(100000);
  });

  test("局をまたいでも通る", () => {
    // 東 3 局に達した時点で終局＝東 1・東 2（＋連荘）を回す。
    const { log } = record(50002, ROUND.E3);
    expect(log.warnings).toStrictEqual([]);
    const kyoku = log.log.filter((e) => e.type == MJAI_TYPE.START_KYOKU);
    expect(kyoku.length).toBeGreaterThan(1);
    expect(
      validateMjaiLog(log.log, { dialect: "strict", unmasked: true })
    ).toStrictEqual([]);
  });

  test("finish の後に書こうとしたら投げる", () => {
    // 閉じた牌譜に追記すると、end_game より後ろにイベントが並ぶ壊れた列になる。
    const w = new MjaiLogWriter();
    w.finish();
    expect(() =>
      w.write({
        id: "0",
        type: "NEW_DORA",
        wind: "1z",
        doraIndicator: "1m",
      })
    ).toThrow();
  });

  test("finish を二度呼んでも end_game は 1 つ", () => {
    const { log } = record(50001);
    log.finish();
    expect(log.log.filter((e) => e.type == MJAI_TYPE.END_GAME)).toHaveLength(1);
  });
});
