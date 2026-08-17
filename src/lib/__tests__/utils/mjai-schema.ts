import {
  array,
  boolean,
  integer,
  length,
  literal,
  maxValue,
  minValue,
  number,
  object,
  optional,
  picklist,
  pipe,
  regex,
  safeParse,
  string,
  summarize,
  union,
  variant,
  type BaseIssue,
  type BaseSchema,
} from "valibot";
import { MJAI_RYUKYOKU_REASON, MJAI_TYPE } from "../../mjai/types";

// mjai イベントのスキーマ。テスト側にだけ置く。
//
// mjai/types.ts の手書き interface とは二重管理になるが、types.ts を core にも
// valibot にも依存させないという方針（§6.1）を優先している。ずれたときは、
// 送出テストが「型は通るがスキーマで落ちる」形で必ず気づける。
//
// dialect が 2 つあるのは、原典（gimite）の実ログが今の形と違うため。
//   - "legacy": 2011 年ごろの原典の形。start_kyoku が oya と dora_marker しか持たず、
//     配牌は別の haipai イベントで来る。外部の golden ログの較正に使う。
//   - "strict": こちらが送出する形（原典のスーパーセット）。自分の出力の検査に使う。

export type MjaiDialect = "legacy" | "strict";

/**
 * 表向きの牌。赤は接尾辞（`5mr`）で、赤は 5 のみという制約もここで効く。
 * 37 種を picklist に並べると読めなくなるので正規表現にする。
 */
const paiSchema = pipe(
  string(),
  regex(/^([1-9][mps]|5[mps]r|[ESWNPFC])$/, "牌として読めない")
);

/** 表向き・非公開のどちらもあり得る牌。 */
const maybeHiddenPaiSchema = union([paiSchema, literal("?")]);

const actorSchema = pipe(number(), integer(), minValue(0), maxValue(3));
const nonNegative = pipe(number(), integer(), minValue(0));
const quad = <T extends BaseSchema<unknown, unknown, BaseIssue<unknown>>>(
  item: T
) => pipe(array(item), length(4));

const yakuSchema = pipe(array(union([string(), number()])), length(2));

/**
 * イベント種別ごとのスキーマ。`variant` で type を判別する。
 *
 * 未知のフィールドは許す（`object` であって `strictObject` ではない）。
 * mjai は実装ごとに拡張フィールドを足すのが常で、原典のログにも `uri` が付く。
 * 受信側は余分を無視する、という §1.1 の方針をスキーマでも守る。
 */
export const mjaiEventSchema = (dialect: MjaiDialect = "strict") => {
  const strict = dialect == "strict";
  /** legacy では省略されうるフィールド。strict では必須。 */
  const required = <T extends BaseSchema<unknown, unknown, BaseIssue<unknown>>>(
    s: T
  ) => (strict ? s : optional(s));

  const variants = [
    object({
      type: literal(MJAI_TYPE.HELLO),
      protocol: optional(string()),
      protocol_version: optional(number()),
    }),
    object({
      type: literal(MJAI_TYPE.JOIN),
      name: optional(string()),
      room: optional(string()),
    }),
    object({
      type: literal(MJAI_TYPE.START_GAME),
      id: optional(actorSchema),
      names: optional(quad(string())),
    }),
    object({
      type: literal(MJAI_TYPE.START_KYOKU),
      bakaze: required(picklist(["E", "S", "W", "N"])),
      kyoku: required(pipe(number(), integer(), minValue(1), maxValue(4))),
      honba: required(nonNegative),
      kyotaku: required(nonNegative),
      oya: actorSchema,
      dora_marker: paiSchema,
      tehais: required(quad(pipe(array(maybeHiddenPaiSchema), length(13)))),
      scores: optional(quad(number())),
    }),
    object({
      type: literal(MJAI_TYPE.TSUMO),
      actor: actorSchema,
      pai: maybeHiddenPaiSchema,
    }),
    object({
      type: literal(MJAI_TYPE.DAHAI),
      actor: actorSchema,
      pai: paiSchema,
      tsumogiri: required(boolean()),
    }),
    object({
      type: literal(MJAI_TYPE.CHI),
      actor: actorSchema,
      target: actorSchema,
      pai: paiSchema,
      consumed: pipe(array(paiSchema), length(2)),
    }),
    object({
      type: literal(MJAI_TYPE.PON),
      actor: actorSchema,
      target: actorSchema,
      pai: paiSchema,
      consumed: pipe(array(paiSchema), length(2)),
    }),
    object({
      type: literal(MJAI_TYPE.DAIMINKAN),
      actor: actorSchema,
      target: actorSchema,
      pai: paiSchema,
      consumed: pipe(array(paiSchema), length(3)),
    }),
    object({
      type: literal(MJAI_TYPE.KAKAN),
      actor: actorSchema,
      pai: paiSchema,
      consumed: pipe(array(paiSchema), length(3)),
    }),
    object({
      type: literal(MJAI_TYPE.ANKAN),
      actor: actorSchema,
      consumed: pipe(array(paiSchema), length(4)),
    }),
    object({ type: literal(MJAI_TYPE.DORA), dora_marker: paiSchema }),
    object({ type: literal(MJAI_TYPE.REACH), actor: actorSchema }),
    object({
      type: literal(MJAI_TYPE.REACH_ACCEPTED),
      actor: actorSchema,
      deltas: optional(quad(number())),
      scores: optional(quad(number())),
    }),
    object({
      type: literal(MJAI_TYPE.HORA),
      actor: actorSchema,
      target: actorSchema,
      pai: paiSchema,
      uradora_markers: optional(array(paiSchema)),
      ura_markers: optional(array(paiSchema)),
      hora_tehais: optional(array(paiSchema)),
      yakus: optional(array(yakuSchema)),
      fu: optional(nonNegative),
      fan: optional(nonNegative),
      hora_points: optional(number()),
      deltas: optional(quad(number())),
      scores: optional(quad(number())),
      pao: optional(actorSchema),
    }),
    object({
      type: literal(MJAI_TYPE.RYUKYOKU),
      reason: optional(picklist(Object.values(MJAI_RYUKYOKU_REASON))),
      tehais: optional(quad(array(maybeHiddenPaiSchema))),
      tenpais: optional(quad(boolean())),
      deltas: optional(quad(number())),
      scores: optional(quad(number())),
    }),
    object({ type: literal(MJAI_TYPE.END_KYOKU) }),
    object({
      type: literal(MJAI_TYPE.END_GAME),
      scores: optional(quad(number())),
    }),
    object({ type: literal(MJAI_TYPE.NONE) }),
    object({
      type: literal(MJAI_TYPE.ERROR),
      message: optional(string()),
      text: optional(string()),
    }),
  ];

  if (!strict) {
    // 原典の古い形。配牌が start_kyoku ではなく haipai で来る。
    // こちらからは送出しないので strict には無い。
    variants.push(
      object({
        type: literal("haipai"),
        actor: actorSchema,
        pais: pipe(array(maybeHiddenPaiSchema), length(13)),
      }) as never
    );
  }

  return variant("type", variants as never);
};

/** スキーマ違反があれば読める形の文字列を、無ければ null を返す。 */
export const checkSchema = (
  event: unknown,
  dialect: MjaiDialect = "strict"
): string | null => {
  const r = safeParse(mjaiEventSchema(dialect), event);
  return r.success ? null : summarize(r.issues);
};
