import { Tile, Parser, Block } from "../core/parser";
import { WIND_MAP, ROUND_MAP, Wind } from "../core/constants";
import { nextWind, prevWind } from "../core/wind-util";
import { parseYamlLikeStringInput } from "./table-yaml";
import {
  parseRawTableInput,
  type ValidatedTableInput,
} from "./table-schema";

// 変換後の型
// ValidatedTableInput => {Discards, Hands, ScoreBoard}
export interface Discards {
  front: readonly Tile[];
  right: readonly Tile[];
  opposite: readonly Tile[];
  left: readonly Tile[];
}

export interface Hands {
  front: readonly Block[];
  right: readonly Block[];
  opposite: readonly Block[];
  left: readonly Block[];
}

export interface ScoreBoard {
  doraIndicators: readonly Tile[];
  round: BoardRound;
  sticks: { reach: number; dead: number };
  scores: {
    front: number;
    right: number;
    opposite: number;
    left: number;
  };
  frontPlace: BoardWind;
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
type BoardWind = (typeof WIND_MAP)[keyof typeof WIND_MAP];

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
  const m = createPlaceMap(frontPlace);
  const f = (w: Wind) => {
    return i[w].discard.replace(/\r?\n/g, "");
  };
  const discards: Discards = {
    front: new Parser(f(m.front)).tiles(),
    right: new Parser(f(m.right)).tiles(),
    opposite: new Parser(f(m.opposite)).tiles(),
    left: new Parser(f(m.left)).tiles(),
  };

  const hands: Hands = {
    front: new Parser(i[m.front].hand).parse(),
    right: new Parser(i[m.right].hand).parse(),
    opposite: new Parser(i[m.opposite].hand).parse(),
    left: new Parser(i[m.left].hand).parse(),
  };

  const scoreBoard: ScoreBoard = {
    round: ROUND_MAP[i.board.round],
    frontPlace: WIND_MAP[frontPlace],
    sticks: i.board.sticks,
    doraIndicators: new Parser(i.board.doraIndicators).tiles(),
    scores: {
      front: i[m.front].score,
      right: i[m.right].score,
      opposite: i[m.opposite].score,
      left: i[m.left].score,
    },
  };
  return { discards, hands, scoreBoard };
};

const createPlaceMap = (front: Wind) => {
  return {
    front: front,
    right: nextWind(front),
    opposite: nextWind(nextWind(front)),
    left: prevWind(front),
  };
};
