import { describe, expect, test } from "vitest";
import {
  EventHandler,
  Player,
  PlayerEvent,
  createLocalGame,
  silentLogger,
} from "../controller";
import { StdioBot, SyncTransport } from "../mjai/bot";
import { createWorkerTransport } from "../mjai/worker-transport";
import { MjaiPlayer } from "../mjai/session";
import { encodeAll } from "../mjai/encode";
import { MJAI_TYPE, MjaiEventWithCanAct } from "../mjai/types";
import { MockPlayer } from "./utils/controller";
import { fixturePath } from "./utils/helper";
import { validateMjaiLog } from "./utils/mjai-validator";

// 線の向こうの bot（Phase 5）。
//
// 2 段に分けて見る。
//   1. 線の約束の変換（bot.ts）— 通信路を差し替えて、プロセス無しで確かめる
//   2. 橋そのもの（worker-transport.ts）— 本物の子プロセスを起こして確かめる
// 1 が壊れていると 2 の失敗が読めなくなるので、順に置く。

/** 記録を取りながら決まった応答を返す通信路。 */
const fakeTransport = (
  reply: (sent: unknown) => unknown | null
): SyncTransport & { sent: unknown[] } => {
  const sent: unknown[] = [];
  return {
    sent,
    exchange(line: string) {
      const parsed = JSON.parse(line);
      sent.push(parsed);
      const r = reply(parsed);
      return r == null ? null : JSON.stringify(r);
    },
    close() {},
  };
};

const tsumoEvent = (canAct: boolean): MjaiEventWithCanAct => ({
  type: MJAI_TYPE.TSUMO,
  actor: 0,
  pai: "1m",
  ...(canAct ? { can_act: true } : {}),
});

describe("線の約束への変換", () => {
  test("接続時に hello を送り join を待つ", () => {
    const t = fakeTransport((e) =>
      (e as { type: string }).type == MJAI_TYPE.HELLO
        ? { type: MJAI_TYPE.JOIN, name: "x" }
        : { type: MJAI_TYPE.NONE }
    );
    const bot = new StdioBot(t, { name: "x" });
    bot.react([tsumoEvent(true)]);

    expect((t.sent[0] as { type: string }).type).toBe(MJAI_TYPE.HELLO);
    expect(bot.warnings).toStrictEqual([]);
  });

  test("挨拶は 1 度だけ", () => {
    const t = fakeTransport(() => ({ type: MJAI_TYPE.NONE }));
    const bot = new StdioBot(t);
    bot.react([tsumoEvent(true)]);
    bot.react([tsumoEvent(true)]);
    expect(t.sent.filter((e) => (e as { type: string }).type == MJAI_TYPE.HELLO))
      .toHaveLength(1);
  });

  test("イベント 1 行につき 1 応答を往復する", () => {
    // react は「溜まったイベント」を渡す形だが、線の上では 1 行ずつ。
    const t = fakeTransport((e) =>
      (e as { type: string }).type == MJAI_TYPE.HELLO
        ? { type: MJAI_TYPE.JOIN }
        : { type: MJAI_TYPE.NONE }
    );
    const bot = new StdioBot(t);
    bot.react([
      { type: MJAI_TYPE.DORA, dora_marker: "1m" },
      { type: MJAI_TYPE.TSUMO, actor: 1, pai: "?" },
      tsumoEvent(true),
    ]);
    // hello + 3 イベント
    expect(t.sent).toHaveLength(4);
  });

  test("can_act が立った行への応答だけを採る", () => {
    // 行動しない行にも bot は none を返す。それを行動として拾ってはいけない。
    const t = fakeTransport((e) => {
      const type = (e as { type: string }).type;
      if (type == MJAI_TYPE.HELLO) return { type: MJAI_TYPE.JOIN };
      if (type == MJAI_TYPE.DORA)
        // 行動しない場面で誤って打牌を返してくる bot（これを拾うと壊れる）
        return { type: MJAI_TYPE.DAHAI, actor: 0, pai: "9p", tsumogiri: false };
      return { type: MJAI_TYPE.DAHAI, actor: 0, pai: "1m", tsumogiri: true };
    });
    const bot = new StdioBot(t);
    const got = bot.react([
      { type: MJAI_TYPE.DORA, dora_marker: "1m" },
      tsumoEvent(true),
    ]);
    expect(got).toStrictEqual({
      type: MJAI_TYPE.DAHAI,
      actor: 0,
      pai: "1m",
      tsumogiri: true,
    });
  });

  test("応答が返らなければ none に倒して警告する", () => {
    const t = fakeTransport((e) =>
      (e as { type: string }).type == MJAI_TYPE.HELLO
        ? { type: MJAI_TYPE.JOIN }
        : null
    );
    const bot = new StdioBot(t);
    expect(bot.react([tsumoEvent(true)])).toStrictEqual({ type: MJAI_TYPE.NONE });
    expect(bot.warnings.join()).toContain("応答が返らなかった");
  });

  test("読めない応答は none に倒す", () => {
    for (const [bad, want] of [
      ["not json", "JSON として読めない"],
      [JSON.stringify({ nope: 1 }), "type の無い応答"],
      [JSON.stringify({ type: "tsumo" }), "行動として扱えない"],
      [JSON.stringify({ type: "error", message: "x" }), "エラーを返した"],
    ] as const) {
      const t: SyncTransport = {
        exchange: (line) =>
          JSON.parse(line).type == MJAI_TYPE.HELLO
            ? JSON.stringify({ type: MJAI_TYPE.JOIN })
            : bad,
        close() {},
      };
      const bot = new StdioBot(t);
      expect(bot.react([tsumoEvent(true)])).toStrictEqual({
        type: MJAI_TYPE.NONE,
      });
      expect(bot.warnings.join(), bad).toContain(want);
    }
  });
});

describe("worker を挟んだ実プロセスとの往復", () => {
  const botPath = fixturePath("mjai/tsumogiri-bot.cjs");

  const newStdioBot = () =>
    new StdioBot(
      createWorkerTransport({
        command: process.execPath,
        args: [botPath],
        timeoutMs: 20_000,
      })
    );

  test("子プロセスと同期で 1 往復できる", () => {
    // ここが Phase 5 の肝。非同期でしか読めない子プロセスの応答を、
    // 同期のコールスタックの中で受け取れること。
    const t = createWorkerTransport({
      command: process.execPath,
      args: [botPath],
      timeoutMs: 20_000,
    });
    const got = t.exchange(JSON.stringify({ type: MJAI_TYPE.HELLO }));
    expect(got).not.toBeNull();
    expect(JSON.parse(got!).type).toBe(MJAI_TYPE.JOIN);
    t.close();
  });

  test("起動できない相手には null を返す（例外にしない）", () => {
    // 存在しない実行ファイル。spawn が error を投げても例外にせず null を返すこと。
    const t = createWorkerTransport({
      command: "mjimage-no-such-bot-binary",
      timeoutMs: 5_000,
    });
    expect(t.exchange(JSON.stringify({ type: MJAI_TYPE.HELLO }))).toBeNull();
    t.close();
  });

  test("別プロセスの bot 4 人で 1 局打てる", () => {
    // MockPlayer（同じくツモ切り）と同じ対局になれば、
    // 線を挟んでも変換が保たれていることの証拠になる。
    const seed = 60001;
    const bots: StdioBot[] = [];
    const seats: MjaiPlayer[] = [];
    const injected = () =>
      class {
        constructor(id: string, e: EventHandler) {
          const bot = newStdioBot();
          bots.push(bot);
          seats.push(new MjaiPlayer(id, e, bot));
        }
      } as unknown as new (id: string, e: EventHandler) => Player;

    const { c } = createLocalGame({
      seed,
      logger: silentLogger,
      playerInjection: {
        p1: injected(),
        p2: injected(),
        p3: injected(),
        p4: injected(),
      },
    });
    const events: PlayerEvent[] = [];
    c.observer.eventHandler.on((e) => events.push(e));
    try {
      c.start();
    } finally {
      for (const b of bots) b.close();
    }

    for (const b of bots) expect(b.warnings).toStrictEqual([]);
    for (const s of seats) expect(s.warnings).toStrictEqual([]);

    const direct = createLocalGame({
      seed,
      logger: silentLogger,
      playerInjection: {
        p1: MockPlayer,
        p2: MockPlayer,
        p3: MockPlayer,
        p4: MockPlayer,
      },
    });
    const directEvents: PlayerEvent[] = [];
    direct.c.observer.eventHandler.on((e) => directEvents.push(e));
    direct.c.start();

    const asMjson = (v: PlayerEvent[]) =>
      encodeAll(v).events.map((e) => JSON.stringify(e));
    expect(asMjson(events)).toStrictEqual(asMjson(directEvents));
    expect(
      validateMjaiLog(encodeAll(events).events, { dialect: "strict" })
    ).toStrictEqual([]);
  }, 60_000);
});
