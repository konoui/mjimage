import { Lexer } from "./lexer";

export const tileSortFunc = (i: Tile, j: Tile) => {
  if (i.k == j.k) {
    if (i.n == 0) return 5 - j.n;
    if (j.n == 0) return i.n - 5;
    return i.n - j.n;
  }

  const lookup: Record<Kind, number> = {
    [Kind.M]: 1,
    [Kind.P]: 2,
    [Kind.S]: 3,
    [Kind.Z]: 4,
    [Kind.Back]: 5,
    [Kind.Separator]: 6,
  };
  return lookup[i.k] - lookup[j.k];
};

export enum Kind {
  M = "m",
  P = "p",
  S = "s",
  Z = "z",
  Back = "_",
  Separator = ",",
}

export function isKind(v: string): [Kind, boolean] {
  switch (v) {
    case Kind.M:
    case Kind.P:
    case Kind.S:
    case Kind.Z:
      return [v, true];
    case Kind.Back:
      return [v, true];
    case Kind.Separator:
      return [v, true];
    default:
      return [Kind.Back, false];
  }
}

export enum Operator {
  Tsumo = "t",
  Dora = "d",
  Horizontal = "-",
}

export class Tile {
  constructor(
    public k: Kind,
    public n: number,
    public op: Operator | null = null
  ) {}

  toString(): string {
    if (this.k === Kind.Back || this.k === Kind.Separator) return this.k;
    const op = this.op != null ? this.op : "";
    return `${op}${this.n}${this.k}`;
  }

  equals(t: Tile | null): boolean {
    return t !== null && this.k === t.k && this.n === t.n;
  }
}

export enum BlockType {
  Pon = 1,
  Chi,
  ShoKan,
  DaiKan,
  AnKan,
  Dora,
  Tsumo,
  Other,
  Unknown,
}

export class Block {
  constructor(public p: Tile[], public type: BlockType) {
    if (type == BlockType.Chi) {
      p.sort((a: Tile, b: Tile) => {
        if (a.op == Operator.Horizontal) return -1;
        if (b.op == Operator.Horizontal) return 1;
        return tileSortFunc(a, b);
      });
      return;
    }
    p.sort(tileSortFunc);
  }
  toString(): string {
    let result = "";
    for (const p of this.p) {
      result += p.toString();
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
        if (k == Kind.Back) {
          res.push(new Tile(k, 0));
          l.readChar(); // for continue
          continue;
        }
        if (k == Kind.Separator) {
          res.push(new Tile(k, -1));
          l.readChar(); // for continue
          continue;
        }

        res.push(...makeTiles(cluster, k));
        cluster = []; // clear for zero length slice
        l.readChar(); // for continue
        continue;
      } else {
        const [p, isOp] = isOperator(l);
        if (isOp) {
          l.readChar(); // for peek
          cluster.push(p);
          l.readChar(); // for continue
          continue;
        }
        const [n, isNum] = isNumber(char);
        if (!isNum)
          throw new Error(`encounter unexpected number: ${n} ${char}`);
        // dummy kind
        cluster.push(new Tile(Kind.Back, n));
      }
      l.readChar();
    }

    if (cluster.length > 0)
      throw new Error(`remaining values ${cluster.toString()}`);
    return res;
  }

  private makeBlocks(pp: Tile[]): Block[] {
    let cluster: Tile[] = [];
    const res: Block[] = [];

    for (const t of pp) {
      if (t.k === Kind.Separator) {
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

function detectBlockType(pp: Tile[]): BlockType {
  if (pp.length === 0) return BlockType.Unknown;
  if (pp.length === 1) {
    if (pp[0].op === Operator.Dora) return BlockType.Dora;
    if (pp[0].op === Operator.Tsumo) return BlockType.Tsumo;
    return BlockType.Other; // 単騎
  }

  let same = true;
  let numOfHorizontal = 0;
  let prev: Tile | null = null;

  for (const t of pp) {
    if (t.op === Operator.Horizontal) numOfHorizontal++;
    if (t.k === Kind.Back) {
      if (pp.length === 4) return BlockType.AnKan;
      return BlockType.Unknown;
    }
    if (prev !== null && !t.equals(prev)) same = false;
    prev = t;
  }

  if (numOfHorizontal === 0) return BlockType.Other;

  if (pp.length === 3) {
    if (same) return BlockType.Pon;
    return BlockType.Chi;
  }

  if (pp.length === 4 && same) {
    if (numOfHorizontal === 1) return BlockType.DaiKan;
    if (numOfHorizontal === 2) return BlockType.ShoKan;
    return BlockType.Unknown;
  }
  return BlockType.Unknown;
}

function makeTiles(cluster: Tile[], k: Kind): Tile[] {
  const res: Tile[] = [];
  for (const p of cluster) {
    res.push(new Tile(k, p.n, p.op));
  }
  return res;
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
    return [Kind.Z, true];
  }
  return [Kind.Back, false];
}

function isNumber(v: string): [number, boolean] {
  const valid = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
  return [Number(v), valid.includes(v)];
}

// FIXME
const operators: Record<string, Operator> = {
  t: Operator.Tsumo,
  d: Operator.Dora,
  "-": Operator.Horizontal,
};

function isOperator(l: Lexer): [Tile, boolean] {
  const op: Operator | undefined = operators[l.char];
  if (op == undefined) return [new Tile(Kind.Back, 0), false];

  const [n, ok]: [number, boolean] = isNumber(l.peekChar());
  if (!ok) return [new Tile(Kind.Back, 0), false];
  return [new Tile(Kind.Back, n, op), true];
}
