import { Tile, Parser, Block } from "../core";
import { ROUND_MAP, Wind } from "../core/constants";
import { Seats, mapSeats, seatWinds } from "./seats";
import { parseYamlLikeStringInput } from "./table-yaml";
import {
  parseRawTableInput,
  type ValidatedTableInput,
} from "./table-schema";

// 変換後の型
// ValidatedTableInput => {Discards, Hands, ScoreBoard}
export type Discards = Seats<readonly Tile[]>;

export type Hands = Seats<readonly Block[]>;

export interface ScoreBoard {
  doraIndicators: readonly Tile[];
  round: BoardRound;
  sticks: { reach: number; dead: number };
  scores: Seats<number>;
  /**
   * 手前の家の風。表示は描画側が WIND_MAP で行う。
   * 席順の計算に使うので、内部表現（Wind）のまま持つ。
   */
  frontPlace: Wind;
}

/**
 * 卓を描くのに必要な内容。createTable の入力。
 */
export interface TableInput {
  discards: Discards;
  hands: Hands;
  scoreBoard: ScoreBoard;
}

type BoardRound = (typeof ROUND_MAP)[keyof typeof ROUND_MAP];

/**
 * 麻雀卓の文字列をパースし、内部表現に変換する
 */
export const parseTableInput = (yamlString: string): TableInput => {
  const d = parseYamlStringInput(yamlString);
  return convertTableInput(d);
};

/**
 * 麻雀卓の YAML 形式の文字列をパースする。
 * パース後さらに内部表現に変換する必要がある。
 */
export const parseYamlStringInput = (
  yamlString: string,
): ValidatedTableInput => {
  const rawInput = parseYamlLikeStringInput(yamlString);
  return parseRawTableInput(rawInput);
};

/**
 * パースした入力を内部表現へ変換する。
 */
export const convertTableInput = (i: ValidatedTableInput): TableInput => {
  const frontPlace = i.board.front;
  // 席（front/right/…）から風（1z/2z/…）への対応。以降は各家の入力をこれで引く。
  const m = seatWinds(frontPlace);

  // 改行を含む複数行の記述も受け付ける（Parser が空白を落とす）。
  const discards: Discards = mapSeats(m, (w) => new Parser(i[w].discard).tiles());

  const hands: Hands = mapSeats(m, (w) => new Parser(i[w].hand).parse());

  const scoreBoard: ScoreBoard = {
    round: ROUND_MAP[i.board.round],
    frontPlace: frontPlace,
    sticks: i.board.sticks,
    doraIndicators: new Parser(i.board.doraIndicators).tiles(),
    scores: mapSeats(m, (w) => i[w].score),
  };
  return { discards, hands, scoreBoard };
};
