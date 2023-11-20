import { Lexer } from "./lexer";
import { BLOCK, OPERATOR, KIND } from "./constants";

export const tileSortFunc = (i: Tile, j: Tile) => {
  if (i.k == j.k) {
    if (i.n == 0) return 5 - j.n;
    if (j.n == 0) return i.n - 5;
    return i.n - j.n;
  }

  const lookup: Record<Kind, number> = {
    [KIND.M]: 1,
    [KIND.P]: 2,
    [KIND.S]: 3,
    [KIND.Z]: 4,
    [KIND.BACK]: 5,
    [KIND.SEPARATOR]: 6,
  };
  return lookup[i.k] - lookup[j.k];
};

type Kind = (typeof KIND)[keyof typeof KIND];

export function isKind(v: string): [Kind, boolean] {
  for (let k of Object.values(KIND)) {
    if (k == v) {
      return [v, true];
    }
  }
  return [KIND.BACK, false];
}

type Operator = (typeof OPERATOR)[keyof typeof OPERATOR];

export class Tile {
  constructor(public k: Kind, public n: number, public op?: Operator) {}

  toString(): string {
    if (this.k === KIND.BACK || this.k === KIND.SEPARATOR) return this.k;
    const op = this.op != null ? this.op : "";
    return `${op}${this.n}${this.k}`;
  }

  equals(t: Tile | null): boolean {
    return t !== null && this.k === t.k && this.n === t.n;
  }
}

type BLOCK = (typeof BLOCK)[keyof typeof BLOCK];

export class Block {
  constructor(public tiles: Tile[], public type: BLOCK) {
    if (type == BLOCK.CHI) {
      tiles.sort((a: Tile, b: Tile) => {
        if (a.op == OPERATOR.HORIZONTAL) return -1;
        if (b.op == OPERATOR.HORIZONTAL) return 1;
        return tileSortFunc(a, b);
      });
      return;
    }
    if (type != BLOCK.DISCARD) {
      tiles.sort(tileSortFunc);
    }
  }
  toString(): string {
    let result = "";
    for (const t of this.tiles) {
      result += t.toString();
    }
    return result;
  }
}

export class Parser {
  readonly maxInputLength = 128;
  constructor(readonly input: string) {
    this.input = input.replace(/\s/g, "");
  }

  parse() {
    const parsed = this.parseInput();
    return this.makeBlocks(parsed);
  }

  parseInput() {
    const l = new Lexer(this.input);
    const res: Tile[] = [];
    let cluster: Tile[] = [];

    this.validate(this.input);

    for (;;) {
      l.skipWhitespace();
      let char = l.char;
      if (char === l.eof) break;

      let [k, isKind] = isKindAlias(char, cluster);
      if (isKind) {
        if (k == KIND.BACK) {
          res.push(new Tile(k, 0));
          l.readChar(); // for continue
          continue;
        }
        if (k == KIND.SEPARATOR) {
          res.push(new Tile(k, -1));
          l.readChar(); // for continue
          continue;
        }

        res.push(...makeTiles(cluster, k));
        cluster = []; // clear for zero length slice
        l.readChar(); // for continue
        continue;
      } else {
        const [t, isOp] = isOperator(l);
        if (isOp) {
          l.readChar(); // for peek
          cluster.push(t);
          l.readChar(); // for continue
          continue;
        }
        const [n, isNum] = isNumber(char);
        if (!isNum)
          throw new Error(`encounter unexpected number: ${n} ${char}`);
        // dummy kind
        cluster.push(new Tile(KIND.BACK, n));
      }
      l.readChar();
    }

    if (cluster.length > 0)
      throw new Error(`remaining values ${cluster.toString()}`);
    return res;
  }

  private makeBlocks(tiles: Tile[]): Block[] {
    let cluster: Tile[] = [];
    const res: Block[] = [];

    for (const t of tiles) {
      if (t.k === KIND.SEPARATOR) {
        const type = detectBlockType(cluster);
        const b = new Block(cluster, type);
        res.push(b);
        cluster = [];
        continue;
      }
      cluster.push(t);
    }

    // handle last block
    const type = detectBlockType(cluster);
    const b = new Block(cluster, type);
    res.push(b);
    cluster = [];
    return res;
  }

  validate(input: string) {
    const maxInputLength = 128;
    if (input.length == 0) throw new Error("no input");
    if (input.length > maxInputLength)
      throw new Error("exceeded maximum input length");
    const lastChar = input.charAt(input.length - 1);
    const [_, isKind] = isKindAlias(lastChar, []);
    if (!isKind)
      throw new Error(`last character(${lastChar}) is not kind value`);
  }
}

function detectBlockType(tiles: Tile[]): BLOCK {
  if (tiles.length === 0) return BLOCK.UNKNOWN;
  if (tiles.length === 1) {
    if (tiles[0].op === OPERATOR.DORA) return BLOCK.DORA;
    if (tiles[0].op === OPERATOR.TSUMO) return BLOCK.TSUMO;
    return BLOCK.HAND; // 単騎
  }

  let sameAll = tiles.filter((v) => v.equals(tiles[0])).length == tiles.length;
  let numOfHorizontals = tiles.filter(
    (v) => v.op == OPERATOR.HORIZONTAL
  ).length;
  let numOfTsumoDoraTiles = tiles.filter((v) => {
    v.op == OPERATOR.TSUMO || v.op == OPERATOR.DORA;
  }).length;
  let numOfBackTiles = tiles.filter((v) => v.k == KIND.BACK).length;

  if (numOfTsumoDoraTiles > 0) return BLOCK.UNKNOWN;

  if (numOfHorizontals == 0 && numOfBackTiles == 0) return BLOCK.HAND;

  if (tiles.length === 3) {
    return sameAll ? BLOCK.PON : BLOCK.CHI;
  }

  if (tiles.length == 4 && numOfBackTiles == 2) return BLOCK.AN_KAN;
  if (tiles.length == 4 && sameAll) {
    if (numOfHorizontals === 1) return BLOCK.DAI_KAN;
    if (numOfHorizontals === 2) return BLOCK.SHO_KAN;
  }

  // handle a simple discard
  if (numOfHorizontals == 1 && numOfBackTiles == 0) return BLOCK.DISCARD;

  return BLOCK.UNKNOWN;
}

function makeTiles(cluster: Tile[], k: Kind): Tile[] {
  return cluster.map((v) => {
    return new Tile(k, v.n, v.op);
  });
}

function isKindAlias(s: string, cluster: Tile[]): [Kind, boolean] {
  const [k, ok] = isKind(s);
  if (ok) return [k, true];

  const isAlias = s === "w" || s === "d";
  if (isAlias && cluster.length > 0) {
    for (let i = 0; i < cluster.length; i++) {
      // convert alias
      if (s === "d") cluster[i].n += 4;
    }
    return [KIND.Z, true];
  }
  return [KIND.BACK, false];
}

function isNumber(v: string): [number, boolean] {
  const valid = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
  return [Number(v), valid.includes(v)];
}

function isOperator(l: Lexer): [Tile, boolean] {
  for (let op of Object.values(OPERATOR)) {
    if (op == l.char) {
      const [n, ok] = isNumber(l.peekChar());
      if (!ok) return [new Tile(KIND.BACK, 0), false];
      return [new Tile(KIND.BACK, n, op), true];
    }
  }
  return [new Tile(KIND.BACK, 0), false];
}
