import {
  Tile,
  Block,
  tileSortFunc,
  Parser,
  BlockAnKan,
  BlockChi,
  BlockOther,
  BlockHand,
} from "../core/parser";
import { TYPE, OPERATOR, BLOCK, INPUT_SEPARATOR } from "../core/constants";
import { Lexer } from "../core/lexer";

describe("parse", () => {
  test("12s34m1z2d,t1s,_05s_,-123s", () => {
    const got = new Parser("12s34m1z2d,t1s,_05s_,-123s").parse();
    const want = [
      new BlockHand([
        new Tile(TYPE.S, 1),
        new Tile(TYPE.S, 2),
        new Tile(TYPE.M, 3),
        new Tile(TYPE.M, 4),
        new Tile(TYPE.Z, 1),
        new Tile(TYPE.Z, 6),
      ]),
      new BlockOther([new Tile(TYPE.S, 1, [OPERATOR.TSUMO])], BLOCK.TSUMO),
      new BlockAnKan([
        new Tile(TYPE.BACK, 0),
        new Tile(TYPE.S, 0),
        new Tile(TYPE.S, 5),
        new Tile(TYPE.BACK, 0),
      ]),
      new BlockChi([
        new Tile(TYPE.S, 1, [OPERATOR.HORIZONTAL]),
        new Tile(TYPE.S, 2),
        new Tile(TYPE.S, 3),
      ]),
    ];

    expect(got).toStrictEqual(want);
  });

  test("require type prefix", () => {
    const p = new Parser("1");
    expect(() => {
      p.parse();
    }).toThrow(/last character.*? is not type value/);
  });
});

describe("parseInput", () => {
  test("1s", () => {
    const got = new Parser("1s").tiles();
    const want = [new Tile(TYPE.S, 1)];
    expect(got).toStrictEqual(want);
  });

  test("12s34m1z2d,t1s,_-1s", () => {
    const got = new Parser("12s34m1z2d,t1s,_-1s").tileSeparators();
    const want = [
      new Tile(TYPE.S, 1),
      new Tile(TYPE.S, 2),
      new Tile(TYPE.M, 3),
      new Tile(TYPE.M, 4),
      new Tile(TYPE.Z, 1),
      new Tile(TYPE.Z, 6),
      INPUT_SEPARATOR,
      new Tile(TYPE.S, 1, [OPERATOR.TSUMO]),
      INPUT_SEPARATOR,
      new Tile(TYPE.BACK, 0),
      new Tile(TYPE.S, 1, [OPERATOR.HORIZONTAL]),
    ];
    expect(got).toStrictEqual(want);
  });
});

describe("sortTiles", () => {
  test("13p5s786m1z", () => {
    const got = new Parser("13p5s786m1z").tiles();
    got.sort(tileSortFunc);
    const want: Tile[] = [
      new Tile(TYPE.M, 6),
      new Tile(TYPE.M, 7),
      new Tile(TYPE.M, 8),
      new Tile(TYPE.P, 1),
      new Tile(TYPE.P, 3),
      new Tile(TYPE.S, 5),
      new Tile(TYPE.Z, 1),
    ];
    expect(got).toStrictEqual(want);
  });
});
