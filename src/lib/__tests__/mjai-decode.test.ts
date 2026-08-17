import { describe, expect, test } from "vitest";
import {
  ChoiceReply,
  EventHandler,
  Controller,
  Player,
  PlayerEvent,
  createLocalGame,
  silentLogger,
} from "../controller";
import { encodeAll } from "../mjai/encode";
import { applyAction, hasSelectableChoice } from "../mjai/decode";
import { MjaiBot, MjaiPlayer } from "../mjai/session";
import {
  MJAI_TYPE,
  MjaiAction,
  MjaiEventWithCanAct,
} from "../mjai/types";
import { validateMjaiLog } from "./utils/mjai-validator";
import { MockPlayer, drawnChoice, discardChoice } from "./utils/controller";

// MjaiAction → ChoiceReply（Phase 3）。
//
// 山は §4.2 の「候補の並べ替え」。mailbox は候補配列の先頭を採るので、
// bot が指名したものを先頭に持ってこないと別の手が通る。
// ここを一番強く確かめるのは、mjai を往復させても素の Player と同じ対局になること。

/** ツモ切りしかしない bot。MockPlayer の既定の動きと同じになるようにしてある。 */
class TsumogiriBot implements MjaiBot {
  react(events: readonly MjaiEventWithCanAct[]): MjaiAction {
    const last = events.at(-1);
    // 自分のツモだけが実牌で来る（他家は "?"）。それをそのまま切る。
    if (last?.type == MJAI_TYPE.TSUMO && last.pai != "?")
      return {
        type: MJAI_TYPE.DAHAI,
        actor: last.actor,
        pai: last.pai,
        tsumogiri: true,
      };
    return { type: MJAI_TYPE.NONE };
  }
}

/**
 * 自分の手牌を mjai の列だけから組み直し、ポンできるときはポンする bot。
 *
 * ツモ切り bot は tsumo / dahai しか通らないので、鳴きの decode 経路（候補の
 * 並べ替えと、鳴いた後の打牌）が確かめられない。この bot はそこを踏ませる。
 *
 * 手牌を mjai の列だけで追えること自体が、送出側が十分な情報を出している証拠になる。
 */
class PonBot implements MjaiBot {
  private hand: string[] = [];
  private me: number | null = null;

  react(events: readonly MjaiEventWithCanAct[]): MjaiAction {
    for (const e of events) this.apply(e);
    const last = events.at(-1);
    if (last == null || this.me == null) return { type: MJAI_TYPE.NONE };

    // 自分のツモ番。ツモ切りする。
    if (last.type == MJAI_TYPE.TSUMO && last.actor == this.me)
      return {
        type: MJAI_TYPE.DAHAI,
        actor: this.me,
        pai: last.pai as never,
        tsumogiri: true,
      };

    // 鳴いた直後の打牌。手牌の先頭を切る。
    if (last.type == MJAI_TYPE.PON && last.actor == this.me)
      return {
        type: MJAI_TYPE.DAHAI,
        actor: this.me,
        pai: this.hand[0] as never,
        tsumogiri: false,
      };

    // 他家の打牌。同じ牌を 2 枚持っていればポンする。
    if (last.type == MJAI_TYPE.DAHAI && last.actor != this.me) {
      const same = this.hand.filter((t) => t == last.pai);
      if (same.length >= 2)
        return {
          type: MJAI_TYPE.PON,
          actor: this.me as never,
          target: last.actor,
          pai: last.pai,
          consumed: [same[0], same[1]] as never,
        };
    }
    return { type: MJAI_TYPE.NONE };
  }

  /** mjai のイベントから自分の手牌を組み直す。 */
  private apply(e: MjaiEventWithCanAct) {
    const drop = (pai: string) => {
      const i = this.hand.indexOf(pai);
      if (i >= 0) this.hand.splice(i, 1);
    };
    switch (e.type) {
      case MJAI_TYPE.START_KYOKU: {
        // 自分の配牌だけが実牌で来る。伏せ牌しかない席は自分ではない。
        const mine = e.tehais.findIndex((h) => h.every((t) => t != "?"));
        this.me = mine;
        this.hand = mine < 0 ? [] : [...e.tehais[mine]];
        break;
      }
      case MJAI_TYPE.TSUMO:
        if (e.actor == this.me) this.hand.push(e.pai);
        break;
      case MJAI_TYPE.DAHAI:
        if (e.actor == this.me) drop(e.pai);
        break;
      case MJAI_TYPE.PON:
        if (e.actor == this.me) for (const t of e.consumed) drop(t);
        break;
    }
  }
}

/** MjaiPlayer を 4 席に差し込んだ対局を作る。 */
const createMjaiGame = (seed: number, newBot: () => MjaiBot) => {
  const seats: MjaiPlayer[] = [];
  const injected = () =>
    class {
      constructor(id: string, e: EventHandler) {
        seats.push(new MjaiPlayer(id, e, newBot()));
      }
      // Controller はパイプの片側しか使わないので、Player の中身は要らない。
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
  return { c, seats };
};

/** observer が見たイベントを mjson にする。 */
const asMjson = (events: readonly PlayerEvent[]) =>
  encodeAll(events).events.map((e) => JSON.stringify(e));

describe("mjai 経由の往復", () => {
  // 同じ種・同じ判断なら、mjai を通しても通さなくても同じ対局になるはず。
  // 変換のどちらか片方でも取りこぼせば、盤面が分岐して食い違う。
  /** MockPlayer をそのまま 4 席に置いた対局。既定の動きがツモ切り・鳴かない。 */
  const createDirectGame = (seed: number) =>
    createLocalGame({
      seed,
      logger: silentLogger,
      playerInjection: {
        p1: MockPlayer,
        p2: MockPlayer,
        p3: MockPlayer,
        p4: MockPlayer,
      },
    });

  const play = (c: { start: () => void; observer: Controller["observer"] }) => {
    const events: PlayerEvent[] = [];
    c.observer.eventHandler.on((e) => events.push(e));
    c.start();
    return events;
  };

  for (const seed of [40001, 40002, 40003]) {
    test(`seed ${seed}: ツモ切り bot は MockPlayer と同じ対局になる`, () => {
      // 山も席順も同じ種から作られるので、違うのはプレイヤーの実装だけ。
      // mjai を通した側が 1 手でも違えば盤面が分岐して食い違う。
      const direct = play(createDirectGame(seed).c);

      const viaMjai = createMjaiGame(seed, () => new TsumogiriBot());
      const mjai = play(viaMjai.c);

      for (const s of viaMjai.seats) expect(s.warnings).toStrictEqual([]);
      expect(asMjson(mjai)).toStrictEqual(asMjson(direct));
    });
  }

  test("往復した対局も validator を通る", () => {
    const { c, seats } = createMjaiGame(40001, () => new TsumogiriBot());
    const events: PlayerEvent[] = [];
    c.observer.eventHandler.on((e) => events.push(e));
    c.start();
    for (const s of seats) s.finish();

    expect(validateMjaiLog(encodeAll(events).events, { dialect: "strict" })).toStrictEqual([]);
  });

  test("ポンする bot でも局が最後まで進み、validator を通る", () => {
    // 鳴きの decode 経路（候補の並べ替えと、鳴いた後の打牌）を通す。
    // ポンが 1 回も起きていなければ、この経路は確かめられていないので併せて見る。
    const { c, seats } = createMjaiGame(40001, () => new PonBot());
    const events = play(c);
    for (const s of seats) expect(s.warnings).toStrictEqual([]);

    const mjai = encodeAll(events).events;
    expect(mjai.filter((e) => e.type == MJAI_TYPE.PON).length).toBeGreaterThan(0);
    expect(validateMjaiLog(mjai, { dialect: "strict" })).toStrictEqual([]);
  });

  test("bot は mjai の列だけから自分の手牌を組み直せる", () => {
    // PonBot は自分の手牌を mjai の列だけで追っている。追えていなければ
    // 「持っていない牌でポン」を申告し、decode が「候補に無い」を積む。
    // 送出側が bot に十分な情報を渡せていることの裏取りになる。
    const { c, seats } = createMjaiGame(40002, () => new PonBot());
    c.start();
    for (const s of seats) expect(s.warnings).toStrictEqual([]);
  });

  test("選択肢が無い家にも必ず返信する", () => {
    // pollReplies は 4 家の返信が揃わないと投げる。選択肢が空でも返す義務がある。
    // 局が最後まで進んだこと自体がその証拠になる。
    const { c } = createMjaiGame(40001, () => new TsumogiriBot());
    expect(() => c.start()).not.toThrow();
    expect(c.actor.getSnapshot().status).toBe("done");
  });
});

describe("候補の並べ替え", () => {
  // mailbox は候補配列の先頭を採る（choices[0]）。指名したものを先頭に出せているか。
  const pon = (tiles: string) => ({ tiles, type: "pon" as const });

  test("赤入りのポンを指名すると、その候補が先頭に来る", () => {
    // 5m のポンには「赤を使う」「使わない」の 2 通りの候補が出る。
    const e = discardChoice("2z", {
      PON: [pon("-5m5m5m"), pon("-5mr5m5m")],
    }) as ChoiceReply;
    const warnings = applyAction(e, {
      type: MJAI_TYPE.PON,
      actor: 1,
      target: 0,
      pai: "5m",
      consumed: ["5mr", "5m"],
    });
    expect(warnings).toStrictEqual([]);
    const choices = e.choices as unknown as { PON: { tiles: string }[]; CHI: unknown };
    expect(choices.PON[0].tiles).toBe("-5mr5m5m");
    // 選ばなかったものは false
    expect(choices.CHI).toBe(false);
  });

  test("候補に無いものを指名したら警告して先頭のまま進める", () => {
    const e = discardChoice("2z", { PON: [pon("-5m5m5m")] }) as ChoiceReply;
    const warnings = applyAction(e, {
      type: MJAI_TYPE.PON,
      actor: 1,
      target: 0,
      pai: "9s",
      consumed: ["9s", "9s"],
    });
    expect(warnings.join()).toContain("候補に無い");
    // 進行は止めない
    expect((e.choices as unknown as { PON: unknown[] }).PON).toHaveLength(1);
  });

  test("立直は宣言牌を候補の先頭に持ってくる", () => {
    // mailbox の afterDrawn は candidates[0].tile を宣言牌に採る。
    const e = drawnChoice("1z", {
      REACH: [{ tile: "1m" }, { tile: "9p" }] as never,
      DISCARD: ["1m", "9p"],
    }) as ChoiceReply;
    const warnings = applyAction(
      e,
      { type: MJAI_TYPE.REACH, actor: 0 },
      { type: MJAI_TYPE.DAHAI, actor: 0, pai: "9p", tsumogiri: false }
    );
    expect(warnings).toStrictEqual([]);
    const choices = e.choices as unknown as { REACH: { tile: string }[] };
    expect(choices.REACH[0].tile).toBe("9p");
  });

  test("宣言牌が渡されないと警告する", () => {
    const e = drawnChoice("1z", {
      REACH: [{ tile: "1m" }] as never,
      DISCARD: ["1m"],
    }) as ChoiceReply;
    const warnings = applyAction(e, { type: MJAI_TYPE.REACH, actor: 0 });
    expect(warnings.join()).toContain("宣言牌が渡されていない");
  });

  test("打牌は指定した牌を先頭に持ってくる", () => {
    const e = drawnChoice("1z", { DISCARD: ["1m", "t9p", "5s"] }) as ChoiceReply;
    const warnings = applyAction(e, {
      type: MJAI_TYPE.DAHAI,
      actor: 0,
      pai: "9p",
      tsumogiri: true,
    });
    expect(warnings).toStrictEqual([]);
    // ツモ牌の印が付いていても同じ牌として拾う
    expect((e.choices as unknown as { DISCARD: string[] }).DISCARD[0]).toBe("t9p");
  });

  test("赤 5 と素の 5 を取り違えない", () => {
    const e = drawnChoice("1z", { DISCARD: ["5m", "r5m"] }) as ChoiceReply;
    applyAction(e, {
      type: MJAI_TYPE.DAHAI,
      actor: 0,
      pai: "5mr",
      tsumogiri: false,
    });
    expect((e.choices as unknown as { DISCARD: string[] }).DISCARD[0]).toBe("r5m");
  });
});

describe("選ばないものは消す", () => {
  test("none はすべて選ばない形にする", () => {
    const e = discardChoice("2z", {
      RON: {} as never,
      PON: [{ tiles: "-1m1m1m", type: "pon" }] as never,
    }) as ChoiceReply;
    applyAction(e, { type: MJAI_TYPE.NONE });
    expect(e.choices).toStrictEqual({
      RON: false,
      PON: false,
      CHI: false,
      DAI_KAN: false,
    });
  });

  test("ツモ番の none は打牌を残す（controller が必須にしている）", () => {
    const e = drawnChoice("1z", {
      TSUMO: {} as never,
      DISCARD: ["1m", "2m"],
    }) as ChoiceReply;
    applyAction(e, { type: MJAI_TYPE.NONE });
    const choices = e.choices as Record<string, unknown>;
    expect(choices.TSUMO).toBe(false);
    expect(choices.DISCARD).toStrictEqual(["1m", "2m"]);
  });

  test("和了は提示されていなければ選ばない形に戻す", () => {
    const e = discardChoice("2z", { PON: [{ tiles: "-1m1m1m", type: "pon" }] as never }) as ChoiceReply;
    const warnings = applyAction(e, {
      type: MJAI_TYPE.HORA,
      actor: 1,
      target: 0,
      pai: "1m",
    });
    expect(warnings.join()).toContain("提示されていない");
    expect((e.choices as unknown as { RON: unknown }).RON).toBe(false);
    // 申告が通らなくても、他の選択肢を勝手に選んだりはしない
    expect((e.choices as unknown as { PON: unknown }).PON).toBe(false);
  });

  test("選択肢が無いイベントは bot に聞くまでもない", () => {
    const e = discardChoice("2z", {}) as ChoiceReply;
    expect(hasSelectableChoice(e)).toBe(false);
    const withPon = discardChoice("2z", {
      PON: [{ tiles: "-1m1m1m", type: "pon" }] as never,
    }) as ChoiceReply;
    expect(hasSelectableChoice(withPon)).toBe(true);
  });

  test("空配列は選べる候補として数えない", () => {
    // events.ts の selectable と同じ扱い。[] は truthy なので長さまで見る必要がある。
    const e = discardChoice("2z", { PON: [] }) as ChoiceReply;
    expect(hasSelectableChoice(e)).toBe(false);
  });
});
