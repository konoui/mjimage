import { describe, test, expect } from "@jest/globals";
import {
  Kind,
  Tile,
  Operator,
  Block,
  BlockType,
  tileSortFunc,
  Parser,
} from "./parser";

test("parseInput1", () => {
  const got = new Parser("1s").parseInput();
  const want = [new Tile(Kind.S, 1)];
  expect(got).toStrictEqual(want);
});

test("parseInput2", () => {
  const got = new Parser("12s34m1z2d,t1s,_-1s").parseInput();
  const want = [
    new Tile(Kind.S, 1),
    new Tile(Kind.S, 2),
    new Tile(Kind.M, 3),
    new Tile(Kind.M, 4),
    new Tile(Kind.Z, 1),
    new Tile(Kind.Z, 6),
    new Tile(Kind.Separator, -1),
    new Tile(Kind.S, 1, Operator.Tsumo),
    new Tile(Kind.Separator, -1),
    new Tile(Kind.Back, 0),
    new Tile(Kind.S, 1, Operator.Horizontal),
  ];
  expect(got).toStrictEqual(want);
});

test("parseInputWithError", () => {
  const p = new Parser("1");
  expect(() => {
    p.parse();
  }).toThrow(/last character.*? is not kind value/);
});

test("makeBlocks", () => {
  const got = new Parser("12s34m1z2d,t1s,_11s_,-123s").parse();
  const want = [
    new Block(
      [
        new Tile(Kind.S, 1),
        new Tile(Kind.S, 2),
        new Tile(Kind.M, 3),
        new Tile(Kind.M, 4),
        new Tile(Kind.Z, 1),
        new Tile(Kind.Z, 6),
      ],
      BlockType.Other
    ),
    new Block([new Tile(Kind.S, 1, Operator.Tsumo)], BlockType.Tsumo),
    new Block(
      [
        new Tile(Kind.Back, 0),
        new Tile(Kind.S, 1),
        new Tile(Kind.S, 1),
        new Tile(Kind.Back, 0),
      ],
      BlockType.AnKan
    ),
    new Block(
      [
        new Tile(Kind.S, 1, Operator.Horizontal),
        new Tile(Kind.S, 2),
        new Tile(Kind.S, 3),
      ],
      BlockType.Chi
    ),
  ];

  expect(got).toStrictEqual(want);
});

test("sortTile", () => {
  const got = new Parser("13p5s786m1z").parseInput();
  got.sort(tileSortFunc);
  const want: Tile[] = [
    new Tile(Kind.M, 6),
    new Tile(Kind.M, 7),
    new Tile(Kind.M, 8),
    new Tile(Kind.P, 1),
    new Tile(Kind.P, 3),
    new Tile(Kind.S, 5),
    new Tile(Kind.Z, 1),
  ];
  expect(got).toStrictEqual(want);
});
