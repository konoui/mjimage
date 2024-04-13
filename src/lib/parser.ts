import { Lexer } from "./lexer";
import { BLOCK, OPERATOR, KIND, INPUT_SEPARATOR } from "./constants";

type Separator = typeof INPUT_SEPARATOR;

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
  };
  return lookup[i.k] - lookup[j.k];
};

export type Kind = (typeof KIND)[keyof typeof KIND];

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
  constructor(public k: Kind, public n: number, public ops: Operator[] = []) {}

  toString(): string {
    if (this.k === KIND.BACK) return this.k;
    return `${this.ops.join("")}${this.n}${this.k}`;
  }

  clone() {
    return new Tile(this.k, this.n, [...this.ops]);
  }

  has(op: Operator) {
    return this.ops.includes(op);
  }

  add(op: Operator): Tile {
    this.ops.push(op);
    this.ops = Array.from(new Set(this.ops));
    return this;
  }

  remove(op: Operator): Tile {
    this.ops = this.ops.filter((v) => v != op);
    return this;
  }

  isNum() {
    return this.k == KIND.M || this.k == KIND.P || this.k == KIND.S;
  }

  equals(t: Tile, ignoreRed: boolean = false): boolean {
    let ok = this.n == t.n;
    if (ignoreRed)
      ok ||= (this.n == 5 && t.n == 0) || (this.n == 0 && t.n == 5);
    return this.k == t.k && ok;
  }
}

type BLOCK = (typeof BLOCK)[keyof typeof BLOCK];

export class Block {
  constructor(public tiles: Tile[], public type: BLOCK) {
    if (type == BLOCK.CHI) {
      tiles.sort((a: Tile, b: Tile) => {
        if (a.has(OPERATOR.HORIZONTAL)) return -1;
        if (b.has(OPERATOR.HORIZONTAL)) return 1;
        return tileSortFunc(a, b);
      });
      return;
    }
    if (type == BLOCK.SHO_KAN) {
      return;
    }
    if (type != BLOCK.DISCARD) {
      tiles.sort(tileSortFunc);
    }
  }

  toString(): string {
    const [sameAll, _] = this.tiles.reduce(
      (a: [boolean, Tile], b: Tile): [boolean, Tile] => {
        return [a[0] && a[1].k == b.k, b];
      },
      [true, this.tiles[0]]
    );
    let ret = "";

    if (sameAll) {
      for (let v of this.tiles) ret += v.toString().slice(0, -1);
      return `${ret}${this.tiles[0].k}`;
    }
    for (const t of this.tiles) ret += t.toString();
    return ret;
  }

  is(type: BLOCK): boolean {
    return this.type == type;
  }

  isCalled(): boolean {
    return [
      BLOCK.PON.toString(),
      BLOCK.CHI.toString(),
      BLOCK.AN_KAN.toString(),
      BLOCK.DAI_KAN.toString(),
      BLOCK.SHO_KAN.toString(),
    ].includes(this.type.toString());
  }

  /**
   * equals does not check operator
   **/
  equals(b: Block) {
    if (this.tiles.length != b.tiles.length) return false;

    let ab = this.tiles;
    let bb = b.tiles;
    if (this.is(BLOCK.CHI) || b.is(BLOCK.CHI)) {
      ab = b.clone().tiles.sort(tileSortFunc);
      bb = this.clone().tiles.sort(tileSortFunc);
    }
    for (let i = 0; i < b.tiles.length; i++) {
      if (!ab[i].equals(bb[i], true)) return false;
    }
    return true;
  }

  minTile(): Tile {
    if (this.is(BLOCK.CHI)) return this.clone().tiles.sort(tileSortFunc)[0];
    return this.tiles[0];
  }

  // clone the block with the operators
  clone() {
    const tiles = this.tiles.map((t) => new Tile(t.k, t.n, [...t.ops]));
    return blockWrapper(tiles, this.type);
  }
}

export class BlockChi extends Block {
  constructor(tiles: [Tile, Tile, Tile]) {
    super(tiles, BLOCK.CHI);
  }
}

export class BlockPon extends Block {
  constructor(tiles: [Tile, Tile, Tile]) {
    super(tiles, BLOCK.PON);
  }
}

export class BlockAnKan extends Block {
  constructor(tiles: Tile[]) {
    super(tiles, BLOCK.AN_KAN);
  }
  toString() {
    const tiles = this.tiles.map((t) => t.clone());
    tiles[1] = new Tile(KIND.BACK, 0);
    tiles[2] = new Tile(KIND.BACK, 0);
    return tiles.reduce((s: string, t: Tile) => {
      return `${s}${t.toString()}`;
    }, "");
  }
}

export class BlockDaiKan extends Block {
  constructor(tiles: Tile[]) {
    super(tiles, BLOCK.DAI_KAN);
  }
}

export class BlockShoKan extends Block {
  constructor(tiles: Tile[]) {
    super(tiles, BLOCK.SHO_KAN);
  }
}

export class BlockPair extends Block {
  constructor(tile1: Tile, tile2: Tile) {
    super([tile1, tile2], BLOCK.PAIR);
  }
}

class BlockSet extends Block {
  constructor(tiles: [Tile, Tile, Tile]) {
    super(tiles, BLOCK.SET);
  }
}

export class BlockThree extends BlockSet {
  constructor(tiles: [Tile, Tile, Tile]) {
    super(tiles);
  }
}

export class BlockRun extends BlockSet {
  constructor(tiles: [Tile, Tile, Tile]) {
    super(tiles);
  }
}

export class BlockIsolated extends Block {
  constructor(tile: Tile) {
    super([tile], BLOCK.ISOLATED);
  }
}

export const blockWrapper = (
  tiles: Tile[],
  type: BLOCK
):
  | Block
  | BlockChi
  | BlockPon
  | BlockAnKan
  | BlockDaiKan
  | BlockShoKan
  | BlockPair
  | BlockSet
  | BlockIsolated => {
  switch (type) {
    case BLOCK.CHI:
      return new BlockChi([tiles[0], tiles[1], tiles[2]]);
    case BLOCK.PON:
      return new BlockPon([tiles[0], tiles[1], tiles[2]]);
    case BLOCK.AN_KAN:
      return new BlockAnKan(tiles);
    case BLOCK.DAI_KAN:
      return new BlockDaiKan(tiles);
    case BLOCK.SHO_KAN:
      return new BlockShoKan(tiles);
    case BLOCK.SET:
      if (tiles[0].equals(tiles[1], true))
        return new BlockThree(tiles as [Tile, Tile, Tile]);
      return new BlockRun(tiles as [Tile, Tile, Tile]);
    case BLOCK.PAIR:
      return new BlockPair(tiles[0], tiles[1]);
    case BLOCK.ISOLATED:
      return new BlockIsolated(tiles[0]);
    default:
      return new Block(tiles, type);
  }
};

export class Parser {
  readonly maxInputLength = 600;
  constructor(readonly input: string) {
    this.input = input.replace(/\s/g, "");
  }

  parse() {
    const parsed = this.tileSeparators();
    return this.makeBlocks(parsed);
  }

  tiles(): Tile[] {
    return this.tileSeparators().filter((v) => v != INPUT_SEPARATOR) as Tile[];
  }

  tileSeparators(): (Tile | Separator)[] {
    const l = new Lexer(this.input);
    const res: (Tile | Separator)[] = [];
    let cluster: Tile[] = [];

    this.validate(this.input);
    for (;;) {
      l.skipWhitespace();
      let char = l.char;
      if (char === l.eof) break;

      if (char == INPUT_SEPARATOR) {
        res.push(INPUT_SEPARATOR);
        l.readChar(); // for continue
        continue;
      }

      let [k, isKind] = isKindAlias(char, cluster);
      if (isKind) {
        if (k == KIND.BACK) {
          res.push(new Tile(k, 0));
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
          cluster.push(t);
          l.readChar(); // for continue
          continue;
        }
        const [n, isNum] = isNumber(char);
        if (!isNum)
          throw new Error(
            `encounter unexpected number. n: ${n}, current: ${char}, input: ${l.input}`
          );
        // dummy kind
        cluster.push(new Tile(KIND.BACK, n));
      }
      l.readChar();
    }

    if (cluster.length > 0)
      throw new Error(`remaining values ${cluster.toString()}`);
    return res;
  }

  private makeBlocks(tiles: (Tile | Separator)[]) {
    let cluster: Tile[] = [];
    const res: (
      | Block
      | BlockChi
      | BlockPon
      | BlockAnKan
      | BlockDaiKan
      | BlockShoKan
    )[] = [];

    if (tiles.length == 0) return res;

    for (const t of tiles) {
      if (t == INPUT_SEPARATOR) {
        const type = detectBlockType(cluster);
        const b = blockWrapper(cluster, type);
        res.push(b);
        cluster = [];
        continue;
      }
      cluster.push(t);
    }

    // handle last block
    const type = detectBlockType(cluster);
    const b = blockWrapper(cluster, type);
    res.push(b);
    cluster = [];
    return res;
  }

  validate(input: string) {
    if (input.length == 0) return;
    if (input.length > this.maxInputLength)
      throw new Error(`exceeded maximum input length(${input.length})`);
    const lastChar = input.charAt(input.length - 1);
    // Note: dummy tile for validation
    const [_, isKind] = isKindAlias(lastChar, [new Tile(KIND.BACK, 1)]);
    if (!isKind)
      throw new Error(`last character(${lastChar}) is not kind value`);
  }
}

function detectBlockType(tiles: Tile[]): BLOCK {
  if (tiles.length === 0) return BLOCK.UNKNOWN;
  if (tiles.length === 1) {
    if (tiles[0].has(OPERATOR.DORA)) return BLOCK.DORA;
    if (tiles[0].has(OPERATOR.TSUMO)) return BLOCK.TSUMO;
    return BLOCK.HAND; // 単騎
  }

  const sameAll =
    tiles.filter((v) => v.equals(tiles[0], true)).length == tiles.length;
  const numOfHorizontals = tiles.filter((v) =>
    v.has(OPERATOR.HORIZONTAL)
  ).length;
  const numOfTsumoDoraTiles = tiles.filter(
    (v) => v.has(OPERATOR.TSUMO) || v.has(OPERATOR.DORA)
  ).length;
  const numOfBackTiles = tiles.filter((v) => v.k == KIND.BACK).length;

  if (numOfTsumoDoraTiles > 0) return BLOCK.UNKNOWN;

  if (numOfHorizontals == 0 && numOfBackTiles == 0) return BLOCK.HAND;

  if (tiles.length === 3) {
    if (sameAll) return BLOCK.PON;
    if (numOfHorizontals == 1 && areConsecutiveTiles(tiles)) return BLOCK.CHI;
    return BLOCK.DISCARD;
  }

  if (tiles.length == 4 && numOfBackTiles == 2) return BLOCK.AN_KAN;
  if (tiles.length == 4 && sameAll) {
    if (numOfHorizontals == 1) return BLOCK.DAI_KAN;
    if (numOfHorizontals == 2) return BLOCK.SHO_KAN;
  }

  if (numOfHorizontals == 1) return BLOCK.DISCARD;

  return BLOCK.UNKNOWN;
}

function areConsecutiveTiles(tiles: Tile[]): boolean {
  tiles = tiles.map((t) => t.clone()).sort(tileSortFunc);
  for (let i = 0; i < tiles.length - 1; i++) {
    let n = tiles[i].n,
      np = tiles[i + 1].n;
    const k = tiles[i].k,
      kp = tiles[i + 1].k;
    if (n == 0) n = 5;
    if (np == 0) np = 5;
    if (k !== kp) return false;
    if (n + 1 !== np) return false;
  }
  return true;
}

function makeTiles(cluster: Tile[], k: Kind): Tile[] {
  return cluster.map((v) => {
    return new Tile(k, v.n, v.ops);
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

// isOperator will consume char if the next is an operator
function isOperator(l: Lexer): [Tile, boolean] {
  const ops = Object.values(OPERATOR) as string[];
  if (!ops.includes(l.char)) return [new Tile(KIND.BACK, 0), false];

  const found: Operator[] = [];
  // 4 is temporary value
  for (let i = 0; i < 4; i++) {
    const c = l.peekCharN(i);
    if (ops.includes(c)) found.push(c as Operator);
    else {
      const [n, ok] = isNumber(c);
      if (!ok) break;
      for (let i = 0; i < found.length; i++) l.readChar();
      return [new Tile(KIND.BACK, n, found), true];
    }
  }
  return [new Tile(KIND.BACK, 0), false];
}
