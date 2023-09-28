import { describe, test, expect } from "@jest/globals";
import {
  Kind,
  Pai,
  Operator,
  Block,
  BlockType,
  paiSortFunc,
  Parser,
} from "./parser";

test("parseInput1", () => {
  const got = (new Parser("1s") as any).parseInput();
  const want = [new Pai(Kind.S, 1)];
  expect(got).toStrictEqual(want);
});

test("parseInput2", () => {
  const got = (new Parser("12s34m1z2d,t1s,_-1s") as any).parseInput();
  const want = [
    new Pai(Kind.S, 1),
    new Pai(Kind.S, 2),
    new Pai(Kind.M, 3),
    new Pai(Kind.M, 4),
    new Pai(Kind.Z, 1),
    new Pai(Kind.Z, 6),
    new Pai(Kind.Separator, -1),
    new Pai(Kind.S, 1, Operator.Tsumo),
    new Pai(Kind.Separator, -1),
    new Pai(Kind.Back, 0),
    new Pai(Kind.S, 1, Operator.Horizontal),
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
        new Pai(Kind.S, 1),
        new Pai(Kind.S, 2),
        new Pai(Kind.M, 3),
        new Pai(Kind.M, 4),
        new Pai(Kind.Z, 1),
        new Pai(Kind.Z, 6),
      ],
      BlockType.Other
    ),
    new Block([new Pai(Kind.S, 1, Operator.Tsumo)], BlockType.Tsumo),
    new Block(
      [
        new Pai(Kind.Back, 0),
        new Pai(Kind.S, 1),
        new Pai(Kind.S, 1),
        new Pai(Kind.Back, 0),
      ],
      BlockType.AnKan
    ),
    new Block(
      [
        new Pai(Kind.S, 1, Operator.Horizontal),
        new Pai(Kind.S, 2),
        new Pai(Kind.S, 3),
      ],
      BlockType.Chi
    ),
  ];

  expect(got).toStrictEqual(want);
});

test("sortPai", () => {
  const got = (new Parser("13p5s786m1z") as any).parseInput();
  got.sort(paiSortFunc);
  const want: Pai[] = [
    new Pai(Kind.M, 6),
    new Pai(Kind.M, 7),
    new Pai(Kind.M, 8),
    new Pai(Kind.P, 1),
    new Pai(Kind.P, 3),
    new Pai(Kind.S, 5),
    new Pai(Kind.Z, 1),
  ];
  expect(got).toStrictEqual(want);
});
