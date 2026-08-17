import { describe, expect, test } from "vitest";
import { PlayerEvent } from "../controller";
import { WIND } from "../core/constants";
import { encodeAll } from "../mjai/encode";
import { MJAI_TYPE, MjaiEvent } from "../mjai/types";
import { createScenario, recordEvents } from "./utils/controller";
import { validateMjaiLog } from "./utils/mjai-validator";
import { snapshotPath } from "./utils/helper";

// PlayerEvent → MjaiEvent[] の変換（Phase 2）。
//
// 検証は 2 本立て。
//   1. 出力を Phase 1.5 の validator に通す（外部の実ログで較正済み）
//   2. mjson をスナップショットで固定する
// 1 が「プロトコルとして成立しているか」、2 が「変えたつもりのないものが変わっていないか」。

/** 台本つきの局を 1 つ回して、observer が見たイベントを mjai に変換する。 */
const encodeScenario = (
  wall: Parameters<typeof createScenario>[0] extends infer P
    ? P extends { wall?: infer W }
      ? W
      : never
    : never,
  drive?: (s: ReturnType<typeof createScenario>) => void
) => {
  const s = createScenario({ autoAdvance: true, wall });
  const events = recordEvents(s.c);
  drive?.(s);
  s.c.actor.start();
  const got = encodeAll(events);
  return { ...s, source: events, ...got };
};

/** 1z が 1z 単騎で待ち、2 巡目に引いてツモ和了する台本。 */
const tsumoWall = {
  hands: { "1z": "123m456m789m123s1z" },
  draws: ["2z", "3z", "4z", "5z", "1z"],
} as const;

/**
 * ツモ和了を申告させる。
 * MockPlayer の既定はツモ切りで、和了の選択肢を自分で false にするので、
 * これを渡さないと台本どおりに引いても和了せず荒牌平局まで進む。
 */
const acceptTsumo = (s: ReturnType<typeof createScenario>) => {
  s.players[0].mDrawHandlers.push((e, p) => {
    if (!e.choices.TSUMO) return false;
    p.eventHandler.emit(e);
    return true;
  });
};

describe("送出方向の変換", () => {
  test("ツモ和了の局が validator を通る", () => {
    const { events, warnings } = encodeScenario(tsumoWall, acceptTsumo);
    expect(warnings).toStrictEqual([]);
    expect(validateMjaiLog(events, { dialect: "strict" })).toStrictEqual([]);
  });

  test("牌譜には伏せ牌が残らない", () => {
    // observer 経由なので全員の手牌が見えている。"?" が残るのは変換の取りこぼし。
    const { events } = encodeScenario(tsumoWall, acceptTsumo);
    expect(
      validateMjaiLog(events, { dialect: "strict", unmasked: true })
    ).toStrictEqual([]);
  });

  test("局の骨格が mjai の順序になる", () => {
    const { events } = encodeScenario(tsumoWall, acceptTsumo);
    const types = events.map((e) => e.type);
    expect(types[0]).toBe(MJAI_TYPE.START_GAME);
    expect(types[1]).toBe(MJAI_TYPE.START_KYOKU);
    expect(types.at(-1)).toBe(MJAI_TYPE.END_GAME);
    expect(types.at(-2)).toBe(MJAI_TYPE.END_KYOKU);
    expect(types.at(-3)).toBe(MJAI_TYPE.HORA);
  });

  test("start_kyoku が局の情報を持つ", () => {
    const { events } = encodeScenario(tsumoWall, acceptTsumo);
    const e = events.find((v) => v.type == MJAI_TYPE.START_KYOKU);
    expect(e).toMatchObject({
      bakaze: "E",
      kyoku: 1,
      honba: 0,
      kyotaku: 0,
      oya: 0,
      scores: [25000, 25000, 25000, 25000],
    });
    // 4 家ぶんの DISTRIBUTE が 1 つの start_kyoku にまとまっていること
    expect(events.filter((v) => v.type == MJAI_TYPE.START_KYOKU)).toHaveLength(1);
  });

  test("和了に裏ドラを含む最終結果が載る", () => {
    // 立直ツモで、裏ドラ表示牌 4z（北）→ 裏ドラ 1z（東）が手牌の 1z 2 枚に乗る。
    const { events } = encodeScenario(
      {
        hands: { "1z": "123m456m789m123s1z" },
        draws: ["5z", "3z", "4z", "6z", "1z"],
        hiddenDoraIndicators: ["4z"],
      },
      (s) => {
        const [mp1] = s.players;
        mp1.mDrawHandlers.push((e, p) => {
          if (!e.choices.REACH) return false;
          e.choices.REACH = e.choices.REACH.filter((t) => t.tile == "5z");
          p.eventHandler.emit(e);
          return true;
        });
        mp1.mDrawHandlers.push((e, p) => {
          if (!e.choices.TSUMO) return false;
          p.eventHandler.emit(e);
          return true;
        });
      }
    );

    const hora = events.find((v) => v.type == MJAI_TYPE.HORA);
    expect(hora).toBeDefined();
    const h = hora as unknown as Record<string, unknown>;
    expect(h.actor).toBe(h.target); // ツモ和了
    expect(h.yakus).toContainEqual(["uradora", 2]);
    expect(h.uradora_markers).toStrictEqual(["N"]);
    // 原典と Mortal 系で名前が違うので両方載せる
    expect(h.ura_markers).toStrictEqual(h.uradora_markers);
    expect(h.fu).toBeGreaterThan(0);
    expect(h.fan).toBeGreaterThan(0);
  });

  test("立直は宣言と宣言牌の 2 つに分かれる", () => {
    // mjimage の REACH は宣言牌を内包した 1 イベント。mjai は reach → dahai の 2 段。
    const { events } = encodeScenario(
      {
        hands: { "1z": "123m456m789m123s1z" },
        draws: ["5z", "3z", "4z", "6z", "1z"],
      },
      (s) => {
        const [mp1] = s.players;
        mp1.mDrawHandlers.push((e, p) => {
          if (!e.choices.REACH) return false;
          e.choices.REACH = e.choices.REACH.filter((t) => t.tile == "5z");
          p.eventHandler.emit(e);
          return true;
        });
      }
    );

    const i = events.findIndex((e) => e.type == MJAI_TYPE.REACH);
    expect(i).toBeGreaterThanOrEqual(0);
    const reach = events[i] as { actor: number };
    const dahai = events[i + 1] as { type: string; actor: number; pai: string };
    expect(dahai.type).toBe(MJAI_TYPE.DAHAI);
    expect(dahai.actor).toBe(reach.actor);
    expect(dahai.pai).toBe("P"); // 5z = 白
    // 供託の成立は宣言牌の後
    const accepted = events.findIndex((e) => e.type == MJAI_TYPE.REACH_ACCEPTED);
    expect(accepted).toBeGreaterThan(i + 1);
  });

  test("暗槓は consumed 4 枚で target を持たない", () => {
    const { events, warnings } = encodeScenario(
      { hands: { "1z": "111m456m789m12p33s" }, draws: ["1m"] },
      (s) => {
        const [mp1] = s.players;
        mp1.mDrawHandlers.push((e, p) => {
          if (!e.choices.AN_KAN) return false;
          e.choices.TSUMO = false;
          e.choices.REACH = false;
          e.choices.SHO_KAN = false;
          e.choices.DRAWN_GAME_BY_NINE_TERMINALS = false;
          p.eventHandler.emit(e);
          return true;
        });
      }
    );
    expect(warnings).toStrictEqual([]);
    const ankan = events.find((e) => e.type == MJAI_TYPE.ANKAN) as unknown as Record<
      string,
      unknown
    >;
    expect(ankan).toBeDefined();
    expect(ankan.consumed).toStrictEqual(["1m", "1m", "1m", "1m"]);
    expect(ankan).not.toHaveProperty("target");
    // 暗槓の直後に新ドラ
    const i = events.indexOf(ankan as unknown as MjaiEvent);
    expect(events[i + 1].type).toBe(MJAI_TYPE.DORA);
  });

  test("流局は理由とテンパイ者を持つ", () => {
    // 九種九牌。1z に么九牌 9 種を配る。
    const { events, warnings } = encodeScenario(
      { hands: { "1z": "19m19p19s1234567z" }, draws: ["5z"] },
      (s) => {
        const [mp1] = s.players;
        mp1.mDrawHandlers.push((e, p) => {
          if (!e.choices.DRAWN_GAME_BY_NINE_TERMINALS) return false;
          e.choices.TSUMO = false;
          e.choices.REACH = false;
          e.choices.AN_KAN = false;
          e.choices.SHO_KAN = false;
          e.choices.DISCARD = false;
          p.eventHandler.emit(e);
          return true;
        });
      }
    );
    expect(warnings).toStrictEqual([]);
    const r = events.find((e) => e.type == MJAI_TYPE.RYUKYOKU) as unknown as Record<
      string,
      unknown
    >;
    expect(r?.reason).toBe("kyushukyuhai");
    expect(r?.deltas).toStrictEqual([0, 0, 0, 0]);
    expect(validateMjaiLog(events, { dialect: "strict" })).toStrictEqual([]);
  });
});

describe("スナップショット", () => {
  test("1 局ぶんの mjson を固定する", async () => {
    const { events } = encodeScenario(tsumoWall, acceptTsumo);
    // 1 行 1 JSON。差分が読めるうえ、そのまま外部ツールに食わせられる。
    const jsonl = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
    await expect(jsonl).toMatchFileSnapshot(snapshotPath("mjai.tsumo.jsonl"));
  });
});

describe("鳴きの target", () => {
  test("ポンは捨てた人を target にする", () => {
    // 2z が捨てた 1m を 1z がポンする。
    const { events, warnings } = encodeScenario(
      {
        hands: { "1z": "11m456m789m123p33s" },
        draws: ["1z", "1m"],
      },
      (s) => {
        const [mp1] = s.players;
        mp1.mDiscardHandlers.push((e, p) => {
          if (!e.choices.PON) return false;
          e.choices.CHI = false;
          e.choices.DAI_KAN = false;
          e.choices.RON = false;
          p.eventHandler.emit(e);
          return true;
        });
      }
    );
    expect(warnings).toStrictEqual([]);
    const pon = events.find((e) => e.type == MJAI_TYPE.PON) as unknown as Record<
      string,
      unknown
    >;
    expect(pon).toBeDefined();
    // 1z = 席 0、2z = 席 1
    expect(pon.actor).toBe(0);
    expect(pon.target).toBe(1);
    expect(pon.pai).toBe("1m");
    expect(pon.consumed).toStrictEqual(["1m", "1m"]);
  });
});

describe("局をまたぐ", () => {
  test("席番号は半荘中変わらない", () => {
    // 風は局ごとに回るが actor は固定。連荘しない局を 2 つ回して確かめる。
    const s = createScenario({ autoAdvance: true, wall: tsumoWall });
    const events: PlayerEvent[] = recordEvents(s.c);
    acceptTsumo(s);
    s.c.actor.start();
    const first = encodeAll(events);
    const kyoku = first.events.filter((e) => e.type == MJAI_TYPE.START_KYOKU);
    expect(kyoku).toHaveLength(1);
    // 東家（1z）が席 0 であること。playerIDs の順が席順。
    expect((kyoku[0] as unknown as Record<string, unknown>).oya).toBe(0);
    expect(s.c.placeManager.wind(s.c.playerIDs[0])).toBe(WIND.E);
  });
});
