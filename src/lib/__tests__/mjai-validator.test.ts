import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { fixturePath } from "./utils/helper";
import { checkSchema } from "./utils/mjai-schema";
import { validateMjaiLog } from "./utils/mjai-validator";
import { fromMjaiPai, toMjaiPai } from "../mjai/pai";
import { MjaiMaybeHiddenPai } from "../mjai/types";

// validator そのものの検査（層 0）。
//
// ここが緑でないうちは、validator を自分の出力に当てても意味が無い。
// 見るのは 2 つ。
//   1. 外部の正しいログを弾かないこと（緩すぎる方向の間違いは 2 で見る）
//   2. 壊したログをちゃんと弾くこと
// 1 だけだと「何も検査していない validator」でも通ってしまう。

const loadJsonl = (path: string): unknown[] =>
  readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim().startsWith("{"))
    .map((l) => JSON.parse(l) as unknown);

const fixture = (name: string) => fixturePath(`mjai/${name}`);

describe("外部の牌譜で較正する", () => {
  test("原典の食い替えログを弾かない", () => {
    // gimite/mjai の test/kuikae.mjson（New BSD）。原典の作者が手で書いたもの。
    const log = loadJsonl(fixture("gimite-kuikae.mjson"));
    expect(log.length).toBe(6);
    expect(validateMjaiLog(log, { dialect: "legacy" })).toStrictEqual([]);
  });

  test("原典の実ログの牌表記が pai.ts と一致する", () => {
    // 牌の表記だけは方言に関係なく共通なので、外部ログを裏取りに使える。
    // この 1 半荘には赤 3 種を含む 37 種すべてが出てくるので、
    // pai.ts が自前の定義から作った 37 種と突き合わせられる。
    const log = loadJsonl(fixture("gimite-fullgame.jsonl"));
    const pais = new Set<string>();
    const collect = (v: unknown) => {
      if (typeof v == "string") pais.add(v);
      else if (Array.isArray(v)) v.forEach(collect);
      else if (v != null && typeof v == "object")
        for (const [k, x] of Object.entries(v))
          if (["pai", "pais", "tehais", "consumed", "dora_marker"].includes(k))
            collect(x);
    };
    log.forEach(collect);
    // 伏せ牌を除いた実牌が、すべて Tile と往復すること
    const real = [...pais].filter((p) => p != "?");
    // 数牌 27 + 字牌 7 + 赤 3。pai.ts が独立に数えた 37 種と一致する。
    expect(real).toHaveLength(37);
    for (const p of real)
      expect(toMjaiPai(fromMjaiPai(p as MjaiMaybeHiddenPai)), p).toBe(p);
  });

  test("原典の 1 半荘ぶんの実ログを弾かない", () => {
    // 較正の主役。17 局ぶんで、hora / ryukyoku / ankan / daiminkan / reach まで
    // すべての種別が出てくる。ここが落ちたら validator が厳しすぎる。
    const log = loadJsonl(fixture("gimite-fullgame.jsonl"));
    expect(log.length).toBe(2015);
    expect(validateMjaiLog(log, { dialect: "legacy" })).toStrictEqual([]);
  });

  test("実ログに全イベント種別が出てくる", () => {
    // 較正の網羅性の見張り。ログを差し替えたときに種別が減ったら気づけるようにする。
    const log = loadJsonl(fixture("gimite-fullgame.jsonl"));
    const types = new Set(log.map((e) => (e as { type: string }).type));
    for (const t of [
      "start_game", "start_kyoku", "haipai", "tsumo", "dahai", "chi", "pon",
      "ankan", "daiminkan", "dora", "reach", "reach_accepted", "hora",
      "ryukyoku", "end_kyoku", "end_game",
    ])
      expect(types, `${t} が実ログに無い`).toContain(t);
  });
});

// 壊し方ごとに 1 件。validator が「何を見ているか」の一覧にもなる。
describe("壊したログを弾く", () => {
  /** legacy 方言の、正しい最小の局。ここから 1 か所ずつ壊す。 */
  const baseline = (): Record<string, unknown>[] => [
    { type: "start_kyoku", oya: 0, dora_marker: "1m" },
    { type: "haipai", actor: 0, pais: ["1p", "2p", "3p", "4p", "5p", "6p", "7p", "8p", "9p", "E", "E", "S", "S"] },
    { type: "haipai", actor: 1, pais: Array(13).fill("?") },
    { type: "haipai", actor: 2, pais: Array(13).fill("?") },
    { type: "haipai", actor: 3, pais: Array(13).fill("?") },
    { type: "tsumo", actor: 0, pai: "W" },
    { type: "dahai", actor: 0, pai: "W" },
  ];

  const problems = (mutate: (log: Record<string, unknown>[]) => void) => {
    const log = baseline();
    mutate(log);
    return validateMjaiLog(log, { dialect: "legacy" });
  };

  test("土台のログ自体は通る", () => {
    // これが落ちると以下の否定テストが「別の理由で落ちている」ことになる。
    expect(validateMjaiLog(baseline(), { dialect: "legacy" })).toStrictEqual([]);
  });

  test("手牌に無い牌を切ったら弾く", () => {
    const got = problems((log) => (log[6].pai = "9s"));
    expect(got.map((p) => p.message).join()).toContain("手牌に無い");
  });

  test("ツモの前に打牌したら弾く", () => {
    const got = problems((log) => log.splice(5, 1));
    expect(got.map((p) => p.message).join()).toContain("自分のツモでも鳴きでもない");
  });

  test("他家の打牌を自分の打牌として続けたら弾く", () => {
    const got = problems((log) => (log[6].actor = 1));
    expect(got.length).toBeGreaterThan(0);
  });

  test("同じ牌が 5 枚見えたら弾く", () => {
    const got = problems((log) => {
      log[1].pais = ["1p", "1p", "1p", "1p", "5p", "6p", "7p", "8p", "9p", "E", "E", "S", "S"];
      log[0].dora_marker = "1p";
      log[5].pai = "1p";
      log[6].pai = "1p";
    });
    expect(got.map((p) => p.message).join()).toContain("4 枚を超えた");
  });

  test("赤 5 と素の 5 は合算して数える", () => {
    // 5m が 4 枚 + 5mr が 1 枚は 5 枚目。別種として数えると見逃す。
    const got = problems((log) => {
      log[1].pais = ["5m", "5m", "5m", "5m", "5p", "6p", "7p", "8p", "9p", "E", "E", "S", "S"];
      log[5].pai = "5mr";
      log[6].pai = "5mr";
    });
    expect(got.map((p) => p.message).join()).toContain("4 枚を超えた");
  });

  test("立直の宣言牌を切らずに供託が成立したら弾く", () => {
    const got = problems((log) =>
      log.splice(6, 1, { type: "reach_accepted", actor: 0 })
    );
    expect(got.map((p) => p.message).join()).toContain("宣言牌を切っていない");
  });

  test("立直を宣言した人と別の人が宣言牌を切ったら弾く", () => {
    const got = problems((log) => {
      log.splice(6, 0, { type: "reach", actor: 1 });
      log[7].actor = 0;
    });
    expect(got.map((p) => p.message).join()).toContain(
      "立直の宣言牌を別の人が切っている"
    );
  });

  test("直前の打牌と違う牌を鳴いたら弾く", () => {
    const got = problems((log) =>
      log.push({
        type: "pon",
        actor: 1,
        target: 0,
        pai: "9s",
        consumed: ["9s", "9s"],
      })
    );
    expect(got.map((p) => p.message).join()).toContain("一致しない");
  });

  test("直前の打牌と違う牌でロンしたら弾く", () => {
    const got = problems((log) =>
      log.push({ type: "hora", actor: 1, target: 0, pai: "9s" })
    );
    expect(got.map((p) => p.message).join()).toContain("あがり牌");
  });

  test("ツモ和了の牌が直前のツモと違ったら弾く", () => {
    const got = problems((log) => {
      log.splice(6, 1); // 打牌を消してツモの直後にする
      log.push({ type: "hora", actor: 0, target: 0, pai: "9s" });
    });
    expect(got.map((p) => p.message).join()).toContain("あがり牌");
  });

  test("流局の deltas の総和が 0 でなければ弾く", () => {
    const got = problems((log) =>
      log.push({ type: "ryukyoku", reason: "fanpai", deltas: [1000, 0, 0, 0] })
    );
    expect(got.map((p) => p.message).join()).toContain("総和");
  });

  test("点棒が 100 点単位でなければ弾く", () => {
    const got = problems((log) =>
      log.push({ type: "hora", actor: 0, target: 0, pai: "W", deltas: [1050, -1000, 0, 0] })
    );
    expect(got.map((p) => p.message).join()).toContain("100 点単位");
  });

  test("和了で場から点棒が減っていたら弾く", () => {
    const got = problems((log) =>
      log.push({ type: "hora", actor: 0, target: 0, pai: "W", deltas: [1000, -2000, 0, 0] })
    );
    expect(got.map((p) => p.message).join()).toContain("場から点棒が減っている");
  });

  test("積み棒のぶん総和が 0 でない和了は通す", () => {
    // 1 本場なら 300 点が場から和了者へ流れる。0 を要求すると正しいログを弾く。
    const got = problems((log) =>
      log.push({ type: "hora", actor: 0, target: 0, pai: "W", deltas: [1300, -1000, 0, 0] })
    );
    expect(got).toStrictEqual([]);
  });

  test("牌譜（replay mode）に伏せ牌が残っていたら弾く", () => {
    const log = baseline();
    expect(
      validateMjaiLog(log, { dialect: "legacy", unmasked: true }).length
    ).toBeGreaterThan(0);
  });
});

describe("スキーマ", () => {
  test("strict は原典の古い start_kyoku を弾く", () => {
    // こちらが送出するのは原典のスーパーセット。bakaze などの欠落は自分のバグ。
    const legacy = { type: "start_kyoku", oya: 0, dora_marker: "1m" };
    expect(checkSchema(legacy, "legacy")).toBeNull();
    expect(checkSchema(legacy, "strict")).not.toBeNull();
  });

  test("strict は dahai の tsumogiri を要求する", () => {
    const e = { type: "dahai", actor: 0, pai: "1m" };
    expect(checkSchema(e, "legacy")).toBeNull();
    expect(checkSchema(e, "strict")).not.toBeNull();
    expect(checkSchema({ ...e, tsumogiri: false }, "strict")).toBeNull();
  });

  test("読めない牌を弾く", () => {
    for (const pai of ["0m", "10m", "5zr", "r5m", "1z", ""])
      expect(
        checkSchema({ type: "dora", dora_marker: pai }, "strict"),
        `${pai} が通ってしまう`
      ).not.toBeNull();
  });

  test("未知のフィールドは通す", () => {
    // 実装ごとの拡張を落とさない。原典のログにも start_game に uri が付く。
    expect(
      checkSchema({ type: "end_kyoku", nonsense: 1 }, "strict")
    ).toBeNull();
  });

  test("actor が範囲外なら弾く", () => {
    expect(checkSchema({ type: "reach", actor: 4 }, "strict")).not.toBeNull();
    expect(checkSchema({ type: "reach", actor: -1 }, "strict")).not.toBeNull();
  });

  test("consumed の枚数が違えば弾く", () => {
    const chi = { type: "chi", actor: 0, target: 3, pai: "1m" };
    expect(checkSchema({ ...chi, consumed: ["2m"] }, "strict")).not.toBeNull();
    expect(
      checkSchema({ ...chi, consumed: ["2m", "3m"] }, "strict")
    ).toBeNull();
  });
});
