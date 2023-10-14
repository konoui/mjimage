import { describe, test, expect } from "@jest/globals";
import { Tile, Block, tileSortFunc, Parser } from "./parser";
import { FONT_FAMILY, KIND, OPERATOR, BLOCK } from "./constants";

test("parseInput1", () => {
  const got = new Parser("1s").parseInput();
  const want = [new Tile(KIND.S, 1)];
  expect(got).toStrictEqual(want);
});

test("parseInput2", () => {
  const got = new Parser("12s34m1z2d,t1s,_-1s").parseInput();
  const want = [
    new Tile(KIND.S, 1),
    new Tile(KIND.S, 2),
    new Tile(KIND.M, 3),
    new Tile(KIND.M, 4),
    new Tile(KIND.Z, 1),
    new Tile(KIND.Z, 6),
    new Tile(KIND.SEPARATOR, -1),
    new Tile(KIND.S, 1, OPERATOR.TSUMO),
    new Tile(KIND.SEPARATOR, -1),
    new Tile(KIND.BACK, 0),
    new Tile(KIND.S, 1, OPERATOR.HORIZONTAL),
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
        new Tile(KIND.S, 1),
        new Tile(KIND.S, 2),
        new Tile(KIND.M, 3),
        new Tile(KIND.M, 4),
        new Tile(KIND.Z, 1),
        new Tile(KIND.Z, 6),
      ],
      BLOCK.OTHER
    ),
    new Block([new Tile(KIND.S, 1, OPERATOR.TSUMO)], BLOCK.TSUMO),
    new Block(
      [
        new Tile(KIND.BACK, 0),
        new Tile(KIND.S, 1),
        new Tile(KIND.S, 1),
        new Tile(KIND.BACK, 0),
      ],
      BLOCK.AN_KAN
    ),
    new Block(
      [
        new Tile(KIND.S, 1, OPERATOR.HORIZONTAL),
        new Tile(KIND.S, 2),
        new Tile(KIND.S, 3),
      ],
      BLOCK.CHI
    ),
  ];

  expect(got).toStrictEqual(want);
});

test("sortTile", () => {
  const got = new Parser("13p5s786m1z").parseInput();
  got.sort(tileSortFunc);
  const want: Tile[] = [
    new Tile(KIND.M, 6),
    new Tile(KIND.M, 7),
    new Tile(KIND.M, 8),
    new Tile(KIND.P, 1),
    new Tile(KIND.P, 3),
    new Tile(KIND.S, 5),
    new Tile(KIND.Z, 1),
  ];
  expect(got).toStrictEqual(want);
});
