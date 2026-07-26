import { WIND, Wind, Round } from "../core/constants";
import type {
  RawBoardInput,
  RawTableInput,
  RawWindInput,
} from "./table-schema";

/**
 * YAML ライクな卓の入力を行単位で走査し、Raw 形式の構造化データに変換する。
 * 値の妥当性は見ない（table-schema が受け持つ）。
 */
export const parseYamlLikeStringInput = (input: string): RawTableInput => {
  const table = "table";
  const board = "board";
  const lines = input
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line != "");
  if (lines.length == 0) throw new Error("empty input");
  const tableLabel = lines.shift()!;
  if (!tableLabel.startsWith(table))
    throw new Error(`input does not start with table: ${tableLabel}`);

  const result: RawTableInput = {};

  let labels: readonly string[] = [WIND.E, WIND.S, WIND.W, WIND.N, board];
  for (;;) {
    const line = lines.shift();
    if (line == undefined) break;

    const label = labels.find((l) => line.startsWith(l));
    if (label == null) throw new Error(`encountered unexpected line ${line}`);

    // 処理済みラベルを除去
    labels = labels.filter((l) => !line.startsWith(l));
    if (label == board) {
      const [boardInput, count] = parseBoardSection([...lines]);
      result.board = boardInput;
      lines.splice(0, count);
    } else {
      const [windInput, count] = parseWindSection([...lines]);
      result[label as Wind] = windInput;
      lines.splice(0, count);
    }
  }
  return result;
};

// キー値ペアから値部分を抽出
const extractValue = (s: string, label: string) => {
  return s.replace(label, "").replace(":", "").trim();
};

// 風牌セクションをパース
const parseWindSection = (lines: readonly string[]) => {
  const hand = "hand";
  const discard = "discard";
  const score = "score";
  const result: RawWindInput = {};
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith(hand)) result.hand = extractValue(line, hand);
    else if (line.startsWith(discard))
      result.discard = extractValue(line, discard);
    else if (line.startsWith(score))
      result.score = Number(extractValue(line, score));
    else break;
  }
  return [result, i] as const;
};

// ボードセクションをパース
const parseBoardSection = (lines: readonly string[]) => {
  const doraIndicators = "dora_indicators";
  const round = "round";
  const front = "front";
  const sticks = "sticks";
  const reach = "reach";
  const dead = "dead";

  const result: RawBoardInput = {};

  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith(doraIndicators)) {
      result.doraIndicators = extractValue(line, doraIndicators);
    } else if (line.startsWith(round)) {
      result.round = extractValue(line, round) as Round;
    } else if (line.startsWith(front)) {
      result.front = extractValue(line, front) as Wind;
    } else if (line.startsWith(sticks)) {
      result.sticks = {};
      const next = lines[i + 1] ?? "";
      const nextNext = lines[i + 2] ?? "";
      if (next.startsWith(reach))
        result.sticks.reach = Number(extractValue(next, reach));
      if (next.startsWith(dead))
        result.sticks.dead = Number(extractValue(next, dead));
      if (nextNext.startsWith(reach))
        result.sticks.reach = Number(extractValue(nextNext, reach));
      if (nextNext.startsWith(dead))
        result.sticks.dead = Number(extractValue(nextNext, dead));
      if (result.sticks.dead != null) i++;
      if (result.sticks.reach != null) i++;
    } else break;
  }
  return [result, i] as const;
};
