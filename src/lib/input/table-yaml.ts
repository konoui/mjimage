import { WIND, Wind, Round } from "../core/constants";
import type {
  RawBoardInput,
  RawTableInput,
  RawWindInput,
} from "./table-schema";

/**
 * 1 行を分解したもの。indent は行頭の空白の数で、入れ子の深さを表す。
 * 値が空の行は子を持つ節（`board:` など）になる。
 */
interface Line {
  readonly indent: number;
  readonly key: string;
  readonly value: string;
}

/**
 * インデントで入れ子になったキーと値。
 * 葉は value を持ち children が空、節は children を持ち value が空になる。
 */
interface Section {
  readonly value: string;
  readonly children: ReadonlyMap<string, Section>;
}

/**
 * YAML ライクな卓の入力を行単位で走査し、Raw 形式の構造化データに変換する。
 * 値の妥当性は見ない（table-schema が受け持つ）。
 */
export const parseYamlLikeStringInput = (input: string): RawTableInput => {
  const root = readTree(input);
  if (root.size == 0) throw new Error("empty input");

  const table = root.get("table");
  if (table == null)
    throw new Error(
      `input does not start with table: ${[...root.keys()].join(", ")}`,
    );
  assertKnownKeys(root, ["table"], "top level");

  const result: RawTableInput = {};
  assertKnownKeys(
    table.children,
    [WIND.E, WIND.S, WIND.W, WIND.N, "board"],
    "table",
  );
  for (const w of [WIND.E, WIND.S, WIND.W, WIND.N]) {
    const section = table.children.get(w);
    if (section != null) result[w] = parseWindSection(section, w);
  }
  const board = table.children.get("board");
  if (board != null) result.board = parseBoardSection(board);
  return result;
};

/**
 * 入力を行に分け、インデントの深さ・キー・値へ落とす。
 * 空行は捨てる。値の中の `:` は残す（キーは最初の `:` までとする）。
 */
const tokenize = (input: string): Line[] =>
  input
    .split("\n")
    .filter((line) => line.trim() != "")
    .map((line) => {
      const body = line.trim();
      const separator = body.indexOf(":");
      if (separator < 0)
        throw new Error(`line must be a "key: value" pair: ${body}`);
      return {
        indent: line.length - line.trimStart().length,
        key: body.slice(0, separator).trim(),
        value: body.slice(separator + 1).trim(),
      };
    });

/**
 * 行の並びを木に組む。
 * 直前のより浅い行を親とするので、インデントの幅そのものは問わない
 * （2 段でも 4 段でも、深くなっていれば子になる）。
 */
const readTree = (input: string): ReadonlyMap<string, Section> => {
  const root = new Map<string, Section>();
  // 番兵として、どの行よりも浅い深さの根を積んでおく。
  const stack = [{ indent: -1, children: root }];
  for (const line of tokenize(input)) {
    while (stack.length > 1 && line.indent <= stack[stack.length - 1].indent)
      stack.pop();
    const parent = stack[stack.length - 1];
    if (parent.children.has(line.key))
      throw new Error(`duplicated key: ${line.key}`);

    const children = new Map<string, Section>();
    parent.children.set(line.key, { value: line.value, children });
    stack.push({ indent: line.indent, children });
  }
  return root;
};

/**
 * 節の子を既知のキーだけに限る。綴りの誤りを黙って捨てないための関門。
 */
const assertKnownKeys = (
  children: ReadonlyMap<string, Section>,
  known: readonly string[],
  where: string,
) => {
  for (const key of children.keys())
    if (!known.includes(key))
      throw new Error(`encountered unexpected key: ${key} in ${where}`);
};

/** 子の値を文字列で返す。無ければ undefined（既定値は schema が入れる）。 */
const text = (node: Section, key: string): string | undefined =>
  node.children.get(key)?.value;

/** 子の値を数値で返す。無ければ undefined。 */
const num = (node: Section, key: string): number | undefined => {
  const v = text(node, key);
  return v == null ? undefined : Number(v);
};

// 風牌セクションをパース
const parseWindSection = (node: Section, where: string): RawWindInput => {
  assertKnownKeys(node.children, ["hand", "discard", "score"], where);
  const result: RawWindInput = {};
  const hand = text(node, "hand");
  const discard = text(node, "discard");
  const score = num(node, "score");
  if (hand != null) result.hand = hand;
  if (discard != null) result.discard = discard;
  if (score != null) result.score = score;
  return result;
};

// ボードセクションをパース
const parseBoardSection = (node: Section): RawBoardInput => {
  assertKnownKeys(
    node.children,
    ["dora_indicators", "round", "front", "sticks"],
    "board",
  );
  const result: RawBoardInput = {};

  const doraIndicators = text(node, "dora_indicators");
  const round = text(node, "round");
  const front = text(node, "front");
  if (doraIndicators != null) result.doraIndicators = doraIndicators;
  if (round != null) result.round = round as Round;
  if (front != null) result.front = front as Wind;

  const sticks = node.children.get("sticks");
  if (sticks != null) {
    assertKnownKeys(sticks.children, ["reach", "dead"], "sticks");
    result.sticks = {};
    const reach = num(sticks, "reach");
    const dead = num(sticks, "dead");
    if (reach != null) result.sticks.reach = reach;
    if (dead != null) result.sticks.dead = dead;
  }
  return result;
};
